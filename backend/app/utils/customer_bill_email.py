"""The customer's trip bill by e-mail, sent once when the trip is closed - only when we know the customer's e-mail (today: bookings that
came from the website, where the customer typed it) and the e-mail server is set up (Admin Settings > SMTP).

Same rule as the bill on the driver's phone: the customer sees the CUSTOMER price only (rate + extra rate, bata + extra bata, GST / toll /
anything else merged into "Taxes & Other Charges"). Never the driver's fare, commission or any payout figure.
Best-effort: a mail problem must never touch the trip, so every failure is swallowed (and logged)."""
import html as _html
import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def customer_email_for(db: Session, order) -> Optional[str]:
    """The customer's e-mail for this booking, or None."""
    mail = (getattr(order, "customer_email", None) or "").strip()
    if mail:
        return mail
    try:      # typed by the driver on the bill screen (phone / admin / vendor bookings)
        from app.models.order_customer_email import OrderCustomerEmail
        row = db.query(OrderCustomerEmail).filter(OrderCustomerEmail.order_id == order.id).first()
        if row and (row.email or "").strip():
            return row.email.strip()
    except Exception:  # noqa: BLE001
        pass
    try:
        from app.utils.website_status_webhook import _find_website_booking_request
        req = _find_website_booking_request(db, order.id)
        return (getattr(req, "customer_email", None) or "").strip() or None
    except Exception:  # noqa: BLE001
        return None


def render_bill(bill: dict, order_id, customer_name: Optional[str], review_link: Optional[str]) -> tuple:
    """(plain text, html) for the bill dict returned by build_customer_bill(lump_taxes=True)."""
    esc = _html.escape
    lines = bill.get("lines") or []
    route = " -> ".join(x for x in (bill.get("from"), bill.get("to")) if x)
    hello = f"Hello {customer_name}," if customer_name and customer_name.strip().lower() not in ("none", "customer") else "Hello,"

    text = [hello, "", f"Thank you for travelling with Drop Cars. Here is the bill for booking #{order_id}.", ""]
    if route:
        text.append(f"Trip: {route}")
    if bill.get("km_driven") is not None:
        text.append(f"Distance travelled: {bill['km_driven']} km")
    text.append("")
    for l in lines:
        text.append(f"{l['label']}: Rs {l['amount']}")
    text += ["", f"Total booking amount: Rs {bill.get('total', 0)}", f"Advance received: Rs {bill.get('advance_received', 0)}",
             f"Balance paid to the driver: Rs {bill.get('cash_to_collect', 0)}"]
    for e in bill.get("extra_charges_paid_directly") or []:
        text.append(f"{e['label']} (paid directly): Rs {e['amount']}")
    if review_link:
        text += ["", f"How was your trip? Please rate it: {review_link}"]
    text += ["", "Drop Cars"]

    rows = "".join(
        f"<tr><td style='padding:6px 0;color:#334155'>{esc(str(l['label']))}</td><td style='padding:6px 0;text-align:right'>Rs {int(l['amount'])}</td></tr>"
        for l in lines
    )
    extra_rows = "".join(
        f"<tr><td style='padding:4px 0;color:#64748b'>{esc(str(e['label']))} (paid directly)</td><td style='padding:4px 0;text-align:right'>Rs {int(e['amount'])}</td></tr>"
        for e in (bill.get("extra_charges_paid_directly") or [])
    )
    review = (f"<p style='margin:18px 0 0'><a href='{esc(review_link)}' style='background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600'>Rate your trip</a></p>"
              if review_link else "")
    html = (
        "<div style='font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0f172a'>"
        f"<h2 style='margin:0 0 4px'>Your trip bill</h2><p style='color:#64748b;margin:0 0 14px'>Booking #{esc(str(order_id))}"
        f"{(' · ' + esc(route)) if route else ''}</p>"
        f"<p>{esc(hello)}</p>"
        + (f"<p style='margin:0 0 8px'>Distance travelled: <b>{esc(str(bill['km_driven']))} km</b></p>" if bill.get("km_driven") is not None else "")
        + f"<table style='width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0'>{rows}"
        f"<tr><td style='padding:10px 0 4px;border-top:1px solid #e2e8f0;font-weight:700'>Total booking amount</td><td style='padding:10px 0 4px;border-top:1px solid #e2e8f0;text-align:right;font-weight:700'>Rs {int(bill.get('total', 0))}</td></tr>"
        f"<tr><td style='padding:4px 0;color:#64748b'>Advance received</td><td style='padding:4px 0;text-align:right'>Rs {int(bill.get('advance_received', 0))}</td></tr>"
        f"<tr><td style='padding:4px 0;color:#64748b'>Balance paid to the driver</td><td style='padding:4px 0;text-align:right'>Rs {int(bill.get('cash_to_collect', 0))}</td></tr>"
        f"{extra_rows}</table>{review}"
        "<p style='color:#94a3b8;font-size:12px;margin-top:22px'>Drop Cars</p></div>"
    )
    return "\n".join(text), html


def _send_with_own_session(to: str, subject: str, text: str, html: str) -> None:
    """SMTP can take seconds: done off the request thread, on a session of its own."""
    from app.database.session import SessionLocal
    from app.utils.emailer import send_email
    own = SessionLocal()
    try:
        send_email(own, to, subject, text, html)
    finally:
        own.close()


async def send_customer_trip_bill_email(db: Session, order_id: int) -> bool:
    """Returns True when an e-mail was sent. Never raises."""
    try:
        from app.models.orders import Order
        from app.models.order_assignments import OrderAssignment
        from app.crud.end_records import build_customer_bill
        import asyncio
        from app.utils.emailer import smtp_configured

        order = db.query(Order).filter(Order.id == order_id).first()
        if order is None:
            return False
        to = customer_email_for(db, order)
        if not to or "@" not in to:
            return False
        if not smtp_configured(db):
            return False
        bill = build_customer_bill(db, order, lump_taxes=True)
        link = None
        try:
            from app.api.routes.trip_reviews import review_base_url
            a = db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id).order_by(OrderAssignment.created_at.desc()).first()
            if a and a.trip_link_token:
                link = f"{review_base_url(db)}/{a.trip_link_token}"
        except Exception:  # noqa: BLE001
            link = None
        text, html = render_bill(bill, order_id, getattr(order, "customer_name", None), link)
        await asyncio.to_thread(_send_with_own_session, to, f"Drop Cars - your trip bill (Booking #{order_id})", text, html)
        return True
    except Exception:  # noqa: BLE001
        logger.warning("Customer bill e-mail failed (non-blocking)", exc_info=True)
        return False
