from sqlalchemy.orm import Session
from sqlalchemy import select, update
from typing import Optional, Tuple

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.wallet_ledger import WalletLedger, WalletEntryTypeEnum
from app.models.razorpay_transactions import RazorpayTransaction, RazorpayPaymentStatusEnum


def get_owner_balance(db: Session, vehicle_owner_id: str) -> int:
    owner = db.execute(
        select(VehicleOwnerDetails).where(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id)
    ).scalar_one()
    return owner.wallet_balance


def upsert_owner_balance(db: Session, vehicle_owner_id: str, new_balance: int) -> None:
    owner = db.execute(
        select(VehicleOwnerDetails).where(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id)
    ).scalar_one()
    owner.wallet_balance = new_balance
    db.add(owner)


def append_ledger_entry(db: Session, vehicle_owner_id: str, entry_type: WalletEntryTypeEnum,
                        amount: int, balance_before: int, balance_after: int,
                        reference_id: Optional[str] = None, reference_type: Optional[str] = None,
                        notes: Optional[str] = None) -> WalletLedger:
    entry = WalletLedger(
        vehicle_owner_id=vehicle_owner_id,
        entry_type=entry_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=reference_id,
        reference_type=reference_type,
        notes=notes,
    )
    db.add(entry)
    return entry


def credit_wallet(db: Session, vehicle_owner_id: str, amount: int, reference_id: Optional[str], reference_type: str, notes: Optional[str] = None) -> Tuple[int, WalletLedger]:
    if amount <= 0:
        raise ValueError("Amount must be positive")
    current = get_owner_balance(db, vehicle_owner_id)
    new_balance = current + amount
    upsert_owner_balance(db, vehicle_owner_id, new_balance)
    entry = append_ledger_entry(
        db, vehicle_owner_id, WalletEntryTypeEnum.CREDIT, amount, current, new_balance, reference_id, reference_type, notes
    )
    return new_balance, entry


def debit_wallet(db: Session, vehicle_owner_id: str, amount: int, reference_id: Optional[str], reference_type: str, notes: Optional[str] = None) -> Tuple[int, WalletLedger]:
    if amount <= 0:
        raise ValueError("Amount must be positive")
    current = get_owner_balance(db, vehicle_owner_id)
    if current < amount:
        raise ValueError("Insufficient balance")
    new_balance = current - amount
    upsert_owner_balance(db, vehicle_owner_id, new_balance)
    entry = append_ledger_entry(
        db, vehicle_owner_id, WalletEntryTypeEnum.DEBIT, amount, current, new_balance, reference_id, reference_type, notes
    )
    return new_balance, entry


def get_trip_hold(db: Session, order_id: int, vehicle_owner_id: str) -> int:
    """Amount held from the owner's wallet for this booking (0 if no active hold).

    A hold is a TRIP_HOLD debit at accept time; a TRIP_HOLD_REFUND credit for
    the same booking releases it (vendor cancelled).
    """
    hold = db.query(WalletLedger).filter(
        WalletLedger.vehicle_owner_id == vehicle_owner_id,
        WalletLedger.reference_id == str(order_id),
        WalletLedger.reference_type == "TRIP_HOLD",
    ).first()
    if not hold:
        return 0
    refund = db.query(WalletLedger).filter(
        WalletLedger.vehicle_owner_id == vehicle_owner_id,
        WalletLedger.reference_id == str(order_id),
        WalletLedger.reference_type == "TRIP_HOLD_REFUND",
    ).first()
    return 0 if refund else int(hold.amount or 0)


def _poster_hold_net(db: Session, owner_id: str, order_id: str) -> int:
    """Advance currently earmarked on the poster's wallet for this booking: every POSTER_ADVANCE_HOLD debit minus every
    POSTER_ADVANCE_HOLD_RELEASE credit (the advance can be edited, so there may be several entries)."""
    from sqlalchemy import func
    held = db.query(func.coalesce(func.sum(WalletLedger.amount), 0)).filter(
        WalletLedger.vehicle_owner_id == owner_id,
        WalletLedger.reference_id == order_id,
        WalletLedger.reference_type == "POSTER_ADVANCE_HOLD",
    ).scalar() or 0
    released = db.query(func.coalesce(func.sum(WalletLedger.amount), 0)).filter(
        WalletLedger.vehicle_owner_id == owner_id,
        WalletLedger.reference_id == order_id,
        WalletLedger.reference_type == "POSTER_ADVANCE_HOLD_RELEASE",
    ).scalar() or 0
    return int(held) - int(released)


def release_poster_advance_hold(db: Session, order, reason: str) -> int:
    """Return the advance a poster had to keep in their wallet when they
    posted a booking with advance_received > 0 (see driver_create_booking_
    confirm's POSTER_ADVANCE_HOLD debit). Called wherever such a booking ends:
    cancelled (by the poster, admin, or auto-expiry) or the trip completes.
    Idempotent - once released the net earmark is 0 - and a no-op for
    bookings that never had a hold (vendor bookings, no advance).
    The caller commits. Returns the amount released."""
    owner_id = getattr(order, "posted_by_vehicle_owner_id", None)
    if not owner_id:
        return 0
    owner_id, order_id = str(owner_id), str(order.id)
    amount = _poster_hold_net(db, owner_id, order_id)
    if amount <= 0:
        return 0
    credit_wallet(
        db, owner_id, amount, order_id, "POSTER_ADVANCE_HOLD_RELEASE",
        notes=f"Returned: advance hold for your Booking #{order_id} ({reason})",
    )
    return amount


def adjust_poster_advance_hold(db: Session, order, new_advance: int) -> int:
    """The advance on a driver-posted booking was edited: move the earmark on the poster's wallet to the new amount.
    Raises ValueError when they would need to hold more than their wallet has. Caller commits. Returns the change."""
    owner_id = getattr(order, "posted_by_vehicle_owner_id", None)
    if not owner_id:
        return 0
    owner_id, order_id = str(owner_id), str(order.id)
    diff = int(new_advance or 0) - _poster_hold_net(db, owner_id, order_id)
    if diff > 0:
        debit_wallet(
            db, owner_id, diff, order_id, "POSTER_ADVANCE_HOLD",
            notes=f"Held (not charged): advance on your Booking #{order_id} was increased - returned when the trip completes or the booking is cancelled",
        )
    elif diff < 0:
        credit_wallet(
            db, owner_id, -diff, order_id, "POSTER_ADVANCE_HOLD_RELEASE",
            notes=f"Returned: advance on your Booking #{order_id} was reduced",
        )
    return diff


def debit_wallet_allow_negative(db: Session, vehicle_owner_id: str, amount: int, reference_id: Optional[str], reference_type: str, notes: Optional[str] = None) -> Tuple[int, WalletLedger]:
    """Debit that may push the balance below zero.

    Used for PENALTIES: per platform rules the wallet is allowed to go
    negative (accounts suspend below the configured threshold via billing),
    so a penalty must always be recorded even when the balance is low.
    """
    if amount <= 0:
        raise ValueError("Amount must be positive")
    current = get_owner_balance(db, vehicle_owner_id)
    new_balance = current - amount
    upsert_owner_balance(db, vehicle_owner_id, new_balance)
    entry = append_ledger_entry(
        db, vehicle_owner_id, WalletEntryTypeEnum.DEBIT, amount, current, new_balance, reference_id, reference_type, notes
    )
    return new_balance, entry


def create_rp_transaction(db: Session, vehicle_owner_id: str, rp_order_id: str, amount: int, notes: Optional[str] = None) -> RazorpayTransaction:
    txn = RazorpayTransaction(
        vehicle_owner_id=vehicle_owner_id,
        rp_order_id=rp_order_id,
        amount=amount,
        status=RazorpayPaymentStatusEnum.CREATED,
        notes=notes,
    )
    db.add(txn)
    return txn


def mark_rp_payment_captured(db: Session, rp_order_id: str, rp_payment_id: str, rp_signature: str) -> RazorpayTransaction:
    txn = db.query(RazorpayTransaction).filter(RazorpayTransaction.rp_order_id == rp_order_id).first()
    if not txn:
        raise ValueError("Transaction not found")
    
    # Check if already processed (idempotency)
    if txn.status == RazorpayPaymentStatusEnum.CAPTURED and txn.captured:
        return txn  # Already processed, return existing transaction
    
    txn.rp_payment_id = rp_payment_id
    txn.rp_signature = rp_signature
    txn.status = RazorpayPaymentStatusEnum.CAPTURED
    txn.captured = True
    db.add(txn)
    return txn


def check_rp_payment_already_processed(db: Session, rp_payment_id: str) -> bool:
    """Check if a Razorpay payment has already been processed (for idempotency)"""
    existing_ledger = db.query(WalletLedger).filter(
        WalletLedger.reference_id == rp_payment_id,
        WalletLedger.reference_type == "RAZORPAY_PAYMENT"
    ).first()
    return existing_ledger is not None


def reconcile_wallet_balance_from_ledger(db: Session, vehicle_owner_id: str) -> int:
    """Calculate expected wallet balance by summing all historical ledger entries for a vehicle owner.
    Guarantees double-entry ledger integrity."""
    entries = db.query(WalletLedger).filter(
        WalletLedger.vehicle_owner_id == vehicle_owner_id
    ).order_by(WalletLedger.id.asc()).all()
    
    calculated_balance = 0
    for entry in entries:
        if entry.entry_type == WalletEntryTypeEnum.CREDIT:
            calculated_balance += (entry.amount or 0)
        elif entry.entry_type == WalletEntryTypeEnum.DEBIT:
            calculated_balance -= (entry.amount or 0)
            
    return calculated_balance



