# Car Status Update API Guide

This guide explains how to update car status (activate/deactivate/block cars) using the admin API.

## API Endpoint

### Update Car Status
**Method:** `PATCH`  
**URL:** `/api/admin/cars/{car_id}/account-status`

**Headers:**
```
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Request Body (JSON):**
```json
{
    "account_status": "ONLINE"
}
```

## Valid Car Status Values

- `"ONLINE"` - Car is online and available for bookings
- `"DRIVING"` - Car is currently on a trip
- `"BLOCKED"` - Car is blocked and cannot be used
- `"PROCESSING"` - Car account is being processed/verified

## Response

**Success Response (200 OK):**
```json
{
    "message": "Car status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "new_status": "ONLINE"
}
```

**Error Response (400 Bad Request):**
```json
{
    "detail": "Invalid car status. Must be one of: ONLINE, DRIVING, BLOCKED, PROCESSING"
}
```

## Postman Examples

### Example 1: Set Car to ONLINE (Activate)

**Request:**
```
PATCH {BASE_URL}/api/admin/cars/550e8400-e29b-41d4-a716-446655440000/account-status
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Body:**
```json
{
    "account_status": "ONLINE"
}
```

**Response:**
```json
{
    "message": "Car status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "new_status": "ONLINE"
}
```

### Example 2: Block a Car

**Request:**
```
PATCH {BASE_URL}/api/admin/cars/550e8400-e29b-41d4-a716-446655440001/account-status
```

**Body:**
```json
{
    "account_status": "BLOCKED"
}
```

**Response:**
```json
{
    "message": "Car status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "new_status": "BLOCKED"
}
```

### Example 3: Set Car to PROCESSING

**Request:**
```
PATCH {BASE_URL}/api/admin/cars/550e8400-e29b-41d4-a716-446655440002/account-status
```

**Body:**
```json
{
    "account_status": "PROCESSING"
}
```

### Example 4: Set Car to DRIVING (Currently on Trip)

**Request:**
```
PATCH {BASE_URL}/api/admin/cars/550e8400-e29b-41d4-a716-446655440003/account-status
```

**Body:**
```json
{
    "account_status": "DRIVING"
}
```

## Frontend Implementation

### React/Next.js Example

```tsx
// components/CarStatusUpdate.tsx
import React, { useState } from 'react';

interface CarStatusUpdateProps {
  carId: string;
  currentStatus: string;
  onStatusUpdate: () => void;
}

export default function CarStatusUpdate({
  carId,
  currentStatus,
  onStatusUpdate
}: CarStatusUpdateProps) {
  const [loading, setLoading] = useState(false);

  const updateCarStatus = async (status: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/admin/cars/${carId}/account-status`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            account_status: status
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(`Car status updated to ${data.new_status}`);
        onStatusUpdate(); // Refresh the car list
      } else {
        const error = await response.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error updating car status:', error);
      alert('Failed to update car status');
    } finally {
      setLoading(false);
    }
  };

  const carStatuses = ['ONLINE', 'DRIVING', 'BLOCKED', 'PROCESSING'];

  const getStatusColor = (status: string) => {
    const colors = {
      'ONLINE': '#4CAF50',
      'DRIVING': '#2196F3',
      'BLOCKED': '#f44336',
      'PROCESSING': '#ff9800'
    };
    return colors[status] || '#757575';
  };

  return (
    <div className="car-status-update">
      <h3>Update Car Status</h3>
      <p>Current Status: 
        <strong style={{ color: getStatusColor(currentStatus) }}>
          {currentStatus}
        </strong>
      </p>
      
      <div className="status-buttons">
        {carStatuses.map((status) => (
          <button
            key={status}
            onClick={() => updateCarStatus(status)}
            disabled={loading || status === currentStatus}
            className="status-btn"
            style={{
              backgroundColor: status === currentStatus ? getStatusColor(status) : '#e0e0e0',
              color: status === currentStatus ? 'white' : '#333'
            }}
          >
            {status === 'ONLINE' && '🟢 '}
            {status === 'DRIVING' && '🚗 '}
            {status === 'BLOCKED' && '🚫 '}
            {status === 'PROCESSING' && '⏳ '}
            {status}
          </button>
        ))}
      </div>

      {loading && <p>Updating status...</p>}
    </div>
  );
}
```

### Vue.js Example

```vue
<!-- components/CarStatusUpdate.vue -->
<template>
  <div class="car-status-update">
    <h3>Update Car Status</h3>
    <p>Current Status: 
      <strong :style="{ color: getStatusColor(currentStatus) }">
        {{ currentStatus }}
      </strong>
    </p>
    
    <div class="status-buttons">
      <button
        v-for="status in carStatuses"
        :key="status"
        @click="updateCarStatus(status)"
        :disabled="loading || status === currentStatus"
        class="status-btn"
        :style="{
          backgroundColor: status === currentStatus ? getStatusColor(status) : '#e0e0e0',
          color: status === currentStatus ? 'white' : '#333'
        }"
      >
        {{ getStatusIcon(status) }} {{ status }}
      </button>
    </div>

    <p v-if="loading">Updating status...</p>
  </div>
</template>

<script>
export default {
  props: {
    carId: String,
    currentStatus: String
  },
  data() {
    return {
      loading: false,
      carStatuses: ['ONLINE', 'DRIVING', 'BLOCKED', 'PROCESSING']
    };
  },
  methods: {
    async updateCarStatus(status) {
      this.loading = true;
      try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(
          `/api/admin/cars/${this.carId}/account-status`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              account_status: status
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          alert(`Car status updated to ${data.new_status}`);
          this.$emit('status-updated');
        } else {
          const error = await response.json();
          alert(`Error: ${error.detail}`);
        }
      } catch (error) {
        console.error('Error updating car status:', error);
        alert('Failed to update car status');
      } finally {
        this.loading = false;
      }
    },
    getStatusColor(status) {
      const colors = {
        'ONLINE': '#4CAF50',
        'DRIVING': '#2196F3',
        'BLOCKED': '#f44336',
        'PROCESSING': '#ff9800'
      };
      return colors[status] || '#757575';
    },
    getStatusIcon(status) {
      const icons = {
        'ONLINE': '🟢',
        'DRIVING': '🚗',
        'BLOCKED': '🚫',
        'PROCESSING': '⏳'
      };
      return icons[status] || '';
    }
  }
};
</script>
```

### CSS Styles

```css
.car-status-update {
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
  margin: 20px 0;
}

.status-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 15px;
}

.status-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.status-btn:hover:not(:disabled) {
  opacity: 0.8;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.status-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## Integration with Car List

Here's how to integrate status update in your car list component:

```tsx
// In your CarList component
const handleCarStatusUpdate = async (carId: string, newStatus: string) => {
  const token = localStorage.getItem('admin_token');
  const response = await fetch(
    `/api/admin/cars/${carId}/account-status`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ account_status: newStatus })
    }
  );

  if (response.ok) {
    // Refresh the car list
    fetchCars();
  }
};
```

## Quick Reference

### Activate Car (Set to ONLINE)
```bash
PATCH /api/admin/cars/{car_id}/account-status
Body: { "account_status": "ONLINE" }
```

### Block Car
```bash
PATCH /api/admin/cars/{car_id}/account-status
Body: { "account_status": "BLOCKED" }
```

### Set Car to Processing
```bash
PATCH /api/admin/cars/{car_id}/account-status
Body: { "account_status": "PROCESSING" }
```

### Set Car to Driving
```bash
PATCH /api/admin/cars/{car_id}/account-status
Body: { "account_status": "DRIVING" }
```

## Status Meanings

- **ONLINE**: Car is available and can be booked
- **DRIVING**: Car is currently on a trip (usually set automatically by system)
- **BLOCKED**: Car is blocked by admin and cannot be used
- **PROCESSING**: Car is being verified/processed (default status for new cars)

## Getting Car ID

To get car IDs, you can use:
1. **Get Vehicle Owner Details** (includes all cars):
   ```
   GET /api/admin/vehicle-owners/{vehicle_owner_id}
   ```
   This returns all cars with their IDs and statuses.

2. **Get Account Documents** (shows car documents with car IDs):
   ```
   GET /api/admin/accounts/{vehicle_owner_id}/documents?account_type=vehicle_owner
   ```
   Car documents include `car_id` in the response.

## Error Handling

Common errors and solutions:

1. **401 Unauthorized**: Make sure you're sending a valid admin token
2. **404 Not Found**: Check that the car_id is correct
3. **400 Bad Request**: Verify the status value is one of: ONLINE, DRIVING, BLOCKED, PROCESSING
4. **500 Internal Server Error**: Check server logs for details

## Testing Checklist

- [ ] Set car to ONLINE
- [ ] Set car to BLOCKED
- [ ] Set car to PROCESSING
- [ ] Set car to DRIVING
- [ ] Test with invalid status values
- [ ] Test with invalid car_id
- [ ] Test without authentication token

## Complete Example: Car Management Component

```tsx
// components/CarManagement.tsx
import React, { useState, useEffect } from 'react';

interface Car {
  id: string;
  car_name: string;
  car_number: string;
  car_status: string;
  vehicle_owner_id: string;
}

export default function CarManagement({ vehicleOwnerId }: { vehicleOwnerId: string }) {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCars();
  }, [vehicleOwnerId]);

  const fetchCars = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/admin/vehicle-owners/${vehicleOwnerId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      setCars(data.cars || []);
    } catch (error) {
      console.error('Error fetching cars:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateCarStatus = async (carId: string, status: string) => {
    const token = localStorage.getItem('admin_token');
    const response = await fetch(
      `/api/admin/cars/${carId}/account-status`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ account_status: status })
      }
    );

    if (response.ok) {
      fetchCars(); // Refresh list
    }
  };

  if (loading) return <div>Loading cars...</div>;

  return (
    <div className="car-management">
      <h2>Cars</h2>
      {cars.map((car) => (
        <div key={car.id} className="car-card">
          <h3>{car.car_name}</h3>
          <p>Number: {car.car_number}</p>
          <p>Status: {car.car_status}</p>
          <div className="car-actions">
            <button onClick={() => updateCarStatus(car.id, 'ONLINE')}>
              Activate
            </button>
            <button onClick={() => updateCarStatus(car.id, 'BLOCKED')}>
              Block
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

