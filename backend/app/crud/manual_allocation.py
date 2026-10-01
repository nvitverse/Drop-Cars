"""Hand a booking directly to one fleet owner ("Allocate manually").

A booking is always allocated to a FLEET OWNER, never to a duty driver: only
fleet owners have a wallet. The fleet owner then picks the driver and car as
for any accepted booking.

Normal allocation holds the commission from the wallet now (TRIP_HOLD), exactly
like accepting a booking. When the wallet is too low, an ADMIN may allocate "on
credit": nothing is taken now and the commission is debited at trip completion,
which may push the wallet below zero. Every allocation is written to the
Owner-visible activity log with the staff member who did it; a credit one also
alerts the admin devices.
"""
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def find_fleet_owner(db: Session, target: str):
    """Fleet owner by id / phone, or the owner of a duty driver (id / phone /
    reg id). Returns VehicleOwnerDetails or None."""
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver

    import uuid

    target = (target or "").strip()
    if not target:
        return None
    # The id columns are UUIDs: comparing them with a phone number makes
    # Postgres reject the whole query, so only match ids with a real UUID.
    try:
        as_uuid = uuid.UUID(target)
    except ValueError:
        as_uuid = None

    owner_match = (VehicleOwnerDetails.primary_number == target) | (VehicleOwnerDetails.vacant_driver_id == target)
    if as_uuid is not None:
        owner_match = owner_match | (VehicleOwnerDetails.vehicle_owner_id == as_uuid)
    owner = db.query(VehicleOwnerDetails).filter(owner_match).first()
    if owner:
        return owner

    driver_match = (CarDriver.primary_number == target) | (CarDriver.reg_id == target)
    if as_uuid is not None:
        driver_match = driver_match | (CarDriver.id == as_uuid)
    driver = db.query(CarDriver).filter(driver_match).first()
    if driver and driver.vehicle_owner_id:
        return db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == driver.vehicle_owner_id
        ).first()
    return None


def commission_hold(estimated_price, vendor_price, cost_per_km=None, trip_distance=None) -> int:
    """Commission held for a booking: the poster's extra (customer price -
    driver price) + 10% of the km fare. Hourly / other sources pass no km."""
    hold = (int(vendor_price or 0) - int(estimated_price or 0))
    if cost_per_km is not None:
        hold += (int(cost_per_km or 0) * float(trip_distance or 0)) * 10 / 100
    return max(0, int(round(hold)))


def hold_for_order(db: Session, order) -> int:
    from app.models.new_orders import NewOrder

    source = getattr(order.source, "value", order.source)
    if source == "NEW_ORDERS":
        row = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if row:
            return commission_hold(order.estimated_price, order.vendor_price, row.cost_per_km, row.trip_distance)
        return 0
    return commission_hold(order.estimated_price, order.vendor_price)


def low_balance_response(vehicle_owner, balance: int, required: int, can_use_credit: bool) -> dict:
    return {
        "status": "INSUFFICIENT_BALANCE",
        "requires_credit_approval": can_use_credit,
        "wallet_balance": balance,
        "required_amount": required,
        "target_vehicle_owner_id": str(vehicle_owner.vehicle_owner_id),
        "fleet_owner_name": getattr(vehicle_owner, "full_name", None),
        "message": (
            f"Wallet balance is low (₹{balance}). This booking needs ₹{required}."
            + ("" if can_use_credit else " Only Drop Cars admin can allocate on credit.")
        ),
    }


def allocate_to_fleet_owner(
    db: Session,
    order,
    vehicle_owner,
    *,
    on_credit: bool = False,
    assigned_by: str = "ADMIN",
    staff=None,
) -> dict:
    """Claim `order` for `vehicle_owner`. Returns a dict with status SUCCESS or
    INSUFFICIENT_BALANCE (nothing changed). `on_credit` is honoured only for
    assigned_by == "ADMIN"."""
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.crud.wallet import get_owner_balance, debit_wallet

    owner_id = str(vehicle_owner.vehicle_owner_id)
    can_use_credit = assigned_by == "ADMIN"
    on_credit = bool(on_credit and can_use_credit)

    hold = hold_for_order(db, order)
    balance = get_owner_balance(db, owner_id)
    short = balance < hold
    if short and not on_credit:
        return low_balance_response(vehicle_owner, balance, hold, can_use_credit)
    # Enough money: hold it now even if "credit" was ticked - credit is only
    # for a wallet that cannot cover the booking.
    use_credit = bool(short and on_credit)
    held_now = 0 if use_credit else hold

    assignment = db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).first()
    if assignment:
        assignment.vehicle_owner_id = owner_id
        assignment.assignment_status = AssignmentStatusEnum.PENDING
        assignment.assigned_by = assigned_by
        assignment.held_amount = held_now
    else:
        assignment = OrderAssignment(
            order_id=order.id,
            vehicle_owner_id=owner_id,
            assignment_status=AssignmentStatusEnum.PENDING,
            assigned_by=assigned_by,
            held_amount=held_now,
            accepted_tier=getattr(vehicle_owner, "tier", "STANDARD"),
        )
        db.add(assignment)

    if held_now > 0:
        debit_wallet(
            db,
            vehicle_owner_id=owner_id,
            amount=held_now,
            reference_id=str(order.id),
            reference_type="TRIP_HOLD",
            notes=f"Held (not final) for Booking ID {order.id} - refunded if it is cancelled; any unused part is returned when the trip completes",
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail=f"Booking #{order.id} has already been accepted/assigned to another fleet owner.",
        )

    staff_name = getattr(staff, "username", None) or ("vendor" if assigned_by == "VENDOR" else "admin")
    owner_name = getattr(vehicle_owner, "full_name", None) or owner_id

    if staff is not None and assigned_by == "ADMIN":
        try:
            from app.crud.admin_activity_log import log_admin_action
            log_admin_action(
                db, admin_id=str(staff.id), admin_username=staff.username, admin_role=getattr(staff, "role", None),
                action="BOOKING_ALLOCATED_ON_CREDIT" if use_credit else "BOOKING_ALLOCATED_MANUALLY",
                target_type="order", target_id=str(order.id), target_name=f"Booking #{order.id}",
                details={
                    "fleet_owner_id": owner_id,
                    "fleet_owner_name": owner_name,
                    "fleet_owner_phone": getattr(vehicle_owner, "primary_number", None),
                    "wallet_balance_at_allocation": balance,
                    "commission_amount": hold,
                    "on_credit": use_credit,
                    "held_now": held_now,
                },
            )
        except Exception as e:
            print(f"allocation activity log failed (booking still allocated): {e}")

    _push_allocation(db, order.id, owner_id, use_credit, hold, assigned_by)
    if use_credit:
        _alert_admins_credit(db, order.id, owner_name, staff_name, balance, hold)

    return {
        "status": "SUCCESS",
        "message": f"Booking ID #{order.id} allocated to {owner_name}" + (" on credit." if use_credit else "."),
        "assignment_id": assignment.id,
        "on_credit": use_credit,
        "held_amount": held_now,
        "commission_amount": hold,
        "wallet_balance_after": get_owner_balance(db, owner_id),
    }


def _push_allocation(db: Session, order_id: int, owner_id: str, on_credit: bool, hold: int, assigned_by: str = "ADMIN") -> None:
    try:
        from app.utils.notification_dispatch import _tokens_for, _send_expo
        giver = "the vendor" if assigned_by == "VENDOR" else "Drop Cars"
        body = f"Booking ID #{order_id} has been directly assigned to you by {giver}."
        if on_credit and hold > 0:
            body += f" Allocated on credit - ₹{hold} commission will be deducted from your wallet when the trip completes."
        _send_expo(_tokens_for(db, "vehicle_owner", owner_id), "Booking Directly Assigned!", body,
                   {"order_id": order_id}, db, "booking_directly_assigned")
    except Exception as e:
        print(f"Failed to push manual assignment notification: {e}")


def _alert_admins_credit(db: Session, order_id: int, owner_name: str, staff_name: str, balance: int, hold: int) -> None:
    try:
        from app.utils.notification_dispatch import _tokens_for, _send_expo
        _send_expo(
            _tokens_for(db, "admin"),
            "Booking allocated on credit",
            f"{staff_name} allocated Booking #{order_id} to {owner_name} on credit. Wallet ₹{balance}, commission ₹{hold} due at trip completion.",
            {"order_id": order_id, "type": "credit_allocation"}, db, "admin_booking_approval",
        )
    except Exception as e:
        print(f"Failed to alert admins about credit allocation: {e}")
