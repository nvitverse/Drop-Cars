# schemas/payout_request.py
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class CreatePayoutRequest(BaseModel):
    amount: int


class ProcessPayoutRequest(BaseModel):
    notes: Optional[str] = None
    paid_via: Optional[str] = None  # "UPI" | "BANK" - label only, no real payment processing


class AdminInitiatedPayoutRequest(BaseModel):
    vehicle_owner_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    amount: int
    remark: str
    paid_via: Optional[str] = None


class PayoutRequestOut(BaseModel):
    id: int
    vehicle_owner_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    role: Optional[str] = None  # "VEHICLE_OWNER" | "VENDOR" - admin-queue enrichment only
    amount: int
    status: str
    requested_at: datetime
    processed_at: Optional[datetime] = None
    processed_by_admin_id: Optional[UUID] = None
    notes: Optional[str] = None
    paid_via: Optional[str] = None
    initiated_by_admin: bool = False
    # Admin-queue enrichment - absent on the driver-facing responses, which
    # build PayoutRequestOut straight from the ORM row via from_attributes.
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    # Where to actually send the money - same admin-queue-only enrichment
    # as owner_name/owner_phone above.
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_account_holder_name: Optional[str] = None
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None

    class Config:
        from_attributes = True
