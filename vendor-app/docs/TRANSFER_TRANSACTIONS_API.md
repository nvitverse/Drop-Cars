# Vendor Wallet-to-Bank Transfer API Documentation

## Overview

The Vendor Wallet-to-Bank Transfer API provides a comprehensive system for vendors to request transfers from their wallet balance to bank balance, with admin approval workflow. This system ensures secure and controlled money movement between different balance types.

## Features

- **Dual Balance System**: Vendors maintain separate wallet and bank balances
- **Transfer Requests**: Vendors can request transfers from wallet to bank
- **Admin Approval**: All transfers require admin approval before processing
- **Balance Tracking**: Complete audit trail of balance changes
- **Transaction History**: Comprehensive transaction logging and reporting

## Database Schema

### Vendor Details Table (`vendor_details`)
- `wallet_balance`: Current wallet balance (default: 0)
- `bank_balance`: Current bank balance (default: 0)

### Transfer Transactions Table (`transfer_transactions`)
- `id`: Unique transaction identifier
- `vendor_id`: Reference to vendor
- `requested_amount`: Amount requested for transfer
- `wallet_balance_before`: Wallet balance before transfer
- `bank_balance_before`: Bank balance before transfer
- `wallet_balance_after`: Wallet balance after transfer (if approved)
- `bank_balance_after`: Bank balance after transfer (if approved)
- `status`: Transaction status (Pending/Approved/Rejected)
- `admin_notes`: Optional notes from admin
- `created_at`: Request creation timestamp
- `updated_at`: Last update timestamp

## API Endpoints

### Vendor Endpoints

#### 1. Request Transfer
**POST** `/api/transfer/request`

Request a transfer from wallet to bank balance.

**Request Body:**
```json
{
    "amount": 1000
}
```

**Response:**
```json
{
    "id": "uuid",
    "vendor_id": "vendor-uuid",
    "requested_amount": 1000,
    "wallet_balance_before": 5000,
    "bank_balance_before": 2000,
    "wallet_balance_after": null,
    "bank_balance_after": null,
    "status": "Pending",
    "admin_notes": null,
    "created_at": "2025-08-13T12:00:00Z",
    "updated_at": "2025-08-13T12:00:00Z"
}
```

**Validation Rules:**
- Amount must be greater than 0
- Vendor must have sufficient wallet balance
- Transfer request creates a pending transaction

#### 2. Check Balance
**GET** `/api/transfer/balance`

Get current wallet and bank balance for the authenticated vendor.

**Response:**
```json
{
    "vendor_id": "vendor-uuid",
    "wallet_balance": 4000,
    "bank_balance": 3000,
    "total_balance": 7000
}
```

#### 3. Transfer History
**GET** `/api/transfer/history?skip=0&limit=100`

Get transfer history for the authenticated vendor.

**Query Parameters:**
- `skip`: Number of records to skip (pagination)
- `limit`: Number of records to return (max 1000)

**Response:**
```json
{
    "transactions": [
        {
            "id": "uuid",
            "vendor_id": "vendor-uuid",
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
    ],
    "total_count": 1
}
```

#### 4. Transfer Statistics
**GET** `/api/transfer/statistics`

Get transfer statistics for the authenticated vendor.

**Response:**
```json
{
    "total_approved": 5,
    "total_rejected": 1,
    "total_pending": 2,
    "total_transferred": 5000
}
```

### Admin Endpoints

#### 1. View Pending Transfers
**GET** `/api/admin/transfers/pending?skip=0&limit=100`

Get all pending transfer requests for admin review.

**Query Parameters:**
- `skip`: Number of records to skip (pagination)
- `limit`: Number of records to return (max 1000)

**Response:** Same as transfer history but only pending transactions.

#### 2. Process Transfer Request
**POST** `/api/admin/transfers/{transaction_id}/process`

Approve or reject a pending transfer request.

**Request Body:**
```json
{
    "action": "approve",
    "notes": "Transfer approved successfully"
}
```

**Actions:**
- `approve`: Transfer is processed, balances are updated
- `reject`: Transfer is rejected, no balance changes

**Response:** Updated transfer transaction details.

#### 3. View Transfer Details
**GET** `/api/admin/transfers/{transaction_id}`

Get detailed information about a specific transfer transaction.

**Response:** Complete transfer transaction details.

#### 4. Check Vendor Balance (Admin)
**GET** `/api/admin/vendors/{vendor_id}/balance`

Get wallet and bank balance for a specific vendor (admin only).

**Response:** Same as vendor balance endpoint.

## Workflow

### 1. Transfer Request Process
1. Vendor requests transfer from wallet to bank
2. System validates sufficient wallet balance
3. Transfer transaction is created with "Pending" status
4. Admin is notified of pending transfer request

### 2. Admin Review Process
1. Admin reviews pending transfer requests
2. Admin can approve or reject the request
3. If approved:
   - Wallet balance is reduced by transfer amount
   - Bank balance is increased by transfer amount
   - Transaction status becomes "Approved"
4. If rejected:
   - No balance changes
   - Transaction status becomes "Rejected"
   - Admin can add notes explaining rejection

### 3. Balance Updates
- **Before Transfer**: System records current balances
- **After Approval**: System updates balances and records new values
- **After Rejection**: Balances remain unchanged

## Security Features

- **Authentication Required**: All endpoints require valid vendor or admin authentication
- **Balance Validation**: System prevents transfers exceeding available wallet balance
- **Admin Authorization**: Only admins can approve/reject transfers
- **Audit Trail**: Complete history of all balance changes and transactions
- **Transaction Isolation**: Each transfer is processed atomically

## Error Handling

### Common Error Responses

**Insufficient Balance:**
```json
{
    "detail": "Insufficient wallet balance. Current balance: 500, Requested: 1000"
}
```

**Transaction Not Found:**
```json
{
    "detail": "Transfer transaction not found"
}
```

**Already Processed:**
```json
{
    "detail": "Transfer request is already Approved"
}
```

**Invalid Action:**
```json
{
    "detail": "Action must be either \"approve\" or \"reject\""
}
```

## Best Practices

### For Vendors
- Check current balance before requesting transfers
- Monitor transfer history for status updates
- Keep track of pending transfer requests

### For Admins
- Review transfer requests promptly
- Add clear notes when rejecting transfers
- Monitor vendor balance patterns
- Use pagination for large transaction lists

## Rate Limiting

- Transfer requests: Limited to prevent abuse
- Balance checks: Reasonable limits for frequent queries
- Admin actions: Standard rate limiting for security

## Monitoring and Alerts

- **Low Balance Alerts**: Notify vendors when wallet balance is low
- **Transfer Volume Monitoring**: Track transfer patterns for fraud detection
- **Admin Activity Logging**: Monitor admin actions for audit purposes
- **System Health Checks**: Ensure database consistency and performance

## Future Enhancements

- **Automated Approvals**: Rule-based approval for small amounts
- **Scheduled Transfers**: Recurring transfer requests
- **Multi-Currency Support**: Handle different currencies
- **Integration APIs**: Connect with external banking systems
- **Mobile Notifications**: Push notifications for transfer status updates
