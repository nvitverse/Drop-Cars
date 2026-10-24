"""Admin App: close a trip by hand when the driver cannot (phone dead, app problem, driver unreachable).

It runs the SAME closing code the Driver App uses (crud/end_records.update_end_trip_record): the same fare rules, the same
commission split and the same wallet settlement - so the driver gets what he is owed, the platform gets its share, and an advance
the poster / vendor already holds is settled against their share. Nothing is calculated here a second time.
What is different: no customer end code is asked (staff are confirming), no speedometer photo is needed, and the reason is stored
on the trip (distance_reason) and in the admin activity log."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud.admin_activity_log import log_admin_action
from app.database.session import get_db
from app.models.end_records import EndRecord
from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
from app.models.orders import Order

router = APIRouter(prefix="/admin/orders", tags=["Admin Trip Close"])

CASH_DIFFERS_MARK = "[CASH_DIFFERS]"     # the Admin App recognises this and asks staff to confirm (same idea as wallet_duplicates.DUPLICATE_MARK)


class ManualCloseIn(BaseModel):
    end_km: int = Field(..., ge=0, description="Odometer reading at the end of the trip")
    start_km: Optional[int] = Field(None, ge=0, description="Odometer at the start - only needed if the driver never started the trip in the app")
    reason: str = Field(..., min_length=3, max_length=400, description="Why staff are closing it (stored on the trip)")
    cash_collection: Optional[int] = Field(None, ge=0, description="Cash the driver collected from the customer; blank = the expected amount (total - advance)")
    updated_toll_charges: Optional[int] = Field(None, ge=0, description="Actual toll - required when the booking asked for the toll to be updated at close")
    waiting_minutes: Optional[int] = Field(None, ge=0, description="Waiting minutes (multi-city bookings)")
    extra_charges_collected: Optional[List[dict]] = Field(None, description='Audit only, e.g. [{"label":"State Tax","amount":150}]')
    confirm_cash: bool = Field(False, description="true = the cash entered really differs from (bill - advance) and staff know the driver wallet moves by the difference")


def _preview_args(body: ManualCloseIn) -> dict:
    return dict(updated_toll_charges=body.updated_toll_charges, waiting_time=body.waiting_minutes, cash_collection=body.cash_collection,
                extra_charges_collected=body.extra_charges_collected)


@router.post("/{order_id}/manual-close")
async def manual_close_trip(order_id: int, body: ManualCloseIn, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_payment_release_permission   # money moves: same permission as releasing a payment
    require_payment_release_permission(current_admin)
    from app.crud.end_records import update_end_trip_record, DistanceReasonRequired, build_customer_bill

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")
    if order.trip_status == "CANCELLED":
        raise HTTPException(status_code=400, detail="This booking is cancelled")
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
    ).order_by(desc(OrderAssignment.assigned_at)).first()
    if not assignment or not assignment.driver_id:
        raise HTTPException(status_code=400, detail="No driver is assigned to this booking, so there is nothing to close")
    if assignment.assignment_status == AssignmentStatusEnum.COMPLETED:
        raise HTTPException(status_code=400, detail="This trip is already completed")

    driver_id = str(assignment.driver_id)
    record = db.query(EndRecord).filter(EndRecord.order_id == order_id, EndRecord.driver_id == assignment.driver_id).first()
    if record is None:
        if body.start_km is None:
            raise HTTPException(status_code=400, detail="The driver never started this trip in the app - enter the start km as well")
        record = EndRecord(order_id=order_id, driver_id=assignment.driver_id, start_km=body.start_km, end_km=0, contact_number="", img_url="")
        db.add(record)
        assignment.assignment_status = AssignmentStatusEnum.DRIVING
        db.commit()
    elif body.start_km is not None and record.end_km in (0, None):
        record.start_km = body.start_km
        db.commit()
    if body.end_km < (record.start_km or 0):
        raise HTTPException(status_code=400, detail=f"End km cannot be less than the start km ({record.start_km})")

    admin_name = getattr(current_admin, "username", "Admin")
    # The driver's wallet moves rupee for rupee with the cash typed here (driver_net - cash + hold). A cash figure far from
    # (bill - advance) is almost always a slip - a Rs 500 hold came back as Rs 3800 that way (Virugambakkam - Kanchipuram,
    # 2026-10-24) - so the real maths is run once without saving and staff must confirm a big difference.
    if body.cash_collection is not None and not body.confirm_cash:
        try:
            sim = await update_end_trip_record(db=db, order_id=order_id, driver_id=driver_id, end_km=body.end_km, recalc=True,
                                               distance_reason=f"Closed by {admin_name} (staff): {body.reason.strip()}", **_preview_args(body))
        except (DistanceReasonRequired, ValueError):
            db.rollback()
            sim = None          # the real call below reports the actual problem
        if sim:
            db.refresh(order)
            advance = int(order.advance_received or 0)
            bill = int(sim.get("closed_vendor_price") or 0)
            expected_cash = max(0, bill - advance)
            if abs(int(body.cash_collection) - expected_cash) > max(300, int(expected_cash * 0.1)):
                lower = int(body.cash_collection) < expected_cash
                raise HTTPException(status_code=409, detail=(
                    f"{CASH_DIFFERS_MARK} The bill is Rs {bill}" + (f" and Rs {advance} advance is already paid" if advance else "") +
                    f", so the driver should have collected about Rs {expected_cash}. You entered Rs {body.cash_collection}. "
                    f"The driver's wallet will be {'credited' if lower else 'debited'} Rs {abs(expected_cash - int(body.cash_collection))} "
                    f"more than a normal close. Leave the cash box blank to use Rs {expected_cash}."))
    try:
        result = await update_end_trip_record(
            db=db, order_id=order_id, driver_id=driver_id, end_km=body.end_km,
            close_speedometer_image_url=None,
            distance_reason=f"Closed by {admin_name} (staff): {body.reason.strip()}",
            **_preview_args(body),
        )
    except DistanceReasonRequired as e:      # cannot happen (a reason is always passed) - kept for safety
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=admin_name, admin_role=getattr(current_admin, "role", None),
        action="TRIP_MANUAL_CLOSE", target_type="order", target_id=str(order_id), target_name=f"Booking {order_id}",
        details={"end_km": body.end_km, "start_km": record.start_km, "reason": body.reason.strip(), "cash_collection": body.cash_collection},
    )
    db.commit()
    bill = None
    try:
        db.refresh(order)
        bill = build_customer_bill(db, order)
    except Exception:
        pass
    wallet = None
    try:   # what actually moved on the driver's wallet, so staff see it the moment they close
        from app.models.wallet_ledger import WalletEntryTypeEnum, WalletLedger
        rows = db.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == assignment.vehicle_owner_id,
                                             WalletLedger.reference_id == str(order_id),
                                             WalletLedger.reference_type == "TRIP_COMPLETION").all()
        if rows:
            net = sum(int(r.amount or 0) if r.entry_type == WalletEntryTypeEnum.CREDIT else -int(r.amount or 0) for r in rows)
            wallet = {"driver_wallet_change": net, "note": rows[-1].notes}
    except Exception:
        pass
    return {"message": f"Booking {order_id} closed", "total_km": result["total_km"], "bill": bill, "wallet": wallet}
