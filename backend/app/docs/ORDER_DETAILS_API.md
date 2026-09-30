# Order Details API Documentation

## Overview

The Order Details API provides comprehensive order information with different access levels for admin and vendor users. This API allows retrieving full order details including all related data such as assignments, end records, and user information.

## Features

- **Admin Access**: Full order details with all related data including sensitive user information
- **Vendor Access**: Limited order details excluding sensitive user data
- **Role-Based Security**: Different data exposure based on user role
- **Comprehensive Data**: Includes assignments, end records, driver, car, and vehicle owner information

## API Endpoints

### 1. Get Admin Order Details

**GET** `/api/orders/admin/{order_id}`

Retrieves full order details for admin users with all related data including sensitive user information.

**Authentication:** Admin JWT token required

**Path Parameters:**
- `order_id` (integer): The ID of the order to retrieve

**Response (200 OK):**
```json
{
  "id": 123,
  "source": "NEW_ORDERS",
  "source_order_id": 456,
  "vendor_id": "550e8400-e29b-41d4-a716-446655440000",
  "trip_type": "Oneway",
  "car_type": "Sedan",
  "pickup_drop_location": {
    "pickup": "Airport Terminal 1",
    "drop": "City Center Hotel"
  },
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "John Doe",
  "customer_number": "9876543210",
  "trip_status": "COMPLETED",
  "pick_near_city": "Mumbai",
  "trip_distance": 45,
  "trip_time": "2 hours",
  "estimated_price": 2500,
  "vendor_price": 2200,
  "platform_fees_percent": 10,
  "closed_vendor_price": 2200,
  "closed_driver_price": 1800,
  "commision_amount": 400,
  "created_at": "2024-01-15T08:00:00Z",
  "vendor": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "full_name": "Vendor Name",
    "primary_number": "9876543210",
    "secondary_number": "9876543211",
    "gpay_number": "9876543210",
    "aadhar_number": "123456789012",
    "address": "Vendor Address",
    "wallet_balance": 5000,
    "bank_balance": 10000,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "assignments": [
    {
      "id": 1,
      "order_id": 123,
      "vehicle_owner_id": "660e8400-e29b-41d4-a716-446655440001",
      "driver_id": "770e8400-e29b-41d4-a716-446655440002",
      "car_id": "880e8400-e29b-41d4-a716-446655440003",
      "assignment_status": "COMPLETED",
      "assigned_at": "2024-01-15T09:00:00Z",
      "expires_at": "2024-01-15T10:00:00Z",
      "cancelled_at": null,
      "completed_at": "2024-01-15T12:00:00Z",
      "created_at": "2024-01-15T08:30:00Z"
    }
  ],
  "end_records": [
    {
      "id": 1,
      "order_id": 123,
      "driver_id": "770e8400-e29b-41d4-a716-446655440002",
      "start_km": 1000,
      "end_km": 1045,
      "contact_number": "9876543210",
      "img_url": "https://storage.googleapis.com/bucket/speedometer.jpg",
      "close_speedometer_image": "https://storage.googleapis.com/bucket/close_speedometer.jpg",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T12:00:00Z"
    }
  ],
  "assigned_driver": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "full_name": "Driver Name",
    "primary_number": "9876543212",
    "secondary_number": "9876543213",
    "licence_number": "DL1234567890123",
    "address": "Driver Address",
    "driver_status": "ONLINE",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "assigned_car": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "car_name": "Toyota Camry",
    "car_type": "SEDAN",
    "car_number": "MH01AB1234",
    "car_status": "ACTIVE",
    "rc_front_img_url": "https://storage.googleapis.com/bucket/rc_front.jpg",
    "rc_back_img_url": "https://storage.googleapis.com/bucket/rc_back.jpg",
    "insurance_img_url": "https://storage.googleapis.com/bucket/insurance.jpg",
    "fc_img_url": "https://storage.googleapis.com/bucket/fc.jpg",
    "car_img_url": "https://storage.googleapis.com/bucket/car.jpg",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "vehicle_owner": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "full_name": "Vehicle Owner Name",
    "primary_number": "9876543214",
    "secondary_number": "9876543215",
    "address": "Owner Address",
    "account_status": "ACTIVE",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "detail": "Could not validate credentials"
}
```

**404 Not Found:**
```json
{
  "detail": "Order not found"
}
```

---

### 2. Get Vendor Order Details

**GET** `/api/orders/vendor/{order_id}`

Retrieves limited order details for vendor users with order-related data but excluding sensitive user information.

**Authentication:** Vendor JWT token required

**Path Parameters:**
- `order_id` (integer): The ID of the order to retrieve

**Response (200 OK):**
```json
{
  "id": 123,
  "source": "NEW_ORDERS",
  "source_order_id": 456,
  "vendor_id": "550e8400-e29b-41d4-a716-446655440000",
  "trip_type": "Oneway",
  "car_type": "Sedan",
  "pickup_drop_location": {
    "pickup": "Airport Terminal 1",
    "drop": "City Center Hotel"
  },
  "start_date_time": "2024-01-15T10:00:00Z",
  "customer_name": "John Doe",
  "customer_number": "9876543210",
  "trip_status": "COMPLETED",
  "pick_near_city": "Mumbai",
  "trip_distance": 45,
  "trip_time": "2 hours",
  "estimated_price": 2500,
  "vendor_price": 2200,
  "platform_fees_percent": 10,
  "closed_vendor_price": 2200,
  "closed_driver_price": 1800,
  "commision_amount": 400,
  "created_at": "2024-01-15T08:00:00Z",
  "assignments": [
    {
      "id": 1,
      "order_id": 123,
      "vehicle_owner_id": "660e8400-e29b-41d4-a716-446655440001",
      "driver_id": "770e8400-e29b-41d4-a716-446655440002",
      "car_id": "880e8400-e29b-41d4-a716-446655440003",
      "assignment_status": "COMPLETED",
      "assigned_at": "2024-01-15T09:00:00Z",
      "expires_at": "2024-01-15T10:00:00Z",
      "cancelled_at": null,
      "completed_at": "2024-01-15T12:00:00Z",
      "created_at": "2024-01-15T08:30:00Z"
    }
  ],
  "end_records": [
    {
      "id": 1,
      "order_id": 123,
      "driver_id": "770e8400-e29b-41d4-a716-446655440002",
      "start_km": 1000,
      "end_km": 1045,
      "contact_number": "9876543210",
      "img_url": "https://storage.googleapis.com/bucket/speedometer.jpg",
      "close_speedometer_image": "https://storage.googleapis.com/bucket/close_speedometer.jpg",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T12:00:00Z"
    }
  ],
  "assigned_driver_name": "Driver Name",
  "assigned_driver_phone": "9876543212",
  "assigned_car_name": "Toyota Camry",
  "assigned_car_number": "MH01AB1234",
  "vehicle_owner_name": "Vehicle Owner Name"
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "detail": "Could not validate credentials"
}
```

**404 Not Found:**
```json
{
  "detail": "Order not found or you don't have permission to view this order"
}
```

---

## Data Models

### AdminOrderDetailResponse
Complete order details with all related data for admin users.

**Fields:**
- `id`: Order ID
- `source`: Order source (NEW_ORDERS, HOURLY_RENTAL)
- `source_order_id`: Source system order ID
- `vendor_id`: Vendor UUID
- `trip_type`: Type of trip (Oneway, Round Trip, etc.)
- `car_type`: Car type (Sedan, SUV, etc.)
- `pickup_drop_location`: JSON object with pickup and drop locations
- `start_date_time`: Trip start date and time
- `customer_name`: Customer name
- `customer_number`: Customer phone number
- `trip_status`: Current trip status
- `pick_near_city`: Pickup city
- `trip_distance`: Trip distance in km
- `trip_time`: Estimated trip time
- `estimated_price`: Estimated trip price
- `vendor_price`: Vendor price
- `platform_fees_percent`: Platform fee percentage
- `closed_vendor_price`: Final vendor price
- `closed_driver_price`: Final driver price
- `commision_amount`: Commission amount
- `created_at`: Order creation timestamp
- `vendor`: Complete vendor information
- `assignments`: List of order assignments
- `end_records`: List of end records
- `assigned_driver`: Complete driver information
- `assigned_car`: Complete car information
- `vehicle_owner`: Complete vehicle owner information

### VendorOrderDetailResponse
Limited order details for vendor users, excluding sensitive user data.

**Fields:**
- All order fields (same as admin response)
- `assignments`: List of order assignments
- `end_records`: List of end records
- `assigned_driver_name`: Driver name only
- `assigned_driver_phone`: Driver phone only
- `assigned_car_name`: Car name only
- `assigned_car_number`: Car number only
- `vehicle_owner_name`: Vehicle owner name only

**Excluded Fields:**
- Complete vendor information
- Complete driver information (address, license, etc.)
- Complete car information (images, status, etc.)
- Complete vehicle owner information (address, etc.)

---

## Security Features

### Role-Based Access Control
- **Admin**: Full access to all order data including sensitive user information
- **Vendor**: Limited access to order data, excluding sensitive user information

### Data Privacy
- Vendor responses exclude personal addresses, IDs, and other sensitive information
- Only essential contact information (names and phone numbers) is provided to vendors
- Complete user profiles are only accessible to admin users

### Authentication
- Both endpoints require valid JWT tokens
- Admin endpoint requires admin role
- Vendor endpoint requires vendor role and ownership verification

---

## Usage Examples

### Admin Request
```bash
curl -X GET "http://localhost:8000/api/orders/admin/123" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Vendor Request
```bash
curl -X GET "http://localhost:8000/api/orders/vendor/123" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "detail": "Invalid order ID format"
}
```

**401 Unauthorized:**
```json
{
  "detail": "Could not validate credentials"
}
```

**403 Forbidden:**
```json
{
  "detail": "Insufficient permissions"
}
```

**404 Not Found:**
```json
{
  "detail": "Order not found"
}
```

**500 Internal Server Error:**
```json
{
  "detail": "Internal server error"
}
```

---

## Best Practices

### For Developers
- Always validate JWT tokens before processing requests
- Check user permissions and order ownership
- Handle missing related data gracefully
- Use appropriate HTTP status codes
- Implement proper error handling

### For API Consumers
- Include valid JWT tokens in Authorization header
- Handle different response formats for admin vs vendor
- Implement proper error handling for all status codes
- Cache responses appropriately to reduce API calls
- Respect rate limits and usage guidelines
