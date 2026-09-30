# crud/admin_add_money.py
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.admin_add_money_to_vehicle_owner import AdminAddMoneyToVehicleOwner
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.wallet_ledger import WalletLedger, WalletEntryTypeEnum
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone
import uuid


def get_vehicle_owner_by_primary_number(db: Session, primary_number: str):
    """Get fleet owner details by primary number"""
    vehicle_owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.primary_number == primary_number
    ).first()
    
    if not vehicle_owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fleet owner with primary number {primary_number} not found"
        )
    
    # Get account status from vehicle_owner table
    vehicle_owner = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == vehicle_owner_details.vehicle_owner_id
    ).first()
    
    account_status = vehicle_owner.account_status.value if vehicle_owner else "Unknown"
    
    return {
        "vehicle_owner_id": vehicle_owner_details.vehicle_owner_id,
        "full_name": vehicle_owner_details.full_name,
        "primary_number": vehicle_owner_details.primary_number,
        "secondary_number": vehicle_owner_details.secondary_number,
        "wallet_balance": vehicle_owner_details.wallet_balance,
        "aadhar_number": vehicle_owner_details.aadhar_number,
        "address": vehicle_owner_details.address,
        "city": vehicle_owner_details.city,
        "pincode": vehicle_owner_details.pincode,
        "account_status": account_status
    }


def create_admin_add_money_transaction(
    db: Session,
    vehicle_owner_id: str,
    transaction_value: int,
    transaction_img: Optional[str] = None,
    notes: Optional[str] = None,
    reference_value: Optional[str] = None,
    admin_id: Optional[str] = None
):
    """Create admin add money transaction and update wallet"""
    
    # Validate transaction_value
    if transaction_value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction value must be greater than 0"
        )
    
    # Convert vehicle_owner_id to UUID
    try:
        vehicle_owner_id_uuid = UUID(vehicle_owner_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid vehicle_owner_id format"
        )
    
    # Idempotency guard: never credit the same payment twice
    if reference_value:
        duplicate = db.query(AdminAddMoneyToVehicleOwner).filter(
            AdminAddMoneyToVehicleOwner.vehicle_owner_id == vehicle_owner_id_uuid,
            AdminAddMoneyToVehicleOwner.reference_value == reference_value
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate transaction: reference '{reference_value}' was already credited to this fleet owner"
            )
    else:
        # No reference given - block identical amount to the same owner within 2 minutes
        # (catches accidental double-taps / network retries)
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=2)
        duplicate = db.query(AdminAddMoneyToVehicleOwner).filter(
            AdminAddMoneyToVehicleOwner.vehicle_owner_id == vehicle_owner_id_uuid,
            AdminAddMoneyToVehicleOwner.transaction_value == transaction_value,
            AdminAddMoneyToVehicleOwner.created_at >= recent_cutoff
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Possible duplicate: the same amount was credited to this owner less than 2 minutes ago. Provide a unique reference_value to confirm this is intentional."
            )

    # Get fleet owner details (row-locked so balance read+update is atomic)
    vehicle_owner = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id_uuid
    ).with_for_update().first()
    
    if not vehicle_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner not found"
        )
    
    # Update wallet balance
    balance_before = vehicle_owner.wallet_balance
    new_balance = balance_before + transaction_value
    
    vehicle_owner.wallet_balance = new_balance
    db.add(vehicle_owner)
    
    # Create wallet ledger entry
    ledger_entry = WalletLedger(
        vehicle_owner_id=vehicle_owner_id_uuid,
        reference_id=str(uuid.uuid4()),  # Reference to the admin transaction
        reference_type="ADMIN_ADD_MONEY",
        entry_type=WalletEntryTypeEnum.CREDIT,
        amount=transaction_value,
        balance_before=balance_before,
        balance_after=new_balance,
        notes=notes or f"Admin added money: {transaction_value}"
    )
    db.add(ledger_entry)
    db.flush()  # Get the ID without committing
    wallet_ledger_entry_id = ledger_entry.id
    
    # Create admin add money transaction record
    admin_transaction = AdminAddMoneyToVehicleOwner(
        vehicle_owner_id=vehicle_owner_id_uuid,
        transaction_value=transaction_value,
        transaction_img=transaction_img,
        reference_value=reference_value,
        vehicle_owner_ledger_id=wallet_ledger_entry_id,
        admin_id=admin_id
    )
    
    db.add(admin_transaction)
    db.commit()
    db.refresh(admin_transaction)
    
    return {
        "transaction_id": admin_transaction.id,
        "vehicle_owner_id": admin_transaction.vehicle_owner_id,
        "transaction_value": admin_transaction.transaction_value,
        "transaction_img": admin_transaction.transaction_img,
        "reference_value": admin_transaction.reference_value,
        "vehicle_owner_ledger_id": admin_transaction.vehicle_owner_ledger_id,
        "new_wallet_balance": new_balance,
        "created_at": admin_transaction.created_at
    }


def get_vehicle_owner_details_by_id(db: Session, vehicle_owner_id: str):
    """Get fleet owner details by ID"""
    vehicle_owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    
    if not vehicle_owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner not found"
        )
    
    return vehicle_owner_details

