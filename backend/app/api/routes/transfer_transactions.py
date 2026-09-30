# api/routes/transfer_transactions.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.schemas.transfer_transactions import (
    TransferRequest, 
    AdminTransferAction, 
    TransferTransactionOut, 
    VendorBalanceOut, 
    TransferHistoryOut
)
from app.crud.transfer_transactions import (
    create_transfer_request,
    get_transfer_transaction,
    get_vendor_transfer_history,
    get_all_pending_transfers,
    process_transfer_request,
    get_vendor_balance,
    get_transfer_statistics,
    get_vendor_transfer_history_pending
)
from app.crud.vendor import get_vendor_by_id
from app.database.session import get_db
from app.core.security import get_current_vendor, get_current_admin
from typing import Optional
from uuid import UUID

router = APIRouter()

@router.post("/transfer/request", response_model=TransferTransactionOut, status_code=status.HTTP_201_CREATED)
async def request_transfer(
    transfer_data: TransferRequest,
    current_vendor = Depends(get_current_vendor),
    db: Session = Depends(get_db)
):
    """
    Request a transfer from wallet to bank balance
    
    Vendor can request to transfer money from their wallet balance to bank balance.
    The request will be pending until approved or rejected by an admin.
    
    Returns:
        - Transfer transaction details with pending status
    """
    try:
        vendor_id = str(current_vendor.id)
        
        # Create transfer request
        # transactions, total_count = get_vendor_transfer_history(db, vendor_id, skip, limit)
        transactions, total_count = get_vendor_transfer_history_pending(db, vendor_id)
        print("Pending Transactions Count:", total_count)
        if total_count == 0:
            transfer_transaction = create_transfer_request(db, vendor_id, transfer_data)
            return transfer_transaction
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have a pending transfer request. Please wait for it to be processed before making a new request."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/transfer/balance", response_model=VendorBalanceOut)
async def get_balance(
    current_vendor = Depends(get_current_vendor),
    db: Session = Depends(get_db)
):
    """
    Get current wallet and bank balance for the authenticated vendor
    
    Returns:
        - Current wallet balance
        - Current bank balance
        - Total balance (wallet + bank)
    """
    try:
        vendor_id = str(current_vendor.id)
        
        # Get vendor balance
        vendor_details = get_vendor_balance(db, vendor_id)
        
        return VendorBalanceOut(
            vendor_id=vendor_details.vendor_id,
            wallet_balance=vendor_details.wallet_balance,
            bank_balance=vendor_details.bank_balance,
            total_balance=vendor_details.wallet_balance + vendor_details.bank_balance
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/transfer/history", response_model=TransferHistoryOut)
async def get_transfer_history(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    current_vendor = Depends(get_current_vendor),
    db: Session = Depends(get_db)
):
    """
    Get transfer history for the authenticated vendor
    
    Returns:
        - List of transfer transactions
        - Total count of transactions
    """
    try:
        vendor_id = str(current_vendor.id)
        # Get transfer history
        transactions, total_count = get_vendor_transfer_history(db, vendor_id, skip, limit)
        
        return TransferHistoryOut(
            transactions=transactions,
            total_count=total_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/transfer/statistics")
async def get_transfer_statistics_route(
    current_vendor = Depends(get_current_vendor),
    db: Session = Depends(get_db)
):
    """
    Get transfer statistics for the authenticated vendor
    
    Returns:
        - Total approved transfers
        - Total rejected transfers
        - Total pending transfers
        - Total amount transferred
    """
    try:
        vendor_id = str(current_vendor.id)
        
        # Get transfer statistics
        statistics = get_transfer_statistics(db, vendor_id)
        
        return statistics
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

# --- Admin Endpoints ---

@router.get("/admin/transfers/pending", response_model=TransferHistoryOut)
async def get_pending_transfers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get all pending transfer requests for admin review
    
    Admin only endpoint to view pending transfer requests that need approval/rejection.
    
    Returns:
        - List of pending transfer transactions
        - Total count of pending transactions
    """
    try:
        # Get pending transfers
        transactions, total_count = get_all_pending_transfers(db, skip, limit)
        
        return TransferHistoryOut(
            transactions=transactions,
            total_count=total_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/transfers/{transaction_id}/process", response_model=TransferTransactionOut)
async def process_transfer(
    transaction_id: UUID,
    admin_action: AdminTransferAction,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Process transfer request (approve or reject) by admin
    
    Admin can approve or reject a pending transfer request.
    - If approved: wallet balance is reduced, bank balance is increased
    - If rejected: no balance changes, only status is updated
    
    Returns:
        - Updated transfer transaction details
    """
    try:
        # Process transfer request
        transfer_transaction, vendor_details = process_transfer_request(
            db, 
            str(transaction_id), 
            admin_action
        )
        
        return transfer_transaction
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/admin/transfers/{transaction_id}", response_model=TransferTransactionOut)
async def get_transfer_details(
    transaction_id: UUID,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific transfer transaction
    
    Admin only endpoint to view complete details of any transfer transaction.
    
    Returns:
        - Complete transfer transaction details
    """
    try:
        # Get transfer transaction
        transfer_transaction = get_transfer_transaction(db, str(transaction_id))
        
        if not transfer_transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer transaction not found"
            )
        
        return transfer_transaction
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/admin/vendors/{vendor_id}/balance", response_model=VendorBalanceOut)
async def get_vendor_balance_admin(
    vendor_id: UUID,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get wallet and bank balance for a specific vendor (Admin only)
    
    Admin can check the balance of any vendor in the system.
    
    Returns:
        - Current wallet balance
        - Current bank balance
        - Total balance (wallet + bank)
    """
    try:
        # Get vendor balance
        vendor_details = get_vendor_balance(db, str(vendor_id))
        
        return VendorBalanceOut(
            vendor_id=vendor_details.vendor_id,
            wallet_balance=vendor_details.wallet_balance,
            bank_balance=vendor_details.bank_balance,
            total_balance=vendor_details.wallet_balance + vendor_details.bank_balance
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )
