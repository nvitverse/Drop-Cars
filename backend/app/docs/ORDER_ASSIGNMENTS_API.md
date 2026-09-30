# Order Assignment API Documentation

## Overview
The Order Assignment API provides endpoints for managing order assignments between vehicle owners and orders. This API allows vehicle owners to accept orders, track assignment status, and manage the complete lifecycle of order assignments.

## Base URL
```
/api/assignments
```

## Authentication
All endpoints require Bearer token authentication. The token should be included in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Accept Order
**POST** `/acceptorder`

Accepts an order and creates a new assignment with PENDING status.

**Request Body:**
```json
{
  "order_id": 123
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "order_id": 123,
  "vehicle_owner_id": "uuid-here",
  "driver_id": null,
  "car_id": null,
  "assignment_status": "PENDING",
  "assigned_at": null,
  "expires_at": "2024-01-01T02:00:00Z",
  "cancelled_at": null,
  "completed_at": null,
  "created_at": "2024-01-01T01:00:00Z"
}
```

**Notes:**
- `vehicle_owner_id` is automatically extracted from the authenticated user's token
- `expires_at` is automatically set to 1 hour from creation time
- `assignment_status` defaults to "PENDING"

---

### 2. Get Assignment by ID
**GET** `/{assignment_id}`

Retrieves a specific order assignment by its ID.

**Response (200 OK):**
```json
{
  "id": 1,
  "order_id": 123,
  "vehicle_owner_id": "uuid-here",
  "driver_id": null,
  "car_id": null,
  "assignment_status": "PENDING",
  "assigned_at": null,
  "expires_at": "2024-01-01T02:00:00Z",
  "cancelled_at": null,
  "completed_at": null,
  "created_at": "2024-01-01T01:00:00Z"
}
```

**Notes:**
- Only the vehicle owner who created the assignment can view it
- Returns 403 Forbidden if unauthorized

---

### 3. Get Assignments by Vehicle Owner
**GET** `/vehicle_owner/{vehicle_owner_id}`

Retrieves all assignments for a specific vehicle owner.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "order_id": 123,
    "vehicle_owner_id": "uuid-here",
    "driver_id": null,
    "car_id": null,
    "assignment_status": "PENDING",
    "assigned_at": null,
    "expires_at": "2024-01-01T02:00:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "created_at": "2024-01-01T01:00:00Z"
  }
]
```

**Notes:**
- Only the authenticated vehicle owner can view their own assignments
- Returns 403 Forbidden if unauthorized
- Results are ordered by creation date (newest first)

---

### 4. Get Assignments by Order ID
**GET** `/order/{order_id}`

Retrieves all assignments for a specific order.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "order_id": 123,
    "vehicle_owner_id": "uuid-here",
    "driver_id": null,
    "car_id": null,
    "assignment_status": "PENDING",
    "assigned_at": null,
    "expires_at": "2024-01-01T02:00:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "created_at": "2024-01-01T01:00:00Z"
  }
]
```

**Notes:**
- Returns all assignments for the specified order
- Results are ordered by creation date (newest first)

---

### 5. Update Assignment Status
**PATCH** `/{assignment_id}/status`

Updates the status of an assignment and sets appropriate timestamps.

**Request Body:**
```json
{
  "assignment_status": "ASSIGNED"
}
```

**Valid Status Values:**
- `PENDING` - Initial status when order is accepted
- `ASSIGNED` - Order has been assigned to driver/car
- `DRIVING` - Trip is in progress
- `COMPLETED` - Trip has been completed
- `CANCELLED` - Assignment has been cancelled

**Response (200 OK):**
```json
{
  "id": 1,
  "order_id": 123,
  "vehicle_owner_id": "uuid-here",
  "driver_id": null,
  "car_id": null,
  "assignment_status": "ASSIGNED",
  "assigned_at": "2024-01-01T01:30:00Z",
  "expires_at": "2024-01-01T02:00:00Z",
  "cancelled_at": null,
  "completed_at": null,
  "created_at": "2024-01-01T01:00:00Z"
}
```

**Notes:**
- Only the vehicle owner who created the assignment can update it
- Returns 403 Forbidden if unauthorized
- Timestamps are automatically updated based on status:
  - `ASSIGNED` → sets `assigned_at`
  - `CANCELLED` → sets `cancelled_at`
  - `COMPLETED` → sets `completed_at`

---

### 6. Cancel Assignment
**PATCH** `/{assignment_id}/cancel`

Cancels an assignment and sets the status to CANCELLED.

**Response (200 OK):**
```json
{
  "id": 1,
  "order_id": 123,
  "vehicle_owner_id": "uuid-here",
  "driver_id": null,
  "car_id": null,
  "assignment_status": "CANCELLED",
  "assigned_at": null,
  "expires_at": "2024-01-01T02:00:00Z",
  "cancelled_at": "2024-01-01T01:45:00Z",
  "completed_at": null,
  "created_at": "2024-01-01T01:00:00Z"
}
```

**Notes:**
- Only the vehicle owner who created the assignment can cancel it
- Returns 403 Forbidden if unauthorized
- Automatically sets `cancelled_at` timestamp

---

### 7. Complete Assignment
**PATCH** `/{assignment_id}/complete`

Marks an assignment as completed and sets the status to COMPLETED.

**Response (200 OK):**
```json
{
  "id": 1,
  "order_id": 123,
  "vehicle_owner_id": "uuid-here",
  "driver_id": null,
  "car_id": null,
  "assignment_status": "COMPLETED",
  "assigned_at": null,
  "expires_at": "2024-01-01T02:00:00Z",
  "cancelled_at": null,
  "completed_at": "2024-01-01T02:30:00Z",
  "created_at": "2024-01-01T01:00:00Z"
}
```

**Notes:**
- Only the vehicle owner who created the assignment can complete it
- Returns 403 Forbidden if unauthorized
- Automatically sets `completed_at` timestamp

---

### 8. Get Vendor Orders with Assignments
**GET** `/api/orders/vendor/with-assignments`

Retrieves all orders for the authenticated vendor with their latest assignment details.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "order_id": 123,
    "vehicle_owner_id": "uuid-here",
    "driver_id": null,
    "car_id": null,
    "assignment_status": "PENDING",
    "assigned_at": null,
    "expires_at": "2024-01-01T02:00:00Z",
    "cancelled_at": null,
    "completed_at": null,
    "created_at": "2024-01-01T01:00:00Z",
    "vendor_id": "vendor-uuid",
    "trip_type": "Oneway",
    "car_type": "Sedan",
    "pickup_drop_location": {
      "pickup": "Location A",
      "drop": "Location B"
    },
    "start_date_time": "2024-01-01T10:00:00Z",
    "customer_name": "John Doe",
    "customer_number": "+1234567890",
    "cost_per_km": 10,
    "extra_cost_per_km": 2,
    "driver_allowance": 500,
    "extra_driver_allowance": 100,
    "permit_charges": 200,
    "extra_permit_charges": 50,
    "hill_charges": 100,
    "toll_charges": 150,
    "pickup_notes": "Call before arrival",
    "trip_status": "PENDING",
    "pick_near_city": "ALL",
    "trip_distance": 150,
    "trip_time": "3 hours",
    "platform_fees_percent": 10,
    "estimated_price": 2000,
    "vendor_price": 1800,
    "order_created_at": "2024-01-01T00:00:00Z"
  }
]
```

**Notes:**
- Returns the latest assignment for each order (handles duplicate rows)
- Combines order details with assignment information
- Orders are filtered by the authenticated vendor's ID

---

## Data Models

### Assignment Status Enum
```python
class AssignmentStatusEnum(str, enum.Enum):
    PENDING = "PENDING"      # Initial status when order is accepted
    ASSIGNED = "ASSIGNED"    # Order has been assigned to driver/car
    CANCELLED = "CANCELLED"  # Assignment has been cancelled
    COMPLETED = "COMPLETED"  # Trip has been completed
    DRIVING = "DRIVING"      # Trip is in progress
```

### Order Assignment Model
```python
class OrderAssignment(Base):
    __tablename__ = "order_assignments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("new_orders.order_id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=False)
    assignment_status = Column(Enum(AssignmentStatusEnum), nullable=False, default=AssignmentStatusEnum.PENDING)
    assigned_at = Column(TIMESTAMP)
    expires_at = Column(TIMESTAMP)
    cancelled_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
```

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Failed to accept order: <error_message>"
}
```

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 403 Forbidden
```json
{
  "detail": "Not authorized to view this assignment"
}
```

### 404 Not Found
```json
{
  "detail": "Assignment not found"
}
```

## Business Rules

1. **Assignment Expiry**: All assignments expire after 1 hour from creation
2. **Authorization**: Vehicle owners can only manage their own assignments
3. **Status Flow**: Status transitions follow the defined enum values
4. **Timestamp Management**: Timestamps are automatically set based on status changes
5. **Duplicate Handling**: For vendor orders, only the latest assignment per order is returned

## Usage Examples

### Accepting an Order
```bash
curl -X POST "http://localhost:8000/api/assignments/acceptorder" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}'
```

### Updating Assignment Status
```bash
curl -X PATCH "http://localhost:8000/api/assignments/1/status" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"assignment_status": "ASSIGNED"}'
```

### Getting Vendor Orders
```bash
curl -X GET "http://localhost:8000/api/orders/vendor/with-assignments" \
  -H "Authorization: Bearer <your_token>"
```
