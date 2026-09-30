# crud/admin_wallet_adjust.py
"""
Admin manual wallet adjustment for BOTH fleet owners (fleet owners) and vendors.
Supports credit (add) and debit (deduct). Isolated from the existing add-money flow
so nothing already working is touched.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional
from uuid import UUID
import uuid

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vendor_details import VendorDetails
from app.models.vendor import VendorCredentials
from app.models.wallet_ledger import WalletLedger, WalletEntryTypeEnum
from app.models.vendor_wallet_ledger import VendorWalletLedger, VendorLedgerEntryType


def _uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id format")


def _apply_symmetric_admin_entry(db: Session, direction: str, amount: int, notes: Optional[str]) -> None:
    """Every manual wallet adjustment moves money to/from admin's own pool,
    so admin's ledger must move the opposite way or its running balance
    silently drifts from reality (e.g. a manual refund would otherwise look
    like admin kept the money it just gave away). Crediting a fleet
    owner/vendor (direction='credit') debits admin; debiting them credits
    admin. Uses the allow-negative debit since a manual payout must always be
    recorded even if it pushes admin's balance below zero (same reasoning as
    wallet penalties, app/crud/wallet.py:debit_wallet_allow_negative)."""
    from app.models.admin import Admin
    from app.crud.admin_wallet import credit_admin_wallet, debit_admin_wallet_allow_negative

    admin = db.query(Admin).first()
    if not admin:
        return

    if direction == "credit":
        debit_admin_wallet_allow_negative(
            db, admin_id=str(admin.id), amount=amount,
            notes=notes or f"Manual payout (admin adjustment): -{amount}",
        )
    else:
        credit_admin_wallet(
            db, admin_id=str(admin.id), amount=amount,
            notes=notes or f"Manual recovery (admin adjustment): +{amount}",
        )


def search_wallet_target(db: Session, role: str, primary_number: str):
    """Find an owner or vendor by phone number for the wallet screen."""
    if role == "vehicle_owner":
        details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.primary_number == primary_number
        ).first()
        if not details:
            raise HTTPException(status_code=404, detail="Fleet owner not found with this number")
        creds = db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.id == details.vehicle_owner_id
        ).first()
        return {
            "role": "vehicle_owner",
            "id": str(details.vehicle_owner_id),
            "reg_id": creds.reg_id if creds else None,
            "full_name": details.full_name,
            "primary_number": details.primary_number,
            "wallet_balance": details.wallet_balance,
            "account_status": creds.account_status.value if creds else "Unknown",
        }
    elif role == "vendor":
        creds = db.query(VendorCredentials).filter(
            VendorCredentials.primary_number == primary_number
        ).first()
        if not creds:
            raise HTTPException(status_code=404, detail="Vendor not found with this number")
        details = db.query(VendorDetails).filter(
            VendorDetails.vendor_id == creds.id
        ).first()
        if not details:
            raise HTTPException(status_code=404, detail="Vendor details not found")
        return {
            "role": "vendor",
            "id": str(creds.id),
            "reg_id": creds.reg_id,
            "full_name": details.full_name,
            "primary_number": details.primary_number,
            "wallet_balance": details.wallet_balance,
            "account_status": creds.account_status.value if creds else "Unknown",
        }
    else:
        raise HTTPException(status_code=400, detail="role must be 'vehicle_owner' or 'vendor'")


def search_wallet_targets(db: Session, role: str, query: str, limit: int = 10):
    """Partial phone-number (or name) search returning a short candidate
    list - previously the wallet screen only did an exact 10-digit phone
    match, so a staff member who only had the last 4 digits of a number (or
    a misremembered digit) couldn't find the account at all. Returns a list
    so the admin explicitly picks the right one rather than money silently
    moving to a `.first()` guess among several matches."""
    like = f"%{query.strip()}%"
    results = []

    if role == "vehicle_owner":
        rows = db.query(VehicleOwnerDetails).filter(
            (VehicleOwnerDetails.primary_number.ilike(like)) | (VehicleOwnerDetails.full_name.ilike(like))
        ).limit(limit).all()
        owner_ids = [r.vehicle_owner_id for r in rows]
        creds_by_id = {
            c.id: c for c in db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id.in_(owner_ids)).all()
        } if owner_ids else {}
        for r in rows:
            creds = creds_by_id.get(r.vehicle_owner_id)
            results.append({
                "role": "vehicle_owner",
                "id": str(r.vehicle_owner_id),
                "reg_id": creds.reg_id if creds else None,
                "full_name": r.full_name,
                "primary_number": r.primary_number,
                "wallet_balance": r.wallet_balance,
                "account_status": creds.account_status.value if creds else "Unknown",
            })
    elif role == "vendor":
        creds_rows = db.query(VendorCredentials).filter(VendorCredentials.primary_number.ilike(like)).limit(limit).all()
        details_rows = db.query(VendorDetails).filter(VendorDetails.full_name.ilike(like)).limit(limit).all()
        seen_ids = set()
        combined = [(c, None) for c in creds_rows] + [(None, d) for d in details_rows]
        for creds, details in combined:
            vendor_id = creds.id if creds else details.vendor_id
            if vendor_id in seen_ids:
                continue
            seen_ids.add(vendor_id)
            if not creds:
                creds = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
            if not details:
                details = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
            if not creds or not details:
                continue
            results.append({
                "role": "vendor",
                "id": str(creds.id),
                "reg_id": creds.reg_id,
                "full_name": details.full_name,
                "primary_number": details.primary_number,
                "wallet_balance": details.wallet_balance,
                "account_status": creds.account_status.value,
            })
            if len(results) >= limit:
                break
    else:
        raise HTTPException(status_code=400, detail="role must be 'vehicle_owner' or 'vendor'")

    return results


def adjust_wallet(
    db: Session,
    role: str,
    target_id: str,
    direction: str,
    amount: int,
    notes: str = None,
):
    """
    Manually credit or debit a wallet.
    - role: 'vehicle_owner' | 'vendor'
    - direction: 'credit' | 'debit'
    - amount: whole rupees (positive integer)
    Debit is blocked if it would push the balance below zero (manual corrections
    should not create surprise negative balances; billing has its own path).
    """
    if direction not in ("credit", "debit"):
        raise HTTPException(status_code=400, detail="direction must be 'credit' or 'debit'")
    if not isinstance(amount, int) or amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be a positive whole number")

    target_uuid = _uuid(target_id)

    if role == "vehicle_owner":
        owner = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == target_uuid
        ).with_for_update().first()
        if not owner:
            raise HTTPException(status_code=404, detail="Fleet owner not found")

        before = owner.wallet_balance or 0
        if direction == "credit":
            after = before + amount
            entry_type = WalletEntryTypeEnum.CREDIT
        else:
            after = before - amount
            if after < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot deduct ₹{amount}: balance is only ₹{before}",
                )
            entry_type = WalletEntryTypeEnum.DEBIT

        owner.wallet_balance = after
        db.add(owner)
        db.add(WalletLedger(
            vehicle_owner_id=target_uuid,
            reference_id=str(uuid.uuid4()),
            reference_type="ADMIN_MANUAL_ADJUST",
            entry_type=entry_type,
            amount=amount,
            balance_before=before,
            balance_after=after,
            notes=notes or f"Admin manual {direction}: {amount}",
        ))
        _apply_symmetric_admin_entry(db, direction, amount, notes)
        db.commit()
        return {"role": role, "id": target_id, "new_wallet_balance": after,
                "direction": direction, "amount": amount, "target_name": owner.full_name}

    elif role == "vendor":
        details = db.query(VendorDetails).filter(
            VendorDetails.vendor_id == target_uuid
        ).with_for_update().first()
        if not details:
            raise HTTPException(status_code=404, detail="Vendor not found")

        before = details.wallet_balance or 0
        if direction == "credit":
            after = before + amount
            entry_type = VendorLedgerEntryType.CREDIT
        else:
            after = before - amount
            if after < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot deduct ₹{amount}: balance is only ₹{before}",
                )
            entry_type = VendorLedgerEntryType.DEBIT

        details.wallet_balance = after
        db.add(details)
        db.add(VendorWalletLedger(
            vendor_id=target_uuid,
            order_id=None,
            entry_type=entry_type,
            amount=amount,
            balance_before=before,
            balance_after=after,
            notes=notes or f"Admin manual {direction}: {amount}",
        ))
        _apply_symmetric_admin_entry(db, direction, amount, notes)
        db.commit()
        return {"role": role, "id": target_id, "new_wallet_balance": after,
                "direction": direction, "amount": amount, "target_name": details.business_name or details.full_name}

    else:
        raise HTTPException(status_code=400, detail="role must be 'vehicle_owner' or 'vendor'")


def get_vehicle_owner_ledger(db: Session, vehicle_owner_id: str, skip: int = 0, limit: int = 200):
    """Full transaction history for one fleet owner - every credit, debit,
    and refund ever recorded against their wallet (admin manual adjustments,
    order-acceptance holds, Razorpay top-ups, refunds - whatever wrote a
    wallet_ledger row for this owner)."""
    target_uuid = _uuid(vehicle_owner_id)
    query = db.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == target_uuid)
    total_count = query.count()
    rows = query.order_by(WalletLedger.created_at.desc()).offset(skip).limit(limit).all()
    return rows, total_count


def get_vendor_ledger(db: Session, vendor_id: str, skip: int = 0, limit: int = 200):
    """Full transaction history for one vendor - every credit, debit, and
    refund ever recorded against their wallet."""
    target_uuid = _uuid(vendor_id)
    query = db.query(VendorWalletLedger).filter(VendorWalletLedger.vendor_id == target_uuid)
    total_count = query.count()
    rows = query.order_by(VendorWalletLedger.created_at.desc()).offset(skip).limit(limit).all()
    return rows, total_count
