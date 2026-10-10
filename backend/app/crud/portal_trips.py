"""Rules of the web execution portal (see models/portal_trip.py). The link's token is the only credential, so what it can see and do is narrow:
  - the customer's number stays hidden until the commission is paid AND the usual reveal time of the booking has come (same rule as the Driver App);
  - the start / end OTPs are never shown to the executor - the customer tells them;
  - only the first person to give details takes the booking."""
import re
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.portal_trip import PortalTrip

LINK_DAYS_AFTER_PICKUP = 3
_PHONE = re.compile(r"^[6-9]\d{9}$")
_VEHICLE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$")
_UTR = re.compile(r"^[A-Za-z0-9]{6,30}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _log(pt: PortalTrip, who: str, action: str, detail: str = "") -> None:
    ev = list(pt.events or [])
    ev.append({"at": _now().isoformat(timespec="seconds"), "who": who, "action": action, "detail": detail[:300]})
    pt.events = ev[-80:]


def _order(db: Session, order_id: int):
    from app.models.orders import Order
    o = db.query(Order).filter(Order.id == order_id).first()
    if o is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return o


def by_token(db: Session, token: str) -> PortalTrip:
    pt = db.query(PortalTrip).filter(PortalTrip.token == (token or "").strip()).first() if token else None
    if pt is None or (pt.expires_at is not None and _utc(pt.expires_at) < _now()):
        raise HTTPException(status_code=404, detail="This link is not valid or has expired. Please ask Drop Cars for a new one.")
    return pt


def create_link(db: Session, order_id: int, who: str) -> PortalTrip:
    """One link per booking: asking again returns the same link (it can be shared into several groups)."""
    o = _order(db, order_id)
    pt = db.query(PortalTrip).filter(PortalTrip.order_id == order_id, PortalTrip.status != "CANCELLED").order_by(PortalTrip.created_at.desc()).first()
    if pt is not None:
        return pt
    pickup = _utc(o.start_date_time) or _now()
    pt = PortalTrip(order_id=order_id, token=secrets.token_urlsafe(24), status="OPEN", created_by=who,
                    start_otp=f"{secrets.randbelow(10000):04d}", end_otp=f"{secrets.randbelow(10000):04d}",
                    expires_at=max(pickup, _now()) + timedelta(days=LINK_DAYS_AFTER_PICKUP), events=[])
    _log(pt, who, "LINK_CREATED")
    db.add(pt)
    db.commit()
    return pt


def commission_amount(db: Session, order) -> int:
    from app.crud.unaccepted_desk import suggest_commission
    from app.models.unaccepted_case import UnacceptedCase
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == order.id).first()
    if case is not None and case.commission_due:
        return int(case.commission_due)
    return suggest_commission(order.vendor_price or order.estimated_price)


def is_paid(db: Session, pt: PortalTrip) -> bool:
    if pt.commission_status == "CONFIRMED":
        return True
    from app.models.unaccepted_case import UnacceptedCase
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == pt.order_id).first()
    return bool(case is not None and case.commission_received and pt.exec_name)


def _ist(dt) -> str:
    dt = _utc(dt)
    return dt.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%a %d %b %Y, %I:%M %p") if dt else "-"


def pay_info(db: Session, pt: PortalTrip, order) -> Dict[str, Any]:
    """Where the commission goes: the platform setting portal_upi_id, else the default brand's UPI id. Empty when neither is set (then staff are called)."""
    from app.crud.system_settings import get_system_setting
    upi = str(get_system_setting(db, "portal_upi_id", "") or "").strip()
    name = str(get_system_setting(db, "portal_upi_name", "") or "").strip()
    phone = str(get_system_setting(db, "portal_helpline", "7200217986") or "7200217986")
    if not upi:
        try:
            from app.models.billing import BillingBrand
            b = db.query(BillingBrand).filter(BillingBrand.is_active.is_(True)).order_by(BillingBrand.is_default.desc()).first()
            if b is not None and b.upi_id:
                upi, name = b.upi_id.strip(), name or (b.legal_name or b.name or "")
        except Exception:        # noqa: BLE001
            pass
    amt = pt.commission_due or 0
    uri = None
    qr = ""
    if upi:
        q = {"pa": upi, "pn": name or "Drop Cars", "cu": "INR", "tn": f"Commission booking {order.id}"}
        if amt:
            q["am"] = str(int(amt))
        uri = "upi://pay?" + urllib.parse.urlencode(q, quote_via=urllib.parse.quote)
        try:
            from app.utils.billing_render import _qr_svg
            qr = _qr_svg(uri, 168)
        except Exception:        # noqa: BLE001
            qr = ""
    return {"upi_id": upi or None, "payee": name or None, "upi_uri": uri, "upi_qr_svg": qr, "helpline": phone, "online_link": pt.pay_link_url}


def razorpay_configured() -> bool:
    import os
    return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))


def ensure_pay_link(db: Session, pt: PortalTrip, order) -> None:
    """The commission as a Razorpay payment link (UPI / card / netbanking) - the same Razorpay account the wallet and billing links use.
    Best effort: when Razorpay is not set up or is down, the UPI QR + UTR route still works."""
    if pt.pay_link_id or not pt.exec_name or not pt.commission_due or not razorpay_configured():
        return
    try:
        from app.utils.razorpay_client import RazorpayClient
        link = RazorpayClient().create_payment_link(
            amount_rupees=int(pt.commission_due), description=f"Drop Cars commission - booking #{order.id}", reference_id=f"portal-{pt.id.hex[:30]}",
            customer_name=pt.exec_name, customer_contact=f"+91{pt.exec_phone}" if pt.exec_phone else None,
            notes={"purpose": "portal_commission", "order_id": str(order.id), "portal_trip_id": str(pt.id)}, expire_in_hours=72)
        pt.pay_link_id, pt.pay_link_url = link["id"], link.get("short_url")
        _log(pt, "system", "PAY_LINK_CREATED", pt.pay_link_id)
        db.commit()
    except Exception:        # noqa: BLE001
        pass


def check_pay_link(db: Session, pt: PortalTrip) -> bool:
    """Ask Razorpay whether the link was paid; if so the commission is confirmed by itself (no staff tap needed). Safe to call often."""
    if not pt.pay_link_id or pt.commission_status == "CONFIRMED":
        return pt.commission_status == "CONFIRMED"
    try:
        from app.utils.razorpay_client import RazorpayClient
        info = RazorpayClient().get_payment_link(pt.pay_link_id)
    except Exception:        # noqa: BLE001
        return False
    if (info.get("status") or "").lower() != "paid":
        return False
    pays = [p for p in (info.get("payments") or []) if (p.get("status") or "").lower() in ("captured", "paid")]
    pt.commission_status = "CONFIRMED"
    pt.commission_utr = (pays[0].get("payment_id") if pays else None) or pt.pay_link_id
    _log(pt, "razorpay", "PAYMENT_CONFIRMED", pt.commission_utr or "")
    db.commit()
    try:
        from app.crud.unaccepted_desk import mark_commission
        mark_commission(db, pt.order_id, True, "Razorpay")
    except Exception:        # noqa: BLE001
        pass
    notify_admins(db, "💰 Web link: commission paid online", f"#{pt.order_id} {pt.exec_name} paid Rs {pt.commission_due} through Razorpay.")
    return True


def view(db: Session, pt: PortalTrip, base_url: str = "") -> Dict[str, Any]:
    """What the link's page may show. Never the OTPs; the customer's name / number only when they are open."""
    from app.crud.order_assignments import customer_number_notice, customer_number_reveal_at, is_customer_number_revealed
    from app.crud.unaccepted_desk import _route
    o = _order(db, pt.order_id)
    if pt.commission_due is None and pt.status == "OPEN":
        due = commission_amount(db, o)
    else:
        due = pt.commission_due
    if pt.exec_name and pt.commission_status != "CONFIRMED":
        ensure_pay_link(db, pt, o)
        check_pay_link(db, pt)
    paid = is_paid(db, pt)
    revealed = bool(pt.exec_name) and paid and is_customer_number_revealed(db, o)
    notice = None
    if pt.exec_name and not paid:
        notice = "Pay the commission to see the customer's number."
    elif pt.exec_name and not revealed:
        notice = customer_number_notice(db, o) or "The customer's number opens soon."
    car = str(getattr(o.car_type, "value", o.car_type) or "").replace("_", " ").title()
    out: Dict[str, Any] = {
        "status": pt.status, "booking_id": o.id, "route": _route(o), "pickup_at_ist": _ist(o.start_date_time), "vehicle": car,
        "trip_type": str(getattr(o.trip_type, "value", o.trip_type) or ""), "distance_km": o.trip_distance,
        "earning": o.vendor_price or o.estimated_price, "cancelled": str(getattr(o.trip_status, "value", o.trip_status)) == "CANCELLED",
        "commission_due": due, "commission_status": "CONFIRMED" if paid else pt.commission_status,
        "executor": ({"name": pt.exec_name, "phone": pt.exec_phone, "vehicle_number": pt.exec_vehicle_number, "vehicle_model": pt.exec_vehicle_model} if pt.exec_name else None),
        "customer": ({"name": o.customer_name, "phone": o.customer_number} if revealed else None),
        "customer_notice": notice,
        "start_km": pt.start_km, "end_km": pt.end_km, "location_shared": pt.last_loc_at is not None,
        "rating": pt.rating,
    }
    if pt.exec_name and not paid:
        out["pay"] = pay_info(db, pt, o)
    if pt.status in ("STARTED", "ENDED") or (pt.exec_name and paid):
        fb = f"{base_url.rstrip('/')}/p/{pt.token}/feedback" if base_url else ""
        out["feedback_url"] = fb
        try:
            from app.utils.billing_render import _qr_svg
            out["feedback_qr_svg"] = _qr_svg(fb, 150) if fb else ""
        except Exception:        # noqa: BLE001
            out["feedback_qr_svg"] = ""
    return out


def take(db: Session, pt: PortalTrip, name: str, phone: str, vehicle_number: str, vehicle_model: str) -> PortalTrip:
    name = " ".join((name or "").split())
    phone = re.sub(r"\D", "", phone or "")[-10:]
    vehicle_number = re.sub(r"[\s-]", "", (vehicle_number or "").upper())
    if len(name) < 3:
        raise HTTPException(status_code=422, detail="Enter the driver's full name")
    if not _PHONE.match(phone):
        raise HTTPException(status_code=422, detail="Enter the driver's 10-digit mobile number")
    if not _VEHICLE.match(vehicle_number):
        raise HTTPException(status_code=422, detail="Enter the vehicle number like TN 01 AB 1234")
    o = _order(db, pt.order_id)
    if str(getattr(o.trip_status, "value", o.trip_status)) == "CANCELLED" or pt.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="This booking was cancelled")
    from app.crud.unaccepted_desk import _has_taker
    if _has_taker(db, o.id):
        raise HTTPException(status_code=409, detail="This booking was just taken by another driver")
    claimed = db.query(PortalTrip).filter(PortalTrip.id == pt.id, PortalTrip.status == "OPEN").update(
        {PortalTrip.status: "TAKEN", PortalTrip.taken_at: _now()}, synchronize_session=False)
    if not claimed:
        raise HTTPException(status_code=409, detail="This booking was just taken by someone else")
    db.refresh(pt)
    pt.exec_name, pt.exec_phone, pt.exec_vehicle_number = name, phone, vehicle_number
    pt.exec_vehicle_model = (vehicle_model or "").strip()[:60] or None
    pt.commission_due = commission_amount(db, o)
    _log(pt, name, "TAKEN", f"{phone} / {vehicle_number}")
    db.commit()
    try:                                                    # the Unaccepted Bookings Desk and the customer's booking page follow
        from app.crud.unaccepted_desk import executed_elsewhere
        executed_elsewhere(db, o.id, "Web link", "Web link", name, name, phone, vehicle_number, "Taken through the web link", pt.commission_due)
    except Exception:        # noqa: BLE001
        pass
    return pt


def report_payment(db: Session, pt: PortalTrip, utr: str) -> PortalTrip:
    if not pt.exec_name:
        raise HTTPException(status_code=409, detail="Give the driver and cab details first")
    utr = (utr or "").strip()
    if not _UTR.match(utr):
        raise HTTPException(status_code=422, detail="Enter the UTR / transaction ID shown in your UPI app (6-30 letters or digits)")
    if pt.commission_status != "CONFIRMED":
        pt.commission_status, pt.commission_utr = "REPORTED", utr
        _log(pt, pt.exec_name, "PAYMENT_REPORTED", utr)
        db.commit()
    return pt


def confirm_payment(db: Session, order_id: int, who: str, received: bool = True) -> PortalTrip:
    pt = db.query(PortalTrip).filter(PortalTrip.order_id == order_id, PortalTrip.status != "CANCELLED").order_by(PortalTrip.created_at.desc()).first()
    if pt is None:
        raise HTTPException(status_code=404, detail="No web link for this booking")
    pt.commission_status = "CONFIRMED" if received else "PENDING"
    _log(pt, who, "PAYMENT_CONFIRMED" if received else "PAYMENT_UNCONFIRMED", pt.commission_utr or "")
    db.commit()
    try:
        from app.crud.unaccepted_desk import mark_commission
        mark_commission(db, order_id, received, who)
    except Exception:        # noqa: BLE001
        pass
    return pt


def _check_otp(db: Session, pt: PortalTrip, given: str, real: Optional[str], what: str) -> None:
    """A 4-digit code can be guessed, so after 5 wrong tries in 15 minutes the link stops taking guesses for a while."""
    since = _now() - timedelta(minutes=15)
    bad = [e for e in (pt.events or []) if e.get("action") == "BAD_OTP" and e.get("at", "") >= since.isoformat(timespec="seconds")]
    if len(bad) >= 5:
        raise HTTPException(status_code=429, detail="Too many wrong codes. Wait 15 minutes, or call Drop Cars.")
    if (given or "").strip() != (real or "x"):
        _log(pt, pt.exec_name or "executor", "BAD_OTP", what)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Wrong {what} OTP - ask the customer for the code (Drop Cars cannot give it)")


def _need_ready(db: Session, pt: PortalTrip, order) -> None:
    if not pt.exec_name:
        raise HTTPException(status_code=409, detail="Give the driver and cab details first")
    if not is_paid(db, pt):
        raise HTTPException(status_code=402, detail="Pay the commission first - Drop Cars confirms it and the trip then opens")
    if str(getattr(order.trip_status, "value", order.trip_status)) == "CANCELLED":
        raise HTTPException(status_code=409, detail="This booking was cancelled")


def start_trip(db: Session, pt: PortalTrip, otp: str, km: int, photo_url: Optional[str]) -> PortalTrip:
    o = _order(db, pt.order_id)
    _need_ready(db, pt, o)
    if pt.status == "STARTED" or pt.status == "ENDED":
        raise HTTPException(status_code=409, detail="This trip has already started")
    _check_otp(db, pt, otp, pt.start_otp, "start")
    if km is None or km < 0 or km > 2_000_000:
        raise HTTPException(status_code=422, detail="Enter the odometer reading")
    pt.status, pt.start_km, pt.start_photo, pt.started_at = "STARTED", km, photo_url, _now()
    _log(pt, pt.exec_name or "executor", "STARTED", f"km {km}")
    db.commit()
    return pt


def end_trip(db: Session, pt: PortalTrip, otp: str, km: int, photo_url: Optional[str]) -> PortalTrip:
    if pt.status != "STARTED":
        raise HTTPException(status_code=409, detail="Start the trip first" if pt.status != "ENDED" else "This trip has already ended")
    _check_otp(db, pt, otp, pt.end_otp, "end")
    if km is None or km < (pt.start_km or 0) or km > 2_000_000:
        raise HTTPException(status_code=422, detail=f"The end reading cannot be below the start reading ({pt.start_km} km)")
    pt.status, pt.end_km, pt.end_photo, pt.ended_at = "ENDED", km, photo_url, _now()
    _log(pt, pt.exec_name or "executor", "ENDED", f"km {km}")
    db.commit()
    return pt


def ping_location(db: Session, pt: PortalTrip, lat: float, lng: float) -> None:
    if pt.status not in ("TAKEN", "STARTED"):
        raise HTTPException(status_code=409, detail="Location is shared only until the trip ends")
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="Bad location")
    pt.last_lat, pt.last_lng, pt.last_loc_at = lat, lng, _now()
    db.commit()


def give_feedback(db: Session, pt: PortalTrip, rating: int, text: str) -> PortalTrip:
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=422, detail="Pick 1 to 5 stars")
    if pt.status not in ("STARTED", "ENDED"):
        raise HTTPException(status_code=409, detail="You can rate the trip once it has started")
    pt.rating, pt.feedback = rating, (text or "").strip()[:600] or None
    _log(pt, "customer", "RATED", f"{rating}")
    db.commit()
    return pt


def customer_message(db: Session, pt: PortalTrip, base_url: str) -> Dict[str, Any]:
    """The note staff send the customer: who is coming, the two OTPs (the customer says them to the driver), tracking and the rating link."""
    o = _order(db, pt.order_id)
    fb = f"{base_url.rstrip('/')}/p/{pt.token}/feedback"
    lines = [f"\U0001F697 *Drop Cars - Booking #{o.id}*", ""]
    if pt.exec_name:
        lines += [f"Driver: {pt.exec_name} ({pt.exec_phone})", f"Vehicle: {pt.exec_vehicle_number}" + (f" - {pt.exec_vehicle_model}" if pt.exec_vehicle_model else ""), ""]
    lines += [f"\U0001F510 Start trip OTP: *{pt.start_otp}*", f"\U0001F510 End trip OTP: *{pt.end_otp}*",
              "Please give the OTP to the driver only at pickup (start) and at the drop (end). Do not share it with anyone else.", "",
              f"Rate your trip: {fb}", "\U0001F4DE Helpline: +91 7200217986"]
    msg = "\n".join(lines)
    phone = re.sub(r"\D", "", o.customer_number or "")[-10:]
    return {"message": msg, "phone": f"91{phone}" if len(phone) == 10 else None,
            "whatsapp_url": (f"https://wa.me/91{phone}?text=" if len(phone) == 10 else "https://wa.me/?text=") + urllib.parse.quote(msg)}


def admin_view(db: Session, pt: PortalTrip, base_url: str) -> Dict[str, Any]:
    v = view(db, pt, base_url)
    return {**v, "link": f"{base_url.rstrip('/')}/p/{pt.token}", "events": pt.events or [], "commission_utr": pt.commission_utr,
            "location": ({"lat": pt.last_lat, "lng": pt.last_lng, "at": pt.last_loc_at.isoformat() if pt.last_loc_at else None,
                          "map": f"https://www.google.com/maps?q={pt.last_lat},{pt.last_lng}"} if pt.last_lat is not None else None),
            "start_photo": pt.start_photo, "end_photo": pt.end_photo, "feedback": pt.feedback}


def notify_admins(db: Session, title: str, body: str) -> None:
    """Best-effort push to every admin device (same channel as the support chat pushes)."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _is_muted, _post_expo_payloads_sync
        tokens = [r.token for r in db.query(Notification).filter(Notification.user == "admin").all() if r.token and not _is_muted(r)]
        if tokens:
            _post_expo_payloads_sync([{"to": t, "title": title, "body": body[:140], "priority": "high", "data": {"type": "portal_trip"}} for t in tokens])
    except Exception:        # noqa: BLE001
        pass
