"""
Drop Bid - reverse-auction negotiation (see models/drop_bid.py for the full
picture). Customer posts a target price; drivers submit competing offers
from their own real fleet; customer accepts one, which converts into a
real Order - same underlying create_oneway_order/auto-assign path
driver_create_booking_confirm uses (order_assignments.py), same
All-Inclusive commission rule (vendor_profit=0 here - no vendor in a
direct customer-driver match, admin_profit=5% always, driver keeps the
rest). Was a pure Driver App UI mock with zero backend before this.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import random
import secrets

from app.database.session import get_db
from app.core.security import get_current_customer, get_current_driver, get_current_admin, get_current_user_flexible
from app.models.drop_bid import DropBidRequest, DropBidOffer
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.orders import Order, Trip_status

router = APIRouter(prefix="/dropbid", tags=["Drop Bid"])

# Same 15% figure the Customer App's DriverQuote UI has always assumed
# (constants/bookingConfig.ts's CUSTOMER_ADVANCE_PERCENT) - now backed by
# a real Razorpay payment instead of being purely cosmetic.
ADVANCE_PERCENT = 15


def _invalidate_advance_if_paid(offer: DropBidOffer):
    """Call whenever offer.offer_price is about to change to a new value
    (a counter being accepted, or a driver directly re-bidding). Any
    advance already paid was 15% of the OLD price - it can't correctly
    cover a different final price, so make the customer pay again rather
    than silently accept a stale/mismatched amount."""
    if offer.advance_paid:
        offer.advance_paid = False
        offer.advance_amount = None
        offer.advance_rp_order_id = None
        offer.advance_rp_payment_id = None
        offer.advance_rp_signature = None


# ---------------------------------------------------------------------------
# Customer side: post a negotiation request, review/accept offers
# ---------------------------------------------------------------------------

class CreateDropBidRequestSchema(BaseModel):
    pickup_location: str
    drop_location: str
    trip_type: str = "Oneway"
    car_type: str
    start_date_time: datetime
    estimated_distance: Optional[int] = None
    customer_target_price: int = Field(gt=0)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_drop_bid_request(
    payload: CreateDropBidRequestSchema,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Customer posts a "name your price" trip request for drivers to bid on."""
    # get_current_customer returns the bare CustomerCredentials row (no
    # full_name - that's on the separate CustomerDetails row, same
    # credentials/details split as vendor and vehicle_owner).
    from app.models.customer_details import CustomerDetails
    details = db.query(CustomerDetails).filter(CustomerDetails.customer_id == current_customer.id).first()
    req = DropBidRequest(
        customer_id=current_customer.id,
        customer_name=(details.full_name if details else None) or "Customer",
        customer_number=current_customer.primary_number,
        pickup_location=payload.pickup_location,
        drop_location=payload.drop_location,
        trip_type=payload.trip_type,
        car_type=payload.car_type,
        start_date_time=payload.start_date_time,
        estimated_distance=payload.estimated_distance,
        customer_target_price=payload.customer_target_price,
        status="OPEN",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Broadcast push notification to drivers in pickup location
    try:
        from app.crud.notification import send_new_booking_notification_sync
        send_new_booking_notification_sync(
            db,
            title=f"⚡ New Drop Bid: ₹{req.customer_target_price}",
            message=f"New trip request from {req.pickup_location} to {req.drop_location}. Open Drop Bid to place your bid!",
            ordered_city=[req.pickup_location],
            is_urgent=True,
        )
    except Exception as e:
        print(f"Drop Bid request notification error: {e}")

    return _request_out(req, offers_count=0)


def _request_out(req: DropBidRequest, offers_count: int, submitted_offer: Optional[int] = None,
                  my_offer_id: Optional[str] = None, my_counter_price: Optional[int] = None,
                  my_counter_by: Optional[str] = None) -> dict:
    return {
        "id": req.id,
        "customer_name": req.customer_name,
        "pickup_location": req.pickup_location,
        "drop_location": req.drop_location,
        "trip_type": req.trip_type,
        "car_type": req.car_type,
        "start_date_time": req.start_date_time,
        "customer_target_price": req.customer_target_price,
        "estimated_distance": req.estimated_distance,
        "offers_count": offers_count,
        "status": req.status,
        "submitted_offer": submitted_offer,
        # Surfaced so the driver feed can show "customer countered your
        # offer" without a second call per request.
        "my_offer_id": my_offer_id,
        "my_counter_price": my_counter_price,
        "my_counter_by": my_counter_by,
        "order_id": req.order_id,
    }


@router.get("/requests")
async def list_drop_bid_requests(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver-side feed: every still-OPEN request, with this driver's own
    offer (if any) surfaced so the app can show "Offer Sent" instead of
    letting them bid twice unknowingly - and, if the customer countered it,
    the pending counter so the app can prompt the driver to respond."""
    reqs = db.query(DropBidRequest).filter(DropBidRequest.status == "OPEN").order_by(DropBidRequest.created_at.desc()).all()
    result = []
    for r in reqs:
        offers = db.query(DropBidOffer).filter(DropBidOffer.request_id == r.id).all()
        mine = next((o for o in offers if str(o.driver_id) == str(current_driver.id) and o.status == "PENDING"), None)
        result.append(_request_out(
            r, offers_count=len(offers), submitted_offer=mine.offer_price if mine else None,
            my_offer_id=mine.id if mine else None,
            my_counter_price=mine.counter_price if mine else None,
            my_counter_by=mine.counter_by if mine else None,
        ))
    return result


def _mask_phone(phone: Optional[str]) -> Optional[str]:
    """Same masking convention as the Vacant Driver screen elsewhere in
    this app - enough to recognize/reference the driver without enabling
    an off-platform contact before the customer has actually accepted an
    offer (see the no-bypass architectural rule)."""
    if not phone or len(phone) < 4:
        return phone
    return "•" * (len(phone) - 4) + phone[-4:]


def _offer_out(o: DropBidOffer, db: Session) -> dict:
    """Enriches a bare offer row with the driver/car details a customer
    actually needs to choose between competing offers - the offer row
    itself only ever stored offer_price/status. Added 2026-09-04 for the
    Customer App's Drop Bid screen, which was still showing entirely
    mocked driver names/cars/ratings because this endpoint had none of
    it. ETA/live-distance-to-pickup and ranking/"recommended" tagging are
    NOT included yet - no reliable live-location source for a driver who
    hasn't been assigned yet, and ranking needs its own design pass -
    left for a follow-up."""
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails
    from app.utils.gcs import generate_signed_url_from_gcs

    driver = db.query(CarDriver).filter(CarDriver.id == o.driver_id).first()
    car = db.query(CarDetails).filter(CarDetails.id == o.car_id).first()
    completed_trips = 0
    if o.driver_id:
        from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
        completed_trips = db.query(OrderAssignment).filter(
            OrderAssignment.driver_id == o.driver_id,
            OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED,
        ).count()

    return {
        "id": o.id,
        "offer_price": o.offer_price,
        "status": o.status,
        "counter_price": o.counter_price,
        "counter_by": o.counter_by,
        "created_at": o.created_at,
        "driver_id": o.driver_id,
        "driver_name": driver.full_name if driver else None,
        "driver_phone_masked": _mask_phone(driver.primary_number) if driver else None,
        "driver_rating": round(driver.rating_avg, 1) if driver and driver.rating_count > 0 else None,
        "driver_rating_count": driver.rating_count if driver else 0,
        "completed_trips": completed_trips,
        "car_name": car.car_name if car else None,
        "car_number": car.car_number if car else None,
        "car_img_url": generate_signed_url_from_gcs(car.car_img_url) if car and car.car_img_url else None,
        # Real Razorpay advance payment state (2026-09-04) - see
        # /pay-advance, /verify-advance and _invalidate_advance_if_paid
        # below. advance_amount is computed fresh here too (not just
        # stored) so the app can show "Pay ₹X advance" even before the
        # customer has ever called pay-advance.
        "advance_amount": o.advance_amount if o.advance_amount is not None else round(o.offer_price * ADVANCE_PERCENT / 100),
        "advance_paid": o.advance_paid,
    }


@router.get("/my-requests")
async def list_my_drop_bid_requests(
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Customer's own posted requests, each with its full offer list to review."""
    reqs = db.query(DropBidRequest).filter(DropBidRequest.customer_id == current_customer.id).order_by(DropBidRequest.created_at.desc()).all()
    result = []
    for r in reqs:
        offers = db.query(DropBidOffer).filter(DropBidOffer.request_id == r.id).all()
        result.append({
            **_request_out(r, offers_count=len(offers)),
            "offers": [_offer_out(o, db) for o in offers],
        })
    return result


# ---------------------------------------------------------------------------
# Drop Bid Settings (Admin Toggle: Allow Change Bid, defaults to False)
# ---------------------------------------------------------------------------

class DropBidSettingsUpdateSchema(BaseModel):
    allow_change_bid: bool


@router.get("/settings", dependencies=[Depends(get_current_user_flexible)])
async def get_drop_bid_settings(db: Session = Depends(get_db)):
    """Public / driver / admin endpoint to get Drop Bid settings."""
    from app.models.platform_setting import PlatformSetting
    setting = db.query(PlatformSetting).filter(PlatformSetting.key == "DROP_BID_ALLOW_CHANGE_BID").first()
    allow_change_bid = (setting.value.lower() in ("true", "1", "yes")) if setting else False
    return {"allow_change_bid": allow_change_bid}


@router.put("/settings", dependencies=[Depends(get_current_admin)])
async def update_drop_bid_settings(
    payload: DropBidSettingsUpdateSchema,
    db: Session = Depends(get_db),
):
    """Admin endpoint to update Drop Bid settings."""
    from app.models.platform_setting import PlatformSetting
    setting = db.query(PlatformSetting).filter(PlatformSetting.key == "DROP_BID_ALLOW_CHANGE_BID").first()
    val_str = "true" if payload.allow_change_bid else "false"
    if setting:
        setting.value = val_str
    else:
        setting = PlatformSetting(key="DROP_BID_ALLOW_CHANGE_BID", value=val_str)
        db.add(setting)
    db.commit()
    return {"allow_change_bid": payload.allow_change_bid}


# ---------------------------------------------------------------------------
# Driver side: submit an offer
# ---------------------------------------------------------------------------

class SubmitOfferSchema(BaseModel):
    offer_price: int = Field(gt=0)
    car_id: str
    driver_id: Optional[str] = None


@router.post("/requests/{request_id}/offers", status_code=status.HTTP_201_CREATED)
async def submit_drop_bid_offer(
    request_id: str,
    payload: SubmitOfferSchema,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver submits (or updates) their own offer on an open request, using
    a car from their own fleet. Same +/-50% sanity band the Driver App
    already enforces client-side - re-checked here since the client-side
    check alone is never real enforcement."""
    req = db.query(DropBidRequest).filter(DropBidRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Negotiation request not found.")
    if req.status != "OPEN":
        raise HTTPException(status_code=400, detail="This request is no longer open for offers.")

    max_allowed = round(req.customer_target_price * 2.5)
    min_allowed = round(req.customer_target_price * 0.5)
    if payload.offer_price > max_allowed:
        raise HTTPException(status_code=400, detail=f"Offer cannot exceed 2.5x the customer's target price (max ₹{max_allowed}).")
    if payload.offer_price < min_allowed:
        raise HTTPException(status_code=400, detail=f"Offer cannot be less than 50% of the customer's target price (min ₹{min_allowed}).")

    target_driver_id = current_driver.id
    if payload.driver_id and payload.driver_id != "owner":
        from app.models.car_driver import CarDriver
        assigned_driver = db.query(CarDriver).filter(
            CarDriver.id == payload.driver_id,
            CarDriver.vehicle_owner_id == current_driver.vehicle_owner_id,
        ).first()
        if assigned_driver:
            target_driver_id = assigned_driver.id

    from app.models.car_details import CarDetails
    from app.crud.verification import is_car_verified
    car = db.query(CarDetails).filter(
        CarDetails.id == payload.car_id,
        CarDetails.vehicle_owner_id == current_driver.vehicle_owner_id,
    ).first()
    if not car:
        raise HTTPException(status_code=404, detail="That car isn't in your fleet.")
    if not is_car_verified(car):
        raise HTTPException(status_code=403, detail="This car's documents must be verified before it can be offered on a trip.")

    # One live offer per driver per request - update in place if they
    # already have a PENDING one, rather than stacking duplicates.
    existing = db.query(DropBidOffer).filter(
        DropBidOffer.request_id == request_id,
        DropBidOffer.vehicle_owner_id == current_driver.vehicle_owner_id,
        DropBidOffer.status == "PENDING",
    ).first()
    if existing:
        # Check admin setting: is driver allowed to change bid?
        from app.models.platform_setting import PlatformSetting
        setting = db.query(PlatformSetting).filter(PlatformSetting.key == "DROP_BID_ALLOW_CHANGE_BID").first()
        allow_change_bid = (setting.value.lower() in ("true", "1", "yes")) if setting else False
        if not allow_change_bid:
            raise HTTPException(status_code=400, detail="Changing an already submitted bid is disabled by Admin.")

        _invalidate_advance_if_paid(existing)
        existing.offer_price = payload.offer_price
        existing.car_id = payload.car_id
        existing.driver_id = target_driver_id
        # A direct re-bid supersedes any negotiation in progress - clear a
        # stale pending counter rather than leave offer_price and
        # counter_price disagreeing about what's actually on the table.
        existing.counter_price = None
        existing.counter_by = None
        db.commit()
        db.refresh(existing)
        offer = existing
    else:
        offer = DropBidOffer(
            request_id=request_id,
            driver_id=target_driver_id,
            vehicle_owner_id=current_driver.vehicle_owner_id,
            car_id=payload.car_id,
            offer_price=payload.offer_price,
            status="PENDING",
        )
        db.add(offer)
        db.commit()
        db.refresh(offer)

    return {"id": offer.id, "offer_price": offer.offer_price, "status": offer.status}


@router.get("/driver-offers")
async def list_driver_drop_bid_offers(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver-side endpoint: returns all offers submitted by this driver's fleet,
    including PENDING (active offers/counters), ACCEPTED (won bids), and
    DECLINED (lost bids), with request details and order_id for won bids."""
    offers = db.query(DropBidOffer).filter(
        DropBidOffer.vehicle_owner_id == current_driver.vehicle_owner_id
    ).order_by(DropBidOffer.created_at.desc()).all()

    result = []
    for o in offers:
        req = db.query(DropBidRequest).filter(DropBidRequest.id == o.request_id).first()
        if not req:
            continue
        result.append({
            "offer_id": o.id,
            "request_id": req.id,
            "customer_name": req.customer_name,
            "customer_phone": req.customer_number if o.status == "ACCEPTED" else _mask_phone(req.customer_number),
            "pickup_location": req.pickup_location,
            "drop_location": req.drop_location,
            "trip_type": req.trip_type,
            "car_type": req.car_type,
            "start_date_time": req.start_date_time,
            "customer_target_price": req.customer_target_price,
            "estimated_distance": req.estimated_distance or 0,
            "offer_price": o.offer_price,
            "offer_status": o.status,
            "counter_price": o.counter_price,
            "counter_by": o.counter_by,
            "created_at": o.created_at,
            "order_id": req.order_id if (o.status == "ACCEPTED" or req.status == "ACCEPTED") else None,
        })
    return result



# ---------------------------------------------------------------------------
# Counter-offer negotiation - added 2026-09-04. Previously Drop Bid was a
# flat "driver bids, customer accepts-or-ignores" flow with no back-and-
# forth; competitor research the same day confirmed real-time negotiation
# (not just the initial bid) is the actual core of inDrive's model, which
# Drop Bid was built to emulate. offer.offer_price is always "the price on
# the table right now"; counter_price/counter_by track a single open
# proposal from whichever side moved last, cleared once the other side
# accepts or rejects it. Deliberately single-proposal (no full history
# thread) - keeps both apps' negotiate UI to one number + three buttons.
# ---------------------------------------------------------------------------

def _sanity_check_counter_price(price: int, target_price: int):
    max_allowed = round(target_price * 2.5)
    min_allowed = round(target_price * 0.5)
    if price > max_allowed:
        raise HTTPException(status_code=400, detail=f"Counter price cannot exceed 2.5x the customer's original target price (max ₹{max_allowed}).")
    if price < min_allowed:
        raise HTTPException(status_code=400, detail=f"Counter price cannot be less than 50% of the customer's original target price (min ₹{min_allowed}).")


class CustomerCounterSchema(BaseModel):
    price: int = Field(gt=0)


@router.post("/offers/{offer_id}/counter")
async def customer_counter_offer(
    offer_id: str,
    payload: CustomerCounterSchema,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Customer proposes a lower (or different) price on a driver's offer,
    instead of just accepting it as-is or ignoring it."""
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
    if not req or str(req.customer_id) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="You can only negotiate on your own requests.")
    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="This offer is no longer open for negotiation.")
    _sanity_check_counter_price(payload.price, req.customer_target_price)

    offer.counter_price = payload.price
    offer.counter_by = "customer"
    db.commit()
    db.refresh(offer)

    # Push notification to driver & vehicle owner
    try:
        from app.crud.notification import notify_drop_bid_event
        notify_drop_bid_event(
            db, user_type="driver", user_sub=str(offer.driver_id),
            title="⚡ Customer Counter-Offer Received!",
            body=f"{req.customer_name} proposed ₹{payload.price} for trip from {req.pickup_location} to {req.drop_location}.",
            event_type="drop_bid_counter", is_urgent=True
        )
        if offer.vehicle_owner_id:
            notify_drop_bid_event(
                db, user_type="vehicle_owner", user_sub=str(offer.vehicle_owner_id),
                title="⚡ Customer Counter-Offer Received!",
                body=f"{req.customer_name} proposed ₹{payload.price} for trip from {req.pickup_location} to {req.drop_location}.",
                event_type="drop_bid_counter", is_urgent=True
            )
    except Exception as e:
        print(f"Counter offer notification error: {e}")

    return _offer_out(offer, db)


class CounterResponseSchema(BaseModel):
    action: str = Field(pattern="^(accept|reject|counter)$")
    price: Optional[int] = None


@router.post("/offers/{offer_id}/counter-response")
async def driver_respond_to_counter(
    offer_id: str,
    payload: CounterResponseSchema,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver responds to the customer's pending counter: accept it (locks
    it in as the new offer price), reject it (offer reverts to its last
    agreed price), or counter back with a different number."""
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer or str(offer.driver_id) != str(current_driver.id):
        raise HTTPException(status_code=404, detail="Offer not found.")
    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="This offer is no longer open for negotiation.")
    if offer.counter_by != "customer" or offer.counter_price is None:
        raise HTTPException(status_code=400, detail="There's no pending customer counter-offer to respond to.")

    if payload.action == "accept":
        _invalidate_advance_if_paid(offer)
        offer.offer_price = offer.counter_price
        offer.counter_price = None
        offer.counter_by = None
    elif payload.action == "reject":
        offer.counter_price = None
        offer.counter_by = None
    else:  # counter
        if not payload.price or payload.price <= 0:
            raise HTTPException(status_code=400, detail="A counter price is required.")
        req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
        _sanity_check_counter_price(payload.price, req.customer_target_price if req else offer.offer_price)
        offer.counter_price = payload.price
        offer.counter_by = "driver"

    db.commit()
    db.refresh(offer)
    return _offer_out(offer, db)


@router.post("/offers/{offer_id}/customer-counter-response")
async def customer_respond_to_counter(
    offer_id: str,
    payload: CounterResponseSchema,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Customer's side of the same exchange, for when the driver was the
    one who last countered."""
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
    if not req or str(req.customer_id) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="You can only negotiate on your own requests.")
    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="This offer is no longer open for negotiation.")
    if offer.counter_by != "driver" or offer.counter_price is None:
        raise HTTPException(status_code=400, detail="There's no pending driver counter-offer to respond to.")

    if payload.action == "accept":
        _invalidate_advance_if_paid(offer)
        offer.offer_price = offer.counter_price
        offer.counter_price = None
        offer.counter_by = None
    elif payload.action == "reject":
        offer.counter_price = None
        offer.counter_by = None
    else:  # counter
        if not payload.price or payload.price <= 0:
            raise HTTPException(status_code=400, detail="A counter price is required.")
        _sanity_check_counter_price(payload.price, req.customer_target_price)
        offer.counter_price = payload.price
        offer.counter_by = "customer"

    db.commit()
    db.refresh(offer)
    return _offer_out(offer, db)


# ---------------------------------------------------------------------------
# Real advance payment via Razorpay - added 2026-09-04. Same create-order/
# verify-signature pattern as customer_bookings.py's
# /customer/bookings/{id}/pay + /verify (that's the reference this mirrors -
# see RazorpayClient in app/utils/razorpay_client.py). The advance is
# ADVANCE_PERCENT (15%, matching the figure the Customer App's UI has
# always shown) of whatever offer_price currently is - so this must be
# called AFTER negotiation has settled, not before. accept_drop_bid_offer
# below now refuses to run unless advance_paid is True.
# ---------------------------------------------------------------------------

class DropBidPayResponse(BaseModel):
    rp_order_id: str
    amount: int
    currency: str = "INR"


class DropBidVerifyRequest(BaseModel):
    rp_order_id: str
    rp_payment_id: str
    rp_signature: str


@router.post("/offers/{offer_id}/pay-advance", response_model=DropBidPayResponse)
async def pay_drop_bid_advance(
    offer_id: str,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Creates a Razorpay order for this offer's 15% advance. The app opens
    Razorpay checkout with the returned order id, then calls
    /verify-advance with what checkout returns."""
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
    if not req or str(req.customer_id) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="You can only pay for your own requests.")
    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="This offer is no longer available.")
    if offer.counter_by is not None:
        raise HTTPException(status_code=400, detail="Please finish negotiating the price before paying the advance.")

    from app.utils.razorpay_client import RazorpayClient
    advance_amount = round(offer.offer_price * ADVANCE_PERCENT / 100)
    client = RazorpayClient()
    try:
        order = client.create_order(
            amount_paise=advance_amount, currency="INR",
            notes={"drop_bid_offer_id": offer.id, "purpose": "drop_bid_advance"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)}")

    offer.advance_amount = advance_amount
    offer.advance_rp_order_id = order.get("id")
    offer.advance_paid = False
    db.commit()

    return DropBidPayResponse(rp_order_id=order.get("id"), amount=order.get("amount"))


@router.post("/offers/{offer_id}/verify-advance")
async def verify_drop_bid_advance(
    offer_id: str,
    payload: DropBidVerifyRequest,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Verifies the Razorpay signature after checkout succeeds and marks
    the advance paid - accept_drop_bid_offer requires this before it will
    run."""
    from app.utils.razorpay_client import RazorpayClient
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
    if not req or str(req.customer_id) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="You can only pay for your own requests.")
    if offer.advance_rp_order_id != payload.rp_order_id:
        raise HTTPException(status_code=400, detail="This payment doesn't match the current advance order for this offer.")
    if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature.")

    offer.advance_rp_payment_id = payload.rp_payment_id
    offer.advance_rp_signature = payload.rp_signature
    offer.advance_paid = True
    db.commit()
    db.refresh(offer)
    return _offer_out(offer, db)


# ---------------------------------------------------------------------------
# Customer accepts an offer -> becomes a real Order
# ---------------------------------------------------------------------------

@router.post("/offers/{offer_id}/accept", status_code=status.HTTP_201_CREATED)
async def accept_drop_bid_offer(
    offer_id: str,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Customer accepts one driver's offer. Converts the negotiation into a
    real Order + OrderAssignment (already ASSIGNED to the winning driver),
    same underlying path driver_create_booking_confirm uses - All-Inclusive
    fare_type, offer_price as total_booking_amount, extra_amount 0 (no
    vendor in a direct customer-driver match). Every other PENDING offer on
    the same request is auto-declined."""
    offer = db.query(DropBidOffer).filter(DropBidOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")

    req = db.query(DropBidRequest).filter(DropBidRequest.id == offer.request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Negotiation request not found.")
    if str(req.customer_id) != str(current_customer.id):
        raise HTTPException(status_code=403, detail="You can only accept offers on your own requests.")
    if req.status != "OPEN":
        raise HTTPException(status_code=400, detail="This request is no longer open.")
    if offer.status != "PENDING":
        raise HTTPException(status_code=400, detail="This offer is no longer available.")
    if not offer.advance_paid:
        raise HTTPException(status_code=400, detail="Please pay the advance amount before confirming this trip.")

    from app.crud.new_orders import create_oneway_order
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum

    try:
        trip_type_enum = OrderTypeEnum(req.trip_type)
    except ValueError:
        trip_type_enum = OrderTypeEnum.ONEWAY
    try:
        car_type_enum = CarTypeEnum(req.car_type)
    except ValueError:
        car_type_enum = CarTypeEnum.SEDAN_4_PLUS_1

    new_order, master_order_id = create_oneway_order(
        db, vendor_id=None, trip_type=trip_type_enum, car_type=car_type_enum,
        pickup_drop_location={"0": req.pickup_location, "1": req.drop_location},
        start_date_time=req.start_date_time, customer_name=req.customer_name, customer_number=req.customer_number,
        cost_per_km=0, extra_cost_per_km=0, driver_allowance=0, extra_driver_allowance=0,
        permit_charges=0, extra_permit_charges=0, hill_charges=0, toll_charges=0,
        pickup_notes="", trip_distance=req.estimated_distance or 0, trip_time="N/A",
        platform_fees_percent=10, pick_near_city=["ALL"], target_driver_id=None,
        max_time_to_assign_order=15, toll_charge_update=False, night_charges=0,
        estimated_cal_price=offer.offer_price, vendor_cal_price=offer.offer_price,
        priority_for_paid=False, priority_cutoff_at=None,
        fare_type="ALL_INCLUSIVE", charge_items=None, advance_received=offer.advance_amount,
        total_booking_amount=offer.offer_price, extra_amount=0, waiting_hours_included=None,
    )

    # Auto-assign to the winning driver - already ASSIGNED, skips the
    # PENDING step (same reasoning as driver_create_booking_confirm: this
    # driver already committed to this exact price, no competing acceptors
    # to race against). No start/end trip OTP for the same reason documented
    # there - deliver-to-customer isn't wired for Drop Bid yet.
    #
    # Wallet hold: same TRIP_HOLD ledger mechanism normal bookings use
    # (order_assignments.py's accept-order route) - the platform's 5%
    # admin commission (see accept_drop_bid_offer's own module docstring:
    # "admin_profit=5% always, driver keeps the rest") is held from the
    # winning fleet owner's wallet the moment the offer is accepted, kept if
    # the trip completes, refunded via credit_wallet/TRIP_HOLD_REFUND on the
    # existing vendor/admin-cancel paths if it doesn't. Added 2026-09-04 -
    # previously this hold was never taken at all (held_amount hardcoded 0),
    # so Drop Bid trips silently never had their commission collected.
    # Uses allow-negative rather than blocking: an insufficient-balance
    # fleet owner is that owner's problem to fix (enforced separately via
    # the negative-balance suspension threshold), not something that should
    # stop the CUSTOMER from finalizing a trip they're ready to pay for.
    hold_amount = max(0, round(offer.offer_price * 0.05))
    from app.crud.trip_otp import ensure_order_otps
    start_otp, end_otp = ensure_order_otps(db, db.query(Order).filter(Order.id == master_order_id).first())
    assignment = OrderAssignment(
        order_id=master_order_id,
        vehicle_owner_id=offer.vehicle_owner_id,
        driver_id=offer.driver_id,
        car_id=offer.car_id,
        assignment_status=AssignmentStatusEnum.ASSIGNED,
        assigned_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        held_amount=hold_amount,
        start_trip_otp=start_otp,
        end_trip_otp=end_otp,
    )
    db.add(assignment)
    assignment.trip_link_token = secrets.token_urlsafe(24)

    if hold_amount > 0:
        from app.crud.wallet import debit_wallet, debit_wallet_allow_negative
        try:
            debit_wallet(
                db, vehicle_owner_id=str(offer.vehicle_owner_id), amount=hold_amount,
                reference_id=str(master_order_id), reference_type="TRIP_HOLD",
                notes=f"Drop Bid commission hold for Order #{master_order_id}",
            )
        except ValueError:
            debit_wallet_allow_negative(
                db, vehicle_owner_id=str(offer.vehicle_owner_id), amount=hold_amount,
                reference_id=str(master_order_id), reference_type="TRIP_HOLD",
                notes=f"Drop Bid commission hold for Order #{master_order_id} (insufficient balance - allowed negative)",
            )

    offer.status = "ACCEPTED"
    req.status = "ACCEPTED"
    req.accepted_offer_id = offer.id
    req.order_id = master_order_id

    # Sync trip_status on master Order and NewOrder so they appear in accepted/upcoming feeds
    # NOTE: do NOT set trip_status to "ACCEPTED" here. Order.trip_status is a database enum (PENDING / COMPLETED /
    # CANCELLED / ...) with no ACCEPTED value: assigning it made the commit fail AFTER the order had already been
    # created, leaving a half-made booking (no assignment) that never showed up in the driver's My Rides. The ASSIGNED
    # OrderAssignment created above is what makes it an accepted booking, exactly like every other flow.
    master_order = db.query(Order).filter(Order.id == master_order_id).first()
    if master_order:
        master_order.trip_status = Trip_status.PENDING

    # Every other pending offer on this request loses.
    others = db.query(DropBidOffer).filter(
        DropBidOffer.request_id == req.id,
        DropBidOffer.id != offer.id,
        DropBidOffer.status == "PENDING",
    ).all()
    for o in others:
        o.status = "DECLINED"

    db.commit()

    # Urgent Push Notification to winning driver & vehicle owner
    try:
        from app.crud.notification import notify_drop_bid_event
        notify_drop_bid_event(
            db, user_type="driver", user_sub=str(offer.driver_id),
            title="🎉 BID ACCEPTED - BOOKING CONFIRMED!",
            body=f"Your bid of ₹{offer.offer_price} for {req.pickup_location} to {req.drop_location} was accepted! Order #{master_order_id} assigned to you.",
            event_type="drop_bid_accepted", is_urgent=True
        )
        if offer.vehicle_owner_id:
            notify_drop_bid_event(
                db, user_type="vehicle_owner", user_sub=str(offer.vehicle_owner_id),
                title="🎉 BID ACCEPTED - BOOKING CONFIRMED!",
                body=f"Your fleet bid of ₹{offer.offer_price} for {req.pickup_location} to {req.drop_location} was accepted! Order #{master_order_id} assigned.",
                event_type="drop_bid_accepted", is_urgent=True
            )
    except Exception as e:
        print(f"Drop Bid acceptance notification error: {e}")

    return {
        "order_id": master_order_id,
        "trip_status": new_order.trip_status,
        "assignment_id": assignment.id,
    }


from app.core.security import get_current_admin

@router.get("/admin/emergency-bids")
def get_admin_emergency_bids(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Retrieve active emergency drop bids for admin dashboard monitoring."""
    requests = db.query(DropBidRequest).filter(
        DropBidRequest.status.in_(["ACTIVE", "PENDING", "OPEN"])
    ).order_by(DropBidRequest.created_at.desc()).all()

    items = []
    for req in requests:
        offers = db.query(DropBidOffer).filter(
            DropBidOffer.request_id == req.id
        ).all()

        top_offer = sorted(offers, key=lambda x: x.offer_price)[0] if offers else None

        items.append({
            "id": str(req.id),
            "customerName": req.customer.full_name if getattr(req, "customer", None) else "Customer",
            "customerPhone": req.customer.phone if getattr(req, "customer", None) else "",
            "pickup": req.pickup_location,
            "dropLocation": req.drop_location,
            "pickupTime": req.start_date_time.strftime("%Y-%m-%d %H:%M") if req.start_date_time else "Immediate",
            "baseEstimate": req.customer_target_price,
            "liveBidsCount": len(offers),
            "topBidAmount": top_offer.offer_price if top_offer else req.customer_target_price,
            "topBidDriver": top_offer.driver.full_name if top_offer and getattr(top_offer, "driver", None) else "Awaiting Driver",
            "status": "LIVE_BIDDING_ACTIVE" if req.status in ["ACTIVE", "OPEN"] else "BID_ACCEPTED",
        })
    return items

