# Order Assignment API Implementation Summary

## Overview
This document provides a summary of the implemented Order Assignment API endpoints for the Drop Cars Project Backend.

## Implemented Endpoints

### 1. POST /api/assignments/acceptorder
- **Purpose**: Accept an order and create a new assignment
- **Authentication**: Bearer token required (vehicle owner)
- **Data Required**: `order_id`
- **Data Stored**: 
  - Auto-generated `id`
  - `order_id` from request
  - `vehicle_owner_id` from token
  - `assignment_status` = "PENDING" (default)
  - `expires_at` = created_at + 1 hour
  - `created_at` = current timestamp
- **Response**: Full assignment record with 201 status

### 2. GET /api/assignments/{assignment_id}
- **Purpose**: Retrieve a specific assignment by ID
- **Authentication**: Bearer token required (vehicle owner)
- **Authorization**: Only the vehicle owner who created the assignment can view it
- **Response**: Full assignment record or 403/404 errors

### 3. GET /api/assignments/vehicle_owner/{vehicle_owner_id}
- **Purpose**: Get all assignments for a specific vehicle owner
- **Authentication**: Bearer token required (vehicle owner)
- **Authorization**: Only the authenticated vehicle owner can view their own assignments
- **Response**: List of assignments ordered by creation date (newest first)

### 4. GET /api/assignments/order/{order_id}
- **Purpose**: Get all assignments for a specific order
- **Authentication**: Bearer token required (vehicle owner)
- **Response**: List of assignments for the specified order

### 5. PATCH /api/assignments/{assignment_id}/status
- **Purpose**: Update assignment status and set appropriate timestamps
- **Authentication**: Bearer token required (vehicle owner)
- **Authorization**: Only the vehicle owner who created the assignment can update it
- **Data Required**: `assignment_status` (enum: PENDING, ASSIGNED, CANCELLED, COMPLETED, DRIVING)
- **Automatic Timestamps**:
  - `ASSIGNED` → sets `assigned_at`
  - `CANCELLED` → sets `cancelled_at`
  - `COMPLETED` → sets `completed_at`

### 6. PATCH /api/assignments/{assignment_id}/cancel
- **Purpose**: Cancel an assignment
- **Authentication**: Bearer token required (vehicle owner)
- **Authorization**: Only the vehicle owner who created the assignment can cancel it
- **Data Stored**: 
  - `assignment_status` = "CANCELLED"
  - `cancelled_at` = current timestamp

### 7. PATCH /api/assignments/{assignment_id}/complete
- **Purpose**: Mark an assignment as completed
- **Authentication**: Bearer token required (vehicle owner)
- **Authorization**: Only the vehicle owner who created the assignment can complete it
- **Data Stored**: 
  - `assignment_status` = "COMPLETED"
  - `completed_at` = current timestamp

### 8. GET /api/orders/vendor/with-assignments
- **Purpose**: Get all orders for the authenticated vendor with their latest assignment details
- **Authentication**: Bearer token required (vendor)
- **Response**: Combined order and assignment data
- **Special Handling**: Returns only the latest assignment per order (handles duplicate rows)

## Data Models

### OrderAssignment Model
```python
class OrderAssignment(Base):
    __tablename__ = "order_assignments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("new_orders.order_id"), nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=False)
    assignment_status = Column(SqlEnum(AssignmentStatusEnum), nullable=False, default=AssignmentStatusEnum.PENDING)
    assigned_at = Column(TIMESTAMP)
    expires_at = Column(TIMESTAMP)
    cancelled_at = Column(TIMESTAMP)
    completed_at = Column(TIMESTAMP)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
```

### Assignment Status Enum
```python
class AssignmentStatusEnum(str, enum.Enum):
    PENDING = "PENDING"      # Initial status when order is accepted
    ASSIGNED = "ASSIGNED"    # Order has been assigned to driver/car
    CANCELLED = "CANCELLED"  # Assignment has been cancelled
    COMPLETED = "COMPLETED"  # Trip has been completed
    DRIVING = "DRIVING"      # Trip is in progress
```

## Business Rules Implemented

1. **Assignment Expiry**: All assignments automatically expire after 1 hour from creation
2. **Authorization**: Vehicle owners can only manage their own assignments
3. **Status Flow**: Status transitions follow the defined enum values
4. **Timestamp Management**: Timestamps are automatically set based on status changes
5. **Duplicate Handling**: For vendor orders, only the latest assignment per order is returned

## Security Features

- **JWT Authentication**: All endpoints require valid Bearer tokens
- **Authorization Checks**: Users can only access/modify their own assignments
- **Input Validation**: Request data is validated using Pydantic schemas
- **Error Handling**: Proper HTTP status codes and error messages

## Files Created/Modified

### New Files Created:
1. `app/models/order_assignments.py` - Database model
2. `app/schemas/order_assignments.py` - Pydantic schemas
3. `app/crud/order_assignments.py` - Database operations
4. `app/api/routes/order_assignments.py` - API endpoints
5. `app/docs/ORDER_ASSIGNMENTS_API.md` - API documentation
6. `app/docs/ORDER_ASSIGNMENTS_SUMMARY.md` - This summary
7. `app/tests/test_order_assignments_api.py` - Test suite

### Modified Files:
1. `app/main.py` - Added order assignments router and model imports
2. `app/api/routes/new_orders.py` - Added vendor orders with assignments endpoint

## Testing

A comprehensive test suite has been created in `app/tests/test_order_assignments_api.py` that covers:
- Accepting orders
- Retrieving assignments
- Updating assignment status
- Cancelling assignments
- Getting assignments by various criteria
- Getting vendor orders with assignments

## Usage Examples

### Accept an Order
```bash
curl -X POST "http://localhost:8000/api/assignments/acceptorder" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}'
```

### Update Assignment Status
```bash
curl -X PATCH "http://localhost:8000/api/assignments/1/status" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"assignment_status": "ASSIGNED"}'
```

### Get Vendor Orders with Assignments
```bash
curl -X GET "http://localhost:8000/api/orders/vendor/with-assignments" \
  -H "Authorization: Bearer <your_token>"
```

## Next Steps

1. **Database Migration**: Ensure the `order_assignments` table is created in the database
2. **Testing**: Run the test suite to verify all endpoints work correctly
3. **Integration**: Test the API with the frontend application
4. **Monitoring**: Add logging and monitoring for production use
5. **Performance**: Consider adding database indexes for frequently queried fields
