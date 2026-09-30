# models/admin_add_money_to_vehicle_owner.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class AdminAddMoneyToVehicleOwner(Base):
    __tablename__ = "admin_add_money_to_vehicle_owner"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False, index=True)
    transaction_value = Column(Integer, nullable=False)  # Mandatory field
    transaction_img = Column(String, nullable=True)  # Optional field - GCS URL
    reference_value = Column(String, nullable=True)  # Optional reference string
    vehicle_owner_ledger_id = Column(UUID(as_uuid=True), ForeignKey("wallet_ledger.id"), nullable=True)
    # Which admin performed this credit - was missing entirely, so there
    # was no way to trace who added money to a given fleet owner's wallet.
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

