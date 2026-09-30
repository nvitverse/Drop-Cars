# utils/notification_dispatch.py
"""
Unified customer-notification dispatcher - routes each alert to the
zero-cost channel (push + email) by default, only using paid SMS when the
customer has no email on file, explicitly chose SMS, or it's a
SOS/emergency alert. Mirrors the exact 4-condition spec:

  1. No email on file            -> always SMS
  2. notification_preference=='sms' -> always SMS
  3. Has email, default/'email_push' -> Expo push (if a token is given) + SMTP email, zero SMS cost
  4. alert_type=='SOS'           -> always SMS to emergency contacts, regardless of 1-3

Reuses real, already-working senders - utils/emailer.py's send_email and
crud/notification.py's Expo push POST - rather than reimplementing either.
SMS goes through utils/sms_gateway.py (real interface, needs an admin-set
API key to actually deliver - see that module's docstring).

`push_token` is a parameter, not a DB lookup: this backend does not yet
store an Expo push token for customers anywhere (only drivers/vehicle
owners have that infra today - confirmed by search). Pass the token from
wherever the Customer App last registered it (mirroring how the driver/
vehicle-owner push flow already works) once that's built; until then this
function still works correctly, it just skips the push half and relies on
email.
"""
import logging
from typing import Optional, Sequence
from sqlalchemy.orm import Session

from app.models.customer import CustomerCredentials
from app.utils.emailer import send_email, smtp_configured
from app.utils.sms_gateway import send_sms, sms_gateway_configured, SmsGatewayNotConfigured

logger = logging.getLogger("dropcars.notification_dispatch")


async def send_trip_alert(
    db: Session,
    customer: CustomerCredentials,
    alert_type: str,
    title: str,
    body: str,
    *,
    push_token: Optional[str] = None,
    emergency_contacts: Optional[Sequence[str]] = None,
) -> dict:
    """Returns {"channels": [...], "sent": [...], "failed": [...]} for
    observability - never raises; each individual channel failure is
    caught and reported in `failed` rather than blocking the others
    (matches the fail-open logging convention used by log_admin_action/
    log_finance_action elsewhere in this codebase). `channels` lists EVERY
    delivery path actually attempted this call (e.g. ["sos", "email_push"]
    when an SOS broadcast AND the customer's own default-channel notify
    both ran) - it is a list, not a single last-writer-wins string, so a
    caller checking "did this go out over SMS" can never be misled by a
    later email/push overwriting an earlier SMS result in the same call."""
    sent, failed, channels = [], [], []

    # Condition 4 - SOS always fires SMS to emergency contacts first,
    # independent of everything else below (which still runs too, so the
    # customer themself also gets notified through their normal channel).
    if alert_type == "SOS" and emergency_contacts:
        channels.append("sos")
        for contact in emergency_contacts:
            try:
                await send_sms(db, contact, f"SOS ALERT: {body}")
                sent.append(f"sms:{contact}")
            except SmsGatewayNotConfigured as e:
                failed.append(f"sms:{contact} (not configured: {e})")
            except Exception as e:
                failed.append(f"sms:{contact} ({e})")

    has_email = bool(customer.email)
    prefers_sms = customer.notification_preference == "sms"
    use_sms = (not has_email) or prefers_sms

    if use_sms and (not customer.primary_number or customer.primary_number.startswith(("g_", "fb_"))):
        # Google-only signup with no real phone linked yet - nothing to
        # SMS. Fall through to email if there is one, else nothing can be
        # delivered on the customer's own channel (surfaced in `failed`
        # for the caller to log/alert on) - the SOS broadcast above (if
        # any) already ran regardless.
        use_sms = False
        if not has_email:
            failed.append("sms: customer has no verified phone number on file")
            return {"channels": channels, "sent": sent, "failed": failed}

    if use_sms:
        channels.append("sms")
        try:
            await send_sms(db, customer.primary_number, body)
            sent.append(f"sms:{customer.primary_number}")
        except SmsGatewayNotConfigured as e:
            failed.append(f"sms (not configured: {e})")
        except Exception as e:
            failed.append(f"sms ({e})")
        return {"channels": channels, "sent": sent, "failed": failed}

    # Condition 3 - default path, zero SMS cost.
    channels.append("email_push")
    if push_token:
        try:
            from app.crud.notification import _post_expo_payloads_sync
            _post_expo_payloads_sync([{"to": push_token, "title": title, "body": body}])
            sent.append(f"push:{push_token[:12]}...")
        except Exception as e:
            failed.append(f"push ({e})")

    if has_email:
        if not smtp_configured(db):
            failed.append("email (SMTP not configured)")
        else:
            try:
                send_email(db, customer.email, title, body)
                sent.append(f"email:{customer.email}")
            except Exception as e:
                failed.append(f"email ({e})")

    return {"channels": channels, "sent": sent, "failed": failed}


# ---------------------------------------------------------------------------
# Staff-app pushes used by SOS (routes/sos.py) and fleet swap
# (routes/fleet_swap.py). Both routes imported these names before they
# existed, so every SOS staff alert and every swap OTP push failed silently
# inside a try/except. Sync, Expo only, never raises.
# ---------------------------------------------------------------------------
def _tokens_for(db: Session, user_type: str, sub: Optional[str] = None, include_muted: bool = False) -> list:
    from app.models.notification import Notification
    from app.crud.notification import _is_muted

    q = db.query(Notification).filter(Notification.user == user_type)
    if sub is not None:
        q = q.filter(Notification.sub == str(sub))
    return [
        row.token for row in q.all()
        if row.token and (include_muted or not _is_muted(row))
    ]


def _send_expo(tokens: list, title: str, body: str, data: Optional[dict] = None) -> dict:
    from app.crud.notification import _post_expo_payloads_sync

    tokens = list(dict.fromkeys(tokens))
    if not tokens:
        return {"status": "no_tokens", "count": 0}
    payloads = [
        {
            "to": t,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "android": {"priority": "max"},
            "data": data or {},
        }
        for t in tokens
    ]
    try:
        result = _post_expo_payloads_sync(payloads)
        return {"status": "sent", "count": len(tokens), "expo_response": result}
    except Exception as e:
        logger.warning("Expo push failed: %s", e)
        return {"status": "failed", "count": len(tokens)}


def broadcast_admin_emergency_push(db: Session, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Emergency push to every admin/staff device. Ignores per-device mute:
    an SOS must reach staff even if someone muted routine alerts."""
    try:
        return _send_expo(_tokens_for(db, "admin", include_muted=True), title, body, data)
    except Exception as e:
        logger.warning("broadcast_admin_emergency_push failed: %s", e)
        return {"status": "failed", "count": 0}


def send_push_to_driver(db: Session, driver_id: str, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Push to one driver's devices (Notification.user == 'driver')."""
    try:
        return _send_expo(_tokens_for(db, "driver", driver_id, include_muted=True), title, body, data)
    except Exception as e:
        logger.warning("send_push_to_driver failed: %s", e)
        return {"status": "failed", "count": 0}


def send_push_to_vehicle_owner(db: Session, vehicle_owner_id: str, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Push to one fleet driver / vehicle owner's devices."""
    try:
        return _send_expo(_tokens_for(db, "vehicle_owner", vehicle_owner_id, include_muted=True), title, body, data)
    except Exception as e:
        logger.warning("send_push_to_vehicle_owner failed: %s", e)
        return {"status": "failed", "count": 0}
