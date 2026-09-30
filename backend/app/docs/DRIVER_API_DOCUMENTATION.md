# Driver API Documentation

This document describes the APIs available for car drivers in the Drop Cars system.

## Base URL
```
http://localhost:8000/api/users
```

## Authentication
Most driver APIs require Bearer token authentication. The token is obtained through the signin process.

## API Endpoints

### 1. Driver Signin
**Endpoint:** `POST /cardriver/signin`

**Description:** Authenticate a driver using primary number and password to get an access token.

**Request Body:**
```json
{
    "primary_number": "+919876543210",
    "password": "your_password"
}
```

**Response (Success - 200):**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "driver_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "full_name": "John Doe",
    "primary_number": "+919876543210",
    "driver_status": "ONLINE"
}
```

**Response (Error - 401):**
```json
{
    "detail": "Invalid primary number or password"
}
```

**Response (Error - 403):**
```json
{
    "detail": "Account is blocked. Please contact your vehicle owner."
}
```

**Business Rules:**
- Driver must exist in the system
- Password must match the hashed password in database
- Driver account must not be blocked
- Returns JWT token with driver ID as payload

---

### 2. Set Driver Online
**Endpoint:** `PUT /cardriver/online`

**Description:** Set driver status to ONLINE. Requires valid Bearer token authentication.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success - 200):**
```json
{
    "message": "Driver status updated to ONLINE successfully",
    "driver_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "new_status": "ONLINE"
}
```

**Response (Error - 401):**
```json
{
    "detail": "Could not validate credentials"
}
```

**Business Rules:**
- Driver must be authenticated with valid token
- Updates driver_status to "ONLINE" in car_driver table
- Only the authenticated driver can update their own status

---

### 3. Set Driver Offline
**Endpoint:** `PUT /cardriver/offline`

**Description:** Set driver status to OFFLINE. Requires valid Bearer token authentication.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success - 200):**
```json
{
    "message": "Driver status updated to OFFLINE successfully",
    "driver_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "new_status": "BLOCKED"
}
```

**Response (Error - 401):**
```json
{
    "detail": "Could not validate credentials"
}
```

**Business Rules:**
- Driver must be authenticated with valid token
- Updates driver_status to "BLOCKED" in car_driver table
- Only the authenticated driver can update their own status

---

## Pending Orders API

### 4. Get Pending Orders for Vehicle Owner
**Endpoint:** `GET /api/orders/vehicle_owner/pending`

**Description:** Retrieve all pending orders for the authenticated vehicle owner based on business rules.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (Success - 200):**
```json
[
    {
        "id": null,
        "order_id": 123,
        "vehicle_owner_id": "v290f1ee-6c54-4b01-90e6-d701748f0851",
        "driver_id": null,
        "car_id": null,
        "assignment_status": "PENDING",
        "assigned_at": null,
        "expires_at": null,
        "cancelled_at": null,
        "completed_at": null,
        "created_at": "2025-01-13T12:00:00Z",
        "vendor_id": "vendor-uuid",
        "trip_type": "Oneway",
        "car_type": "Sedan",
        "pickup_drop_location": {
            "pickup": "Mumbai Airport",
            "drop": "Mumbai City Center"
        },
        "start_date_time": "2025-01-15T10:00:00Z",
        "customer_name": "John Doe",
        "customer_number": "+919876543210",
        "cost_per_km": 15,
        "extra_cost_per_km": 5,
        "driver_allowance": 500,
        "extra_driver_allowance": 200,
        "permit_charges": 100,
        "extra_permit_charges": 50,
        "hill_charges": 200,
        "toll_charges": 150,
        "pickup_notes": "Please arrive 15 minutes early",
        "trip_status": "PENDING",
        "pick_near_city": "Mumbai",
        "trip_distance": 25,
        "trip_time": "45 minutes",
        "platform_fees_percent": 10,
        "estimated_price": 1500,
        "vendor_price": 1350,
        "order_created_at": "2025-01-13T12:00:00Z"
    }
]
```

**Business Rules for Pending Orders:**
1. **Orders not in assignment table**: Orders that have never been assigned to any vehicle owner
2. **Orders with cancelled assignments**: Orders that were previously assigned but the latest assignment status is "CANCELLED"
3. **Exclude cancelled orders**: Orders with trip_status "CANCELLED" are not returned
4. **Latest assignment comparison**: For each order, compares with the most recent assignment record (ordered by created_at)

**Order Status Values:**
- `trip_status`: PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED
- `assignment_status`: PENDING, ASSIGNED, CANCELLED, COMPLETED, DRIVING

---

## Error Responses

### Common HTTP Status Codes

**400 Bad Request**
```json
{
    "detail": "Validation error or business rule violation"
}
```

**401 Unauthorized**
```json
{
    "detail": "Could not validate credentials"
}
```

**403 Forbidden**
```json
{
    "detail": "Access denied or account blocked"
}
```

**404 Not Found**
```json
{
    "detail": "Resource not found"
}
```

**500 Internal Server Error**
```json
{
    "detail": "Internal server error occurred"
}
```

---

## Data Models

### Driver Status Enum
```python
class AccountStatusEnum(str, Enum):
    ONLINE = "ONLINE"      # Driver is available for assignments
    OFFLINE = "OFFLINE"    # Driver is offline/unavailable
    DRIVING = "DRIVING"    # Driver is currently on a trip
    BLOCKED = "BLOCKED"    # Driver is blocked by admin
    PROCESSING = "PROCESSING"  # Driver account is being processed
```

### Assignment Status Enum
```python
class AssignmentStatusEnum(str, Enum):
    PENDING = "PENDING"       # Order assigned but not yet started
    ASSIGNED = "ASSIGNED"     # Order assigned and confirmed
    CANCELLED = "CANCELLED"   # Assignment was cancelled
    COMPLETED = "COMPLETED"   # Trip completed successfully
    DRIVING = "DRIVING"       # Driver is currently driving
```

---

## Usage Examples

### 1. Driver Signin Flow
```bash
# Step 1: Signin to get access token
curl -X POST "http://localhost:8000/api/users/cardriver/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_number": "+919876543210",
    "password": "your_password"
  }'

# Step 2: Use the token for subsequent requests
curl -X PUT "http://localhost:8000/api/users/cardriver/online" \
  -H "Authorization: Bearer <access_token>"
```

### 2. Update Driver Status
```bash
# Set driver online
curl -X PUT "http://localhost:8000/api/users/cardriver/online" \
  -H "Authorization: Bearer <access_token>"

# Set driver offline
curl -X PUT "http://localhost:8000/api/users/cardriver/offline" \
  -H "Authorization: Bearer <access_token>"
```

### 3. Get Pending Orders
```bash
curl -X GET "http://localhost:8000/api/orders/vehicle_owner/pending" \
  -H "Authorization: Bearer <access_token>"
```

---

## Security Considerations

1. **JWT Tokens**: All authenticated endpoints require valid JWT tokens
2. **Token Expiry**: Tokens expire after 30 minutes by default
3. **Driver Isolation**: Drivers can only access their own data and status
4. **Password Hashing**: Passwords are hashed using bcrypt before storage
5. **Input Validation**: All inputs are validated using Pydantic schemas

---

## Rate Limiting

Currently, no rate limiting is implemented. Consider implementing rate limiting for production use.

---

## Notes

- All timestamps are in UTC timezone
- Mobile numbers should follow Indian format (+91XXXXXXXXXX or XXXXXXXXXX)
- Driver status changes are immediate and affect order assignment eligibility
- Pending orders are filtered based on business rules to ensure only available orders are shown
- **Enhanced Business Logic**: The system now compares each order with the latest assignment record (most recent created_at) to ensure accurate status determination
- **Data Safety**: Added fallback values for potentially null fields to prevent API errors
