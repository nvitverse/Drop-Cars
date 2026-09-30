# Vendor Order Details API Documentation

## Overview
The Vendor Order Details API allows vendors to retrieve comprehensive information about their orders, including source-specific details for different order types (NEW_ORDERS and HOURLY_RENTAL).

## Endpoint
```
GET /api/v1/order/vendor/{order_id}
```

## Authentication
Requires vendor authentication via JWT token in the Authorization header.

## Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| order_id | integer | Yes | The ID of the order to retrieve details for |

## Response Schema

### Success Response (200 OK)
```json
{
  "id": 123,
  "source": "NEW_ORDERS",
  "source_order_id": 456,
  "vendor_id": "uuid-string",
  "trip_type": "Oneway",
  "car_type": "Sedan",
  "pickup_drop_location": {
    "0": "Chennai",
    "1": "Bangalore"
  },
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "John Doe",
  "customer_number": "9876543210",
  "trip_status": "PENDING",
  "pick_near_city": "Chennai",
  "trip_distance": 350,
  "trip_time": "5 hours 30 mins",
  "estimated_price": 2500,
  "vendor_price": 3000,
  "platform_fees_percent": 10,
  "closed_vendor_price": null,
  "closed_driver_price": null,
  "commision_amount": null,
  "created_at": "2024-01-15T09:00:00Z",
  "cancelled_by": null,
  "max_time_to_assign_order": "2024-01-15T09:15:00Z",
  "toll_charge_update": false,
  "data_visibility_vehicle_owner": false,
  
  "cost_per_km": 8,
  "extra_cost_per_km": 2,
  "driver_allowance": 500,
  "extra_driver_allowance": 100,
  "permit_charges": 200,
  "extra_permit_charges": 50,
  "hill_charges": 300,
  "toll_charges": 150,
  "pickup_notes": "Pick up from airport",
  
  "package_hours": null,
  "cost_per_hour": null,
  "extra_cost_per_hour": null,
  "cost_for_addon_km": null,
  "extra_cost_for_addon_km": null,
  
  "assignments": [
    {
      "id": 789,
      "order_id": 123,
      "vehicle_owner_id": "uuid-string",
      "driver_id": "uuid-string",
      "car_id": "uuid-string",
      "assignment_status": "ASSIGNED",
      "assigned_at": "2024-01-15T09:05:00Z",
      "expires_at": "2024-01-15T09:20:00Z",
      "cancelled_at": null,
      "completed_at": null,
      "created_at": "2024-01-15T09:05:00Z"
    }
  ],
  "end_records": [],
  
  "assigned_driver_name": "Driver Name",
  "assigned_driver_phone": "9876543210",
  "assigned_car_name": "Toyota Innova",
  "assigned_car_number": "TN-01-AB-1234",
  "vehicle_owner_name": "Owner Name",
  "vendor_profit": null,
  "admin_profit": null
}
```

### For HOURLY_RENTAL Orders
```json
{
  "id": 124,
  "source": "HOURLY_RENTAL",
  "source_order_id": 789,
  "vendor_id": "uuid-string",
  "trip_type": "Hourly Rental",
  "car_type": "Sedan",
  "pickup_drop_location": {
    "0": "Chennai Airport"
  },
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "Jane Smith",
  "customer_number": "9876543211",
  "trip_status": "PENDING",
  "pick_near_city": "Chennai",
  "trip_distance": 50,
  "trip_time": "5",
  "estimated_price": 1200,
  "vendor_price": 1500,
  "platform_fees_percent": 10,
  "created_at": "2024-01-15T09:00:00Z",
  "cancelled_by": null,
  "max_time_to_assign_order": "2024-01-15T09:15:00Z",
  "toll_charge_update": false,
  "data_visibility_vehicle_owner": false,
  
  "cost_per_km": null,
  "extra_cost_per_km": null,
  "driver_allowance": null,
  "extra_driver_allowance": null,
  "permit_charges": null,
  "extra_permit_charges": null,
  "hill_charges": null,
  "toll_charges": null,
  "pickup_notes": "Airport pickup",
  
  "package_hours": {
    "hours": 5,
    "km_range": 50
  },
  "cost_per_hour": 200,
  "extra_cost_per_hour": 50,
  "cost_for_addon_km": 10,
  "extra_cost_for_addon_km": 5,
  
  "assignments": [],
  "end_records": [],
  
  "assigned_driver_name": null,
  "assigned_driver_phone": null,
  "assigned_car_name": null,
  "assigned_car_number": null,
  "vehicle_owner_name": null,
  "vendor_profit": null,
  "admin_profit": null
}
```

### Error Responses

#### 404 Not Found
```json
{
  "detail": "Order not found or you don't have permission to view this order"
}
```

#### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

## Field Descriptions

### Common Fields (All Order Types)
- **id**: Master order ID
- **source**: Order source ("NEW_ORDERS" or "HOURLY_RENTAL")
- **source_order_id**: ID in the source table
- **vendor_id**: Vendor UUID
- **trip_type**: Type of trip (Oneway, Round Trip, Multicity, Hourly Rental)
- **car_type**: Type of car requested
- **pickup_drop_location**: JSON object with location indices
- **start_date_time**: Trip start time
- **customer_name**: Customer name
- **customer_number**: Customer phone number
- **trip_status**: Current status (PENDING, COMPLETED, CANCELLED)
- **pick_near_city**: City for driver selection
- **trip_distance**: Total distance in km
- **trip_time**: Estimated trip duration
- **estimated_price**: Customer-facing price
- **vendor_price**: Vendor's price
- **platform_fees_percent**: Platform commission percentage
- **created_at**: Order creation timestamp
- **cancelled_by**: Cancellation reason (if cancelled)
- **max_time_to_assign_order**: Deadline for order assignment
- **toll_charge_update**: Whether toll charges can be updated
- **data_visibility_vehicle_owner**: Whether vehicle owners can see customer data

### NEW_ORDERS Specific Fields
- **cost_per_km**: Base cost per kilometer
- **extra_cost_per_km**: Additional cost per kilometer
- **driver_allowance**: Driver allowance amount
- **extra_driver_allowance**: Additional driver allowance
- **permit_charges**: Permit charges
- **extra_permit_charges**: Additional permit charges
- **hill_charges**: Hill station charges
- **toll_charges**: Toll charges
- **pickup_notes**: Special pickup instructions

### HOURLY_RENTAL Specific Fields
- **package_hours**: JSON object with hours and km_range
- **cost_per_hour**: Base cost per hour
- **extra_cost_per_hour**: Additional cost per hour
- **cost_for_addon_km**: Cost for additional kilometers
- **extra_cost_for_addon_km**: Additional cost for extra km
- **pickup_notes**: Special pickup instructions

### Assignment Information
- **assignments**: Array of assignment records
- **end_records**: Array of trip completion records
- **assigned_driver_name**: Name of assigned driver
- **assigned_driver_phone**: Phone number of assigned driver
- **assigned_car_name**: Name of assigned car
- **assigned_car_number**: License plate of assigned car
- **vehicle_owner_name**: Name of vehicle owner

## Validation Rules

1. **Order Existence**: The order with the specified ID must exist
2. **Vendor Ownership**: The order must belong to the authenticated vendor
3. **Authentication**: Valid JWT token required

## Example Usage

### cURL Example
```bash
curl -X GET "http://localhost:8000/api/v1/order/vendor/123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Python Example
```python
import requests

url = "http://localhost:8000/api/v1/order/vendor/123"
headers = {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    order_details = response.json()
    print(f"Order Type: {order_details['trip_type']}")
    print(f"Customer: {order_details['customer_name']}")
    print(f"Status: {order_details['trip_status']}")
    
    # Check source-specific fields
    if order_details['source'] == 'NEW_ORDERS':
        print(f"Cost per km: {order_details['cost_per_km']}")
    elif order_details['source'] == 'HOURLY_RENTAL':
        print(f"Package hours: {order_details['package_hours']}")
else:
    print(f"Error: {response.json()['detail']}")
```

## Testing

Use the provided test script `test_recreate_order.py` to test both APIs:

```bash
python test_recreate_order.py
```

The test script includes:
- Recreate order API testing
- Vendor order details API testing
- Source-specific field validation
- Error handling tests

## Notes

- The API returns comprehensive order information including source-specific details
- Source-specific fields are populated based on the order source (NEW_ORDERS vs HOURLY_RENTAL)
- Assignment and end record information is included when available
- Driver and car information is limited to basic details (names and phone numbers)
- Sensitive personal information is excluded for security
- The API supports all order types: oneway, roundtrip, multicity, and hourly rental
