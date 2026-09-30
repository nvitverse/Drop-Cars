# Vehicle Owner Orders API Documentation

This document describes the API endpoints for vehicle owners to retrieve order details based on assignment status.

## Overview

Vehicle owners can access two main endpoints to view their assigned orders:
1. **Pending Orders**: Orders with assignment_status = 'PENDING'
2. **Non-Pending Orders**: Orders with assignment_status != 'PENDING' (ASSIGNED, CANCELLED, COMPLETED, DRIVING)

Both endpoints require JWT authentication and automatically filter orders based on the vehicle owner's ID extracted from the token.

## Authentication

All endpoints require Bearer token authentication. The vehicle owner ID is automatically extracted from the JWT token.

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

## API Endpoints

### 1. Get Pending Orders

**Endpoint:** `GET /orders/vehicle-owner/pending`

**Description:** Retrieves all orders assigned to the authenticated vehicle owner where the assignment status is 'PENDING'.

**Authentication:** Required (Vehicle Owner JWT Token)

**Response Model:** `List[VehicleOwnerOrderDetailResponse]`

**Example Request:**
```bash
curl -X GET "http://localhost:8000/orders/vehicle-owner/pending" \
  -H "Authorization: Bearer <vehicle_owner_jwt_token>" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
[
  {
    "id": 123,
    "source": "NEW_ORDERS",
    "source_order_id": 456,
    "vendor_id": "550e8400-e29b-41d4-a716-446655440000",
    "trip_type": "ONE_WAY",
    "car_type": "SEDAN",
    "pickup_drop_location": {
      "pickup": {
        "address": "Airport Terminal 1",
        "coordinates": {"lat": 12.9716, "lng": 77.5946}
      },
      "drop": {
        "address": "City Center Mall",
        "coordinates": {"lat": 12.9716, "lng": 77.5946}
      }
    },
    "start_date_time": "2024-01-15T10:30:00Z",
    "customer_name": "John Doe",
    "customer_number": "+919876543210",
    "trip_status": "CONFIRMED",
    "pick_near_city": "Bangalore",
    "trip_distance": 25,
    "trip_time": "45 minutes",
    "estimated_price": 500,
    "vendor_price": 400,
    "platform_fees_percent": 20,
    "closed_vendor_price": null,
    "closed_driver_price": null,
    "commision_amount": null,
    "created_at": "2024-01-15T09:00:00Z",
    "assignment_id": 789,
    "assignment_status": "PENDING",
    "assigned_at": null,
    "expires_at": null,
    "cancelled_at": null,
    "completed_at": null,
    "assignment_created_at": "2024-01-15T09:15:00Z",
    "vendor_name": "ABC Travels",
    "vendor_phone": "+919876543211",
    "assigned_driver_name": null,
    "assigned_driver_phone": null,
    "assigned_car_name": null,
    "assigned_car_number": null
  }
]
```

### 2. Get Non-Pending Orders

**Endpoint:** `GET /orders/vehicle-owner/non-pending`

**Description:** Retrieves all orders assigned to the authenticated vehicle owner where the assignment status is NOT 'PENDING'. This includes orders with status: ASSIGNED, CANCELLED, COMPLETED, DRIVING.

**Authentication:** Required (Vehicle Owner JWT Token)

**Response Model:** `List[VehicleOwnerOrderDetailResponse]`

**Example Request:**
```bash
curl -X GET "http://localhost:8000/orders/vehicle-owner/non-pending" \
  -H "Authorization: Bearer <vehicle_owner_jwt_token>" \
  -H "Content-Type: application/json"
```

**Example Response:**
```json
[
  {
    "id": 124,
    "source": "HOURLY_RENTAL",
    "source_order_id": 457,
    "vendor_id": "550e8400-e29b-41d4-a716-446655440001",
    "trip_type": "ROUND_TRIP",
    "car_type": "SUV",
    "pickup_drop_location": {
      "pickup": {
        "address": "Hotel Grand Plaza",
        "coordinates": {"lat": 12.9716, "lng": 77.5946}
      },
      "drop": {
        "address": "Hotel Grand Plaza",
        "coordinates": {"lat": 12.9716, "lng": 77.5946}
      }
    },
    "start_date_time": "2024-01-14T14:00:00Z",
    "customer_name": "Jane Smith",
    "customer_number": "+919876543212",
    "trip_status": "IN_PROGRESS",
    "pick_near_city": "Bangalore",
    "trip_distance": 60,
    "trip_time": "2 hours",
    "estimated_price": 1200,
    "vendor_price": 1000,
    "platform_fees_percent": 20,
    "closed_vendor_price": null,
    "closed_driver_price": null,
    "commision_amount": null,
    "created_at": "2024-01-14T13:00:00Z",
    "assignment_id": 790,
    "assignment_status": "ASSIGNED",
    "assigned_at": "2024-01-14T13:30:00Z",
    "expires_at": "2024-01-14T15:30:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "assignment_created_at": "2024-01-14T13:15:00Z",
    "vendor_name": "XYZ Tours",
    "vendor_phone": "+919876543213",
    "assigned_driver_name": "Raj Kumar",
    "assigned_driver_phone": "+919876543214",
    "assigned_car_name": "Toyota Innova",
    "assigned_car_number": "KA01AB1234"
  }
]
```

## Response Schema

### VehicleOwnerOrderDetailResponse

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Order ID |
| `source` | string | Source of the order (NEW_ORDERS, HOURLY_RENTAL) |
| `source_order_id` | integer | Original order ID from source system |
| `vendor_id` | UUID | Vendor ID who created the order |
| `trip_type` | string | Type of trip (ONE_WAY, ROUND_TRIP, MULTI_CITY) |
| `car_type` | string | Required car type (SEDAN, SUV, HATCHBACK, etc.) |
| `pickup_drop_location` | object | Pickup and drop location details with coordinates |
| `start_date_time` | datetime | Scheduled start time of the trip |
| `customer_name` | string | Customer's name |
| `customer_number` | string | Customer's contact number |
| `trip_status` | string | Current status of the trip |
| `pick_near_city` | string | City where pickup is located |
| `trip_distance` | integer | Estimated distance in kilometers |
| `trip_time` | string | Estimated trip duration |
| `estimated_price` | integer | Estimated price for the trip |
| `vendor_price` | integer | Price offered by vendor |
| `platform_fees_percent` | integer | Platform commission percentage |
| `closed_vendor_price` | integer | Final vendor price (set when trip is completed) |
| `closed_driver_price` | integer | Final driver price (set when trip is completed) |
| `commision_amount` | integer | Commission amount (set when trip is completed) |
| `created_at` | datetime | Order creation timestamp |
| `assignment_id` | integer | Assignment ID for this vehicle owner |
| `assignment_status` | string | Assignment status (PENDING, ASSIGNED, CANCELLED, COMPLETED, DRIVING) |
| `assigned_at` | datetime | When the assignment was confirmed |
| `expires_at` | datetime | When the assignment expires |
| `cancelled_at` | datetime | When the assignment was cancelled |
| `completed_at` | datetime | When the assignment was completed |
| `assignment_created_at` | datetime | Assignment creation timestamp |
| `vendor_name` | string | Vendor's business name |
| `vendor_phone` | string | Vendor's primary contact number |
| `assigned_driver_name` | string | Name of assigned driver (if any) |
| `assigned_driver_phone` | string | Phone number of assigned driver (if any) |
| `assigned_car_name` | string | Name/model of assigned car (if any) |
| `assigned_car_number` | string | Registration number of assigned car (if any) |

## Assignment Status Values

| Status | Description |
|--------|-------------|
| `PENDING` | Order assigned to vehicle owner but not yet confirmed |
| `ASSIGNED` | Order confirmed and driver/car assigned |
| `CANCELLED` | Assignment was cancelled |
| `COMPLETED` | Trip has been completed |
| `DRIVING` | Trip is currently in progress |

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Error retrieving pending orders: <error_message>"
}
```

## Usage Examples

### JavaScript/Fetch API
```javascript
// Get pending orders
const getPendingOrders = async (token) => {
  const response = await fetch('/orders/vehicle-owner/pending', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.ok) {
    const orders = await response.json();
    console.log('Pending orders:', orders);
    return orders;
  } else {
    throw new Error('Failed to fetch pending orders');
  }
};

// Get non-pending orders
const getNonPendingOrders = async (token) => {
  const response = await fetch('/orders/vehicle-owner/non-pending', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.ok) {
    const orders = await response.json();
    console.log('Non-pending orders:', orders);
    return orders;
  } else {
    throw new Error('Failed to fetch non-pending orders');
  }
};
```

### Python Requests
```python
import requests

def get_vehicle_owner_orders(token, endpoint):
    url = f"http://localhost:8000/orders/vehicle-owner/{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        return response.json()
    else:
        response.raise_for_status()

# Usage
pending_orders = get_vehicle_owner_orders(token, "pending")
non_pending_orders = get_vehicle_owner_orders(token, "non-pending")
```

## Notes

1. **Authentication**: Both endpoints require a valid JWT token for vehicle owners. The vehicle owner ID is automatically extracted from the token.

2. **Filtering**: Orders are automatically filtered based on the authenticated vehicle owner's ID and the specified assignment status.

3. **Ordering**: Results are ordered by order creation time (newest first).

4. **Data Privacy**: Sensitive information like addresses, IDs, and personal details are not included in the response for security reasons.

5. **Real-time Updates**: These endpoints provide current data. For real-time updates, consider implementing WebSocket connections or polling mechanisms.

6. **Pagination**: Currently, all results are returned in a single response. For large datasets, consider implementing pagination.

## Related Endpoints

- `GET /orders/admin/{order_id}` - Get detailed order information for admins
- `GET /orders/vendor/{order_id}` - Get limited order information for vendors
- `GET /orders/vendor` - Get all orders for authenticated vendor
- `GET /orders/pending/vendor` - Get pending orders for authenticated vendor