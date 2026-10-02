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
    from app.crud.website_post_rules import describe_pending, any_staff_present, get_rules

    rules = get_rules(db)
    from app.crud import driver_tariff
    tariff_cfg = driver_tariff.load(db)           # once for the whole list (the Admin App polls this every few seconds)
    requests = (
        db.query(CustomerBookingRequest)
        .filter(CustomerBookingRequest.status == "PENDING")
        .filter(CustomerBookingRequest.requires_manual_confirm == False)  # noqa: E712 - enquiries have their own inbox
        .order_by(CustomerBookingRequest.created_at.asc())
        .all()
    )
    out = []
    for r, plan in describe_pending(db, requests):
        out.append({
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
            # when it posts by itself, and why (None = waits for staff)
            "auto_post_at": plan["deadline"],
            "auto_post_tier": plan["tier"],
            "auto_post_reason": plan["reason"],
            "hold_until": r.hold_until,
            "can_hold": plan["deadline"] is not None,
            # what the Admin App card shows: when it was confirmed, when it will post and why, the latest time staff may schedule/hold to,
            # and the exact driver | extra numbers it will be posted with
            "confirmed_at": r.created_at,
            "post_at_override": r.post_at_override,
            "is_held": bool(plan.get("held")),
            "latest_post_time": cap_for(r, rules),
            "rule_text": rule_text(r, plan, rules),
            "customer_total": r.admin_total_amount if r.admin_total_amount is not None else r.quoted_total_amount,
            "custom_driver_fare": bool(r.custom_driver_fare),
            "post_preview": preview_for(db, r, tariff_cfg),
            "trip_distance": r.quoted_trip_distance,
        })
    return out


def cap_for(r, rules):
    from app.crud.website_post_rules import hold_cap
    return hold_cap(r, rules)


def rule_text(r, plan, rules) -> str:
    """One plain sentence on WHY the booking posts at that time."""
    tier = plan.get("tier")
    adv, wait = int(rules["website_advance_post_hours"]), int(rules["website_staff_wait_until_hours"])
    if tier == "SCHEDULED":
        return "Posting time chosen by staff"
    if plan.get("held"):
        return f"Held by staff. It posts by itself {wait} hrs before pickup and the alarm rings then"
    if tier == "ADVANCE":
        return f"Booked more than {adv} hrs ahead: posts {adv} hrs before pickup (staff can post earlier any time)"
    if tier == "STAFF_WAIT":
        return f"Staff on duty: waits for staff, at most until {wait} hrs before pickup"
    if tier == "MANUAL":
        return "Waits for staff to confirm (never posts by itself)"
    return plan.get("reason") or ""


def preview_for(db, r, tariff_cfg=None):
    try:
        from app.crud.customer_booking_request import posted_fare_split
        return posted_fare_split(db, r, tariff_cfg)
    except Exception:  # noqa: BLE001
        return None


def bulk_approve_website_bookings(db, ids: list, decided_by: str) -> dict:
    """Post exactly the selected bookings. One failing booking never stops the rest."""
    approved, failed = [], []
    for raw_id in ids:
        try:
            order = approve_website_booking(db, raw_id, decided_by=decided_by)
            approved.append({"id": str(raw_id), "order_id": order.id})
        except HTTPException as e:
            db.rollback()
            failed.append({"id": str(raw_id), "reason": e.detail})
        except Exception as e:
            db.rollback()
            failed.append({"id": str(raw_id), "reason": str(e)})
    return {"approved": approved, "failed": failed}


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
