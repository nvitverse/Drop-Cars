# api/routes/website_bookings.py
"""
Server-to-server bridge for the Drop Cars website (a separate PHP/MySQL
system - see WEBSITE_COST_SAVING_INTEGRATION.md for the existing, unrelated
city-suggestion bridge). A booking confirmed on the website lands here as a
PENDING CustomerBookingRequest, same as an app booking, so it reuses the
existing admin-approval -> NewOrder -> Order pipeline (which already fires the
Telegram alert and vehicle-owner push fan-out - see create_master_from_new_order
in app/crud/orders.py). Two differences from the app flow:
  - Auth is a shared secret (X-DropCars-Website-Key), not a customer/admin JWT,
    since the website has no logged-in Drop Cars user to act as.
  - If nobody approves it in time, it auto-posts anyway (see
    app/crud/customer_booking_request.py:auto_approve_expired_booking_requests,
    wired into the existing sweep timer in app/main.py).
"""
import os
from datetime import datetime, timedelta
import logging
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, status, File, Form, UploadFile, BackgroundTasks
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.models.customer_booking_request import CustomerBookingRequest
from app.models.website_integration import WebsiteIntegration
from app.crud.customer import find_or_create_guest_customer
from app.crud.notification import send_push_notification_to_admin

logger = logging.getLogger(__name__)
router = APIRouter()

WEBSITE_INTEGRATION_KEY = os.getenv("WEBSITE_INTEGRATION_KEY")
WEBSITE_STATUS_WEBHOOK_URL = os.getenv("WEBSITE_STATUS_WEBHOOK_URL")


def require_website_key(
    x_dropcars_website_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[WebsiteIntegration]:
    """Accepts either the original single env-var key (kept so the existing
    live website keeps working unchanged) or a key issued to a row in
    website_integrations (admin-managed, see /admin/website-integrations) -
    that's what lets a NEW website be added without an env var edit or
    redeploy. Returns the matched integration row (or None for the
    env-var/legacy path) so callers can stamp source_website_id."""
    if not x_dropcars_website_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing website key")

    if WEBSITE_INTEGRATION_KEY and x_dropcars_website_key == WEBSITE_INTEGRATION_KEY:
        return None

    integration = db.query(WebsiteIntegration).filter(
        WebsiteIntegration.api_key == x_dropcars_website_key,
        WebsiteIntegration.is_active == True,  # noqa: E712
    ).first()
    if not integration:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing website key")
    return integration


class CreatePaymentOrderRequest(BaseModel):
    amount_rupees: int
    notes: Optional[Dict[str, str]] = None


@router.post("/website/payments/create-order", dependencies=[Depends(require_website_key)])
def create_payment_order(body: CreatePaymentOrderRequest):
    """Create a Razorpay order for the website's urgent-booking advance,
    using the SAME Razorpay account/credentials as the Driver/Vendor apps
    (see app/utils/razorpay_client.py) - just a different order, not a
    separate integration. The website opens Razorpay Checkout with the
    returned order_id + key_id, then POSTs the resulting payment reference
    back via /website/bookings' rp_order_id/rp_payment_id/rp_signature."""
    if body.amount_rupees <= 0:
        raise HTTPException(status_code=400, detail="amount_rupees must be positive")
    from app.utils.razorpay_client import RazorpayClient
    client = RazorpayClient()
    if not client.key_id or not client.key_secret:
        raise HTTPException(status_code=503, detail="Payments are not configured right now")
    try:
        order = client.create_order(body.amount_rupees, notes=body.notes)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not create payment order: {str(e)}")
    return {
        "razorpay_order_id": order.get("id"),
        "amount_paise": order.get("amount"),
        "currency": order.get("currency", "INR"),
        "key_id": client.key_id,
    }


class WebsiteBookingCreate(BaseModel):
    customer_name: str
    customer_number: str
    customer_email: Optional[str] = None
    pickup_drop_location: Dict[str, str]
    trip_type: str  # Must be one of: "Oneway" | "Round Trip" | "Hourly Rental" | "Multy City"
    car_type: str   # Must be a canonical CarTypeEnum value, e.g. "SEDAN_4_PLUS_1"
    start_date_time: datetime
    is_urgent: bool = False  # "Urgent - need taxi immediately" - short admin-review window
    # Razorpay proof for the urgent advance - required and verified below
    # when is_urgent is true (see app/utils/razorpay_client.py). Left unset
    # for normal bookings, which have no advance.
    rp_order_id: Optional[str] = None
    rp_payment_id: Optional[str] = None
    rp_signature: Optional[str] = None
    # Rupee amount actually charged for the advance (website computes 15% of
    # the fare and charges it via Razorpay before this request is created).
    # Without this, a verified real advance payment had no way to reach
    # NewOrder.advance_received at approval time.
    advance_amount: Optional[int] = None
    driver_referral_code: Optional[str] = None
    # A soft lead (customer just checking prices via the enquiry form) rather
    # than a real confirmed booking - stays PENDING forever until someone
    # explicitly confirms it (website/admin panel/Admin App), never
    # auto-posts to the driver marketplace on the normal review timer.
    is_enquiry: bool = False
    # The fare the customer saw and confirmed on the website (per-km rate, bata, billable km, total). When present and sensible it
    # becomes the booking's quote instead of the backend's own rate card (see crud/website_quote.py). Kept loose (a plain dict): a
    # malformed quote must never make the whole booking fail - it is ignored and the backend tariff is used.
    quoted_fare: Optional[Dict[str, Any]] = None

    @field_validator("pickup_drop_location", mode="before")
    def locations_from_list(cls, v):
        # The website (PHP) builds ['0' => pickup, '1' => drop]; json_encode() turns a 0..n-1 keyed array into a JSON
        # LIST, so every website booking arrived as ["pickup", "drop"] and was rejected with 422 (nothing was ever
        # posted). Accept the list form too.
        if isinstance(v, list):
            return {str(i): str(x) for i, x in enumerate(v) if x is not None}
        return v

    @field_validator("pickup_drop_location")
    def validate_locations(cls, v: Dict[str, str]):
        if not isinstance(v, dict) or len(v.keys()) < 2:
            raise ValueError("pickup_drop_location must contain at least a source (0) and a destination (1)")
        return v


class WebsiteBookingOut(BaseModel):
    id: UUID
    status: str
    quoted_total_amount: int
    auto_post_at: Optional[datetime] = None


@router.post("/website/bookings", response_model=WebsiteBookingOut, status_code=status.HTTP_201_CREATED)
async def create_website_booking(
    payload: WebsiteBookingCreate,
    db: Session = Depends(get_db),
    integration: Optional[WebsiteIntegration] = Depends(require_website_key),
):
    from app.api.routes.customer_bookings import _calculate_fare_internal
    from app.crud.customer_booking_request import get_auto_approve_seconds
    from datetime import timedelta, timezone

    # Urgent bookings are pre-paid (15% advance, collected on the website
    # before this call) - verify the Razorpay signature server-side so a
    # forged/replayed payment reference can't create a "paid" booking.
    verified_advance_amount = None
    if payload.is_urgent:
        if not (payload.rp_order_id and payload.rp_payment_id and payload.rp_signature):
            raise HTTPException(status_code=400, detail="Urgent bookings require a completed advance payment")
        from app.utils.razorpay_client import RazorpayClient
        if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
            raise HTTPException(status_code=400, detail="Payment verification failed - please try the payment again")
        # verify_signature only proves a real payment happened for that
        # order/payment id pair - it says nothing about the AMOUNT. The
        # website's own advance_amount field was being trusted as-is and
        # stored straight onto the booking, where it later reduces how
        # much cash the driver is expected to collect at trip end (see
        # crud/end_records.py's cash-settlement comment) - an inflated
        # value here (bug or bad actor) means the platform/driver collects
        # less than the customer actually owes. Cross-check the real
        # captured amount with Razorpay instead of trusting the field.
        try:
            from starlette.concurrency import run_in_threadpool as _rtp
            rp_order = await _rtp(RazorpayClient().get_order, payload.rp_order_id)
            verified_advance_amount = int((rp_order.get("amount_paid") or 0) // 100)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not confirm advance payment with Razorpay: {str(e)}")
        if verified_advance_amount <= 0:
            raise HTTPException(status_code=400, detail="Payment not confirmed as paid by Razorpay")

    try:
        credentials, _details = find_or_create_guest_customer(db, payload.customer_number, payload.customer_name)

        # Google Maps / rate card lookups are blocking: run them in the thread pool so one slow lookup never freezes the whole server
        from starlette.concurrency import run_in_threadpool
        fare, rates = await run_in_threadpool(
            _calculate_fare_internal, db, payload.pickup_drop_location, payload.trip_type, payload.car_type
        )
        website_quote = None
        if payload.quoted_fare:
            from app.crud.website_quote import WebsiteQuotedFare, apply_website_quote
            try:
                website_quote = apply_website_quote(fare, WebsiteQuotedFare(**payload.quoted_fare))
            except Exception as e:  # noqa: BLE001
                logger.warning("website quoted_fare ignored: %s", type(e).__name__)
        if website_quote:
            rates = {**rates, "cost_per_km": website_quote["cost_per_km"], "driver_allowance": website_quote["driver_allowance"],
                     "extra_driver_allowance": 0, "permit_charges": website_quote["permit_charges"], "extra_permit_charges": 0, "hill_charges": 0,
                     "toll_charges": website_quote["toll_charges"], "extra_cost_per_km": 0, "night_charges": 0}
            fare = {**fare, "total_amount": website_quote["total_amount"], "driver_amount": website_quote["driver_amount"],
                    "total_km": website_quote["total_km"]}

        driver_referral_code = (payload.driver_referral_code or "").strip().upper() or None
        if driver_referral_code:
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            referrer = db.query(VehicleOwnerDetails).filter(
                VehicleOwnerDetails.referral_code == driver_referral_code
            ).first()
            if not referrer:
                raise HTTPException(status_code=404, detail="Referral code not found")

        booking = CustomerBookingRequest(
            customer_id=credentials.id,
            pickup_drop_location=payload.pickup_drop_location,
            trip_type=payload.trip_type,
            car_type=payload.car_type,
            start_date_time=payload.start_date_time,
            customer_name=payload.customer_name,
            customer_number=payload.customer_number,
            customer_email=payload.customer_email,
            driver_referral_code=driver_referral_code,

            quoted_cost_per_km=rates["cost_per_km"],
            quoted_driver_allowance=rates["driver_allowance"],
            quoted_extra_driver_allowance=rates["extra_driver_allowance"],
            quoted_permit_charges=rates["permit_charges"],
            quoted_extra_permit_charges=rates["extra_permit_charges"],
            quoted_hill_charges=rates["hill_charges"],
            quoted_toll_charges=rates["toll_charges"],
            quoted_extra_cost_per_km=rates["extra_cost_per_km"],
            quoted_night_charges=rates["night_charges"],
            quoted_total_amount=fare["total_amount"],
            quoted_driver_amount=fare["driver_amount"],
            quoted_trip_distance=fare["total_km"],
            quoted_trip_time=fare["trip_time"],

            status="PENDING",
            source="WEBSITE",
            source_website_id=integration.id if integration else None,
            is_paid=payload.is_urgent,  # verified above if urgent; normal bookings have no advance
            is_urgent=payload.is_urgent,
            rp_order_id=payload.rp_order_id,
            rp_payment_id=payload.rp_payment_id,
            rp_signature=payload.rp_signature,
            advance_amount=verified_advance_amount if payload.is_urgent else None,
            requires_manual_confirm=payload.is_enquiry,
            gst_included=bool(website_quote and website_quote["gst_amount"]),
            gst_amount=website_quote["gst_amount"] if website_quote else None,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to create website booking: {str(e)}")

    delay_seconds = get_auto_approve_seconds(db, is_urgent=payload.is_urgent)
    from datetime import timezone as _tz
    from app.crud.customer_booking_request import get_website_post_mode
    from app.crud import website_post_rules as post_rules
    post_mode = get_website_post_mode(db)
    _now = datetime.now(_tz.utc)
    _rules = post_rules.get_rules(db)
    _plan = post_rules.compute_post_plan(
        booking, now=_now, staff_on=post_rules.any_staff_present(db, _now, _rules), rules=_rules, mode=post_mode,
        normal_seconds=get_auto_approve_seconds(db, is_urgent=False), urgent_seconds=get_auto_approve_seconds(db, is_urgent=True),
    )
    auto_post_at = None if payload.is_enquiry else _plan["deadline"]
    seconds_left = max(5, int((auto_post_at - _now).total_seconds())) if auto_post_at is not None else 0
    minutes = max(1, seconds_left // 60)
    if auto_post_at is not None and seconds_left <= 3600:
        # wake the service at the right moment (the one-minute Cloud Scheduler sweep covers anything later)
        from app.crud.notification import schedule_internal_sweep
        schedule_internal_sweep(seconds_left + 5)

    try:
        urgency_prefix = "URGENT: " if payload.is_urgent else ""
        if post_mode == "MANUAL":
            when = "Waiting for your approval (auto-post is off)."
        elif auto_post_at is None:
            when = "Staff on duty will handle it."
        elif seconds_left > 3600:
            when = f"{_plan['reason']}."
        else:
            when = f"Auto-posts in {minutes} min if not reviewed."
        await send_push_notification_to_admin(
            db,
            title=f"{urgency_prefix}New website booking needs approval",
            message=f"{payload.customer_name} - {payload.pickup_drop_location.get('0', '')} -> {list(payload.pickup_drop_location.values())[-1]}. " + when,
        )
    except Exception as e:
        print(f"Failed to alert admin of new website booking: {e}")

    return WebsiteBookingOut(
        id=booking.id,
        status=booking.status,
        quoted_total_amount=booking.quoted_total_amount,
        auto_post_at=auto_post_at,
    )


@router.get("/website/bookings/pending", dependencies=[Depends(require_website_key)])
def list_pending_website_bookings(db: Session = Depends(get_db)):
    """Shared logic (also excludes enquiries/soft-leads - see
    crud/website_booking_approvals.py's module docstring) lives in
    crud/website_booking_approvals.py, called from here and from the Admin
    App's JWT-authenticated mirror in admin.py."""
    from app.crud.website_booking_approvals import list_pending_website_bookings as _list
    return _list(db)


@router.post("/website/bookings/{id}/approve", dependencies=[Depends(require_website_key)])
def approve_website_booking(id: UUID, db: Session = Depends(get_db)):
    from app.crud.website_booking_approvals import approve_website_booking as _approve
    master_order = _approve(db, id)
    return {"status": "APPROVED", "order_id": master_order.id}


class WebsiteBookingReject(BaseModel):
    reason: str


@router.post("/website/bookings/{id}/reject", dependencies=[Depends(require_website_key)])
def reject_website_booking(id: UUID, body: WebsiteBookingReject, db: Session = Depends(get_db)):
    from app.crud.website_booking_approvals import reject_website_booking as _reject
    return _reject(db, id, body.reason)


class WebsiteBookingRatesUpdate(BaseModel):
    cost_per_km: Optional[int] = None
    extra_cost_per_km: Optional[int] = None
    gst_included: Optional[bool] = None
    gst_amount: Optional[int] = None


class WebsiteQuoteRepair(BaseModel):
    quoted_fare: Dict[str, Any]


@router.put("/website/bookings/{id}/quote", dependencies=[Depends(require_website_key)])
def repair_website_booking_quote(id: UUID, body: WebsiteQuoteRepair, db: Session = Depends(get_db)):
    """The website's Sync tool: a booking that reached the backend without the customer's confirmed fare gets that fare as its quote
    (only while PENDING and not edited by staff). Returns {updated: bool}."""
    from app.models.customer_booking_request import CustomerBookingRequest
    from app.crud.website_quote import apply_quote_to_request
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    updated = apply_quote_to_request(request, body.quoted_fare)
    if updated:
        db.commit()
    return {"updated": updated, "quoted_total_amount": request.quoted_total_amount, "quoted_cost_per_km": request.quoted_cost_per_km}


@router.patch("/website/bookings/{id}/rates", dependencies=[Depends(require_website_key)])
def update_website_booking_rates(id: UUID, body: WebsiteBookingRatesUpdate, db: Session = Depends(get_db)):
    """Lets the website's Enquiry "Customize" action set the DRIVER-facing
    per-km rate (what the Driver/Vendor App shows) on a still-pending
    request - separate from quoted_total_amount/fare_estimate, which is
    the CUSTOMER's price. Only while PENDING: once approved/converted into
    a real Order, edit its rates the normal way (admin's edit-fare, or the
    vendor's own PATCH /{order_id}/edit) instead - this endpoint only
    exists to bridge the gap before that conversion happens. Values here
    become the request's admin_cost_per_km/admin_extra_cost_per_km, which
    approve_customer_booking_request() already copies onto the resulting
    NewOrder's cost_per_km/extra_cost_per_km."""
    from app.models.customer_booking_request import CustomerBookingRequest
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a still-pending request's rates can be edited here")
    if body.cost_per_km is not None:
        request.admin_cost_per_km = body.cost_per_km
    if body.extra_cost_per_km is not None:
        request.admin_extra_cost_per_km = body.extra_cost_per_km
    if body.gst_included is not None:
        request.gst_included = body.gst_included
    if body.gst_amount is not None:
        request.gst_amount = body.gst_amount
    db.commit()
    return {
        "status": "OK",
        "admin_cost_per_km": request.admin_cost_per_km,
        "admin_extra_cost_per_km": request.admin_extra_cost_per_km,
        "gst_included": request.gst_included,
        "gst_amount": request.gst_amount,
    }


@router.get("/website/bookings/{id}/trip-codes", dependencies=[Depends(require_website_key)])
def website_trip_codes(id: UUID, db: Session = Depends(get_db)):
    """The customer's trip start / end codes for the website's "My Bookings" page. The website must only call this for the booking
    of the customer who is signed in there (e-mail login); the codes are what the customer reads to the driver."""
    from app.crud.trip_otp import trip_codes_for_request
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    return trip_codes_for_request(db, request)


@router.post("/website/bookings/{id}/request-cancel-otp", dependencies=[Depends(require_website_key)])
def request_cancel_otp(id: UUID, db: Session = Depends(get_db)):
    """Step 1 of a customer-initiated cancel: email a fresh OTP to the
    customer on file. A booking ID alone isn't proof of identity - anyone
    who has it (it's shown in confirmation emails/WhatsApp) could otherwise
    cancel someone else's trip."""
    import random

    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status not in ("PENDING", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"This booking is already {request.status.lower()} and cannot be cancelled")
    if not request.customer_email:
        raise HTTPException(status_code=400, detail="No email on file for this booking - please contact support to cancel")

    otp = f"{random.randint(0, 999999):06d}"
    request.cancel_otp = otp
    request.cancel_otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    db.commit()

    try:
        from app.utils.emailer import send_email, smtp_configured
        if smtp_configured(db):
            send_email(
                db, request.customer_email,
                "Drop Cars - Cancellation Verification Code",
                f"Hi {request.customer_name},\n\n"
                f"Your one-time code to cancel booking {request.id} is: {otp}\n\n"
                "This code expires in 10 minutes. If you didn't request this, you can ignore this email - "
                "your booking is unaffected.\n\n- Drop Cars Team",
            )
    except Exception as e:
        print(f"Cancel OTP email failed for request {id} (OTP still generated): {e}")

    return {"status": "OTP_SENT"}


class ConfirmCancelRequest(BaseModel):
    otp: str
    reason: Optional[str] = None


@router.post("/website/bookings/{id}/confirm-cancel", dependencies=[Depends(require_website_key)])
def confirm_cancel(id: UUID, body: ConfirmCancelRequest, db: Session = Depends(get_db)):
    """Step 2: verify the OTP, then actually cancel - PENDING requests are
    simply rejected (nothing was ever posted to the marketplace), APPROVED
    ones go through cancel_order_by_customer for the real refund-tier logic."""
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status not in ("PENDING", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"This booking is already {request.status.lower()} and cannot be cancelled")

    now = datetime.utcnow()
    otp_expires_at = request.cancel_otp_expires_at
    if otp_expires_at and otp_expires_at.tzinfo is not None:
        otp_expires_at = otp_expires_at.replace(tzinfo=None)
    if not request.cancel_otp or not otp_expires_at or otp_expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired or not requested - please request a new code")
    if body.otp.strip() != request.cancel_otp:
        raise HTTPException(status_code=400, detail="Incorrect code")

    # OTP is single-use regardless of outcome below.
    request.cancel_otp = None
    request.cancel_otp_expires_at = None

    if request.status == "PENDING":
        request.status = "REJECTED"
        request.rejection_reason = "Cancelled by customer before admin review"
        request.decided_at = now
        request.decided_by = "CUSTOMER"
        request.refund_eligible = True  # nothing was ever posted, no driver ever involved
        db.commit()
        return {"status": "CANCELLED", "refund_eligible": True}

    # APPROVED: a real Order exists in the marketplace.
    from app.crud.order_assignments import cancel_order_by_customer
    if not request.linked_order_id:
        raise HTTPException(status_code=400, detail="No linked order found for this booking")
    try:
        result = cancel_order_by_customer(db, request.linked_order_id, body.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    request.refund_eligible = result["refund_eligible"]
    db.commit()

    from app.utils.website_status_webhook import notify_website_of_status
    notify_website_of_status(db, request.linked_order_id, "CANCELLED")

    return {"status": "CANCELLED", "refund_eligible": result["refund_eligible"]}


@router.post("/website/bookings/{id}/request-refund", dependencies=[Depends(require_website_key)])
async def request_refund(id: UUID, db: Session = Depends(get_db)):
    """Customer clicks "Request Refund" after an eligible cancellation.
    Deliberately NOT automatic - this just queues it for admin to review
    and process (see /website/bookings/refund-requests and
    /website/bookings/{id}/process-refund below). "1-5 working days" is the
    customer-facing promise regardless of how long admin actually takes."""
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status not in ("REJECTED", "APPROVED") or request.refund_eligible is not True:
        raise HTTPException(status_code=400, detail="This booking is not eligible for a refund")
    if request.refund_status == "REQUESTED":
        raise HTTPException(status_code=400, detail="A refund has already been requested for this booking")
    if request.refund_status == "PROCESSED":
        raise HTTPException(status_code=400, detail="This refund has already been processed")

    request.refund_status = "REQUESTED"
    request.refund_requested_at = datetime.utcnow()
    db.commit()

    try:
        from app.crud.notification import send_push_notification_to_admin
        await send_push_notification_to_admin(
            db, title="Refund requested",
            message=f"{request.customer_name} requested a refund for booking {request.id}.",
        )
    except Exception as e:
        print(f"Refund-request admin alert failed (request still recorded): {e}")

    return {
        "status": "REQUESTED",
        "message": "Your refund has been requested. It will be processed within 1-5 working days.",
    }


@router.get("/website/bookings/refund-requests", dependencies=[Depends(require_website_key)])
def list_refund_requests(db: Session = Depends(get_db)):
    """Admin queue - see admin/pages/refund-requests.php on the website.
    Shared logic lives in crud/refund_requests.py - the Admin App's
    JWT-authenticated mirror (app/api/routes/admin.py) calls the same
    functions."""
    from app.crud.refund_requests import list_pending_refund_requests
    return list_pending_refund_requests(db)


class ProcessRefundRequest(BaseModel):
    approve: bool
    refund_amount: Optional[int] = None
    notes: Optional[str] = None
    # Only meaningful when approve=true and the booking has an rp_payment_id
    # on file (a real Razorpay advance, not a manual-UPI one). Defaults to
    # true - admin can uncheck it to record the refund as done manually
    # (e.g. already refunded outside the system) without calling Razorpay again.
    via_razorpay: bool = True


@router.post("/website/bookings/{id}/process-refund", dependencies=[Depends(require_website_key)])
def process_refund(id: UUID, body: ProcessRefundRequest, db: Session = Depends(get_db)):
    """Admin marks a requested refund as processed (approve=true, with the
    amount actually refunded via whatever payment channel was used - manual
    UPI or Razorpay) or denied (approve=false, with a reason in notes)."""
    from app.crud.refund_requests import process_refund_request
    return process_refund_request(db, id, body.approve, body.refund_amount, body.notes, body.via_razorpay)


# --- Driver trip-link (website-only live tracking, no Driver App login) ---
# A shareable link (pages/driver-trip.php?token=...) generated per-assignment
# (see the trip_link_token generation next to start_trip_otp/end_trip_otp in
# api/routes/order_assignments.py). The token itself IS the auth - no
# X-DropCars-Website-Key needed on these three, since the driver's own phone
# browser calls them directly (CORS is wildcard-open, see main.py). Reuses
# the exact same create_start_trip_record() the JWT-based
# /driver/start-trip/{order_id} endpoint uses, so a trip started via this
# link is indistinguishable downstream from one started in the Driver App.

def _get_assignment_by_trip_token(db: Session, token: str):
    from app.models.order_assignments import OrderAssignment
    assignment = db.query(OrderAssignment).filter(OrderAssignment.trip_link_token == token).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Invalid or expired trip link")
    return assignment


@router.get("/website/trip-link/{token}")
def get_trip_link_info(token: str, db: Session = Depends(get_db)):
    from app.models.order_assignments import AssignmentStatusEnum
    from app.models.orders import Order
    from app.models.end_records import EndRecord

    assignment = _get_assignment_by_trip_token(db, token)
    order = db.query(Order).filter(Order.id == assignment.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")

    started = db.query(EndRecord).filter(
        EndRecord.order_id == assignment.order_id,
        EndRecord.driver_id == assignment.driver_id,
    ).first() is not None

    return {
        "order_id": order.id,
        "customer_name": order.customer_name,
        "pickup_drop_location": order.pickup_drop_location,
        "trip_status": order.trip_status,
        "assignment_status": assignment.assignment_status,
        "trip_started": started,
        "trip_cancelled": assignment.assignment_status == AssignmentStatusEnum.CANCELLED,
    }


@router.post("/website/trip-link/{token}/start")
async def start_trip_via_link(
    token: str,
    start_km: int = Form(...),
    otp: str = Form(...),
    speedometer_img: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Same OTP/km/photo flow as POST /driver/start-trip/{order_id}, just
    authenticated by the link token instead of a driver JWT."""
    from app.models.order_assignments import AssignmentStatusEnum

    assignment = _get_assignment_by_trip_token(db, token)
    if assignment.assignment_status == AssignmentStatusEnum.CANCELLED:
        raise HTTPException(status_code=400, detail="This assignment has been cancelled")
    if assignment.assignment_status == AssignmentStatusEnum.COMPLETED:
        raise HTTPException(status_code=400, detail="This trip is already completed - its codes are no longer valid")
    if assignment.start_trip_otp and otp.strip() != assignment.start_trip_otp:
        raise HTTPException(status_code=400, detail="Incorrect trip start code - ask the customer for the code from their confirmation email")

    if not speedometer_img.content_type or not speedometer_img.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image file.")

    from app.utils.gcs import upload_image_to_gcs
    folder_path = f"trip_records/{assignment.order_id}/start"
    speedometer_img_url = upload_image_to_gcs(speedometer_img, folder_path)

    from app.crud.end_records import create_start_trip_record
    try:
        trip_record = await create_start_trip_record(
            db=db,
            order_id=assignment.order_id,
            driver_id=str(assignment.driver_id),
            start_km=start_km,
            speedometer_img_url=speedometer_img_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": "Trip started successfully",
        "end_record_id": trip_record.id,
        "start_km": trip_record.start_km,
        "speedometer_img_url": speedometer_img_url,
    }


class TripLinkLocationPing(BaseModel):
    lat: float
    lng: float


def _mirror_location_to_website(order_id: int, lat: float, lng: float) -> None:
    """Runs AFTER the response is sent (see BackgroundTasks below) - was a
    synchronous `requests.post(..., timeout=5)` inline in the request
    handler, meaning every single location ping (client already throttles to
    one per 10s, but that's still every active trip, every 10s, at whatever
    driver count) blocked on an outbound HTTP call to a third-party site
    before the response could return. At scale this is exactly the kind of
    hidden latency that eats into a pooled DB connection's hold time for no
    reason - the actual location write above has already committed by the
    time this runs, so there's nothing for the response to wait on here."""
    db = SessionLocal()
    try:
        request = _find_website_booking_request_for_order(db, order_id)
        if request and WEBSITE_STATUS_WEBHOOK_URL and WEBSITE_INTEGRATION_KEY:
            import requests
            requests.post(
                WEBSITE_STATUS_WEBHOOK_URL,
                json={
                    "backend_request_id": str(request.id),
                    "status": "LOCATION_UPDATE",
                    "last_lat": lat,
                    "last_lng": lng,
                    "tracking_left": False,
                },
                headers={"X-DropCars-Website-Key": WEBSITE_INTEGRATION_KEY},
                timeout=5,
            )
    except Exception as e:
        print(f"trip-link location mirror to website failed (location still saved on backend): {e}")
    finally:
        db.close()


@router.post("/website/trip-link/{token}/location")
def update_trip_link_location(token: str, body: TripLinkLocationPing, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Fired repeatedly by navigator.geolocation.watchPosition() while
    pages/driver-trip.php stays open in the driver's browser. Last-write-wins;
    no history is kept, only the latest fix."""
    assignment = _get_assignment_by_trip_token(db, token)
    assignment.last_lat = str(body.lat)
    assignment.last_lng = str(body.lng)
    assignment.last_location_at = datetime.utcnow()
    # A fresh fix proves the page is still open and tracking - clear any
    # earlier "left the page" flag from a background/foreground blip.
    assignment.tracking_left_at = None
    order_id = assignment.order_id
    db.commit()

    # Best-effort mirror to the website's own MySQL `bookings` row so
    # track-booking.php can read it locally without calling back into the
    # backend on every customer page load - deferred to run after the
    # response is sent instead of blocking it (see _mirror_location_to_website).
    background_tasks.add_task(_mirror_location_to_website, order_id, body.lat, body.lng)

    return {"status": "ok"}


@router.post("/website/trip-link/{token}/left")
def trip_link_page_left(token: str, db: Session = Depends(get_db)):
    """Sent via navigator.sendBeacon() when driver-trip.php detects it was
    backgrounded or is closing (visibilitychange/pagehide) - see the JS in
    pages/driver-trip.php. This is DETECTION, not enforcement: a website page
    cannot actually force the driver's browser tab to stay open. It exists so
    track-booking.php can honestly show "driver paused sharing" instead of
    silently freezing on a stale pin."""
    assignment = _get_assignment_by_trip_token(db, token)
    assignment.tracking_left_at = datetime.utcnow()
    db.commit()

    try:
        request = _find_website_booking_request_for_order(db, assignment.order_id)
        if request and WEBSITE_STATUS_WEBHOOK_URL and WEBSITE_INTEGRATION_KEY:
            import requests
            requests.post(
                WEBSITE_STATUS_WEBHOOK_URL,
                json={
                    "backend_request_id": str(request.id),
                    "status": "LOCATION_UPDATE",
                    "last_lat": None,
                    "last_lng": None,
                    "tracking_left": True,
                },
                headers={"X-DropCars-Website-Key": WEBSITE_INTEGRATION_KEY},
                timeout=5,
            )
    except Exception as e:
        print(f"trip-link 'left' mirror to website failed (flag still saved on backend): {e}")

    return {"status": "ok"}


def _find_website_booking_request_for_order(db: Session, order_id: int):
    from app.models.customer_booking_request import CustomerBookingRequest
    return (
        db.query(CustomerBookingRequest)
        .filter(
            CustomerBookingRequest.linked_order_id == order_id,
            CustomerBookingRequest.source == "WEBSITE",
        )
        .first()
    )


class WebsiteBookingSettingsUpdate(BaseModel):
    auto_approve_seconds: Optional[int] = None
    urgent_approve_seconds: Optional[int] = None


@router.get("/website/bookings/settings", dependencies=[Depends(require_website_key)])
def get_website_booking_settings(db: Session = Depends(get_db)):
    """Same underlying values as GET /admin/website-booking-settings (admin-JWT
    gated, for the Admin app) - this is the shared-secret twin so the website
    can read/edit the two real settings too. See app/crud/customer_booking_request.py."""
    from app.crud.customer_booking_request import get_auto_approve_seconds
    return {
        "auto_approve_seconds": get_auto_approve_seconds(db, is_urgent=False),
        "urgent_approve_seconds": get_auto_approve_seconds(db, is_urgent=True),
    }


@router.put("/website/bookings/settings", dependencies=[Depends(require_website_key)])
def update_website_booking_settings(body: WebsiteBookingSettingsUpdate, db: Session = Depends(get_db)):
    from app.crud.customer_booking_request import (
        set_platform_setting_value, WEBSITE_AUTO_APPROVE_SECONDS_KEY, WEBSITE_URGENT_APPROVE_SECONDS_KEY,
        get_auto_approve_seconds,
    )
    if body.auto_approve_seconds is not None:
        if body.auto_approve_seconds < 30:
            raise HTTPException(status_code=400, detail="auto_approve_seconds must be at least 30")
        set_platform_setting_value(db, WEBSITE_AUTO_APPROVE_SECONDS_KEY, str(body.auto_approve_seconds))
    if body.urgent_approve_seconds is not None:
        if body.urgent_approve_seconds < 30:
            raise HTTPException(status_code=400, detail="urgent_approve_seconds must be at least 30")
        set_platform_setting_value(db, WEBSITE_URGENT_APPROVE_SECONDS_KEY, str(body.urgent_approve_seconds))
    return {
        "auto_approve_seconds": get_auto_approve_seconds(db, is_urgent=False),
        "urgent_approve_seconds": get_auto_approve_seconds(db, is_urgent=True),
    }


# --- Admin management of website integrations (Admin app, admin-JWT gated) ---
# This is what makes adding a new website "no hardcoding": admin creates a row
# here, gets back an api_key, hands it to whoever builds the new site's
# integration - done. No env var, no code change, no redeploy.

from app.core.security import get_current_admin


class WebsiteIntegrationOut(BaseModel):
    id: UUID
    name: str
    api_key: str
    is_active: bool
    created_at: datetime


class WebsiteIntegrationCreate(BaseModel):
    name: str


@router.get("/admin/website-integrations", response_model=list[WebsiteIntegrationOut])
def list_website_integrations(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.models.website_integration import WebsiteIntegration
    return db.query(WebsiteIntegration).order_by(WebsiteIntegration.created_at.desc()).all()


@router.post("/admin/website-integrations", response_model=WebsiteIntegrationOut, status_code=status.HTTP_201_CREATED)
def create_website_integration(body: WebsiteIntegrationCreate, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    import secrets
    from app.models.website_integration import WebsiteIntegration

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    integration = WebsiteIntegration(name=name, api_key=secrets.token_urlsafe(32), is_active=True)
    db.add(integration)
    db.commit()
    db.refresh(integration)
    return integration


@router.put("/admin/website-integrations/{id}/deactivate", response_model=WebsiteIntegrationOut)
def deactivate_website_integration(id: UUID, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.models.website_integration import WebsiteIntegration
    integration = db.query(WebsiteIntegration).filter(WebsiteIntegration.id == id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    integration.is_active = False
    db.commit()
    db.refresh(integration)
    return integration


@router.put("/admin/website-integrations/{id}/activate", response_model=WebsiteIntegrationOut)
def activate_website_integration(id: UUID, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.models.website_integration import WebsiteIntegration
    integration = db.query(WebsiteIntegration).filter(WebsiteIntegration.id == id).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    integration.is_active = True
    db.commit()
    db.refresh(integration)
    return integration
