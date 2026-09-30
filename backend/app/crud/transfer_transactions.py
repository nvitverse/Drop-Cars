# crud/transfer_transactions.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.transfer_transactions import TransferTransactions, TransferStatusEnum
from app.models.vendor_details import VendorDetails
from app.models.vendor_wallet_ledger import VendorWalletLedger, VendorLedgerEntryType
from app.schemas.transfer_transactions import TransferRequest, AdminTransferAction
from typing import List, Optional
import uuid

def create_transfer_request(db: Session, vendor_id: str, transfer_data: TransferRequest):
    """
    Create a new transfer request from wallet to bank
    """
    # Get vendor details to check current balances
    vendor_details = db.query(VendorDetails).filter(
        VendorDetails.vendor_id == vendor_id
    ).first()
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    # Check if vendor has sufficient wallet balance
    if vendor_details.wallet_balance < transfer_data.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance. Current balance: {vendor_details.wallet_balance}, Requested: {transfer_data.amount}"
        )
    
    # Create transfer transaction
    transfer_transaction = TransferTransactions(
        vendor_id=vendor_id,
        requested_amount=transfer_data.amount,
        wallet_balance_before=vendor_details.wallet_balance,
        bank_balance_before=vendor_details.bank_balance,
        status=TransferStatusEnum.PENDING
    )
    
    try:
        db.add(transfer_transaction)
        db.commit()
        db.refresh(transfer_transaction)
        return transfer_transaction
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create transfer request: {str(e)}"
        )

def get_transfer_transaction(db: Session, transaction_id: str):
    """
    Get transfer transaction by ID
    """
    return db.query(TransferTransactions).filter(
        TransferTransactions.id == transaction_id
    ).first()

def get_vendor_transfer_history(db: Session, vendor_id: str, skip: int = 0, limit: int = 100):
    """
    Get transfer history for a specific vendor
    """
    transactions = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id
    ).order_by(TransferTransactions.created_at.desc()).offset(skip).limit(limit).all()
    
    total_count = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id
    ).count()
    
    return transactions, total_count

def get_vendor_transfer_history_pending(db: Session, vendor_id: str):
    """
    Get transfer history for a specific vendor
    """
    transactions = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id
    ).filter(
        TransferTransactions.status == TransferStatusEnum.PENDING
    ).order_by(TransferTransactions.created_at.desc()).all()
    
    total_count = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id
    ).filter(TransferTransactions.status == TransferStatusEnum.PENDING
    ).count()
    
    return transactions, total_count

def get_all_pending_transfers(db: Session, skip: int = 0, limit: int = 100):
    """
    Get all pending transfer requests for admin review
    """
    transactions = db.query(TransferTransactions).filter(
        TransferTransactions.status == TransferStatusEnum.PENDING
    ).order_by(TransferTransactions.created_at.asc()).offset(skip).limit(limit).all()
    
    total_count = db.query(TransferTransactions).filter(
        TransferTransactions.status == TransferStatusEnum.PENDING
    ).count()
    
    return transactions, total_count

def process_transfer_request(db: Session, transaction_id: str, admin_action: AdminTransferAction):
    """
    Process transfer request (approve or reject) by admin
    """
    # Get transfer transaction (row-locked so concurrent approvals cannot double-process)
    transfer_transaction = db.query(TransferTransactions).filter(
        TransferTransactions.id == transaction_id
    ).with_for_update().first()
    if not transfer_transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer transaction not found"
        )

    # Check if transaction is already processed
    if transfer_transaction.status != TransferStatusEnum.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transfer request is already {transfer_transaction.status.value}"
        )

    # Get vendor details (row-locked so balance read+update is atomic)
    vendor_details = db.query(VendorDetails).filter(
        VendorDetails.vendor_id == transfer_transaction.vendor_id
    ).with_for_update().first()
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    try:
        if admin_action.action == "approve":
            # Check if vendor still has sufficient balance
            if vendor_details.wallet_balance < transfer_transaction.requested_amount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient wallet balance for transfer"
                )
            
            # Update vendor balances
            balance_before = vendor_details.wallet_balance
            vendor_details.wallet_balance -= transfer_transaction.requested_amount
            vendor_details.bank_balance += transfer_transaction.requested_amount

            # Update transaction
            transfer_transaction.status = TransferStatusEnum.APPROVED
            transfer_transaction.wallet_balance_after = vendor_details.wallet_balance
            transfer_transaction.bank_balance_after = vendor_details.bank_balance
            transfer_transaction.admin_notes = admin_action.notes

            # Audit trail: record the debit in the vendor wallet ledger
            db.add(VendorWalletLedger(
                vendor_id=transfer_transaction.vendor_id,
                entry_type=VendorLedgerEntryType.DEBIT,
                amount=transfer_transaction.requested_amount,
                balance_before=balance_before,
                balance_after=vendor_details.wallet_balance,
                notes=f"Wallet-to-bank transfer approved (transfer id {transfer_transaction.id})"
            ))
            
        elif admin_action.action == "reject":
            # Update transaction status only
            transfer_transaction.status = TransferStatusEnum.REJECTED
            transfer_transaction.admin_notes = admin_action.notes
        
        db.commit()
        db.refresh(transfer_transaction)
        db.refresh(vendor_details)
        
        return transfer_transaction, vendor_details
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process transfer request: {str(e)}"
        )

def get_vendor_balance(db: Session, vendor_id: str):
    """
    Get current wallet and bank balance for a vendor
    """
    vendor_details = db.query(VendorDetails).filter(
        VendorDetails.vendor_id == vendor_id
    ).first()
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    return vendor_details

def get_transfer_statistics(db: Session, vendor_id: str):
    """
    Get transfer statistics for a vendor
    """
    # Convert vendor_id to string if it's a UUID
    vendor_id_str = str(vendor_id)
    
    # Get total approved transfers
    total_approved = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id_str,
        TransferTransactions.status == TransferStatusEnum.APPROVED
    ).count()
    
    # Get total rejected transfers
    total_rejected = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id_str,
        TransferTransactions.status == TransferStatusEnum.REJECTED
    ).count()
    
    # Get total pending transfers
    total_pending = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id_str,
        TransferTransactions.status == TransferStatusEnum.PENDING
    ).count()
    
    # Get total amount transferred
    total_transferred = db.query(TransferTransactions).filter(
        TransferTransactions.vendor_id == vendor_id_str,
        TransferTransactions.status == TransferStatusEnum.APPROVED
    ).with_entities(
        func.sum(TransferTransactions.requested_amount)
    ).scalar() or 0
    
    return {
        "total_approved": total_approved,
        "total_rejected": total_rejected,
        "total_pending": total_pending,
        "total_transferred": total_transferred
    }
