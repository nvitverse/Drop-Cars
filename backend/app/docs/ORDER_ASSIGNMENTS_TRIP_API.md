### POST /order-assignments/driver/end-trip/{order_id}

Form fields:
- `end_km` (int, required)
- `toll_charge_update` (bool, optional)
- `updated_toll_charges` (int, required if `toll_charge_update` is true)
- `close_speedometer_img` (file, required)

Behavior:
- Validates `updated_toll_charges` presence when `toll_charge_update` is true.
- Validates `end_km - start_km` > `trip_distance` when `trip_distance` exists.
- Recalculates fare and computes/stores `vendor_profit`, `admin_profit`, `driver_profit` on `orders`.
- Credits vendor wallet with vendor profit and records an entry in `vendor_wallet_ledger` with `order_id` mapping.
# Order Assignments and Trip Management APIs

## Overview
This document describes the new APIs implemented for order assignments and trip management functionality. The system now maps order assignments to the `orders` table instead of `new_orders` table and includes comprehensive trip management features.

## API Endpoints

### 1. Order Assignment APIs

#### 1.1 Accept Order
**Endpoint:** `POST /api/users/assignments/acceptorder`
**Authentication:** Vehicle Owner Token Required
**Description:** Accept an order and create assignment with balance check

**Request Body:**
```json
{
    "order_id": 1
}
```

**Response:**
```json
{
    "id": 1,
    "order_id": 1,
    "vehicle_owner_id": "uuid",
    "driver_id": null,
    "car_id": null,
    "assignment_status": "PENDING",
    "assigned_at": null,
    "expires_at": "2025-01-01T12:00:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "created_at": "2025-01-01T11:00:00Z"
}
```

**Features:**
- Checks vehicle owner balance before accepting
- Creates assignment with PENDING status
- Sets expiry time (1 hour from creation)

#### 1.2 Assign Car and Driver
**Endpoint:** `PATCH /api/users/assignments/{assignment_id}/assign-car-driver`
**Authentication:** Vehicle Owner Token Required
**Description:** Assign car and driver to an accepted order

**Request Body:**
```json
{
    "driver_id": "uuid",
    "car_id": "uuid"
}
```

**Response:**
```json
{
    "id": 1,
    "order_id": 1,
    "vehicle_owner_id": "uuid",
    "driver_id": "uuid",
    "car_id": "uuid",
    "assignment_status": "ASSIGNED",
    "assigned_at": "2025-01-01T11:30:00Z",
    "expires_at": "2025-01-01T12:00:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "created_at": "2025-01-01T11:00:00Z"
}
```

**Features:**
- Updates assignment status to ASSIGNED
- Sets assigned_at timestamp
- Validates vehicle owner authorization

### 2. Driver APIs

#### 2.1 Get Driver Assigned Orders
**Endpoint:** `GET /api/users/assignments/driver/assigned-orders`
**Authentication:** Driver Token Required
**Description:** Get all ASSIGNED orders for the authenticated driver

**Response:**
```json
[
    {
        "id": 1,
        "order_id": 1,
        "assignment_status": "ASSIGNED",
        "customer_name": "John Doe",
        "customer_number": "9876543210",
        "pickup_drop_location": {"0": "Mumbai", "1": "Delhi"},
        "start_date_time": "2025-01-01T10:00:00Z",
        "trip_type": "Oneway",
        "car_type": "Sedan",
        "estimated_price": 2000,
        "assigned_at": "2025-01-01T11:30:00Z",
        "created_at": "2025-01-01T11:00:00Z"
    }
]
```

**Features:**
- Returns only ASSIGNED orders for the driver
- Includes order details and customer information
- Ordered by assigned_at timestamp (newest first)

#### 2.2 Start Trip
**Endpoint:** `POST /api/users/assignments/driver/start-trip/{order_id}`
**Authentication:** Driver Token Required
**Description:** Start trip by uploading start KM and speedometer image

**Request Body (Form Data):**
- `start_km`: Integer (starting kilometer reading)
- `speedometer_img`: Image file

**Response:**
```json
{
    "message": "Trip started successfully",
    "end_record_id": 1,
    "start_km": 1000,
    "speedometer_img_url": "https://storage.googleapis.com/..."
}
```

**Features:**
- Creates trip record in end_records table
- Updates assignment status to DRIVING
- Updates driver status to DRIVING
- Uploads speedometer image to GCS
- Validates driver is assigned to the order

#### 2.3 End Trip
**Endpoint:** `POST /api/users/assignments/driver/end-trip/{order_id}`
**Authentication:** Driver Token Required
**Description:** End trip by uploading end KM, contact number, and speedometer image

**Request Body (Form Data):**
- `end_km`: Integer (ending kilometer reading)
- `contact_number`: String (10-digit Indian mobile number)
- `speedometer_img`: Image file

**Response:**
```json
{
    "message": "Trip ended successfully",
    "end_record_id": 1,
    "end_km": 1050,
    "speedometer_img_url": "https://storage.googleapis.com/...",
    "total_km": 50,
    "calculated_fare": 2000,
    "driver_amount": 1400,
    "vehicle_owner_amount": 600
}
```

**Features:**
- Calculates total kilometers (end_km - start_km)
- Calculates fare based on order pricing
- Debits amount from vehicle owner wallet
- Updates assignment status to COMPLETED
- Updates driver status back to ONLINE
- Uploads end speedometer image to GCS
- Validates trip was started

#### 2.4 Driver Trip History
**Endpoint:** `GET /api/users/assignments/driver/trip-history`
**Authentication:** Driver Token Required
**Description:** Get driver's completed trip history

**Response:**
```json
[
    {
        "id": 1,
        "order_id": 1,
        "customer_name": "John Doe",
        "customer_number": "9876543210",
        "start_km": 1000,
        "end_km": 1050,
        "total_km": 50,
        "contact_number": "9876543210",
        "img_url": "https://storage.googleapis.com/...",
        "created_at": "2025-01-01T11:00:00Z",
        "trip_type": "Oneway",
        "estimated_price": 2000
    }
]
```

**Features:**
- Returns only completed trips (end_km > 0)
- Ordered by created_at timestamp (newest first)
- Includes trip details and fare information

## Database Changes

### 1. Order Assignments Model
- **Updated:** `order_id` now references `orders.id` instead of `new_orders.order_id`
- **New Fields:** All existing fields maintained
- **Status Flow:** PENDING → ASSIGNED → DRIVING → COMPLETED

### 2. End Records Model
- **Table:** `end_records`
- **Fields:**
  - `id`: Primary key
  - `order_id`: References `orders.id`
  - `driver_id`: References `car_driver.id`
  - `start_km`: Starting kilometer reading
  - `end_km`: Ending kilometer reading
  - `contact_number`: Customer contact number
  - `img_url`: Speedometer image URL
  - `created_at`: Record creation timestamp

## Business Logic

### 1. Order Acceptance Flow
1. Vehicle owner accepts order
2. System checks vehicle owner balance
3. Creates assignment with PENDING status
4. Sets expiry time (1 hour)
5. Vehicle owner assigns car and driver
6. Status changes to ASSIGNED

### 2. Trip Management Flow
1. Driver starts trip with start KM and image
2. Status changes to DRIVING
3. Driver ends trip with end KM, contact, and image
4. System calculates fare and debits vehicle owner
5. Status changes to COMPLETED
6. Driver status returns to ONLINE

### 3. Fare Calculation
- **Base Fare:** Uses `order.estimated_price`
- **Driver Share:** 70% of calculated fare
- **Vehicle Owner Share:** 30% of calculated fare
- **Wallet Debit:** Full amount debited from vehicle owner

### 4. Balance Management
- **Order Acceptance:** Checks balance but doesn't debit
- **Trip Completion:** Debits full fare amount
- **Validation:** Ensures sufficient balance before acceptance

## Error Handling

### 1. Validation Errors
- Invalid phone numbers (10-digit Indian format)
- Invalid KM readings (must be positive)
- Invalid file types (images only)

### 2. Business Logic Errors
- Insufficient balance for order acceptance
- Driver not assigned to order
- Trip already started/ended
- Invalid status transitions

### 3. Authorization Errors
- Unauthorized access to assignments
- Driver accessing other driver's orders
- Vehicle owner accessing other owner's assignments

## Testing

### Test Files Created
1. **`test_order_assignments_trip.py`** - Comprehensive test suite
2. **Updated existing test files** - Phone number validation

### Test Coverage
- Order acceptance with balance check
- Car and driver assignment
- Driver order listing
- Trip start and end functionality
- Fare calculation and wallet operations
- Error handling and validation

## Usage Examples

### 1. Complete Order Flow
```bash
# 1. Accept order
POST /api/users/assignments/acceptorder
{
    "order_id": 1
}

# 2. Assign car and driver
PATCH /api/users/assignments/1/assign-car-driver
{
    "driver_id": "uuid",
    "car_id": "uuid"
}

# 3. Driver starts trip
POST /api/users/assignments/driver/start-trip/1
Form data: start_km=1000, speedometer_img=file

# 4. Driver ends trip
POST /api/users/assignments/driver/end-trip/1
Form data: end_km=1050, contact_number=9876543210, speedometer_img=file
```

### 2. Driver Operations
```bash
# Get assigned orders
GET /api/users/assignments/driver/assigned-orders

# Get trip history
GET /api/users/assignments/driver/trip-history
```

## Security Features

1. **JWT Authentication:** All endpoints require valid tokens
2. **Authorization Checks:** Users can only access their own data
3. **Input Validation:** Phone numbers, KM readings, file types
4. **Balance Validation:** Prevents insufficient balance operations
5. **Status Validation:** Ensures proper status transitions

## Performance Considerations

1. **Database Indexes:** On order_id, driver_id, vehicle_owner_id
2. **Image Storage:** GCS for scalable image storage
3. **Transaction Management:** Proper rollback on failures
4. **Caching:** Consider caching for frequently accessed data

This implementation provides a complete order assignment and trip management system with proper validation, security, and error handling.
