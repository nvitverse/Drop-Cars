"""General (non-booking) support chat between a driver/owner and Drop Cars
Admin - a real two-way thread (not a fire-and-forget ticket), plus the
driver-facing "who do I call right now" lookup. A booking-specific question
goes through booking_chat.py's per-order thread instead."""
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_current_driver, get_current_user, get_current_admin, get_current_user_flexible
from app.models.support_message import SupportMessage
from app.models.admin import Admin

router = APIRouter(prefix="/support", tags=["Support"])

# Same retention window as booking_chat's CHAT_RETENTION_DAYS, for the same
# reason - keep the Support inbox from growing forever.
SUPPORT_RETENTION_DAYS = 10


def purge_old_support_messages(db: Session) -> int:
    """Delete Support chat messages older than SUPPORT_RETENTION_DAYS
    (called from main.py's hourly housekeeping sweep, alongside
    booking_chat.purge_old_chat_messages)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=SUPPORT_RETENTION_DAYS)
    n = db.query(SupportMessage).filter(SupportMessage.created_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return int(n or 0)


def _resolve_sender(request: Request, db: Session):
    """Owner, driver or vendor, whichever token this is - this same Admin
    Support chat is shared by the Driver App (owner shell or duty driver)
    and the Vendor App. VENDOR added 2026-09-23 - the Vendor App's
    "Operations & Dispatch Desk" row used to be call-only because this
    resolver only ever tried OWNER/DRIVER, so a vendor token always 401'd
    here."""
    h = request.headers.get("authorization") or request.headers.get("Authorization")
    if not h or not h.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=h.split(" ", 1)[1])
    from app.core.security import get_current_vendor
    for role, getter in (("OWNER", get_current_user), ("DRIVER", get_current_driver), ("VENDOR", get_current_vendor)):
        try:
            return role, getter(creds, db)
        except HTTPException:
            continue
    raise HTTPException(status_code=401, detail="Could not validate credentials")


def _sender_display_name(db: Session, role: str, caller) -> str:
    """caller.full_name works for OWNER/DRIVER, but get_current_vendor
    returns VendorCredentials (no full_name column - that's on the separate
    VendorDetails row), so a vendor's messages showed up in Admin's inbox
    as the generic 'Driver/Owner' fallback. Look up the real name for
    VENDOR specifically."""
    if role == "VENDOR":
        try:
            from app.crud.vendor import get_vendor_details_by_vendor_id
            details = get_vendor_details_by_vendor_id(db, str(caller.id))
            if details and details.full_name:
                return details.full_name
        except Exception:
            pass
        return "Vendor"
    return getattr(caller, "full_name", None) or getattr(caller, "reg_id", None) or "Driver/Owner"


def _notify_admins_of_support_message(db: Session, sender_name: str, text: str) -> None:
    """Best-effort push to every admin with a token - mirrors booking_chat's
    admin fallback. Deliberately broad (not on-duty-only) so a message is
    never silently missed just because no one remembered to toggle on-duty."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _is_muted, _post_expo_payloads_sync
        rows = db.query(Notification).filter(Notification.user == "admin").all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return
        _post_expo_payloads_sync([
            {"to": t, "title": f"\U0001F4AC Support: {sender_name}", "body": text[:140], "priority": "high",
             "data": {"type": "support_chat"}}
            for t in tokens
        ])
    except Exception:
        pass


def _notify_driver_owner_of_admin_reply(db: Session, thread_key: str, text: str) -> None:
    """Push to whichever app (Driver App as a duty driver, or as the owner
    shell) actually has a token registered for this thread's owner."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _is_muted, _post_expo_payloads_sync
        rows = db.query(Notification).filter(
            Notification.user.in_(["driver", "vehicle_owner"]), Notification.sub == thread_key
        ).all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return
        _post_expo_payloads_sync([
            {"to": t, "title": "\U0001F4AC Drop Cars Support replied", "body": text[:140], "priority": "high",
             "data": {"type": "support_chat"}}
            for t in tokens
        ])
    except Exception:
        pass


def _msg_out(m: SupportMessage, me: str) -> dict:
    return {
        "id": m.id, "mine": m.sender_side == me, "sender_name": m.sender_name,
        "text": m.text, "voice_url": m.voice_url, "created_at": m.created_at.isoformat() if m.created_at else None,
        "read": m.read_at is not None,
    }


class SupportMessagePayload(BaseModel):
    text: Optional[str] = Field(None, max_length=1000)
    voice_url: Optional[str] = None


class PublicAdminHelpRequest(BaseModel):
    role: str = Field(..., description="vehicle_owner | driver")
    primary_number: str = Field(..., min_length=10, max_length=10)
    reason: str = Field(..., min_length=2, max_length=100)
    message: Optional[str] = Field(None, max_length=1000)


@router.post("/public-request-admin-help")
def public_request_admin_help(payload: PublicAdminHelpRequest, db: Session = Depends(get_db)):
    """Allow an existing driver/owner on the password reset screen to submit a
    support request directly into the Admin App's Support Chats inbox,
    validating first that an account exists for their primary_number."""
    role = payload.role.strip().lower()
    number = payload.primary_number.strip()
    reason = payload.reason.strip()
    custom_msg = (payload.message or "").strip()

    # 1. Account existence validation
    account = None
    if role == "vehicle_owner":
        from app.models.vehicle_owner import VehicleOwnerCredentials
        account = db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.primary_number == number
        ).first()
    elif role == "driver":
        from app.models.car_driver import CarDriver
        account = db.query(CarDriver).filter(
            CarDriver.primary_number == number
        ).first()

    if not account:
        raise HTTPException(
            status_code=400,
            detail=f"No {role.replace('_', ' ')} account found registered with mobile number +91 {number}. Please check your mobile number.",
        )

    name = getattr(account, "full_name", None) or f"{role.capitalize()} (+91 {number})"
    thread_key = str(getattr(account, "id", f"guest_{number}"))

    # 2. Format support message for Admin inbox
    formatted_text = f"🔑 Password Reset Support Request\n\n📌 Reason: {reason}"
    if custom_msg:
        formatted_text += f"\n\n💬 Note: {custom_msg}"
    formatted_text += f"\n\n📞 Primary Mobile: +91 {number}"

    # 3. Create SupportMessage row for Admin App > Chats
    m = SupportMessage(
        thread_key=thread_key,
        thread_role=role.upper(),
        thread_name=f"{name} ({number})",
        sender_side="DRIVER_OWNER",
        sender_name=name,
        text=formatted_text,
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    # 4. Best-effort email & push notification to Admins
    try:
        from app.utils.emailer import send_email, smtp_configured, get_smtp_settings
        if smtp_configured(db):
            from app.models.platform_setting import PlatformSetting
            row = db.query(PlatformSetting).filter(PlatformSetting.key == "support_notify_email").first()
            to_email = (row.value if row and row.value else None) or get_smtp_settings(db)["smtp_user"]
            send_email(
                db,
                to_email,
                f"Drop Cars Reset Support Request from {name}",
                f"Password Reset Support Request\nFrom: {name} (+91 {number})\nReason: {reason}\n\nNote:\n{custom_msg}\n\nReply in Admin App > Chats."
            )
    except Exception:
        pass

    _notify_admins_of_support_message(db, name, formatted_text)

    return {
        "success": True,
        "message": f"Support request submitted to Drop Cars Admin for account +91 {number}. Admin has been notified.",
        "thread_key": thread_key,
    }


@router.post("/dispatch-message", dependencies=[Depends(get_current_user_flexible)])
def send_support_message(payload: SupportMessagePayload, request: Request, db: Session = Depends(get_db)):
    """The Driver App's "Drop Cars Admin / Support" chat. This really
    creates/continues a live thread Admin can see and reply to (Admin App
    Chats), plus an email nudge - not a canned auto-reply pretending a
    human already answered."""
    role, caller = _resolve_sender(request, db)
    name = _sender_display_name(db, role, caller)
    number = getattr(caller, "primary_number", None) or ""
    thread_key = str(getattr(caller, "id", ""))
    voice_url = (payload.voice_url or "").strip() or None
    text = (payload.text or "").strip() or ("\U0001F3A4 Voice message" if voice_url else "")
    if not text:
        raise HTTPException(status_code=422, detail="Message can't be empty.")

    m = SupportMessage(
        thread_key=thread_key, thread_role=role, thread_name=f"{name} ({number})" if number else name,
        sender_side="DRIVER_OWNER", sender_name=name, text=text, voice_url=voice_url,
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    # Best-effort email nudge so a real person notices quickly even before
    # opening the Admin App - never blocks/fails the chat message itself.
    try:
        from app.utils.emailer import send_email, smtp_configured, get_smtp_settings
        if smtp_configured(db):
            from app.models.platform_setting import PlatformSetting
            row = db.query(PlatformSetting).filter(PlatformSetting.key == "support_notify_email").first()
            to_email = (row.value if row and row.value else None) or get_smtp_settings(db)["smtp_user"]
            send_email(db, to_email, f"Drop Cars Support message from {name}",
                       f"From: {name} ({number})\nRole: {role}\n\nMessage:\n{text}\n\nReply from the Admin App > Chats.")
    except Exception:
        pass

    _notify_admins_of_support_message(db, name, text)

    return {
        "success": True,
        "reply": (
            "✅ Your message has been sent to Drop Cars Support - a real person will see and reply here, "
            "not an automatic response. For anything urgent right now, please call the Dispatch/Support helpline."
        ),
        "id": m.id,
        "read": m.read_at is not None,
    }


@router.get("/my-thread", dependencies=[Depends(get_current_user_flexible)])
def get_my_support_thread(request: Request, after_id: int = 0, db: Session = Depends(get_db)):
    """The driver/owner's own support thread, so the chat can show Admin's
    replies (poll this like booking-chat)."""
    role, caller = _resolve_sender(request, db)
    thread_key = str(getattr(caller, "id", ""))
    q = db.query(SupportMessage).filter(SupportMessage.thread_key == thread_key)
    all_msgs = q.order_by(SupportMessage.id.asc()).all()
    now = datetime.now(timezone.utc)
    changed = False
    for m in all_msgs:
        if m.sender_side == "ADMIN" and m.read_at is None:
            m.read_at = now
            changed = True
    if changed:
        db.commit()
    msgs = [m for m in all_msgs if m.id > after_id]
    return {"messages": [_msg_out(m, "DRIVER_OWNER") for m in msgs]}


@router.get("/my-unread-count", dependencies=[Depends(get_current_user_flexible)])
def get_my_support_unread_count(request: Request, db: Session = Depends(get_db)):
    """Just a count, with no side effect of marking anything read - for a
    tab-bar badge that stays lit until the driver actually opens the chat
    (GET /my-thread marks messages read as a side effect, which would make
    a badge fetched in the background flicker on and immediately off)."""
    role, caller = _resolve_sender(request, db)
    thread_key = str(getattr(caller, "id", ""))
    unread = db.query(func.count(SupportMessage.id)).filter(
        SupportMessage.thread_key == thread_key, SupportMessage.sender_side == "ADMIN", SupportMessage.read_at.is_(None)
    ).scalar() or 0
    return {"unread": int(unread)}


@router.get("/on-duty-contact")
def get_on_duty_contact(db: Session = Depends(get_db)):
    """Who to call right now - whichever staff/owner admin has toggled
    "on duty" most recently, so drivers get a real, currently-reachable
    number instead of a hardcoded placeholder. Falls back to any Owner-role
    admin if no one has toggled on duty."""
    from app.crud.website_post_rules import get_rules, is_admin_effectively_on_duty
    rules = get_rules(db)
    on_duty = (
        db.query(Admin).filter(Admin.is_on_duty.is_(True))
        .order_by(Admin.on_duty_since.desc()).all()
    )
    # only someone who is really there (app used in the last few minutes) is shown as reachable
    admin = next((a for a in on_duty if is_admin_effectively_on_duty(a, rules=rules)), None)
    reachable = admin is not None
    if not admin:
        admin = db.query(Admin).filter(Admin.role == "Owner").order_by(Admin.created_at.asc()).first()
    if not admin or not admin.phone:
        return {"available": False, "name": None, "phone": None}
    return {"available": reachable, "name": admin.username, "phone": admin.phone}


class OnDutyPayload(BaseModel):
    on_duty: bool


@router.get("/admin/on-duty")
def get_my_on_duty(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Get current admin's on-duty status. `effective` is what the booking rules use: the switch is ON, the app
    was used in the last few minutes and the shift is under the maximum length."""
    from datetime import timedelta
    from app.crud.website_post_rules import get_rules, is_admin_effectively_on_duty
    rules = get_rules(db)
    since = current_admin.on_duty_since
    return {
        "is_on_duty": bool(current_admin.is_on_duty),
        "effective": is_admin_effectively_on_duty(current_admin, rules=rules),
        "on_duty_since": since,
        "shift_ends_at": (since + timedelta(hours=rules["staff_duty_max_hours"])) if (current_admin.is_on_duty and since) else None,
        "username": current_admin.username,
        "role": current_admin.role,
    }


@router.patch("/admin/on-duty")
def set_my_on_duty(payload: OnDutyPayload, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Admin App > Settings self-toggle."""
    now = datetime.now(timezone.utc)
    current_admin.is_on_duty = payload.on_duty
    if payload.on_duty:
        current_admin.on_duty_since = now
        current_admin.last_seen_at = now
    db.add(current_admin)
    db.commit()
    return {"is_on_duty": current_admin.is_on_duty}


@router.post("/admin/on-duty/heartbeat")
def admin_duty_heartbeat(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """The Admin App can ping this while it is open (e.g. every minute). Any authenticated call already counts as
    presence; this is the cheapest one and tells the app whether it really counts as on duty."""
    from datetime import timedelta
    from app.crud.website_post_rules import get_rules, is_admin_effectively_on_duty
    now = datetime.now(timezone.utc)
    current_admin.last_seen_at = now
    db.add(current_admin)
    db.commit()
    rules = get_rules(db)
    since = current_admin.on_duty_since
    expired = bool(current_admin.is_on_duty and since and (since.replace(tzinfo=since.tzinfo or timezone.utc) < now - timedelta(hours=rules["staff_duty_max_hours"])))
    return {"is_on_duty": bool(current_admin.is_on_duty), "effective": is_admin_effectively_on_duty(current_admin, now, rules),
            "shift_expired": expired}


@router.get("/admin/threads")
def list_support_threads_for_admin(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Admin App > Chats - one row per driver/owner who has messaged
    Support, newest activity first."""
    keys = [r[0] for r in db.query(SupportMessage.thread_key).distinct().all()]
    out = []
    for key in keys:
        last = db.query(SupportMessage).filter(SupportMessage.thread_key == key).order_by(SupportMessage.id.desc()).first()
        if not last:
            continue
        unread = db.query(func.count(SupportMessage.id)).filter(
            SupportMessage.thread_key == key, SupportMessage.sender_side == "DRIVER_OWNER", SupportMessage.read_at.is_(None)
        ).scalar() or 0
        out.append({
            "thread_key": key, "thread_name": last.thread_name, "thread_role": last.thread_role,
            "last_text": last.text, "last_at": last.created_at.isoformat() if last.created_at else None,
            "unread": int(unread),
        })
    out.sort(key=lambda t: t["last_at"] or "", reverse=True)
    return out


@router.get("/admin/threads/{thread_key}")
def get_support_thread_for_admin(thread_key: str, after_id: int = 0, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    q = db.query(SupportMessage).filter(SupportMessage.thread_key == thread_key)
    all_msgs = q.order_by(SupportMessage.id.asc()).all()
    if not all_msgs:
        raise HTTPException(status_code=404, detail="No such support thread")
    now = datetime.now(timezone.utc)
    changed = False
    for m in all_msgs:
        if m.sender_side == "DRIVER_OWNER" and m.read_at is None:
            m.read_at = now
            changed = True
    if changed:
        db.commit()
    msgs = [m for m in all_msgs if m.id > after_id]
    return {
        "thread_key": thread_key, "thread_name": all_msgs[-1].thread_name, "thread_role": all_msgs[-1].thread_role,
        "messages": [_msg_out(m, "ADMIN") for m in msgs],
    }


@router.post("/admin/threads/{thread_key}", status_code=status.HTTP_201_CREATED)
def reply_to_support_thread(thread_key: str, payload: SupportMessagePayload, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    prior = db.query(SupportMessage).filter(SupportMessage.thread_key == thread_key).order_by(SupportMessage.id.desc()).first()
    if not prior:
        raise HTTPException(status_code=404, detail="No such support thread")
    voice_url = (payload.voice_url or "").strip() or None
    text = (payload.text or "").strip() or ("\U0001F3A4 Voice message" if voice_url else "")
    if not text:
        raise HTTPException(status_code=422, detail="Message can't be empty.")
    m = SupportMessage(
        thread_key=thread_key, thread_role=prior.thread_role, thread_name=prior.thread_name,
        sender_side="ADMIN", sender_name=current_admin.username or "Drop Cars Admin", text=text, voice_url=voice_url,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    _notify_driver_owner_of_admin_reply(db, thread_key, m.text)
    return _msg_out(m, "ADMIN")
