"""Correct the km of a trip that is already COMPLETED, and settle the difference properly.

Before (found 2026-10-14): the office could change a closed trip's km, but the fare, the commission split and the wallets stayed as they
were - so a 159 km trip that really ran 175 km was billed and settled as 159. Now the new figures come from the SAME closing maths
(update_end_trip_record in recalc mode), and the difference is posted to the wallets with a plain note, or - if the office chooses -
only the record is corrected and the wallets are left alone.

Who moves what (the customer pays the extra to the driver in cash, so the driver's wallet carries the counter-entry):
    driver wallet   : -(extra poster share + extra platform fee)      (a refund when the km went down)
    poster          : +extra poster share      (vendor wallet / posting fleet owner's wallet; the platform itself when there is none)
    platform        : +extra platform fee
The three always add up to zero, so nothing is created or lost."""
from datetime import datetime
from typing import Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.end_records import EndRecord
from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
from app.models.orders import Order


def _snapshot(order) -> dict:
    return {"customer_total": int(order.closed_vendor_price or 0), "driver_net": int(order.driver_profit or 0),
            "poster_share": int(order.vendor_profit or 0), "platform_fee": int(order.admin_profit or 0)}


async def correct_trip_km(db: Session, order_id: int, new_end_km: int, reason: str, *, adjust_wallet: bool, by: str, apply: bool) -> dict:
    from app.crud.end_records import update_end_trip_record

    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValueError("Please write why the km is being corrected - it is stored on the trip and in the driver's wallet note")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Booking not found")
    if str(getattr(order.trip_status, "value", order.trip_status)).upper() != "COMPLETED":
        raise ValueError("Only a completed trip can be corrected here. For a trip that is still open use Close trip.")
    a = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED, OrderAssignment.driver_id.isnot(None),
    ).order_by(desc(OrderAssignment.created_at)).first()
    if not a:
        raise ValueError("No driver was assigned to this booking")
    rec = db.query(EndRecord).filter(EndRecord.order_id == order_id, EndRecord.driver_id == a.driver_id).first()
    if not rec or not rec.end_km:
        raise ValueError("This trip has no end-km record to correct")
    if new_end_km < (rec.start_km or 0):
        raise ValueError(f"End km cannot be less than the start km ({rec.start_km})")

    old_km, start_km, old_end = int(rec.end_km - rec.start_km), int(rec.start_km), int(rec.end_km)
    old = _snapshot(order)
    owner_id, vendor_id = str(a.vehicle_owner_id), (str(order.vendor_id) if order.vendor_id else None)
    poster_owner_id = str(order.posted_by_vehicle_owner_id) if getattr(order, "posted_by_vehicle_owner_id", None) else None
    toll = int(order.updated_toll_charges or 0) if order.toll_charge_update else None
    waiting = order.waiting_minutes
    cash = rec.cash_collection

    new = await update_end_trip_record(
        db, order_id, str(a.driver_id), int(new_end_km), updated_toll_charges=toll, waiting_time=waiting, cash_collection=cash,
        distance_reason=f"Km corrected by {by}: {reason}", recalc=True,
    )
    d_total = new["closed_vendor_price"] - old["customer_total"]
    d_poster = new["vendor_profit"] - old["poster_share"]
    d_platform = new["admin_profit"] - old["platform_fee"]
    d_driver_net = new["driver_profit"] - old["driver_net"]
    driver_wallet = -(d_poster + d_platform)          # + = credited to the driver's wallet, - = taken from it
    plan = {
        "order_id": order_id, "applied": False, "wallet_adjusted": False, "reason": reason,
        "km": {"start": start_km, "old_end": old_end, "new_end": int(new_end_km), "old_driven": old_km, "new_driven": int(new["total_km"])},
        "customer_total": {"old": old["customer_total"], "new": new["closed_vendor_price"], "change": d_total},
        "driver_earns": {"old": old["driver_net"], "new": new["driver_profit"], "change": d_driver_net},
        "poster_share": {"old": old["poster_share"], "new": new["vendor_profit"], "change": d_poster},
        "platform_fee": {"old": old["platform_fee"], "new": new["admin_profit"], "change": d_platform},
        "driver_wallet_change": driver_wallet,
        "poster_kind": "vendor" if vendor_id else ("fleet_owner" if poster_owner_id else "platform"),
        "summary": (
            f"Km {old_km} -> {int(new['total_km'])}. The customer's bill changes by Rs {d_total:+d}. "
            + (f"Commission difference Rs {-driver_wallet} will be taken from the driver's wallet." if driver_wallet < 0
               else f"Rs {driver_wallet} will be returned to the driver's wallet." if driver_wallet > 0 else "No wallet difference.")
        ),
    }
    if not apply:
        return plan

    # ---- apply: the record and the order first, then the wallets
    order = db.query(Order).filter(Order.id == order_id).first()
    rec = db.query(EndRecord).filter(EndRecord.order_id == order_id, EndRecord.driver_id == a.driver_id).first()
    rec.end_km = int(new_end_km)
    rec.distance_reason = f"Km corrected by {by} ({old_end} -> {int(new_end_km)}): {reason}"[:500]
    rec.updated_at = datetime.utcnow()
    order.closed_vendor_price, order.closed_driver_price = new["closed_vendor_price"], new["closed_driver_price"]
    order.driver_profit, order.vendor_profit, order.admin_profit = new["driver_profit"], new["vendor_profit"], new["admin_profit"]
    order.commision_amount = new["commision_amount"]
    bd = dict(new["closing_breakdown"] or {})
    if bd:
        bd.setdefault("notes", [])
        bd["notes"] = list(bd["notes"]) + [f"Km corrected by {by}: {old_km} km -> {int(new['total_km'])} km. {reason}"]
        order.closing_breakdown = bd

    moved = []
    if adjust_wallet and (d_poster or d_platform):
        from app.crud.wallet import credit_wallet, debit_wallet_allow_negative
        from app.crud.admin_wallet import credit_admin_wallet, debit_admin_wallet_allow_negative
        from app.crud.vendor_wallet import credit_vendor_wallet, debit_vendor_wallet, get_vendor_wallet_balance
        from app.models.admin import Admin
        note = f"Booking {order_id}: km corrected {old_km} -> {int(new['total_km'])} by {by} ({reason})"
        if driver_wallet < 0:
            debit_wallet_allow_negative(db, vehicle_owner_id=owner_id, amount=-driver_wallet, reference_id=str(order_id), reference_type="KM_CORRECTION",
                                        notes=f"{note}. Commission difference Rs {-driver_wallet} deducted (platform Rs {d_platform:+d}, poster Rs {d_poster:+d}).")
        elif driver_wallet > 0:
            credit_wallet(db, vehicle_owner_id=owner_id, amount=driver_wallet, reference_id=str(order_id), reference_type="KM_CORRECTION",
                          notes=f"{note}. Commission difference Rs {driver_wallet} returned.")
        moved.append({"who": "driver", "amount": driver_wallet})

        admin = db.query(Admin).first()
        admin_id = str(admin.id) if admin else None
        platform_part = d_platform
        if vendor_id:
            if d_poster > 0:
                credit_vendor_wallet(db, vendor_id=vendor_id, amount=d_poster, order_id=order_id, notes=note)
            elif d_poster < 0:
                take = min(-d_poster, max(0, int(get_vendor_wallet_balance(db, vendor_id) or 0)))
                if take > 0:
                    debit_vendor_wallet(db, vendor_id=vendor_id, amount=take, order_id=order_id, notes=note, reference_id=str(order_id), reference_type="KM_CORRECTION")
            moved.append({"who": "vendor", "amount": d_poster})
        elif poster_owner_id:
            if d_poster > 0:
                credit_wallet(db, vehicle_owner_id=poster_owner_id, amount=d_poster, reference_id=str(order_id), reference_type="POSTER_SHARE", notes=note)
            elif d_poster < 0:
                debit_wallet_allow_negative(db, vehicle_owner_id=poster_owner_id, amount=-d_poster, reference_id=str(order_id), reference_type="POSTER_SHARE", notes=note)
            moved.append({"who": "posting driver", "amount": d_poster})
        else:
            platform_part += d_poster                                   # website / admin booking: the platform is the poster too
        if admin_id and platform_part:
            if platform_part > 0:
                credit_admin_wallet(db, admin_id=admin_id, amount=platform_part, order_id=order_id, notes=note)
            else:
                debit_admin_wallet_allow_negative(db, admin_id=admin_id, amount=-platform_part, order_id=order_id, notes=note)
            moved.append({"who": "platform", "amount": platform_part})
    db.commit()

    try:
        from app.utils.website_status_webhook import notify_website_of_status
        notify_website_of_status(db=db, order_id=order_id, status="COMPLETED", actual_distance=int(new["total_km"]), starting_km=start_km,
                                 closing_km=int(new_end_km), final_fare=new["closed_vendor_price"])
    except Exception as e:      # noqa: BLE001
        print(f"website sync after km correction failed: {e}")
    try:
        from app.crud.notification import notify_order_reminder
        # the assignment is COMPLETED (not active), so reach the owner directly
        from app.models.notification import Notification
        from app.crud.notification import _post_expo_payloads
        from app.utils.notification_settings import apply_notification_extras
        body = plan["summary"] if adjust_wallet else f"Km corrected {old_km} -> {int(new['total_km'])}. Your wallet was not changed."
        payloads = [apply_notification_extras({"to": n.token, "title": f"Booking #{order_id} km corrected", "body": body}, db, "booking_reminder")
                    for n in db.query(Notification).filter(Notification.user == "vehicle_owner", Notification.sub == owner_id).all() if n.token]
        if payloads:
            await _post_expo_payloads(payloads)
    except Exception as e:      # noqa: BLE001
        print(f"km correction push failed: {e}")
    plan.update({"applied": True, "wallet_adjusted": bool(adjust_wallet and (d_poster or d_platform)), "moved": moved})
    return plan
