# Order Cancellation API - Quick Reference

## Overview
This document provides a quick reference for the order cancellation system APIs and functionality.

## API Endpoints

### Vendor Cancellation
**Cancel an order (no penalty charged)**

```
PATCH /order-assignments/vendor/cancel-order/{order_id}
```

**Headers:**
```
Authorization: Bearer <vendor_jwt_token>
Content-Type: application/json
```

**Parameters:**
- `order_id` (path): The ID of the order to cancel

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
- `400`: Order not found, already cancelled, or permission denied
- `401`: Invalid or missing authentication token
- `500`: Internal server error

## Auto-Cancellation System

### How It Works
- **Trigger**: Automatic when `max_time_to_assign_order` is exceeded
- **Condition**: Assignment status is `PENDING` with no driver/car assigned
- **Penalty**: `vendor_price - estimated_price` debited from vehicle owner's wallet
- **Status Updates**: Order and assignment marked as `CANCELLED`

### Balance Check
- **Sufficient Balance**: Penalty is debited and recorded in wallet ledger
- **Insufficient Balance**: Warning logged, cancellation proceeds without debit

## Database Schema

### Orders Table
```sql
-- New column added
cancelled_by VARCHAR(50) -- 'AUTO_CANCELLED' or 'CANCELLED_BY_VENDOR'
```

### Wallet Ledger Integration
Auto-cancellation penalties are recorded with:
- `reference_type`: `AUTO_CANCELLATION_PENALTY`
- `reference_id`: Assignment ID
- `entry_type`: `DEBIT`
- `amount`: Calculated penalty amount

## Usage Examples

### cURL Example
```bash
# Vendor cancels order
curl -X PATCH \
  "https://api.dropcars.com/order-assignments/vendor/cancel-order/123" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Python Example
```python
import requests

# Vendor cancellation
headers = {
    "Authorization": "Bearer <vendor_jwt_token>",
    "Content-Type": "application/json"
}

response = requests.patch(
    "https://api.dropcars.com/order-assignments/vendor/cancel-order/123",
    headers=headers
)

if response.status_code == 200:
    result = response.json()
    print(f"Order {result['order_id']} cancelled successfully")
else:
    print(f"Error: {response.json()['detail']}")
```

## Key Differences

| Feature | Auto-Cancellation | Vendor Cancellation |
|---------|------------------|-------------------|
| **Trigger** | System automatic | Manual API call |
| **Penalty** | Yes (debit from wallet) | No penalty |
| **Balance Check** | Yes | No |
| **Wallet Ledger** | Yes | No |
| **Authentication** | System | Vendor JWT required |
| **cancelled_by** | `AUTO_CANCELLED` | `CANCELLED_BY_VENDOR` |

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 400 | Bad Request | Check order ID and vendor permissions |
| 401 | Unauthorized | Verify JWT token is valid and not expired |
| 500 | Internal Server Error | Check server logs and database connectivity |

## Monitoring

### Key Log Messages
- `"Debited {amount} from vehicle owner {id} for auto-cancellation"`
- `"Vehicle owner {id} does not have enough money. Required: {required}, Available: {available}"`
- `"Error processing auto-cancellation for assignment {id}: {error}"`

### Metrics to Track
- Auto-cancellation rate
- Penalty collection success rate
- Insufficient balance incidents
- Vendor cancellation frequency

## Database Migration

```sql
-- Add cancelled_by column
ALTER TABLE orders ADD COLUMN cancelled_by VARCHAR(50);

-- Add constraint
ALTER TABLE orders ADD CONSTRAINT chk_cancelled_by 
CHECK (cancelled_by IN ('AUTO_CANCELLED', 'CANCELLED_BY_VENDOR'));

-- Update existing cancelled orders
UPDATE orders SET cancelled_by = 'AUTO_CANCELLED' WHERE trip_status = 'CANCELLED';
```

## Testing Checklist

### Auto-Cancellation Tests
- [ ] Sufficient balance scenario
- [ ] Insufficient balance scenario
- [ ] Database error handling
- [ ] Multiple assignment processing

### Vendor Cancellation Tests
- [ ] Valid cancellation
- [ ] Unauthorized access
- [ ] Already cancelled order
- [ ] Non-existent order

## Support

For issues or questions:
1. Check application logs for detailed error messages
2. Verify wallet ledger entries for transaction history
3. Confirm database schema matches expected structure
4. Validate JWT token authentication

## Related Documentation
- [Order Cancellation API Documentation](./ORDER_CANCELLATION_API.md)
- [Cancellation System Summary](./CANCELLATION_SYSTEM_SUMMARY.md)
