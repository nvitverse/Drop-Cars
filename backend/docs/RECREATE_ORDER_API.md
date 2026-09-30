# Recreate Order API Documentation

## Overview
The Recreate Order API allows vendors to recreate orders that were previously auto-cancelled. This API validates vendor ownership and order status before creating a new order with the same details.

## Endpoint
```
POST /api/v1/new-orders/recreate
```

## Authentication
Requires vendor authentication via JWT token in the Authorization header.

## Request Schema

### RecreateOrderRequest
```json
{
  "order_id": 123,
  "max_time_to_assign_order": 30
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| order_id | integer | Yes | The ID of the order to recreate |
| max_time_to_assign_order | integer | No | Maximum time in minutes to assign the order (default: 15 minutes) |

## Response Schema

### Success Response (201 Created)
For NEW_ORDERS source:
```json
{
  "order_id": 456,
  "trip_status": "PENDING",
  "pick_near_city": "Chennai",
  "trip_type": "Oneway",
  "vendor_price": 2500,
  "estimated_price": 2000,
  "trip_time": "2 hours 30 mins",
  "source": "NEW_ORDERS"
}
```

For HOURLY_RENTAL source:
```json
{
  "order_id": 456,
  "order_status": "PENDING",
  "picup_near_city": "Chennai",
  "vendor_price": 1500,
  "estimated_price": 1200,
  "trip_type": "Hourly Rental",
  "trip_time": "5",
  "source": "HOURLY_RENTAL"
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "detail": "Order not found"
}
```

```json
{
  "detail": "Order does not belong to the current vendor"
}
```

```json
{
  "detail": "Order can only be recreated if it was auto_cancelled"
}
```

#### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

#### 500 Internal Server Error
```json
{
  "detail": "Failed to recreate order: [error details]"
}
```

## Validation Rules

1. **Order Existence**: The order with the specified ID must exist in the database.

2. **Vendor Ownership**: The order must belong to the authenticated vendor.

3. **Cancellation Status**: The order must have been auto_cancelled (`cancelled_by = "AUTO_CANCELLED"`).

4. **Source Order**: The source order (NEW_ORDERS or HOURLY_RENTAL) must exist and be valid.

## Supported Order Types

The API supports recreating all order types:
- **Oneway**: Single destination trips
- **Round Trip**: Return trips
- **Multicity**: Multi-destination trips  
- **Hourly Rental**: Time-based rentals

## Business Logic

1. **Data Preservation**: All original order data is preserved including:
   - Customer details
   - Pickup/drop locations
   - Pricing information
   - Trip configuration
   - Vendor settings

2. **New Order Creation**: A completely new order is created with:
   - New order ID
   - Fresh timestamps
   - PENDING status
   - Same vendor assignment

3. **Master Order**: A new master order is created linking to the new source order

4. **Notifications**: Vehicle owners are notified of the new order

## Example Usage

### cURL Example
```bash
curl -X POST "http://localhost:8000/api/v1/new-orders/recreate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "order_id": 123,
    "max_time_to_assign_order": 30
  }'
```

### Python Example
```python
import requests

url = "http://localhost:8000/api/v1/new-orders/recreate"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN"
}
payload = {
    "order_id": 123,
    "max_time_to_assign_order": 30  # Optional, defaults to 15
}

response = requests.post(url, json=payload, headers=headers)
if response.status_code == 201:
    new_order = response.json()
    print(f"New order created with ID: {new_order['order_id']}")
else:
    print(f"Error: {response.json()['detail']}")
```

## Testing

Use the provided test script `test_recreate_order.py` to test the API functionality:

```bash
python test_recreate_order.py
```

Make sure to:
1. Start your FastAPI server
2. Replace test order IDs with actual values from your database
3. Add proper authentication headers
4. Ensure you have auto_cancelled orders in your database

## Notes

- The API creates a completely new order, not a copy or reference to the old one
- All timestamps are updated to the current time
- The order status is reset to PENDING
- Vehicle owners receive notifications about the new order
- The original order remains unchanged in the database
