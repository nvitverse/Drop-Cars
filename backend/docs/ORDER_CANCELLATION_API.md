# Order Cancellation API Documentation

## Overview

This document describes the order cancellation system implemented in the Drop Cars Backend. The system supports two types of cancellations:

1. **Auto-cancellation**: Automatic cancellation when orders exceed the maximum assignment time
2. **Vendor cancellation**: Manual cancellation by vendors

## Database Changes

### New Column in Orders Table

A new column `cancelled_by` has been added to the `orders` table to track the source of cancellation:

```sql
ALTER TABLE orders ADD COLUMN cancelled_by VARCHAR(50);
```

**Enum Values:**
- `AUTO_CANCELLED`: Order was automatically cancelled due to timeout
- `CANCELLED_BY_VENDOR`: Order was manually cancelled by the vendor

## Auto-Cancellation System

### How It Works

When an order assignment exceeds the `max_time_to_assign_order` time limit and no driver/car has been assigned, the system automatically:

1. **Calculates Penalty**: `penalty_amount = vendor_price - estimated_price`
2. **Checks Balance**: Verifies if the vehicle owner has sufficient wallet balance
3. **Debits Penalty**: If sufficient balance exists, debits the penalty amount
4. **Updates Status**: Sets order status to `CANCELLED` and assignment status to `CANCELLED`
5. **Records Transaction**: Creates a wallet ledger entry for the penalty

### Auto-Cancellation Logic

```python
def cancel_timed_out_pending_assignments(db: Session) -> int:
    """
    Cancel PENDING assignments that exceeded order's max_time_to_assign_order
    and have no driver/car assigned. Also debits penalty amount from vehicle 
    owner's wallet and updates order status.
    """
```

**Key Features:**
- Only processes assignments with `PENDING` status
- Only processes assignments without assigned driver/car
- Checks vehicle owner's wallet balance before debiting
- Records detailed transaction in wallet ledger
- Updates both order and assignment status
- Handles insufficient balance gracefully

### Wallet Ledger Integration

Auto-cancellation penalties are recorded in the `wallet_ledger` table with:
- **Reference Type**: `AUTO_CANCELLATION_PENALTY`
- **Reference ID**: Assignment ID
- **Amount**: `vendor_price - estimated_price`
- **Notes**: Detailed description of the penalty

## Vendor Cancellation API

### Endpoint

```
PATCH /order-assignments/vendor/cancel-order/{order_id}
```

### Authentication

Requires vendor authentication token in the Authorization header:
```
Authorization: Bearer <vendor_jwt_token>
```

### Request Parameters

- **order_id** (path parameter): The ID of the order to cancel

### Response

**Success Response (200):**
```json
{
    "message": "Order cancelled successfully by vendor",
    "order_id": 123,
    "cancelled_by": "CANCELLED_BY_VENDOR",
    "cancelled_at": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
    "detail": "Order not found or you don't have permission to cancel this order"
}
```

```json
{
    "detail": "Order is already cancelled"
}
```

**401 Unauthorized:**
```json
{
    "detail": "Could not validate credentials"
}
```

**500 Internal Server Error:**
```json
{
    "detail": "Failed to cancel order: <error_message>"
}
```

### Vendor Cancellation Logic

```python
def cancel_order_by_vendor(db: Session, order_id: int, vendor_id: str) -> dict:
    """
    Cancel an order by vendor without debiting money from vehicle owner
    """
```

**Key Features:**
- Verifies vendor ownership of the order
- Checks if order is already cancelled
- Updates order status to `CANCELLED`
- Sets `cancelled_by` to `CANCELLED_BY_VENDOR`
- Updates assignment status if exists
- **No money is debited** from vehicle owner's wallet

## Balance Check System

### Insufficient Balance Handling

When a vehicle owner doesn't have sufficient balance for auto-cancellation penalty:

1. **Logs Warning**: Prints detailed message about insufficient funds
2. **Continues Cancellation**: Order is still cancelled despite insufficient balance
3. **No Partial Debit**: No money is debited if balance is insufficient
4. **Records Attempt**: The cancellation attempt is logged for audit purposes

**Example Log Message:**
```
Vehicle owner abc-123 does not have enough money. Required: 500, Available: 200
```

## API Usage Examples

### Auto-Cancellation (System Triggered)

Auto-cancellation is triggered automatically by the system. No API call is required.

### Vendor Cancellation

```bash
curl -X PATCH \
  "https://api.dropcars.com/order-assignments/vendor/cancel-order/123" \
  -H "Authorization: Bearer <vendor_jwt_token>" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
    "message": "Order cancelled successfully by vendor",
    "order_id": 123,
    "cancelled_by": "CANCELLED_BY_VENDOR",
    "cancelled_at": "2024-01-15T10:30:00.000Z"
}
```

## Database Schema Updates

### Orders Table

```sql
-- New column for tracking cancellation source
ALTER TABLE orders ADD COLUMN cancelled_by VARCHAR(50);

-- Add enum constraint
ALTER TABLE orders ADD CONSTRAINT chk_cancelled_by 
CHECK (cancelled_by IN ('AUTO_CANCELLED', 'CANCELLED_BY_VENDOR'));
```

### Wallet Ledger Integration

The existing `wallet_ledger` table is used to record auto-cancellation penalties:

```sql
-- Example wallet ledger entry for auto-cancellation
INSERT INTO wallet_ledger (
    vehicle_owner_id,
    reference_id,
    reference_type,
    entry_type,
    amount,
    balance_before,
    balance_after,
    notes
) VALUES (
    'vehicle-owner-uuid',
    'assignment-id',
    'AUTO_CANCELLATION_PENALTY',
    'DEBIT',
    500,
    1000,
    500,
    'Auto-cancellation penalty for order 123'
);
```

## Error Handling

### Auto-Cancellation Errors

- **Database Errors**: Logged and processing continues with other assignments
- **Wallet Errors**: Logged but cancellation still proceeds
- **Insufficient Balance**: Logged with detailed information

### Vendor Cancellation Errors

- **Order Not Found**: Returns 400 with clear error message
- **Permission Denied**: Returns 400 if vendor doesn't own the order
- **Already Cancelled**: Returns 400 if order is already cancelled
- **Database Errors**: Returns 500 with error details

## Security Considerations

1. **Vendor Authentication**: All vendor cancellation requests require valid JWT tokens
2. **Ownership Verification**: Vendors can only cancel their own orders
3. **Idempotency**: Multiple cancellation attempts are handled gracefully
4. **Audit Trail**: All cancellations are logged with timestamps and reasons

## Monitoring and Logging

### Key Metrics to Monitor

1. **Auto-cancellation Rate**: Percentage of orders auto-cancelled
2. **Penalty Collection Rate**: Percentage of penalties successfully collected
3. **Insufficient Balance Rate**: Percentage of failed penalty collections
4. **Vendor Cancellation Rate**: Frequency of vendor-initiated cancellations

### Log Messages

- Auto-cancellation penalties: `"Debited {amount} from vehicle owner {id} for auto-cancellation"`
- Insufficient balance: `"Vehicle owner {id} does not have enough money. Required: {required}, Available: {available}"`
- Processing errors: `"Error processing auto-cancellation for assignment {id}: {error}"`

## Testing

### Test Scenarios

1. **Auto-cancellation with sufficient balance**
2. **Auto-cancellation with insufficient balance**
3. **Vendor cancellation of owned order**
4. **Vendor cancellation of non-owned order**
5. **Cancellation of already cancelled order**
6. **Database error handling during cancellation**

### Test Data Setup

```sql
-- Create test order with assignment
INSERT INTO orders (vendor_id, trip_type, car_type, ...) VALUES (...);
INSERT INTO order_assignments (order_id, vehicle_owner_id, ...) VALUES (...);

-- Set up wallet balance for testing
UPDATE vehicle_owner_details SET wallet_balance = 1000 WHERE vehicle_owner_id = 'test-id';
```

## Migration Guide

### Database Migration

1. **Add cancelled_by column**:
   ```sql
   ALTER TABLE orders ADD COLUMN cancelled_by VARCHAR(50);
   ```

2. **Update existing cancelled orders** (if any):
   ```sql
   UPDATE orders SET cancelled_by = 'AUTO_CANCELLED' WHERE trip_status = 'CANCELLED';
   ```

### Code Deployment

1. Deploy the updated models with the new `cancelled_by` column
2. Deploy the updated CRUD functions
3. Deploy the new API endpoints
4. Update any existing cancellation logic to use the new system

## Future Enhancements

1. **Configurable Penalty Rates**: Allow different penalty calculations
2. **Notification System**: Notify vehicle owners of auto-cancellations
3. **Cancellation Analytics**: Detailed reporting on cancellation patterns
4. **Refund System**: Handle refunds for vendor cancellations
5. **Escalation System**: Handle cases where penalties cannot be collected
