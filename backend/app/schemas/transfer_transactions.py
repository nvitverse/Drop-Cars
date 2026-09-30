# schemas/transfer_transactions.py
from pydantic import BaseModel, Field, validator
from typing import Optional
from uuid import UUID
from datetime import datetime
from enum import Enum

class TransferStatusEnum(str, Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"

# --- Request Transfer Schema ---
class TransferRequest(BaseModel):
    amount: int = Field(..., gt=0, description="Amount to transfer from wallet to bank")

    @validator('amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Transfer amount must be greater than 0')
        return v

# --- Admin Action Schema ---
class AdminTransferAction(BaseModel):
    action: str = Field(..., description="Action to take: 'approve' or 'reject'")
    notes: Optional[str] = Field(None, description="Optional notes from admin")

    @validator('action')
    def validate_action(cls, v):
        if v.lower() not in ['approve', 'reject']:
            raise ValueError('Action must be either "approve" or "reject"')
        return v.lower()

# --- Transfer Transaction Response Schema ---
class TransferTransactionOut(BaseModel):
    id: UUID
    vendor_id: UUID
    requested_amount: int
    wallet_balance_before: int
    bank_balance_before: int
    wallet_balance_after: Optional[int]
    bank_balance_after: Optional[int]
    status: TransferStatusEnum
    admin_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
                "requested_amount": 1000,
                "wallet_balance_before": 5000,
                "bank_balance_before": 2000,
                "wallet_balance_after": 4000,
                "bank_balance_after": 3000,
                "status": "Approved",
                "admin_notes": "Transfer approved successfully",
                "created_at": "2025-08-13T12:00:00Z",
                "updated_at": "2025-08-13T12:30:00Z"
            }
        }

# --- Vendor Balance Response Schema ---
class VendorBalanceOut(BaseModel):
    vendor_id: UUID
    wallet_balance: int
    bank_balance: int
    total_balance: int

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
                "wallet_balance": 4000,
                "bank_balance": 3000,
                "total_balance": 7000
            }
        }

# --- Transfer History Response Schema ---
class TransferHistoryOut(BaseModel):
    transactions: list[TransferTransactionOut]
    total_count: int

    class Config:
        from_attributes = True
