# crud/refund_requests.py
"""Shared refund-request queue logic, used by both the website's
shared-secret endpoints (app/api/routes/website_bookings.py, called from
admin/pages/refund-requests.php) and the Admin App's JWT-authenticated
mirror (app/api/routes/admin.py) - one source of truth for the query and
the approve/deny/Razorpay-refund logic, two auth surfaces calling it."""
from typing import Optional
from datetime import datetime
from fastapi import HTTPException

from app.models.customer_booking_request import CustomerBookingRequest


def list_pending_refund_requests(db) -> list:
    requests = (
        db.query(CustomerBookingRequest)
        .filter(CustomerBookingRequest.refund_status == "REQUESTED")
        .order_by(CustomerBookingRequest.refund_requested_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "customer_name": r.customer_name,
            "customer_number": r.customer_number,
            "customer_email": r.customer_email,
            "linked_order_id": r.linked_order_id,
            "quoted_total_amount": r.quoted_total_amount,
            "refund_requested_at": r.refund_requested_at,
            "has_razorpay_payment": bool(r.rp_payment_id),
        }
        for r in requests
    ]


def process_refund_request(
    db,
    request_id,
    approve: bool,
    refund_amount: Optional[int],
    notes: Optional[str],
    via_razorpay: bool = True,
) -> dict:
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.refund_status != "REQUESTED":
        raise HTTPException(status_code=400, detail="This refund is not awaiting processing")

    # Real Razorpay refund - only when admin approves AND there's an actual
    # Razorpay payment on file AND admin didn't opt out (via_razorpay=false).
    # This is the human checkpoint the customer's own "Request Refund"
    # action deliberately does NOT have - admin approving here IS the
    # decision to actually move money, not an automatic customer-triggered one.
    if approve and via_razorpay and request.rp_payment_id:
        from app.utils.razorpay_client import RazorpayClient
        client = RazorpayClient()
        try:
            client.refund(
                request.rp_payment_id,
                amount_rupees=refund_amount,
                notes={"booking_id": str(request.id), "reason": "Customer-requested cancellation refund"},
            )
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Razorpay refund failed: {str(e)}. Nothing was recorded - retry or uncheck via_razorpay to record it as done manually.",
            )

    request.refund_status = "PROCESSED" if approve else "DENIED"
    request.refund_processed_at = datetime.utcnow()
    request.refund_amount = refund_amount
    request.refund_notes = notes
    db.commit()

    try:
        if request.customer_email:
            from app.utils.emailer import send_email, smtp_configured
            if smtp_configured(db):
                if approve:
                    subject = f"Booking {request.id} - Refund Processed"
                    amt_line = f"Refund amount: Rs.{refund_amount}\n\n" if refund_amount else ""
                    body_text = (
                        f"Hi {request.customer_name},\n\nYour refund for booking {request.id} has been processed.\n\n"
                        f"{amt_line}It may take a few more days to reflect depending on your bank/payment provider.\n\n"
                        "- Drop Cars Team"
                    )
                else:
                    subject = f"Booking {request.id} - Refund Request Update"
                    body_text = (
                        f"Hi {request.customer_name},\n\nWe've reviewed your refund request for booking {request.id}.\n\n"
                        f"{notes or 'Please contact support for details.'}\n\n- Drop Cars Team"
                    )
                send_email(db, request.customer_email, subject, body_text)
    except Exception as e:
        print(f"Refund-decision email failed for request {request_id} (decision still recorded): {e}")

    return {"status": request.refund_status, "customer_name": request.customer_name}
