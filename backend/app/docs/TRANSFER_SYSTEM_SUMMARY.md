# Vendor Wallet-to-Bank Transfer System - Quick Reference

## System Overview
A comprehensive API system for vendors to request transfers from wallet to bank balance with admin approval workflow.

## Key Components

### 1. Models
- **VendorDetails**: Extended with `bank_balance` field
- **TransferTransactions**: New table for tracking transfer requests and status

### 2. Schemas
- **TransferRequest**: For vendor transfer requests
- **AdminTransferAction**: For admin approve/reject actions
- **TransferTransactionOut**: Complete transaction details
- **VendorBalanceOut**: Current balance information

### 3. CRUD Operations
- **create_transfer_request**: Create new transfer request
- **process_transfer_request**: Admin approval/rejection
- **get_vendor_balance**: Check current balances
- **get_transfer_history**: View transaction history

### 4. API Endpoints

#### Vendor Endpoints
- `POST /api/transfer/request` - Request transfer
- `GET /api/transfer/balance` - Check balance
- `GET /api/transfer/history` - View history
- `GET /api/transfer/statistics` - Get statistics

#### Admin Endpoints
- `GET /api/admin/transfers/pending` - View pending requests
- `POST /api/admin/transfers/{id}/process` - Approve/reject
- `GET /api/admin/transfers/{id}` - View details
- `GET /api/admin/vendors/{id}/balance` - Check vendor balance

## Workflow

1. **Vendor Request**: Vendor requests transfer with amount
2. **Validation**: System checks sufficient wallet balance
3. **Pending Status**: Transaction created with "Pending" status
4. **Admin Review**: Admin reviews and approves/rejects
5. **Balance Update**: If approved, balances are updated
6. **Status Update**: Transaction status updated accordingly

## Security Features

- Authentication required for all endpoints
- Balance validation prevents overspending
- Admin-only approval workflow
- Complete audit trail
- Transaction isolation

## Database Changes

### New Table: `transfer_transactions`
```sql
CREATE TABLE transfer_transactions (
    id UUID PRIMARY KEY,
    vendor_id UUID REFERENCES vendor(id),
    requested_amount INTEGER NOT NULL,
    wallet_balance_before INTEGER NOT NULL,
    bank_balance_before INTEGER NOT NULL,
    wallet_balance_after INTEGER,
    bank_balance_after INTEGER,
    status transfer_status_enum DEFAULT 'Pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Updated Table: `vendor_details`
```sql
ALTER TABLE vendor_details ADD COLUMN bank_balance INTEGER DEFAULT 0;
```

## Usage Examples

### Request Transfer
```bash
curl -X POST "http://localhost:8000/api/transfer/request" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

### Approve Transfer (Admin)
```bash
curl -X POST "http://localhost:8000/api/admin/transfers/{id}/process" \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve", "notes": "Approved"}'
```

### Check Balance
```bash
curl -X GET "http://localhost:8000/api/transfer/balance" \
  -H "Authorization: Bearer {token}"
```

## Error Handling

- **400**: Insufficient balance, invalid amount
- **401**: Unauthorized access
- **403**: Admin access required
- **404**: Transaction or vendor not found
- **500**: Internal server error

## Testing

The system includes comprehensive error handling and validation:
- Amount validation (must be > 0)
- Balance validation (sufficient funds)
- Status validation (not already processed)
- Authentication and authorization checks

## Future Enhancements

- Automated approvals for small amounts
- Scheduled transfers
- Multi-currency support
- External banking integration
- Mobile notifications
