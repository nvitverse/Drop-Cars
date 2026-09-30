# crud/finance_audit_log.py
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from app.models.finance_audit_log import FinanceAuditLog


def log_finance_action(
    db: Session,
    *,
    staff_id: Optional[str],
    staff_username: str,
    staff_role: Optional[str] = None,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Record one tax/invoice/settlement action for the finance-specific
    audit trail. Same fail-open contract as crud/admin_activity_log.py's
    log_admin_action - a logging failure must never block the real
    financial action it's describing."""
    try:
        entry = FinanceAuditLog(
            staff_id=staff_id,
            staff_username=staff_username or "Unknown",
            staff_role=staff_role,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"finance audit log write failed (action still applied): {e}")
        db.rollback()


def get_finance_audit_log(
    db: Session, skip: int = 0, limit: int = 50,
    since: Optional[datetime] = None, until: Optional[datetime] = None,
    action: Optional[str] = None,
) -> Tuple[List[FinanceAuditLog], int]:
    query = db.query(FinanceAuditLog)
    if since is not None:
        query = query.filter(FinanceAuditLog.created_at >= since)
    if until is not None:
        query = query.filter(FinanceAuditLog.created_at < until)
    if action is not None:
        query = query.filter(FinanceAuditLog.action == action)
    total_count = query.count()
    rows = (
        query
        .order_by(FinanceAuditLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return rows, total_count
