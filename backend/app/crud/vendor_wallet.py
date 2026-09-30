from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.vendor_details import VendorDetails
from app.models.vendor_wallet_ledger import VendorWalletLedger, VendorLedgerEntryType


def get_vendor_wallet_balance(db: Session, vendor_id: str) -> int:
    vendor_details = db.execute(
        select(VendorDetails).where(VendorDetails.vendor_id == vendor_id)
    ).scalar_one()
    return vendor_details.wallet_balance


def set_vendor_wallet_balance(db: Session, vendor_id: str, new_balance: int) -> None:
    vendor_details = db.execute(
        select(VendorDetails).where(VendorDetails.vendor_id == vendor_id)
    ).scalar_one()
    vendor_details.wallet_balance = new_balance
    db.add(vendor_details)


def append_vendor_ledger_entry(
    db: Session,
    *,
    vendor_id: str,
    order_id: Optional[int],
    entry_type: VendorLedgerEntryType,
    amount: int,
    balance_before: int,
    balance_after: int,
    notes: Optional[str] = None,
    reference_id: Optional[str] = None,
    reference_type: Optional[str] = None,
) -> VendorWalletLedger:
    entry = VendorWalletLedger(
        vendor_id=vendor_id,
        order_id=order_id,
        entry_type=entry_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        notes=notes,
        reference_id=reference_id,
        reference_type=reference_type,
    )
    db.add(entry)
    return entry


def credit_vendor_wallet(
    db: Session,
    *,
    vendor_id: str,
    amount: int,
    order_id: Optional[int] = None,
    notes: Optional[str] = None,
    deduct_admin_profit: bool = False,
    admin_profit: Optional[int] = None,
    admin_id: Optional[str] = None,
) -> Tuple[int, VendorWalletLedger]:
    if amount <= 0:
        raise ValueError("Amount must be positive")
    
    before = get_vendor_wallet_balance(db, vendor_id)
    
    # If admin profit needs to be deducted
    if deduct_admin_profit and admin_profit and admin_profit > 0:
        # `amount` is the vendor's gross profit pool for this trip;
        # admin_profit is the platform's cut OUT OF that same pool, not an
        # extra charge on top. The vendor's wallet must end up at
        # before + (amount - admin_profit), never before + amount - this
        # used to persist the full `amount` (the admin-profit deduction
        # below was computed but never actually written back), so the
        # platform's cut was being conjured from nothing on every trip:
        # vendor kept the whole pool AND admin got credited their share
        # separately, creating admin_profit out of thin air each time.
        final_after = before + amount - admin_profit
        set_vendor_wallet_balance(db, vendor_id, final_after)

        # Credit ledger entry for the trip's gross vendor-profit pool...
        credit_entry = append_vendor_ledger_entry(
            db,
            vendor_id=vendor_id,
            order_id=order_id,
            entry_type=VendorLedgerEntryType.CREDIT,
            amount=amount,
            balance_before=before,
            balance_after=before + amount,
            notes=notes or f"Trip {order_id} vendor profit",
        )

        # ...immediately followed by the debit ledger entry for admin's cut
        # out of that pool, so the ledger's own running balance_after
        # matches what's actually persisted, and the deduction is visible
        # in the vendor's transaction history instead of disappearing.
        append_vendor_ledger_entry(
            db,
            vendor_id=vendor_id,
            order_id=order_id,
            entry_type=VendorLedgerEntryType.DEBIT,
            amount=admin_profit,
            balance_before=before + amount,
            balance_after=final_after,
            notes=f"Admin profit deduction for order {order_id}",
        )

        # Credit admin wallet with admin profit
        if admin_id:
            from app.crud.admin_wallet import credit_admin_wallet
            credit_admin_wallet(
                db,
                admin_id=admin_id,
                amount=admin_profit,
                order_id=order_id,
                notes=f"Admin profit from order {order_id}"
            )

        return final_after, credit_entry
    else:
        # Normal credit without admin profit deduction
        after = before + amount
        set_vendor_wallet_balance(db, vendor_id, after)
        entry = append_vendor_ledger_entry(
            db,
            vendor_id=vendor_id,
            order_id=order_id,
            entry_type=VendorLedgerEntryType.CREDIT,
            amount=amount,
            balance_before=before,
            balance_after=after,
            notes=notes,
        )
        return after, entry


def release_driver_payout_hold(
    db: Session,
    *,
    vendor_id: str,
    order_id: int,
    notes: Optional[str] = None,
) -> Optional[VendorWalletLedger]:
    """Refunds a DRIVER_PAYOUT_HOLD placed on the vendor's wallet at
    accept time (see debit_vendor_wallet call in order_assignments.py's
    accept-booking flow), for a booking that was cancelled instead of
    completed - no payout guarantee is owed if the trip never happened.
    Idempotent: returns None (no-op) if there's no hold for this order, or
    it was already released (or already paid out as DRIVER_PAYOUT_GUARANTEE
    at trip completion - see end_records.py)."""
    hold = db.query(VendorWalletLedger).filter(
        VendorWalletLedger.vendor_id == vendor_id,
        VendorWalletLedger.reference_id == str(order_id),
        VendorWalletLedger.reference_type == "DRIVER_PAYOUT_HOLD",
        VendorWalletLedger.entry_type == VendorLedgerEntryType.DEBIT,
    ).first()
    if not hold or abs(int(hold.amount or 0)) <= 0:
        return None

    already_settled = db.query(VendorWalletLedger).filter(
        VendorWalletLedger.vendor_id == vendor_id,
        VendorWalletLedger.reference_id == str(order_id),
        VendorWalletLedger.reference_type == "DRIVER_PAYOUT_HOLD_RELEASE",
    ).first()
    if already_settled:
        return None

    held_amount = abs(int(hold.amount))
    _, entry = credit_vendor_wallet(
        db,
        vendor_id=vendor_id,
        amount=held_amount,
        order_id=order_id,
        notes=notes or f"Driver payout hold released - order {order_id} cancelled before completion",
    )
    entry.reference_id = str(order_id)
    entry.reference_type = "DRIVER_PAYOUT_HOLD_RELEASE"
    return entry


def debit_vendor_wallet(
    db: Session,
    *,
    vendor_id: str,
    amount: int,
    order_id: Optional[int] = None,
    notes: Optional[str] = None,
    reference_id: Optional[str] = None,
    reference_type: Optional[str] = None,
) -> Tuple[int, VendorWalletLedger]:
    """Debit amount from vendor wallet"""
    if amount <= 0:
        raise ValueError("Amount must be positive")

    before = get_vendor_wallet_balance(db, vendor_id)
    after = before - amount

    if after < 0:
        raise ValueError("Insufficient vendor balance")

    set_vendor_wallet_balance(db, vendor_id, after)

    entry = append_vendor_ledger_entry(
        db,
        vendor_id=vendor_id,
        order_id=order_id,
        entry_type=VendorLedgerEntryType.DEBIT,
        amount=amount,
        balance_before=before,
        balance_after=after,
        notes=notes,
        reference_id=reference_id,
        reference_type=reference_type,
    )
    return after, entry


