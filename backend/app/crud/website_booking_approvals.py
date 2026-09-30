# crud/website_booking_approvals.py
"""Shared "pending website booking, awaiting the auto-approve timer" queue -
lets an admin approve/reject early instead of waiting out the delay, or
catch something suspicious before it ever posts to drivers. Used by both
the website's shared-secret endpoints (website_bookings.py, called from
admin/pages/website-booking-approvals.php) and the Admin App's
JWT-authenticated mirror (admin.py).

Deliberately excludes rows with requires_manual_confirm=True (website
enquiries/soft-leads) - those are a separate flow with their own inbox
(the enquiries.tsx / admin-app-enquiries.php mirror) and never sit on this
auto-approve timer at all, so showing them here too would just be the same
lead appearing twice in two different places."""
from datetime import timedelta
from fastapi import HTTPException

from app.models.customer_booking_request import CustomerBookingRequest


def list_pending_website_bookings(db) -> list:
    from app.crud.customer_booking_request import get_auto_approve_seconds

    normal_delay = get_auto_approve_seconds(db, is_urgent=False)
    urgent_delay = get_auto_approve_seconds(db, is_urgent=True)
    requests = (
        db.query(CustomerBookingRequest)
        .filter(CustomerBookingRequest.status == "PENDING")
        .filter(CustomerBookingRequest.requires_manual_confirm == False)  # noqa: E712 - enquiries have their own inbox
        .order_by(CustomerBookingRequest.created_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "customer_name": r.customer_name,
            "customer_number": r.customer_number,
            "pickup_drop_location": r.pickup_drop_location,
            "trip_type": r.trip_type,
            "car_type": r.car_type,
            "start_date_time": r.start_date_time,
            "quoted_total_amount": r.quoted_total_amount,
            "source": r.source,
            "created_at": r.created_at,
            "is_urgent": r.is_urgent,
            "auto_post_at": r.created_at + timedelta(seconds=urgent_delay if r.is_urgent else normal_delay),
        }
        for r in requests
    ]


def approve_website_booking(db, request_id, decided_by: str = "ADMIN"):
    from app.crud.customer_booking_request import approve_customer_booking_request

    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    return approve_customer_booking_request(db, request, decided_by=decided_by)


def reject_website_booking(db, request_id, reason: str) -> dict:
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    from datetime import datetime
    request.status = "REJECTED"
    request.rejection_reason = reason
    request.decided_at = datetime.utcnow()
    request.decided_by = "ADMIN"
    db.commit()
    return {"status": "REJECTED"}
