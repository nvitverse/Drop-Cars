from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.models.wallet_ledger import WalletEntryTypeEnum
from app.models.razorpay_transactions import RazorpayPaymentStatusEnum


class CreateRazorpayOrderRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in paise")
    currency: str = Field(default="INR")
    notes: Optional[dict] = None


class CreateRazorpayOrderResponse(BaseModel):
    rp_order_id: str
    amount: int
    currency: str


class VerifyRazorpayPaymentRequest(BaseModel):
    rp_order_id: str
    rp_payment_id: str
    rp_signature: str


class RazorpayTransactionOut(BaseModel):
    id: UUID
    vehicle_owner_id: UUID
    rp_order_id: str
    rp_payment_id: Optional[str]
    amount: int
    currency: str
    status: RazorpayPaymentStatusEnum
    captured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class WalletLedgerOut(BaseModel):
    id: UUID
    vehicle_owner_id: UUID
    reference_id: Optional[str]
    reference_type: Optional[str]
    entry_type: WalletEntryTypeEnum
    amount: int
    balance_before: int
    balance_after: int
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class WalletBalanceOut(BaseModel):
    vehicle_owner_id: UUID
    current_balance: int

class WalletHistory(BaseModel):
    id: UUID
    vendor_id: UUID
    order_id: Optional[int]
    entry_type: str
    amount: int
    balance_before: int
    balance_after: int
    notes: Optional[str]
    created_at: datetime