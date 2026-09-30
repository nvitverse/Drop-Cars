# models/finance_audit_log.py
"""
Immutable audit trail scoped to tax/invoice/settlement actions - a sibling
of app/models/admin_activity_log.py (same denormalized-actor convention:
username/role copied at write time so the log survives account deletion),
but with explicit old_value/new_value/ip_address columns since financial
corrections specifically need "what changed, from what, to what, by whom,
from where" rather than admin_activity_log's freeform `details` JSON blob.
Kept as a separate table (not just new columns on admin_activity_log) so
an Owner can pull a clean, self-contained financial audit export without
filtering out unrelated account/verification actions.
"""
from sqlalchemy import Column, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class FinanceAuditLog(Base):
    __tablename__ = "finance_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)

    staff_id = Column(UUID(as_uuid=True), nullable=True)
    staff_username = Column(String, nullable=False)
    staff_role = Column(String, nullable=True)  # "Owner" / "Staff"

    # e.g. "INVOICE_ISSUED", "INVOICE_CREDIT_NOTE", "MANUAL_REFUND_APPROVED",
    # "TAX_INVOICE_OVERRIDE", "GST_RATE_SETTING_CHANGED", "SETTLEMENT_FINALIZED"
    action = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=True)   # "tax_invoice", "driver_settlement", "tax_setting"
    entity_id = Column(String, nullable=True, index=True)

    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
