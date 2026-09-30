import os
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List

WEBSITE_PUBLIC_BASE_URL = os.getenv("WEBSITE_PUBLIC_BASE_URL", "https://dropcars.in")


from app.crud.trip_otp import otps_visible as _otps_visible


def _trip_link_url(token: Optional[str]) -> Optional[str]:
    """Shareable driver-trip web link (see /website/trip-link/{token}* in
    api/routes/website_bookings.py) - surfaced on order-detail responses so
    staff can copy/forward it to the driver until it's in the Driver App."""
    if not token:
        return None
    return f"{WEBSITE_PUBLIC_BASE_URL}/pages/driver-trip.php?token={token}"
from app.models.orders import Order
from app.models.order_assignments import OrderAssignment
from app.models.end_records import EndRecord
from app.models.vendor import VendorCredentials
from app.models.vendor_details import VendorDetails
from app.models.car_driver import CarDriver
from app.models.car_details import CarDetails
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.new_orders import NewOrder
from app.models.orders import OrderSourceEnum
from app.models.hourly_rental import HourlyRental
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.schemas.order_details import (
    AdminOrderDetailResponse, 
    VendorOrderDetailResponse,
    VehicleOwnerOrderDetailResponse,
    VendorBasicInfo,
    DriverBasicInfo,
    CarBasicInfo,
    VehicleOwnerBasicInfo,
    OrderAssignmentDetail,
    EndRecordDetail
)
import math
from app.utils.gcs import generate_signed_url_from_gcs


def _display_trip_status(order, has_assignments: bool) -> str:
    """The original code showed "AUTOCANCELLED" for ANY non-null
    cancelled_by, collapsing 4 genuinely different real reasons into one
    label that actively misrepresents 3 of them (a vendor-cancelled or
    customer-cancelled booking read as if the SYSTEM auto-cancelled it -
    confirmed live on a real order: cancelled_by was CANCELLED_BY_VENDOR,
    displayed as "AUTOCANCELLED"). Only AUTO_CANCELLED is actually
    system-driven, and even that covers two different situations:
    (1) nobody ever accepted before the deadline
    (crud/order_assignments.py's cancel_expired_unaccepted_orders - "no
    money moves, nothing was held"), vs (2) a fleet owner DID accept but
    then failed to assign a driver in time after retries. Only case (1) is
    ever reachable with zero assignments (that function skips any order
    that ever had one), so that's the signal used to split those two."""
    from app.models.orders import CancelledByEnum
    if order.cancelled_by is None:
        return order.trip_status
    if order.cancelled_by == CancelledByEnum.AUTO_CANCELLED:
        return "EXPIRED" if not has_assignments else "NO DRIVER ASSIGNED"
    if order.cancelled_by == CancelledByEnum.CANCELLED_BY_VENDOR:
        return "CANCELLED BY VENDOR"
    if order.cancelled_by == CancelledByEnum.CANCELLED_WHILE_DRIVING:
        return "CANCELLED WHILE DRIVING"
    if order.cancelled_by == CancelledByEnum.CANCELLED_BY_CUSTOMER:
        return "CANCELLED BY CUSTOMER"
    return "CANCELLED"


def _pretrip_estimate_rates(db: Session) -> dict:
    """Commission rates for both trip categories, fetched ONCE and reused
    across every order in a page - _estimate_pretrip_split needs a rate per
    order, but the underlying platform_settings row is the same for all of
    them, so looking it up per-order would reintroduce the exact N+1 pattern
    get_all_admin_orders was rewritten to eliminate (see that function's own
    docstring)."""
    from app.utils.commission import get_commission_rates
    return {
        "OUTSTATION": get_commission_rates(db, "OUTSTATION", "STANDARD"),
        "LOCAL": get_commission_rates(db, "LOCAL", "STANDARD"),
    }


def _estimate_pretrip_split(
    rates_by_category: dict, order, cost_per_km, extra_cost_per_km, driver_allowance, extra_driver_allowance,
    permit_charges, extra_permit_charges, hill_charges, toll_charges, night_charges, distance,
):
    """Pre-completion estimate of the vendor/driver split, using the SAME
    commission formula real settlement uses (crud/end_records.py's
    non-hourly branch: vendor_profit = ceil(cost_per_km * km * vendor_rate%)).
    Without this, the "Vendor Earning" shown before a trip completes was a
    naive vendor_price - estimated_price subtraction, which only ever
    captured the vendor's own added markup (extra_cost_per_km/extra_driver_
    allowance/etc.) and completely missed the tier commission - the
    vendor's actual primary earning source on most bookings. Tier defaults
    to STANDARD since the accepting fleet owner's tier isn't known until
    they accept; in the current default rates vendor% doesn't vary by tier
    within a trip category, so this is exact in practice, only admin%/
    driver% can shift slightly once a Preferred owner actually accepts.
    Only meaningful for per-km (NEW_ORDERS) bookings - Hourly Rental uses a
    different real formula (see end_records.py's hourly branch), so callers
    should not call this for Hourly Rental orders.

    rates_by_category: pre-fetched via _pretrip_estimate_rates(db) - pass
    the SAME dict for every order in a batch, don't refetch per order."""
    if cost_per_km is None or distance is None:
        return None, None
    from app.utils.commission import get_trip_category
    category = get_trip_category(order)
    rates = rates_by_category.get(category) or rates_by_category["OUTSTATION"]
    distance = int(distance)
    base_amount = int(cost_per_km) * distance
    vendor_commission = math.ceil(base_amount * rates["vendor"] / 100)
    admin_commission = math.ceil(base_amount * rates["admin"] / 100)
    extra_markup = (int(extra_cost_per_km or 0) * distance) + int(extra_driver_allowance or 0) + int(extra_permit_charges or 0)
    estimated_vendor_earning = vendor_commission + extra_markup
    closed_vendor_price_estimate = (
        (int(cost_per_km) + int(extra_cost_per_km or 0)) * distance
        + int(driver_allowance or 0) + int(extra_driver_allowance or 0)
        + int(permit_charges or 0) + int(extra_permit_charges or 0)
        + int(hill_charges or 0) + int(toll_charges or 0) + int(night_charges or 0)
    )
    estimated_driver_earning = closed_vendor_price_estimate - estimated_vendor_earning - admin_commission
    return estimated_vendor_earning, estimated_driver_earning


def get_order_by_id(db: Session, order_id: int) -> Optional[Order]:
    """Get order by ID"""
    return db.query(Order).filter(Order.id == order_id).first()


def get_vendor_basic_info(db: Session, vendor_id: str) -> Optional[VendorBasicInfo]:
    """Get basic vendor information"""
    vendor_creds = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
    if not vendor_creds:
        return None
    
    vendor_details = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    if not vendor_details:
        return None
    
    return VendorBasicInfo(
        id=vendor_creds.id,
        full_name=vendor_details.full_name,
        primary_number=vendor_details.primary_number,
        secondary_number=vendor_details.secondary_number,
        gpay_number=vendor_details.gpay_number,
        aadhar_number=vendor_details.aadhar_number,
        address=vendor_details.address,
        wallet_balance=vendor_details.wallet_balance,
        bank_balance=vendor_details.bank_balance,
        created_at=vendor_creds.created_at
    )


def get_driver_basic_info(db: Session, driver_id: str) -> Optional[DriverBasicInfo]:
    """Get basic driver information"""
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
    if not driver:
        return None
    
    return DriverBasicInfo(
        id=driver.id,
        full_name=driver.full_name,
        primary_number=driver.primary_number,
        secondary_number=driver.secondary_number,
        licence_number=driver.licence_number,
        address=driver.address,
        driver_status=driver.driver_status,
        created_at=driver.created_at
    )


def get_car_basic_info(db: Session, car_id: str) -> Optional[CarBasicInfo]:
    """Get basic car information"""
    car = db.query(CarDetails).filter(CarDetails.id == car_id).first()
    if not car:
        return None
    
    return CarBasicInfo(
        id=car.id,
        car_name=car.car_name,
        car_type=car.car_type,
        car_number=car.car_number,
        car_status=car.car_status,
        rc_front_img_url=car.rc_front_img_url,
        rc_back_img_url=car.rc_back_img_url,
        insurance_img_url=car.insurance_img_url,
        fc_img_url=car.fc_img_url,
        car_img_url=car.car_img_url,
        created_at=car.created_at
    )


def get_vehicle_owner_basic_info(db: Session, vehicle_owner_id: str) -> Optional[VehicleOwnerBasicInfo]:
    """Get basic fleet owner information"""
    owner_creds = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == vehicle_owner_id).first()
    if not owner_creds:
        return None
    
    owner_details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    if not owner_details:
        return None
    
    return VehicleOwnerBasicInfo(
        id=owner_creds.id,
        full_name=owner_details.full_name,
        primary_number=owner_details.primary_number,
        secondary_number=owner_details.secondary_number,
        address=owner_details.address,
        account_status=owner_creds.account_status,
        created_at=owner_creds.created_at
    )


def get_order_assignments(db: Session, order_id: int) -> list[OrderAssignmentDetail]:
    """Get all order assignments for an order"""
    assignments = db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id).all()
    from app.crud.trip_otp import otps_visible
    _order = db.query(Order).filter(Order.id == order_id).first()

    return [
        OrderAssignmentDetail(
            id=assignment.id,
            order_id=assignment.order_id,
            vehicle_owner_id=assignment.vehicle_owner_id,
            driver_id=assignment.driver_id,
            car_id=assignment.car_id,
            assignment_status=assignment.assignment_status,
            assigned_at=assignment.assigned_at,
            expires_at=assignment.expires_at,
            cancelled_at=assignment.cancelled_at,
            completed_at=assignment.completed_at,
            created_at=assignment.created_at,
            held_amount=assignment.held_amount,
            assigned_by=assignment.assigned_by or "SELF",
            start_trip_otp=assignment.start_trip_otp if otps_visible(_order, assignment) else None,
            end_trip_otp=assignment.end_trip_otp if otps_visible(_order, assignment) else None,
            trip_link_url=_trip_link_url(assignment.trip_link_token),
        )
        for assignment in assignments
    ]


def get_order_end_records(db: Session, order_id: int) -> list[EndRecordDetail]:
    """Get all end records for an order"""
    end_records = db.query(EndRecord).filter(EndRecord.order_id == order_id).all()
    
    return [
        EndRecordDetail(
            id=record.id,
            order_id=record.order_id,
            driver_id=record.driver_id,
            start_km=record.start_km,
            end_km=record.end_km,
            contact_number=record.contact_number,
            img_url= generate_signed_url_from_gcs(record.img_url) if record.img_url else None,
            close_speedometer_image=generate_signed_url_from_gcs(record.close_speedometer_image) if record.close_speedometer_image else None,
            created_at=record.created_at,
            updated_at=record.updated_at
        )
        for record in end_records
    ]


def get_admin_order_details(db: Session, order_id: int) -> Optional[AdminOrderDetailResponse]:
    """Get full order details for admin with all related data"""
    order = get_order_by_id(db, order_id)
    if not order:
        return None
    
    # Get vendor information
    # Driver-posted / website bookings have no vendor - that is valid (schema field is Optional),
    # so only look one up when there is one; returning None here made the admin view 404.
    vendor = get_vendor_basic_info(db, str(order.vendor_id)) if order.vendor_id else None
    
    # Get assignments
    assignments = get_order_assignments(db, order_id)
    
    # Get end records
    end_records = get_order_end_records(db, order_id)
    
    # Get latest assignment details
    latest_assignment = None
    assigned_driver = None
    assigned_car = None
    vehicle_owner = None
    
    if assignments:
        latest_assignment = assignments[-1]  # Most recent assignment

        if latest_assignment.driver_id:
            assigned_driver = get_driver_basic_info(db, str(latest_assignment.driver_id))

        if latest_assignment.car_id:
            assigned_car = get_car_basic_info(db, str(latest_assignment.car_id))

        if latest_assignment.vehicle_owner_id:
            vehicle_owner = get_vehicle_owner_basic_info(db, str(latest_assignment.vehicle_owner_id))

    # Per-km rate breakdown only exists on the originating NewOrder row
    # (standard bookings) - Hourly Rental is priced as a flat package, so
    # these stay None for that source and the frontend hides the section.
    cost_per_km = extra_cost_per_km = driver_allowance = extra_driver_allowance = None
    permit_charges = extra_permit_charges = hill_charges = quoted_toll_charges = None
    if order.source == OrderSourceEnum.NEW_ORDERS:
        source_new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if source_new_order:
            cost_per_km = source_new_order.cost_per_km
            extra_cost_per_km = source_new_order.extra_cost_per_km
            driver_allowance = source_new_order.driver_allowance
            extra_driver_allowance = source_new_order.extra_driver_allowance
            permit_charges = source_new_order.permit_charges
            extra_permit_charges = source_new_order.extra_permit_charges
            hill_charges = source_new_order.hill_charges
            quoted_toll_charges = source_new_order.toll_charges

    estimated_vendor_profit = estimated_driver_profit = None
    if order.source == OrderSourceEnum.NEW_ORDERS and cost_per_km is not None:
        estimated_vendor_profit, estimated_driver_profit = _estimate_pretrip_split(
            _pretrip_estimate_rates(db), order, cost_per_km, extra_cost_per_km, driver_allowance, extra_driver_allowance,
            permit_charges, extra_permit_charges, hill_charges, quoted_toll_charges,
            order.night_charges, order.calculated_trip_distance or order.trip_distance,
        )

    # Commission class + split (read-only here; the percentages themselves are Owner-editable in System Config)
    _comm_class = None
    _comm_breakdown = None
    try:
        from app.utils.commission import estimate_split_for_order, resolve_commission_class, get_fee_settings
        _src = getattr(order.source, "value", order.source)
        if _src != "HOURLY_RENTAL":
            _comm_class = resolve_commission_class(
                fare_type=order.fare_type, vendor_id=order.vendor_id,
                posted_by_vehicle_owner_id=order.posted_by_vehicle_owner_id, stored=order.commission_class,
            )
            if str(getattr(order.trip_status, "value", order.trip_status)).upper() == "COMPLETED" and order.closed_vendor_price is not None:
                _comm_breakdown = {
                    "final": True,
                    "customer_total": order.closed_vendor_price,
                    "driver_net": order.driver_profit,
                    "poster_share": order.vendor_profit,
                    "platform_fee": order.admin_profit,
                    "fee_pct": order.commision_amount,
                }
            else:
                _sp = estimate_split_for_order(db, order)
                _comm_breakdown = {
                    "final": False,
                    "customer_total": _sp["customer_total"],
                    "driver_net": _sp["driver_net"],
                    "poster_share": _sp["poster_share"],
                    "platform_fee": _sp["platform_fee"],
                    "fee_pct": _sp["fee_pct"],
                    "min_hold": _sp["min_hold"],
                }
    except Exception as _e:
        print(f"commission breakdown failed for order {order_id}: {_e}")

    return AdminOrderDetailResponse(
        id=order.id,
        source=order.source,
        source_order_id=order.source_order_id,
        vendor_id=order.vendor_id,
        trip_type=order.trip_type,
        car_type=order.car_type,
        pickup_drop_location=order.pickup_drop_location,
        start_date_time=order.start_date_time,
        customer_name=order.customer_name,
        customer_number=order.customer_number,
        trip_status=_display_trip_status(order, bool(assignments)),
        cancelled_by=order.cancelled_by.value if order.cancelled_by else None,
        pick_near_city=order.pick_near_city,
        trip_distance=order.trip_distance,
        trip_time=order.trip_time,
        estimated_price=order.estimated_price,
        vendor_price=order.vendor_price,
        platform_fees_percent=order.platform_fees_percent,
        vendor_fees_percent=order.vendor_fees_percent,
        closed_vendor_price=order.closed_vendor_price,
        closed_driver_price=order.closed_driver_price,
        commision_amount=order.commision_amount,
        vendor_profit=order.vendor_profit,
        driver_profit=order.driver_profit,
        admin_profit=order.admin_profit,
        estimated_vendor_profit=estimated_vendor_profit,
        estimated_driver_profit=estimated_driver_profit,
        fare_type=getattr(order, 'fare_type', None),
        charge_items=getattr(order, 'charge_items', None),
        advance_received=getattr(order, 'advance_received', None),
        night_charges=order.night_charges,
        waiting_time=order.waiting_time,
        toll_charge_update=order.toll_charge_update or False,
        updated_toll_charges=order.updated_toll_charges,
        cost_per_km=cost_per_km,
        extra_cost_per_km=extra_cost_per_km,
        driver_allowance=driver_allowance,
        extra_driver_allowance=extra_driver_allowance,
        permit_charges=permit_charges,
        extra_permit_charges=extra_permit_charges,
        hill_charges=hill_charges,
        quoted_toll_charges=quoted_toll_charges,
        executed_platform=getattr(order, 'executed_platform', None) or 'Drop Cars App',
        created_at=order.created_at,
        commission_class=_comm_class,
        commission_breakdown=_comm_breakdown,
        vendor=vendor,
        assignments=assignments,
        end_records=end_records,
        assigned_driver=assigned_driver,
        assigned_car=assigned_car,
        vehicle_owner=vehicle_owner
    )


def get_all_admin_orders(db: Session, skip: int = 0, limit: int = 100, order_id: Optional[int] = None, sort: str = "newest", vendor_id: Optional[str] = None) -> tuple[List[AdminOrderDetailResponse], int]:
    """Get all orders with full details for admin with pagination.

    Batches every related lookup (vendor, assignments, end records, driver,
    car, owner) into a handful of queries up front instead of the previous
    per-order loop, which fired up to ~7 extra queries PER ORDER (worst N+1
    in the codebase - a 100-order page could issue ~700 queries).

    Pass `order_id` to fetch a single order (used by the admin "trip detail"
    page reached from ledger entries) - skips pagination entirely.

    Pass `vendor_id` to see only what that one fleet owner/vendor has posted
    (the "Bookings" tab on their admin detail page) - additive filter, only
    applies when order_id is not given."""
    from app.models.orders import Order

    if order_id is not None:
        orders = db.query(Order).filter(Order.id == order_id).all()
        total_count = len(orders)
        if not orders:
            return [], 0
    else:
        base_q = db.query(Order)
        if vendor_id:
            base_q = base_q.filter(Order.vendor_id == vendor_id)
        # Get total count
        total_count = base_q.count()

        order_col = Order.created_at.asc() if sort == "oldest" else Order.created_at.desc()
        # Get paginated orders
        orders = base_q.order_by(order_col).offset(skip).limit(limit).all()

        if not orders:
            return [], total_count

    order_ids = [o.id for o in orders]
    vendor_ids = {str(o.vendor_id) for o in orders if o.vendor_id}

    # --- Batch: vendors (2 queries total instead of 2 per order) ---
    vendor_creds_by_id = {
        str(v.id): v for v in db.query(VendorCredentials).filter(VendorCredentials.id.in_(vendor_ids)).all()
    } if vendor_ids else {}
    vendor_details_by_id = {
        str(v.vendor_id): v for v in db.query(VendorDetails).filter(VendorDetails.vendor_id.in_(vendor_ids)).all()
    } if vendor_ids else {}
    vendor_info_by_id: Dict[str, VendorBasicInfo] = {}
    for vid, creds in vendor_creds_by_id.items():
        details = vendor_details_by_id.get(vid)
        if not details:
            continue
        vendor_info_by_id[vid] = VendorBasicInfo(
            id=creds.id, reg_id=creds.reg_id, full_name=details.full_name, primary_number=details.primary_number,
            secondary_number=details.secondary_number, gpay_number=details.gpay_number,
            aadhar_number=details.aadhar_number, address=details.address,
            wallet_balance=details.wallet_balance, bank_balance=details.bank_balance,
            created_at=creds.created_at
        )

    # --- Batch: assignments (1 query instead of 1 per order) ---
    assignments_by_order: Dict[int, list] = {}
    for a in db.query(OrderAssignment).filter(OrderAssignment.order_id.in_(order_ids)) \
            .order_by(OrderAssignment.created_at.asc(), OrderAssignment.id.asc()).all():
        assignments_by_order.setdefault(a.order_id, []).append(a)

    # --- Batch: end records (1 query instead of 1 per order) ---
    end_records_by_order: Dict[int, list] = {}
    for r in db.query(EndRecord).filter(EndRecord.order_id.in_(order_ids)).all():
        end_records_by_order.setdefault(r.order_id, []).append(r)

    # --- Determine latest assignment per order + collect ids to batch-fetch ---
    latest_assignment_by_order: Dict[int, OrderAssignment] = {}
    driver_ids, car_ids, owner_ids = set(), set(), set()
    for oid, alist in assignments_by_order.items():
        latest = alist[-1]  # Most recent assignment (list is chronological)
        latest_assignment_by_order[oid] = latest
        if latest.driver_id:
            driver_ids.add(str(latest.driver_id))
        if latest.car_id:
            car_ids.add(str(latest.car_id))
        if latest.vehicle_owner_id:
            owner_ids.add(str(latest.vehicle_owner_id))

    # --- Batch: drivers, cars, owners referenced by any latest assignment ---
    driver_info_by_id = {
        str(d.id): DriverBasicInfo(
            id=d.id, reg_id=d.reg_id, full_name=d.full_name, primary_number=d.primary_number,
            secondary_number=d.secondary_number, licence_number=d.licence_number,
            address=d.address, driver_status=d.driver_status, created_at=d.created_at
        ) for d in (db.query(CarDriver).filter(CarDriver.id.in_(driver_ids)).all() if driver_ids else [])
    }
    car_info_by_id = {
        str(c.id): CarBasicInfo(
            id=c.id, car_name=c.car_name, car_type=c.car_type, car_number=c.car_number,
            car_status=c.car_status, rc_front_img_url=c.rc_front_img_url, rc_back_img_url=c.rc_back_img_url,
            insurance_img_url=c.insurance_img_url, fc_img_url=c.fc_img_url, car_img_url=c.car_img_url,
            created_at=c.created_at
        ) for c in (db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all() if car_ids else [])
    }
    owner_creds_by_id = {
        str(o.id): o for o in (db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id.in_(owner_ids)).all() if owner_ids else [])
    }
    owner_details_by_id = {
        str(o.vehicle_owner_id): o for o in (db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all() if owner_ids else [])
    }
    owner_info_by_id: Dict[str, VehicleOwnerBasicInfo] = {}
    for oid, creds in owner_creds_by_id.items():
        details = owner_details_by_id.get(oid)
        if not details:
            continue
        owner_info_by_id[oid] = VehicleOwnerBasicInfo(
            id=creds.id, reg_id=creds.reg_id, full_name=details.full_name, primary_number=details.primary_number,
            secondary_number=details.secondary_number, address=details.address,
            account_status=creds.account_status, created_at=creds.created_at
        )

    # --- Batch: per-km rate breakdown (cost_per_km/extra_cost_per_km/
    # driver_allowance/extra_driver_allowance) - only exists on the
    # originating NewOrder row (standard bookings); Hourly Rental is a flat
    # package so it has no equivalent and stays None. ---
    new_order_ids = {o.source_order_id for o in orders if o.source == OrderSourceEnum.NEW_ORDERS}
    new_order_by_id = {
        n.order_id: n for n in (db.query(NewOrder).filter(NewOrder.order_id.in_(new_order_ids)).all() if new_order_ids else [])
    }

    # Fetched once, reused for every order below - see _pretrip_estimate_rates.
    pretrip_rates = _pretrip_estimate_rates(db) if new_order_ids else None

    # Build response list
    order_responses = []
    for order in orders:
        # Get vendor information - None for a genuinely vendor-less order
        # (website-direct, Drop Bid, Driver App "Create Booking") or for
        # the rare case a vendor record can't be resolved. Previously this
        # silently `continue`d past the WHOLE order when vendor was falsy -
        # every vendor-less order (an entire, intentionally-built category)
        # was invisible on every admin Orders/Bookings screen as a result.
        # Fixed 2026-09-04 - see also schemas/order_details.py's
        # AdminOrderDetailResponse.vendor, now Optional to match.
        vendor = vendor_info_by_id.get(str(order.vendor_id)) if order.vendor_id else None

        assignments = [
            OrderAssignmentDetail(
                id=a.id, order_id=a.order_id, vehicle_owner_id=a.vehicle_owner_id,
                driver_id=a.driver_id, car_id=a.car_id, assignment_status=a.assignment_status,
                assigned_at=a.assigned_at, expires_at=a.expires_at, cancelled_at=a.cancelled_at,
                completed_at=a.completed_at, created_at=a.created_at
            ) for a in assignments_by_order.get(order.id, [])
        ]

        end_records = [
            EndRecordDetail(
                id=r.id, order_id=r.order_id, driver_id=r.driver_id, start_km=r.start_km,
                end_km=r.end_km, contact_number=r.contact_number,
                img_url=generate_signed_url_from_gcs(r.img_url) if r.img_url else None,
                close_speedometer_image=generate_signed_url_from_gcs(r.close_speedometer_image) if r.close_speedometer_image else None,
                created_at=r.created_at, updated_at=r.updated_at
            ) for r in end_records_by_order.get(order.id, [])
        ]

        # Get latest assignment details
        assigned_driver = None
        assigned_car = None
        vehicle_owner = None

        latest_assignment = latest_assignment_by_order.get(order.id)
        if latest_assignment:
            if latest_assignment.driver_id:
                assigned_driver = driver_info_by_id.get(str(latest_assignment.driver_id))

            if latest_assignment.car_id:
                assigned_car = car_info_by_id.get(str(latest_assignment.car_id))

            if latest_assignment.vehicle_owner_id:
                vehicle_owner = owner_info_by_id.get(str(latest_assignment.vehicle_owner_id))

        source_new_order = new_order_by_id.get(order.source_order_id) if order.source == OrderSourceEnum.NEW_ORDERS else None

        estimated_vendor_profit = estimated_driver_profit = None
        if source_new_order is not None:
            estimated_vendor_profit, estimated_driver_profit = _estimate_pretrip_split(
                pretrip_rates, order, source_new_order.cost_per_km, source_new_order.extra_cost_per_km,
                source_new_order.driver_allowance, source_new_order.extra_driver_allowance,
                source_new_order.permit_charges, source_new_order.extra_permit_charges,
                source_new_order.hill_charges, source_new_order.toll_charges,
                order.night_charges, order.calculated_trip_distance or order.trip_distance,
            )

        order_response = AdminOrderDetailResponse(
            id=order.id,
            source=order.source,
            source_order_id=order.source_order_id,
            vendor_id=order.vendor_id,
            trip_type=order.trip_type,
            car_type=order.car_type,
            pickup_drop_location=order.pickup_drop_location,
            start_date_time=order.start_date_time,
            customer_name=order.customer_name,
            customer_number=order.customer_number,
            trip_status=_display_trip_status(order, bool(assignments)),
            cancelled_by=order.cancelled_by.value if order.cancelled_by else None,
            pick_near_city=order.pick_near_city,
            trip_distance=order.trip_distance,
            trip_time=order.trip_time,
            distance_edited=getattr(order, 'distance_edited', False) or False,
            calculated_trip_distance=getattr(order, 'calculated_trip_distance', None),
            location_links=getattr(order, 'location_links', None),
            estimated_price=order.estimated_price,
            vendor_price=order.vendor_price,
            platform_fees_percent=order.platform_fees_percent,
            vendor_fees_percent=order.vendor_fees_percent,
            closed_vendor_price=order.closed_vendor_price,
            closed_driver_price=order.closed_driver_price,
            commision_amount=order.commision_amount,
            vendor_profit=order.vendor_profit,
            driver_profit=order.driver_profit,
            admin_profit=order.admin_profit,
            estimated_vendor_profit=estimated_vendor_profit,
            estimated_driver_profit=estimated_driver_profit,
            fare_type=getattr(order, 'fare_type', None),
            charge_items=getattr(order, 'charge_items', None),
            advance_received=getattr(order, 'advance_received', None),
            night_charges=order.night_charges,
            waiting_time=order.waiting_time,
            toll_charge_update=order.toll_charge_update or False,
            updated_toll_charges=order.updated_toll_charges,
            cost_per_km=source_new_order.cost_per_km if source_new_order else None,
            extra_cost_per_km=source_new_order.extra_cost_per_km if source_new_order else None,
            driver_allowance=source_new_order.driver_allowance if source_new_order else None,
            extra_driver_allowance=source_new_order.extra_driver_allowance if source_new_order else None,
            permit_charges=source_new_order.permit_charges if source_new_order else None,
            extra_permit_charges=source_new_order.extra_permit_charges if source_new_order else None,
            hill_charges=source_new_order.hill_charges if source_new_order else None,
            quoted_toll_charges=source_new_order.toll_charges if source_new_order else None,
            executed_platform=getattr(order, 'executed_platform', None) or 'Drop Cars App',
            created_at=order.created_at,
            vendor=vendor,
            assignments=assignments,
            end_records=end_records,
            assigned_driver=assigned_driver,
            assigned_car=assigned_car,
            vehicle_owner=vehicle_owner,
            start_otp=((latest_assignment.start_trip_otp if latest_assignment else None) or order.start_trip_otp) if _otps_visible(order) else None,
            end_otp=((latest_assignment.end_trip_otp if latest_assignment else None) or order.end_trip_otp) if _otps_visible(order) else None
        )

        order_responses.append(order_response)
    
    return order_responses, total_count


def get_vendor_order_details(db: Session, order_id: int, vendor_id: str) -> Optional[VendorOrderDetailResponse]:
    """Get limited order details for vendor (excludes sensitive user data)"""
    order = get_order_by_id(db, order_id)
    if not order:
        return None
    
    # Check if vendor owns this order
    if str(order.vendor_id) != vendor_id:
        return None
    
    # Calculate max_time in minutes
    max_time = None
    if order.max_time_to_assign_order and order.created_at:
        time_diff = (order.max_time_to_assign_order - order.created_at).total_seconds() / 60
        max_time = int(time_diff)
    
    # Get assignments
    assignments = get_order_assignments(db, order_id)
    
    # Get end records
    end_records = get_order_end_records(db, order_id)
    
    # Get limited info from latest assignment
    assigned_driver_name = None
    assigned_driver_phone = None
    assigned_car_name = None
    assigned_car_number = None
    vehicle_owner_name = None
    vehicle_owner_number = None
    
    if assignments:
        latest_assignment = assignments[-1]  # Most recent assignment
        
        if latest_assignment.driver_id:
            driver = db.query(CarDriver).filter(CarDriver.id == latest_assignment.driver_id).first()
            if driver:
                assigned_driver_name = driver.full_name
                assigned_driver_phone = driver.primary_number
        
        if latest_assignment.car_id:
            car = db.query(CarDetails).filter(CarDetails.id == latest_assignment.car_id).first()
            if car:
                assigned_car_name = car.car_name
                assigned_car_number = car.car_number
        
        if latest_assignment.vehicle_owner_id:
            owner_details = db.query(VehicleOwnerDetails).filter(
                VehicleOwnerDetails.vehicle_owner_id == latest_assignment.vehicle_owner_id
            ).first()
            if owner_details:
                vehicle_owner_name = owner_details.full_name
                vehicle_owner_number = owner_details.primary_number
    
    # Get source-specific details
    cost_per_km = None
    extra_cost_per_km = None
    driver_allowance = None
    extra_driver_allowance = None
    permit_charges = None
    extra_permit_charges = None
    hill_charges = None
    toll_charges = None
    pickup_notes = None
    package_hours = None
    cost_per_hour = None
    extra_cost_per_hour = None
    cost_for_addon_km = None
    extra_cost_for_addon_km = None
    
    # Get source-specific data based on order source
    if order.source.value == "NEW_ORDERS":
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if new_order:
            cost_per_km = new_order.cost_per_km
            extra_cost_per_km = new_order.extra_cost_per_km
            driver_allowance = new_order.driver_allowance
            extra_driver_allowance = new_order.extra_driver_allowance
            permit_charges = new_order.permit_charges
            extra_permit_charges = new_order.extra_permit_charges
            hill_charges = new_order.hill_charges
            toll_charges = new_order.toll_charges
            pickup_notes = new_order.pickup_notes
    elif order.source.value == "HOURLY_RENTAL":
        hourly_order = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
        if hourly_order:
            package_hours = hourly_order.package_hours
            cost_per_hour = hourly_order.cost_per_hour
            extra_cost_per_hour = hourly_order.extra_cost_per_hour
            cost_for_addon_km = hourly_order.cost_for_addon_km
            extra_cost_for_addon_km = hourly_order.extra_cost_for_addon_km
            pickup_notes = hourly_order.pickup_notes
    # Trip OTPs for the vendor to share with the customer. The live
    # assignment's codes win (that's what start/end-trip verify against);
    # otherwise the booking-level codes, created on first view for a still-
    # open booking - so a vendor sees them right after posting, before any
    # driver accepts (reported 2026-09-30, booking #332 showed "----").
    start_otp = end_otp = None
    from app.crud.trip_otp import otps_visible
    live = next((a for a in reversed(assignments) if str(getattr(a.assignment_status, "value", a.assignment_status)) != "CANCELLED" and a.start_trip_otp), None)
    if live:
        start_otp, end_otp = live.start_trip_otp, live.end_trip_otp
    elif str(getattr(order.trip_status, "value", order.trip_status)) == "PENDING":
        from app.crud.trip_otp import ensure_order_otps
        start_otp, end_otp = ensure_order_otps(db, order)
        db.commit()
    elif order.start_trip_otp:
        start_otp, end_otp = order.start_trip_otp, order.end_trip_otp
    if not otps_visible(order, live):
        start_otp = end_otp = None

    return VendorOrderDetailResponse(
        start_trip_otp=start_otp,
        end_trip_otp=end_otp,
        id=order.id,
        source=order.source.value,
        source_order_id=order.source_order_id,
        vendor_id=order.vendor_id,
        trip_type=order.trip_type.value,
        car_type=order.car_type.value,
        pickup_drop_location=order.pickup_drop_location,
        start_date_time=order.start_date_time,
        customer_name=order.customer_name,
        customer_number=order.customer_number,
        trip_status=order.trip_status,
        pick_near_city=order.pick_near_city,
        trip_distance=order.trip_distance,
        trip_time=order.trip_time,
        estimated_price=order.estimated_price,
        vendor_price=order.vendor_price,
        platform_fees_percent=order.platform_fees_percent,
        closed_vendor_price=order.closed_vendor_price,
        closed_driver_price=order.closed_driver_price,
        commision_amount=order.commision_amount,
        created_at=order.created_at,
        cancelled_by=order.cancelled_by if order.cancelled_by else None,
        max_time_to_assign_order=order.max_time_to_assign_order,
        max_time=max_time,
        toll_charge_update=order.toll_charge_update,
        data_visibility_vehicle_owner=order.data_visibility_vehicle_owner,
        cost_per_km=cost_per_km,
        extra_cost_per_km=extra_cost_per_km,
        driver_allowance=driver_allowance,
        extra_driver_allowance=extra_driver_allowance,
        permit_charges=permit_charges,
        extra_permit_charges=extra_permit_charges,
        hill_charges=hill_charges,
        toll_charges=toll_charges,
        updated_toll_charges = int(order.updated_toll_charges) if order.updated_toll_charges and int( order.updated_toll_charges) > 0 else 0,
        night_charges=int(order.night_charges) if order.night_charges and int(order.night_charges) > 0 else 0,
        waiting_time = order.waiting_time if order.waiting_time else 0,
        vendor_earns_estimation =  math.ceil(((new_order.extra_cost_per_km*order.trip_distance) + new_order.extra_driver_allowance + new_order.extra_permit_charges)+((new_order.cost_per_km*new_order.trip_distance)*order.vendor_fees_percent/100)) - math.ceil(math.ceil(((new_order.extra_cost_per_km*order.trip_distance) + new_order.extra_driver_allowance + new_order.extra_permit_charges)+((new_order.cost_per_km*new_order.trip_distance)*order.vendor_fees_percent/100))*order.platform_fees_percent/100) if order.source == "NEW_ORDERS" else 0,
        pickup_notes=pickup_notes,
        package_hours=package_hours,
        cost_per_hour=cost_per_hour,
        extra_cost_per_hour=extra_cost_per_hour,
        cost_for_addon_km=cost_for_addon_km,
        extra_cost_for_addon_km=extra_cost_for_addon_km,
        assignments=assignments,
        end_records=end_records,
        assigned_driver_name=assigned_driver_name,
        assigned_driver_phone=assigned_driver_phone,
        assigned_car_name=assigned_car_name,
        assigned_car_number=assigned_car_number,
        vehicle_owner_name=vehicle_owner_name,
        vendor_profit=order.vendor_profit,
        admin_profit=order.admin_profit,
        vehicle_owner_number=vehicle_owner_number
    )


def get_vehicle_owner_orders_by_assignment_status(
    db: Session,
    vehicle_owner_id: str,
    assignment_status: str
) -> List[VehicleOwnerOrderDetailResponse]:
    """Get orders for fleet owner filtered by assignment status.

    Batches vendor/driver/car/source-record lookups into a handful of
    queries up front instead of the previous per-order loop, which fired
    up to 5 extra queries PER ORDER (same N+1 pattern already fixed for
    the admin orders endpoint - see get_all_admin_orders)."""
    from sqlalchemy import and_, or_, cast, String
    import uuid
    from app.models.order_assignments import AssignmentStatusEnum

    owner_uuid = None
    try:
        owner_uuid = uuid.UUID(str(vehicle_owner_id))
    except Exception:
        pass

    vo_filter = (
        or_(
            OrderAssignment.vehicle_owner_id == owner_uuid,
            cast(OrderAssignment.vehicle_owner_id, String) == str(vehicle_owner_id)
        )
        if owner_uuid is not None
        else cast(OrderAssignment.vehicle_owner_id, String) == str(vehicle_owner_id)
    )

    # Query to join orders with order_assignments and filter by vehicle_owner_id and assignment_status
    query = db.query(Order, OrderAssignment).join(
        OrderAssignment, Order.id == OrderAssignment.order_id
    ).filter(
        and_(
            vo_filter,
            or_(
                cast(OrderAssignment.assignment_status, String) == str(assignment_status),
                cast(OrderAssignment.assignment_status, String) == "PENDING",
                cast(OrderAssignment.assignment_status, String) == "ASSIGNED",
                cast(OrderAssignment.assignment_status, String) == "DRIVING",
                OrderAssignment.assignment_status == assignment_status,
                OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
                OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED,
                OrderAssignment.assignment_status == AssignmentStatusEnum.DRIVING,
            )
        )
    ).order_by(Order.created_at.desc())

    order_assignment_pairs = query.all()
    if not order_assignment_pairs:
        return []
    _drop_bid_order_ids = _drop_bid_ids(db, [o.id for o, _ in order_assignment_pairs])

    vendor_ids = {str(o.vendor_id) for o, _ in order_assignment_pairs if o.vendor_id}
    driver_ids = {str(a.driver_id) for _, a in order_assignment_pairs if a.driver_id}
    car_ids = {str(a.car_id) for _, a in order_assignment_pairs if a.car_id}
    new_order_ids = {
        o.source_order_id for o, _ in order_assignment_pairs 
        if (hasattr(o.source, 'value') and o.source.value == "NEW_ORDERS") or str(o.source) in ("NEW_ORDERS", "OrderSourceEnum.NEW_ORDERS")
    }
    hourly_rental_ids = {
        o.source_order_id for o, _ in order_assignment_pairs 
        if (hasattr(o.source, 'value') and o.source.value == "HOURLY_RENTAL") or str(o.source) in ("HOURLY_RENTAL", "OrderSourceEnum.HOURLY_RENTAL")
    }

    vendor_by_id = {
        v.vendor_id: v for v in (db.query(VendorDetails).filter(VendorDetails.vendor_id.in_(list(vendor_ids))).all() if vendor_ids else [])
    }
    
    driver_uuids = []
    for d_id in driver_ids:
        try:
            driver_uuids.append(uuid.UUID(str(d_id)))
        except Exception:
            driver_uuids.append(d_id)

    car_uuids = []
    for c_id in car_ids:
        try:
            car_uuids.append(uuid.UUID(str(c_id)))
        except Exception:
            car_uuids.append(c_id)

    driver_by_id = {
        str(d.id): d for d in (db.query(CarDriver).filter(or_(CarDriver.id.in_(driver_uuids), cast(CarDriver.id, String).in_(list(driver_ids)))).all() if driver_ids else [])
    }
    car_by_id = {
        str(c.id): c for c in (db.query(CarDetails).filter(or_(CarDetails.id.in_(car_uuids), cast(CarDetails.id, String).in_(list(car_ids)))).all() if car_ids else [])
    }
    new_order_by_order_id = {
        n.order_id: n for n in (db.query(NewOrder).filter(NewOrder.order_id.in_(list(new_order_ids))).all() if new_order_ids else [])
    }
    hourly_rental_by_id = {
        h.id: h for h in (db.query(HourlyRental).filter(HourlyRental.id.in_(list(hourly_rental_ids))).all() if hourly_rental_ids else [])
    }

    results = []

    for order, assignment in order_assignment_pairs:
        # Get basic vendor info
        vendor_name = "Drop Cars (Customer Direct)"
        vendor_phone = None
        vendor_details = vendor_by_id.get(str(order.vendor_id)) if order.vendor_id else None
        if vendor_details:
            vendor_name = vendor_details.business_name or vendor_details.full_name
            vendor_phone = vendor_details.primary_number

        # Get driver and car info if assigned
        assigned_driver_name = None
        assigned_driver_phone = None
        assigned_car_name = None
        assigned_car_number = None
        pickup_notes = None

        if assignment.driver_id:
            driver = driver_by_id.get(str(assignment.driver_id))
            if driver:
                assigned_driver_name = driver.full_name
                assigned_driver_phone = driver.primary_number

        if assignment.car_id:
            car = car_by_id.get(str(assignment.car_id))
            if car:
                assigned_car_name = car.car_name
                assigned_car_number = car.car_number

        # Business rule: the fleet owner must NEVER see the customer's contact details.
        # This prevents owners from contacting customers directly and bypassing the platform.
        # Owners are given the vendor's number instead (vendor_phone, set below).
        show_customer = bool(order.data_visibility_vehicle_owner)  # manual "Show customer number" switch

        # Source-specific pricing fields
        price_per_km = None
        driver_allowance_val = None
        permit_charge_val = None
        hills_charge_val = None
        toll_charge_val = None
        waiting_charge_val = None
        charges_to_deduct = 0

        # Populate pricing fields based on source
        is_new_order = (hasattr(order.source, 'value') and order.source.value == "NEW_ORDERS") or str(order.source) in ("NEW_ORDERS", "OrderSourceEnum.NEW_ORDERS")
        is_hourly = (hasattr(order.source, 'value') and order.source.value == "HOURLY_RENTAL") or str(order.source) in ("HOURLY_RENTAL", "OrderSourceEnum.HOURLY_RENTAL")
        if is_new_order:
            new_order = new_order_by_order_id.get(order.source_order_id)
            if new_order:
                pickup_notes = new_order.pickup_notes
                price_per_km = new_order.cost_per_km
                driver_allowance_val = new_order.driver_allowance
                permit_charge_val = new_order.permit_charges
                hills_charge_val = new_order.hill_charges
                toll_charge_val = new_order.toll_charges
                charges_to_deduct = round(
                    (order.vendor_price - order.estimated_price)
                    + ((new_order.cost_per_km * new_order.trip_distance) * 10 / 100)
                )
                # Get waiting charge from order.waiting_time (stored when trip ends)
                waiting_charge_val = order.waiting_time if order.waiting_time is not None else None
        elif is_hourly:
            hourly_rental = hourly_rental_by_id.get(order.source_order_id)
            if hourly_rental:
                pickup_notes = hourly_rental.pickup_notes
                charges_to_deduct = int(order.vendor_price - order.estimated_price)
                # If you want to map waiting charge for hourly rental, consider extra_cost_per_hour
                waiting_charge_val = hourly_rental.extra_cost_per_hour

        result = VehicleOwnerOrderDetailResponse(
            # Order information
            id=order.id,
            source=order.source.value,
            source_order_id=order.source_order_id,
            vendor_id=order.vendor_id,
            trip_type=order.trip_type.value,
            car_type=order.car_type.value,
            pickup_drop_location=order.pickup_drop_location,
            start_date_time=order.start_date_time,
            customer_name=order.customer_name if show_customer else "Hidden",
            customer_number=order.customer_number if show_customer else "Hidden",
            trip_status=order.trip_status,
            pick_near_city=order.pick_near_city,
            trip_distance=order.trip_distance,
            trip_time=order.trip_time,
            estimated_price=order.estimated_price,
            vendor_price=order.vendor_price,
            platform_fees_percent=order.platform_fees_percent,
            closed_vendor_price=order.closed_vendor_price,
            closed_driver_price=order.closed_driver_price,
            commision_amount=order.commision_amount,
            created_at=order.created_at,
            max_time_to_assign_order=order.max_time_to_assign_order,
            pickup_notes = pickup_notes,
            charges_to_deduct = charges_to_deduct,
            advance_received = order.advance_received,
            fare_type = (getattr(order.fare_type, 'value', order.fare_type) or 'ITEMIZED'),
            is_drop_bid = order.id in _drop_bid_order_ids,
            final_driver_earnings = order.driver_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            final_poster_share = order.vendor_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            final_platform_fee = order.admin_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            charge_items = order.charge_items,
            held_amount = assignment.held_amount,
            is_urgent = order.is_urgent,
            start_trip_otp = assignment.start_trip_otp if _otps_visible(order, assignment) else None,
            end_trip_otp = assignment.end_trip_otp if _otps_visible(order, assignment) else None,
            trip_link_url = _trip_link_url(assignment.trip_link_token),

            # Pricing additions
            price_per_km=price_per_km,
            driver_allowance=driver_allowance_val,
            permit_charge=permit_charge_val,
            hills_charge=hills_charge_val,
            toll_charge=toll_charge_val,
            waiting_charge=waiting_charge_val,
            night_charges=order.night_charges,
            
            # Assignment information
            assignment_id=assignment.id,
            assignment_status=assignment.assignment_status,
            assigned_at=assignment.assigned_at,
            expires_at=assignment.expires_at,
            cancelled_at=assignment.cancelled_at,
            completed_at=assignment.completed_at,
            assignment_created_at=assignment.created_at,
            
            # Vendor info
            vendor_name=vendor_name,
            vendor_phone=vendor_phone,
            
            # Driver and car info
            assigned_driver_name=assigned_driver_name,
            assigned_driver_phone=assigned_driver_phone,
            assigned_car_name=assigned_car_name,
            assigned_car_number=assigned_car_number,

        )
        
        results.append(result)
    
    return results


def get_vehicle_owner_pending_orders(db: Session, vehicle_owner_id: str) -> List[VehicleOwnerOrderDetailResponse]:
    """Get pending orders for fleet owner"""
    return get_vehicle_owner_orders_by_assignment_status(db, vehicle_owner_id, "PENDING")


_UNALLOCATED_BY_CODE = {
    "AUTO_CANCELLED": "AUTO_CANCELLED",
    "DITCHED": "DITCHED",
    "REMOVED_WITH_PENALTY": "REMOVED",
}


def _drop_bid_ids(db: Session, order_ids) -> set:
    """Orders that came from a confirmed Drop Bid negotiation (shown with a 'Drop Bid' label)."""
    if not order_ids:
        return set()
    try:
        from app.models.drop_bid import DropBidRequest
        return {r[0] for r in db.query(DropBidRequest.order_id).filter(DropBidRequest.order_id.in_(list(order_ids))).all()}
    except Exception:
        return set()


def _end_record_dict(er):
    if not er:
        return None
    return {
        "start_km": er.start_km,
        "end_km": er.end_km,
        "total_km": (er.end_km - er.start_km) if er.end_km is not None and er.start_km is not None else None,
        "img_url": er.img_url,
        "close_speedometer_image": er.close_speedometer_image,
        "start_odometer_photo": er.img_url,
        "end_odometer_photo": er.close_speedometer_image,
        "cash_collection": er.cash_collection,
        "extra_charges_collected": er.extra_charges_collected,
    }


def default_cancel_reason(order, assignment=None) -> str:
    """A cancelled booking must always say why. If whoever cancelled did not give a reason (older app versions, system
    cancels), state the real cause instead of leaving it blank."""
    kind = _unallocated_kind(order, assignment) if assignment is not None else None
    if kind == "AUTO_CANCELLED":
        return "Auto-cancelled - no driver & car were assigned in time (penalty applied)"
    if kind == "DITCHED":
        return "Cancelled by the driver who had accepted it (penalty applied)"
    if kind == "REMOVED":
        return "Removed from the driver by Drop Cars admin (penalty applied)"
    by = str(getattr(getattr(order, "cancelled_by", None), "value", getattr(order, "cancelled_by", None)) or "")
    return {
        "CANCELLED_BY_ADMIN": "Cancelled by Drop Cars admin",
        "CANCELLED_BY_CUSTOMER": "Cancelled by the customer",
        "CANCELLED_BY_VENDOR": "Cancelled by the booking owner",
        "CANCELLED_WHILE_DRIVING": "Cancelled while the trip was running (penalty applied)",
        "AUTO_CANCELLED": "Auto-cancelled - nobody accepted it in time",
    }.get(by, "Cancelled")


def _unallocated_kind(order, assignment):
    """Penalised endings go to the Driver App's My Rides > Unallocated tab (auto-cancelled for no
    driver/car in time, ditched by the driver, removed by admin with penalty); plain cancels
    (vendor / customer / admin / poster) stay under Cancelled."""
    code = getattr(assignment, "cancel_reason", None)
    if code in _UNALLOCATED_BY_CODE:
        return _UNALLOCATED_BY_CODE[code]
    cancelled_by = getattr(order, "cancelled_by", None)
    if getattr(cancelled_by, "value", cancelled_by) == "AUTO_CANCELLED":
        return "AUTO_CANCELLED"
    return None


def get_vehicle_owner_non_pending_orders(
    db: Session,
    vehicle_owner_id: str,
    start_date=None,
    end_date=None,
    skip: int = 0,
    limit: int = 50,
) -> List[VehicleOwnerOrderDetailResponse]:
    """Get non-pending orders for fleet owner (ASSIGNED, CANCELLED, COMPLETED, DRIVING).

    start_date/end_date (inclusive, by Order.created_at) let the Executed tab
    default to a recent window instead of always loading every historical
    trip - large fleets were seeing this page get slow as trip count grew.
    """
    from sqlalchemy import and_, not_
    print("vehicle_owner_id", vehicle_owner_id)
    # Query to join orders with order_assignments and filter by vehicle_owner_id and non-pending status
    query = db.query(Order, OrderAssignment).join(
        OrderAssignment, Order.id == OrderAssignment.order_id
    ).filter(
        and_(
            OrderAssignment.vehicle_owner_id == vehicle_owner_id,
            OrderAssignment.assignment_status != "PENDING",
            OrderAssignment.assignment_status != "ASSIGNED"
        )
    )
    if start_date is not None:
        query = query.filter(Order.created_at >= start_date)
    if end_date is not None:
        query = query.filter(Order.created_at <= end_date)
    query = query.order_by(Order.created_at.desc()).offset(skip).limit(limit)

    order_assignment_pairs = query.all()
    if not order_assignment_pairs:
        return []
    _drop_bid_order_ids = _drop_bid_ids(db, [o.id for o, _ in order_assignment_pairs])

    # Batch every related lookup up front instead of the previous per-order
    # loop, which fired up to 4 extra queries PER ORDER (same N+1 pattern
    # already fixed for the admin orders endpoint and the pending-orders
    # twin of this function above).
    vendor_ids = {str(o.vendor_id) for o, _ in order_assignment_pairs if o.vendor_id}
    driver_ids = {str(a.driver_id) for _, a in order_assignment_pairs if a.driver_id}
    car_ids = {str(a.car_id) for _, a in order_assignment_pairs if a.car_id}
    new_order_ids = {o.source_order_id for o, _ in order_assignment_pairs if o.source.value == "NEW_ORDERS"}
    hourly_rental_ids = {o.source_order_id for o, _ in order_assignment_pairs if o.source.value == "HOURLY_RENTAL"}

    vendor_by_id = {
        v.vendor_id: v for v in (db.query(VendorDetails).filter(VendorDetails.vendor_id.in_(vendor_ids)).all() if vendor_ids else [])
    }
    driver_by_id = {
        str(d.id): d for d in (db.query(CarDriver).filter(CarDriver.id.in_(driver_ids)).all() if driver_ids else [])
    }
    car_by_id = {
        str(c.id): c for c in (db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all() if car_ids else [])
    }
    new_order_by_order_id = {
        n.order_id: n for n in (db.query(NewOrder).filter(NewOrder.order_id.in_(new_order_ids)).all() if new_order_ids else [])
    }
    hourly_rental_by_id = {
        h.id: h for h in (db.query(HourlyRental).filter(HourlyRental.id.in_(hourly_rental_ids)).all() if hourly_rental_ids else [])
    }
    _end_by_order = {}
    for _er in db.query(EndRecord).filter(EndRecord.order_id.in_({o.id for o, _ in order_assignment_pairs})).all():
        _end_by_order[_er.order_id] = _er

    results = []

    for order, assignment in order_assignment_pairs:
        # Get basic vendor info
        vendor_name = None
        vendor_phone = None
        vendor_details = vendor_by_id.get(str(order.vendor_id))
        if vendor_details:
            vendor_name = vendor_details.business_name or vendor_details.full_name
            vendor_phone = vendor_details.primary_number

        # Get driver and car info if assigned
        assigned_driver_name = None
        assigned_driver_phone = None
        assigned_car_name = None
        assigned_car_number = None

        if assignment.driver_id:
            driver = driver_by_id.get(str(assignment.driver_id))
            if driver:
                assigned_driver_name = driver.full_name
                assigned_driver_phone = driver.primary_number

        if assignment.car_id:
            car = car_by_id.get(str(assignment.car_id))
            if car:
                assigned_car_name = car.car_name
                assigned_car_number = car.car_number

        # Business rule: the fleet owner must NEVER see the customer's contact details.
        # This prevents owners from contacting customers directly and bypassing the platform.
        # Owners are given the vendor's number instead (vendor_phone, set below).
        show_customer = bool(order.data_visibility_vehicle_owner)  # manual "Show customer number" switch
        # Source-specific waiting charge mapping
        new_order = None
        waiting_charge_val = None
        try:
            if order.source.value == "NEW_ORDERS":
                new_order = new_order_by_order_id.get(order.source_order_id)
                # Get waiting charge from order.waiting_time (stored when trip ends)
                waiting_charge_val = order.waiting_time if order.waiting_time is not None else None
            elif order.source.value == "HOURLY_RENTAL":
                hourly = hourly_rental_by_id.get(order.source_order_id)
                if hourly:
                    waiting_charge_val = hourly.extra_cost_per_hour
        except Exception:
            waiting_charge_val = None

        result = VehicleOwnerOrderDetailResponse(
            # Order information
            id=order.id,
            source=order.source.value,
            source_order_id=order.source_order_id,
            vendor_id=order.vendor_id,
            trip_type=order.trip_type.value,
            car_type=order.car_type.value,
            pickup_drop_location=order.pickup_drop_location,
            start_date_time=order.start_date_time,
            customer_name=order.customer_name if show_customer else "Hidden",
            customer_number=order.customer_number if show_customer else "Hidden",
            trip_status=order.trip_status,
            pick_near_city=order.pick_near_city,
            trip_distance=order.trip_distance,
            trip_time=order.trip_time,
            estimated_price=order.estimated_price,
            vendor_price=order.vendor_price,
            platform_fees_percent=order.platform_fees_percent,
            closed_vendor_price=order.closed_vendor_price,
            closed_driver_price=order.closed_driver_price,
            commision_amount=order.commision_amount,
            created_at=order.created_at,
            cancelled_by = order.cancelled_by,
            assignment_cancel_reason = getattr(assignment, "cancel_reason", None),
            cancel_note = (getattr(assignment, "cancel_note", None) or getattr(order, "cancel_note", None) or (default_cancel_reason(order, assignment) if str(getattr(assignment.assignment_status, "value", assignment.assignment_status)) == "CANCELLED" else None)),
            unallocated_kind = _unallocated_kind(order, assignment),
            end_record = _end_record_dict(_end_by_order.get(order.id)) if str(getattr(assignment.assignment_status, "value", assignment.assignment_status)) == "COMPLETED" else None,
            data_visibility_vehicle_owner = order.data_visibility_vehicle_owner,
            advance_received = order.advance_received,
            fare_type = (getattr(order.fare_type, 'value', order.fare_type) or 'ITEMIZED'),
            is_drop_bid = order.id in _drop_bid_order_ids,
            final_driver_earnings = order.driver_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            final_poster_share = order.vendor_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            final_platform_fee = order.admin_profit if str(getattr(order.trip_status, 'value', order.trip_status)).upper() == 'COMPLETED' else None,
            charge_items = order.charge_items,
            held_amount = assignment.held_amount,
            is_urgent = order.is_urgent,
            start_trip_otp = assignment.start_trip_otp if _otps_visible(order, assignment) else None,
            end_trip_otp = assignment.end_trip_otp if _otps_visible(order, assignment) else None,
            trip_link_url = _trip_link_url(assignment.trip_link_token),
            # Pricing additions
            waiting_charge=waiting_charge_val,
            night_charges=order.night_charges,
            
            #new order specific
            pickup_notes = new_order.pickup_notes if order.source.value == "NEW_ORDERS" else None,
            price_per_km = new_order.cost_per_km if order.source.value == "NEW_ORDERS" else None,
            driver_allowance = new_order.driver_allowance if order.source.value == "NEW_ORDERS" else None,
            permit_charge = new_order.permit_charges if order.source.value == "NEW_ORDERS" else None,
            hills_charge = new_order.hill_charges if order.source.value == "NEW_ORDERS" else None,
            toll_charge = new_order.toll_charges if order.source.value == "NEW_ORDERS" else None,
            
            # Assignment information
            assignment_id=assignment.id,
            assignment_status=assignment.assignment_status,
            assigned_at=assignment.assigned_at,
            expires_at=assignment.expires_at,
            cancelled_at=assignment.cancelled_at,
            completed_at=assignment.completed_at,
            assignment_created_at=assignment.created_at,
            
            # Vendor info
            vendor_name=vendor_name,
            vendor_phone=vendor_phone,
            
            # Driver and car info
            assigned_driver_name=assigned_driver_name,
            assigned_driver_phone=assigned_driver_phone,
            assigned_car_name=assigned_car_name,
            assigned_car_number=assigned_car_number
        )
        
        results.append(result)
    
    return results
