from sqlalchemy import Column, String, TIMESTAMP, Integer, func
from app.database.session import Base


class ProfileEditReview(Base):
    """
    Model for Admin Profile-Edit Review Queue.
    Routes sensitive driver/fleet owner profile edits (bank details, IFSC code, DL number, Aadhaar, PAN)
    into an admin review queue before updating live records.
    """
    __tablename__ = "profile_edit_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    user_type = Column(String, nullable=False)  # "FLEET_OWNER" | "DRIVER"
    user_name = Column(String, nullable=True)
    user_phone = Column(String, nullable=True)

    field_name = Column(String, nullable=False)  # e.g., "bank_account_number", "ifsc_code", "license_number", "pan_number"
    old_value = Column(String, nullable=True)
    proposed_value = Column(String, nullable=False)
    proof_document_url = Column(String, nullable=True)

    # Status: "PENDING", "APPROVED", "REJECTED"
    status = Column(String, nullable=False, default="PENDING", index=True)
    admin_notes = Column(String, nullable=True)
    processed_by = Column(String, nullable=True)
    processed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
