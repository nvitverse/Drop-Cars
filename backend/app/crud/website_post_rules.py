"""When does a pending website booking post to drivers by itself?

Owner's rule (2026-10-01). "T" is how long before pickup the booking was MADE:

  T > 15 hrs     Advance booking. Staff can confirm any time (they call the customer in the gap);
                 otherwise it posts by itself at pickup - 15 hrs. Applies whether or not staff is on duty.
  2 - 15 hrs     Staff on duty: wait for them, at most until pickup - 2 hrs.  Off duty: posts after 5 min.
  1 - 2 hrs      Staff on duty: 10 min.  Off duty: 1 min.
  up to 1 hr     (or flagged urgent) as before - staff gets 2 min, then it posts.  Off duty: 30 sec.

"Staff on duty" means really present: the duty switch is ON, the admin app was used in the last 5 minutes
and the shift is under 12 hrs old. A forgotten switch no longer holds bookings back.

Staff can pause one booking with "hold" (never beyond pickup - 2 hrs). Bookings still waiting after
10 minutes alert the Owner once. Every number is editable in Admin > System Config.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

DEFAULTS = {
    "website_advance_post_hours": 15,
    "website_staff_wait_until_hours": 2,
    "website_short_notice_hours": 1,
    "website_off_duty_delay_seconds": 300,
    "website_on_duty_short_delay_seconds": 600,
    "website_off_duty_short_delay_seconds": 60,
    "website_off_duty_urgent_delay_seconds": 30,
    "website_owner_escalate_minutes": 10,
    "staff_presence_minutes": 5,
    "staff_duty_max_hours": 12,
}
HOLD_MAX_MINUTES = 120


def get_rules(db: Session) -> dict:
    """All rule numbers in one query. Anything unset or unreadable falls back to the default."""
    rows = {r.key: r.value for r in db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(DEFAULTS))).all()}
    rules = {}
    for key, default in DEFAULTS.items():
        try:
            rules[key] = float(rows[key]) if key in rows else float(default)
        except (TypeError, ValueError):
            rules[key] = float(default)
    return rules


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ------------------------------------------------------------------ who is really on duty
def staff_present_count(db: Session, now: Optional[datetime] = None, rules: Optional[dict] = None) -> int:
    from app.models.admin import Admin

    now = now or datetime.now(timezone.utc)
    rules = rules or get_rules(db)
    seen_after = now - timedelta(minutes=rules["staff_presence_minutes"])
    shift_after = now - timedelta(hours=rules["staff_duty_max_hours"])
    q = db.query(Admin.id).filter(Admin.is_on_duty.is_(True), Admin.last_seen_at >= seen_after)
    q = q.filter((Admin.on_duty_since.is_(None)) | (Admin.on_duty_since >= shift_after))
    return q.count()


def any_staff_present(db: Session, now: Optional[datetime] = None, rules: Optional[dict] = None) -> bool:
    return staff_present_count(db, now, rules) > 0


def is_admin_effectively_on_duty(admin, now: Optional[datetime] = None, rules: Optional[dict] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    rules = rules or DEFAULTS
    if not getattr(admin, "is_on_duty", False):
        return False
    seen = _aware(getattr(admin, "last_seen_at", None))
    if seen is None or seen < now - timedelta(minutes=rules["staff_presence_minutes"]):
        return False
    since = _aware(getattr(admin, "on_duty_since", None))
    return since is None or since >= now - timedelta(hours=rules["staff_duty_max_hours"])


def expire_stale_duty(db: Session, now: Optional[datetime] = None, rules: Optional[dict] = None) -> int:
    """Switch a shift off once it is older than the maximum (12 hrs), so nobody stays on duty forever."""
    from app.models.admin import Admin

    now = now or datetime.now(timezone.utc)
    rules = rules or get_rules(db)
    limit = now - timedelta(hours=rules["staff_duty_max_hours"])
    n = db.query(Admin).filter(Admin.is_on_duty.is_(True), Admin.on_duty_since.isnot(None), Admin.on_duty_since < limit).update(
        {Admin.is_on_duty: False}, synchronize_session=False
    )
    if n:
        db.commit()
    return n


# ------------------------------------------------------------------ the plan for one booking
def compute_post_plan(request, *, now: datetime, staff_on: bool, rules: dict, mode: str,
                      normal_seconds: int = 900, urgent_seconds: int = 120) -> dict:
    """{"deadline": datetime|None, "tier": str, "reason": str}. deadline None = it will not post by itself."""
    if mode == "MANUAL" or getattr(request, "requires_manual_confirm", False):
        return {"deadline": None, "tier": "MANUAL", "reason": "Waits for staff to confirm"}

    created = _aware(request.created_at) or now
    pickup = _aware(getattr(request, "start_date_time", None))
    is_urgent = bool(getattr(request, "is_urgent", False))

    if mode == "AUTO_IF_NO_STAFF":  # older mode: only posts while nobody is on duty, on the creation-time timer
        if staff_on:
            return {"deadline": None, "tier": "STAFF_ON_DUTY", "reason": "Staff on duty handles it by hand"}
        return {"deadline": created + timedelta(seconds=urgent_seconds if is_urgent else normal_seconds),
                "tier": "OFF_DUTY", "reason": "No staff on duty"}

    plan = None
    if pickup is None:  # no pickup time to plan around - the plain timer
        plan = {"deadline": created + timedelta(seconds=urgent_seconds if is_urgent else normal_seconds),
                "tier": "TIMER", "reason": "Review window"}
    else:
        made_hrs = (pickup - created).total_seconds() / 3600.0
        advance = rules["website_advance_post_hours"]
        wait_until = rules["website_staff_wait_until_hours"]
        short = rules["website_short_notice_hours"]
        if is_urgent or made_hrs <= short:
            # flagged "need a taxi now" by the customer, or pickup within the hour: never held back by the advance rule
            delay = urgent_seconds if staff_on else rules["website_off_duty_urgent_delay_seconds"]
            plan = {"deadline": created + timedelta(seconds=delay), "tier": "URGENT",
                    "reason": "Pickup is very close" if staff_on else "No staff on duty - urgent"}
        elif made_hrs > advance:
            plan = {"deadline": pickup - timedelta(hours=advance), "tier": "ADVANCE",
                    "reason": f"Advance booking - posts {int(advance)} hrs before pickup"}
        elif made_hrs <= wait_until:
            delay = rules["website_on_duty_short_delay_seconds"] if staff_on else rules["website_off_duty_short_delay_seconds"]
            plan = {"deadline": created + timedelta(seconds=delay), "tier": "SHORT_NOTICE",
                    "reason": "Pickup within 2 hrs" if staff_on else "No staff on duty"}
        elif staff_on:
            plan = {"deadline": pickup - timedelta(hours=wait_until), "tier": "STAFF_WAIT",
                    "reason": f"Staff can confirm until {int(wait_until)} hrs before pickup"}
        else:
            plan = {"deadline": created + timedelta(seconds=rules["website_off_duty_delay_seconds"]), "tier": "OFF_DUTY",
                    "reason": "No staff on duty"}

    hold = _aware(getattr(request, "hold_until", None))
    if hold is not None and plan["deadline"] is not None and hold > plan["deadline"]:
        plan = {**plan, "deadline": hold, "reason": "Held by staff"}
    return plan


def hold_cap(request, rules: dict) -> Optional[datetime]:
    """Latest moment a hold may run to: pickup - 2 hrs. None = no pickup time, use the plain maximum."""
    pickup = _aware(getattr(request, "start_date_time", None))
    return None if pickup is None else pickup - timedelta(hours=rules["website_staff_wait_until_hours"])


def set_hold(db: Session, request, minutes: int, rules: Optional[dict] = None, now: Optional[datetime] = None) -> datetime:
    """Pause the auto-post of one booking for `minutes` (max 120), never past pickup - 2 hrs."""
    from fastapi import HTTPException

    now = now or datetime.now(timezone.utc)
    rules = rules or get_rules(db)
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a pending booking can be held")
    minutes = max(1, min(int(minutes), HOLD_MAX_MINUTES))
    until = now + timedelta(minutes=minutes)
    cap = hold_cap(request, rules)
    if cap is not None:
        if cap <= now:
            raise HTTPException(status_code=400, detail="Too close to pickup to hold - confirm or post it now")
        until = min(until, cap)
    request.hold_until = until
    db.commit()
    return until


def describe_pending(db: Session, requests: list, *, now: Optional[datetime] = None) -> list:
    """[(request, plan)] for the Admin App list - the same plan the sweep will act on."""
    from app.crud.customer_booking_request import get_auto_approve_seconds, get_website_post_mode

    now = now or datetime.now(timezone.utc)
    rules = get_rules(db)
    staff_on = any_staff_present(db, now, rules)
    mode = get_website_post_mode(db)
    normal_s = get_auto_approve_seconds(db, is_urgent=False)
    urgent_s = get_auto_approve_seconds(db, is_urgent=True)
    return [(r, compute_post_plan(r, now=now, staff_on=staff_on, rules=rules, mode=mode,
                                  normal_seconds=normal_s, urgent_seconds=urgent_s)) for r in requests]


def maybe_escalate(db: Session, request, plan: dict, *, now: datetime, rules: dict, staff_on: bool) -> bool:
    """A booking that staff were supposed to handle has been waiting too long: alert the Owner once."""
    if getattr(request, "escalated_at", None) is not None:
        return False
    if plan.get("tier") not in ("STAFF_WAIT", "SHORT_NOTICE") or not staff_on:
        return False
    created = _aware(request.created_at) or now
    waited_min = (now - created).total_seconds() / 60.0
    if waited_min < rules["website_owner_escalate_minutes"]:
        return False

    from app.models.admin import Admin
    from app.utils.notification_dispatch import _tokens_for, _send_expo

    request.escalated_at = now
    db.commit()
    tokens = []
    for owner in db.query(Admin).filter(Admin.role == "Owner").all():
        tokens.extend(_tokens_for(db, "admin", sub=str(owner.id)))
    if tokens:
        route = getattr(request, "pickup_drop_location", None) or {}
        places = [str(v) for v in route.values()] if isinstance(route, dict) else []
        _send_expo(
            tokens,
            "Booking waiting on staff",
            f"{request.customer_name} {' -> '.join(places[:2])} has waited {int(waited_min)} min. {plan.get('reason', '')}",
            {"type": "website_booking_waiting", "booking_id": str(request.id)},
            db, "admin_booking_approval",
        )
    return True
