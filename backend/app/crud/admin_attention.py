"""'What needs my attention', ranked (Phase 3). Read-only.

Order of importance: SOS > leads waiting > chats waiting for a person > approvals > unassigned bookings > payouts > refunds.
A section is left out entirely (not even counted) when the admin has no permission for it, so the answer never leaks the size of
a queue the person may not see.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.crud import admin_perms as P

logger = logging.getLogger(__name__)


def _section(rank: int, key: str, headline: str, count: int, items: Optional[List[Any]] = None) -> Dict[str, Any]:
    return {"rank": rank, "section": key, "headline": headline, "count": count, "examples": (items or [])[:3]}


def needs_attention(db: Session, admin) -> Dict[str, Any]:
    out: List[Dict[str, Any]] = []

    def safe(fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            logger.warning("attention section failed: %s", type(e).__name__)

    def sos():
        from app.models.sos_alert import SosAlert
        rows = db.query(SosAlert).filter(SosAlert.status == "ACTIVE").order_by(SosAlert.id.asc()).all()
        if rows:
            out.append(_section(1, "sos", "SOS alerts that nobody has acknowledged", len(rows), [f"SOS #{r.id} (booking {r.order_id or '-'})" for r in rows]))

    def leads():
        if not P.has_permission(admin, "customers"):
            return
        from app.models.crm_models import CrmLead
        rows = db.query(CrmLead).filter(CrmLead.status == "New", CrmLead.is_snoozed.is_(False)).order_by(CrmLead.created_at.asc()).all()
        if rows:
            out.append(_section(2, "leads", "New leads waiting for a call", len(rows), [f"{(r.pickup_location or '?')} -> {(r.drop_location or '?')}" for r in rows]))

    def chats():
        from app.models.conversation import Conversation
        rows = db.query(Conversation).filter(Conversation.type.in_(("SUPPORT", "BOOKING"))).all()
        waiting = [c for c in rows if (c.meta or {}).get("needs_human")]
        if waiting:
            out.append(_section(3, "chats", "Chats the assistant handed to a person", len(waiting), [c.title or str(c.id) for c in waiting]))

    def approvals():
        if not P.has_permission(admin, "approvals"):
            return
        from app.models.customer_booking_request import CustomerBookingRequest
        rows = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.status == "PENDING").order_by(CustomerBookingRequest.start_date_time.asc()).all()
        if rows:
            out.append(_section(4, "approvals", "Website bookings waiting for approval", len(rows), [f"Request {str(r.id)[:8]}" for r in rows]))

    def unassigned():
        if not P.has_permission(admin, "bookings"):
            return
        from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
        from app.models.orders import Order, Trip_status
        live = exists().where(OrderAssignment.order_id == Order.id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
        now = datetime.now(timezone.utc)
        rows = (db.query(Order).filter(Order.trip_status == Trip_status.PENDING, Order.start_date_time > now, ~live)
                .order_by(Order.start_date_time.asc()).all())
        if rows:
            out.append(_section(5, "unassigned", "Upcoming bookings with no driver yet (soonest first)", len(rows), [f"#{o.id}" for o in rows]))

    def payouts():
        if not P.has_permission(admin, ("finance", "payment_release")):
            return
        from app.models.payout_request import PayoutRequest, PayoutRequestStatusEnum
        n = db.query(PayoutRequest).filter(PayoutRequest.status == PayoutRequestStatusEnum.PENDING).count()
        if n:
            out.append(_section(6, "payouts", "Payout requests waiting", n))

    def refunds():
        if not P.has_permission(admin, ("finance", "payment_release")):
            return
        from app.crud.refund_requests import list_pending_refund_requests
        n = len(list_pending_refund_requests(db))
        if n:
            out.append(_section(7, "refunds", "Refund requests waiting", n))

    for fn in (sos, leads, chats, approvals, unassigned, payouts, refunds):
        safe(fn)
    out.sort(key=lambda s: s["rank"])
    return {"ranked": out, "nothing_waiting": not out}
