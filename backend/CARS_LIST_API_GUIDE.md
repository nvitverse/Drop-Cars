# Cars List API Guide

Complete guide for the admin cars list API with filtering, pagination, and frontend implementation.

## API Endpoint

### Get All Cars
**Method:** `GET`  
**URL:** `/api/admin/cars`

**Headers:**
```
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Query Parameters:**
- `skip` (optional): Number of records to skip. Default: 0
- `limit` (optional): Number of records to return. Default: 100, Max: 1000
- `vehicle_owner_id` (optional): Filter by vehicle owner ID
- `status_filter` (optional): Filter by car status (ONLINE, DRIVING, BLOCKED, PROCESSING)
- `car_type_filter` (optional): Filter by car type (HATCHBACK, SEDAN, SUV, INNOVA, etc.)

## Response

**Success Response (200 OK):**
```json
{
    "cars": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "vehicle_owner_id": "550e8400-e29b-41d4-a716-446655440001",
            "car_name": "Toyota Camry",
            "car_type": "SEDAN_4_PLUS_1",
            "car_number": "MH-12-AB-1234",
            "year_of_the_car": "2020",
            "car_status": "ONLINE",
            "vehicle_owner_name": "John Doe",
            "created_at": "2025-01-01T10:00:00Z"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "vehicle_owner_id": "550e8400-e29b-41d4-a716-446655440001",
            "car_name": "Honda City",
            "car_type": "SEDAN_4_PLUS_1",
            "car_number": "MH-12-CD-5678",
            "year_of_the_car": "2021",
            "car_status": "BLOCKED",
            "vehicle_owner_name": "John Doe",
            "created_at": "2025-01-02T11:00:00Z"
        }
    ],
    "total_count": 150,
    "online_count": 80,
    "blocked_count": 20,
    "processing_count": 30,
    "driving_count": 20
}
```

## Postman Examples

### Example 1: Get All Cars (No Filters)

**Request:**
```
GET {BASE_URL}/api/admin/cars?skip=0&limit=100
```

**Headers:**
```
Authorization: Bearer {your_token}
```

### Example 2: Filter by Status (Online Cars Only)

**Request:**
```
GET {BASE_URL}/api/admin/cars?status_filter=ONLINE&skip=0&limit=50
```

### Example 3: Filter by Vehicle Owner

**Request:**
```
GET {BASE_URL}/api/admin/cars?vehicle_owner_id=550e8400-e29b-41d4-a716-446655440001&skip=0&limit=100
```

### Example 4: Filter by Car Type

**Request:**
```
GET {BASE_URL}/api/admin/cars?car_type_filter=SUV&skip=0&limit=100
```

### Example 5: Multiple Filters

**Request:**
```
GET {BASE_URL}/api/admin/cars?status_filter=ONLINE&car_type_filter=SEDAN_4_PLUS_1&skip=0&limit=50
```

## Valid Car Status Values

- `ONLINE` - Car is online and available
- `DRIVING` - Car is currently on a trip
- `BLOCKED` - Car is blocked
- `PROCESSING` - Car is being processed/verified

## Valid Car Type Values

- `HATCHBACK`
- `SEDAN_4_PLUS_1`
- `NEW_SEDAN_2022_MODEL`
- `ETIOS_4_PLUS_1`
- `SUV`
- `SUV_6_PLUS_1`
- `SUV_7_PLUS_1`
- `INNOVA`
- `INNOVA_6_PLUS_1`
- `INNOVA_7_PLUS_1`
- `INNOVA_CRYSTA`
- `INNOVA_CRYSTA_6_PLUS_1`
- `INNOVA_CRYSTA_7_PLUS_1`

## Frontend Implementation

### React/Next.js Component

```tsx
// components/CarList.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface Car {
  id: string;
  vehicle_owner_id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  year_of_the_car?: string;
  car_status: string;
  vehicle_owner_name?: string;
  created_at: string;
}

interface CarListResponse {
  cars: Car[];
  total_count: number;
  online_count: number;
  blocked_count: number;
  processing_count: number;
  driving_count: number;
}

export default function CarList() {
  const [carData, setCarData] = useState<CarListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    skip: 0,
    limit: 50,
    vehicle_owner_id: '',
    status_filter: '',
    car_type_filter: ''
  });
  const router = useRouter();

  useEffect(() => {
    fetchCars();
  }, [filters]);

  const fetchCars = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const queryParams = new URLSearchParams();
      
      queryParams.append('skip', filters.skip.toString());
      queryParams.append('limit', filters.limit.toString());
      if (filters.vehicle_owner_id) {
        queryParams.append('vehicle_owner_id', filters.vehicle_owner_id);
      }
      if (filters.status_filter) {
        queryParams.append('status_filter', filters.status_filter);
      }
      if (filters.car_type_filter) {
        queryParams.append('car_type_filter', filters.car_type_filter);
      }

      const response = await fetch(
        `/api/admin/cars?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      const data = await response.json();
      setCarData(data);
    } catch (error) {
      console.error('Error fetching cars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCarClick = (carId: string) => {
    // Navigate to car details or documents
    router.push(`/admin/cars/${carId}`);
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

  const getStatusColor = (status: string) => {
    const colors = {
      'ONLINE': '#4CAF50',
      'DRIVING': '#2196F3',
      'BLOCKED': '#f44336',
      'PROCESSING': '#ff9800'
    };
    return colors[status] || '#757575';
  };

  if (loading) return <div>Loading cars...</div>;
  if (!carData) return <div>No cars found</div>;

  return (
    <div className="car-list">
      <div className="header">
        <h1>All Cars</h1>
        <div className="stats">
          <span>Total: {carData.total_count}</span>
          <span style={{ color: '#4CAF50' }}>Online: {carData.online_count}</span>
          <span style={{ color: '#f44336' }}>Blocked: {carData.blocked_count}</span>
          <span style={{ color: '#ff9800' }}>Processing: {carData.processing_count}</span>
          <span style={{ color: '#2196F3' }}>Driving: {carData.driving_count}</span>
        </div>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Vehicle Owner ID"
          value={filters.vehicle_owner_id}
          onChange={(e) => setFilters({ ...filters, vehicle_owner_id: e.target.value })}
        />
        <select
          value={filters.status_filter}
          onChange={(e) => setFilters({ ...filters, status_filter: e.target.value })}
        >
          <option value="">All Statuses</option>
          <option value="ONLINE">Online</option>
          <option value="DRIVING">Driving</option>
          <option value="BLOCKED">Blocked</option>
          <option value="PROCESSING">Processing</option>
        </select>
        <select
          value={filters.car_type_filter}
          onChange={(e) => setFilters({ ...filters, car_type_filter: e.target.value })}
        >
          <option value="">All Types</option>
          <option value="HATCHBACK">Hatchback</option>
          <option value="SEDAN_4_PLUS_1">Sedan</option>
          <option value="SUV">SUV</option>
          <option value="INNOVA">Innova</option>
        </select>
        <button onClick={fetchCars}>Apply Filters</button>
      </div>

      <div className="cars-grid">
        {carData.cars.map((car) => (
          <div key={car.id} className="car-card" onClick={() => handleCarClick(car.id)}>
            <div className="car-header">
              <h3>{car.car_name}</h3>
              <span
                className="status-badge"
                style={{ backgroundColor: getStatusColor(car.car_status) }}
              >
                {car.car_status}
              </span>
            </div>
            <div className="car-details">
              <p><strong>Number:</strong> {car.car_number}</p>
              <p><strong>Type:</strong> {car.car_type}</p>
              <p><strong>Year:</strong> {car.year_of_the_car || 'N/A'}</p>
              <p><strong>Owner:</strong> {car.vehicle_owner_name || 'N/A'}</p>
            </div>
            <div className="car-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateCarStatus(car.id, 'ONLINE');
                }}
                disabled={car.car_status === 'ONLINE'}
                className="btn-activate"
              >
                Activate
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateCarStatus(car.id, 'BLOCKED');
                }}
                disabled={car.car_status === 'BLOCKED'}
                className="btn-block"
              >
                Block
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="pagination">
        <button
          onClick={() => setFilters({ ...filters, skip: Math.max(0, filters.skip - filters.limit) })}
          disabled={filters.skip === 0}
        >
          Previous
        </button>
        <span>
          Showing {filters.skip + 1} to {Math.min(filters.skip + filters.limit, carData.total_count)} of {carData.total_count}
        </span>
        <button
          onClick={() => setFilters({ ...filters, skip: filters.skip + filters.limit })}
          disabled={filters.skip + filters.limit >= carData.total_count}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Vue.js Component

```vue
<!-- components/CarList.vue -->
<template>
  <div class="car-list">
    <div class="header">
      <h1>All Cars</h1>
      <div class="stats">
        <span>Total: {{ carData?.total_count }}</span>
        <span style="color: #4CAF50">Online: {{ carData?.online_count }}</span>
        <span style="color: #f44336">Blocked: {{ carData?.blocked_count }}</span>
        <span style="color: #ff9800">Processing: {{ carData?.processing_count }}</span>
        <span style="color: #2196F3">Driving: {{ carData?.driving_count }}</span>
      </div>
    </div>

    <div class="filters">
      <input
        v-model="filters.vehicle_owner_id"
        type="text"
        placeholder="Vehicle Owner ID"
      />
      <select v-model="filters.status_filter">
        <option value="">All Statuses</option>
        <option value="ONLINE">Online</option>
        <option value="DRIVING">Driving</option>
        <option value="BLOCKED">Blocked</option>
        <option value="PROCESSING">Processing</option>
      </select>
      <select v-model="filters.car_type_filter">
        <option value="">All Types</option>
        <option value="HATCHBACK">Hatchback</option>
        <option value="SEDAN_4_PLUS_1">Sedan</option>
        <option value="SUV">SUV</option>
        <option value="INNOVA">Innova</option>
      </select>
      <button @click="fetchCars">Apply Filters</button>
    </div>

    <div class="cars-grid">
      <div
        v-for="car in carData?.cars"
        :key="car.id"
        class="car-card"
        @click="$router.push(`/admin/cars/${car.id}`)"
      >
        <div class="car-header">
          <h3>{{ car.car_name }}</h3>
          <span
            class="status-badge"
            :style="{ backgroundColor: getStatusColor(car.car_status) }"
          >
            {{ car.car_status }}
          </span>
        </div>
        <div class="car-details">
          <p><strong>Number:</strong> {{ car.car_number }}</p>
          <p><strong>Type:</strong> {{ car.car_type }}</p>
          <p><strong>Owner:</strong> {{ car.vehicle_owner_name || 'N/A' }}</p>
        </div>
        <div class="car-actions">
          <button
            @click.stop="updateCarStatus(car.id, 'ONLINE')"
            :disabled="car.car_status === 'ONLINE'"
            class="btn-activate"
          >
            Activate
          </button>
          <button
            @click.stop="updateCarStatus(car.id, 'BLOCKED')"
            :disabled="car.car_status === 'BLOCKED'"
            class="btn-block"
          >
            Block
          </button>
        </div>
      </div>
    </div>

    <div class="pagination">
      <button
        @click="previousPage"
        :disabled="filters.skip === 0"
      >
        Previous
      </button>
      <span>
        Showing {{ filters.skip + 1 }} to {{ Math.min(filters.skip + filters.limit, carData?.total_count || 0) }} of {{ carData?.total_count }}
      </span>
      <button
        @click="nextPage"
        :disabled="filters.skip + filters.limit >= (carData?.total_count || 0)"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      carData: null,
      loading: true,
      filters: {
        skip: 0,
        limit: 50,
        vehicle_owner_id: '',
        status_filter: '',
        car_type_filter: ''
      }
    };
  },
  mounted() {
    this.fetchCars();
  },
  watch: {
    filters: {
      deep: true,
      handler() {
        this.fetchCars();
      }
    }
  },
  methods: {
    async fetchCars() {
      this.loading = true;
      try {
        const token = localStorage.getItem('admin_token');
        const queryParams = new URLSearchParams();
        
        queryParams.append('skip', this.filters.skip.toString());
        queryParams.append('limit', this.filters.limit.toString());
        if (this.filters.vehicle_owner_id) {
          queryParams.append('vehicle_owner_id', this.filters.vehicle_owner_id);
        }
        if (this.filters.status_filter) {
          queryParams.append('status_filter', this.filters.status_filter);
        }
        if (this.filters.car_type_filter) {
          queryParams.append('car_type_filter', this.filters.car_type_filter);
        }

        const response = await fetch(
          `/api/admin/cars?${queryParams.toString()}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        this.carData = await response.json();
      } catch (error) {
        console.error('Error fetching cars:', error);
      } finally {
        this.loading = false;
      }
    },
    async updateCarStatus(carId, status) {
      const token = localStorage.getItem('admin_token');
      await fetch(
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
      this.fetchCars();
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
    previousPage() {
      this.filters.skip = Math.max(0, this.filters.skip - this.filters.limit);
    },
    nextPage() {
      if (this.filters.skip + this.filters.limit < (this.carData?.total_count || 0)) {
        this.filters.skip += this.filters.limit;
      }
    }
  }
};
</script>
```

### CSS Styles

```css
/* styles/car-list.css */
.car-list {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #eee;
}

.stats {
  display: flex;
  gap: 20px;
}

.stats span {
  padding: 5px 15px;
  background: #f5f5f5;
  border-radius: 5px;
  font-weight: bold;
}

.filters {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
  flex-wrap: wrap;
}

.filters input,
.filters select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.filters button {
  padding: 10px 20px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}

.filters button:hover {
  background: #45a049;
}

.cars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.car-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.car-card:hover {
  border-color: #4CAF50;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transform: translateY(-2px);
}

.car-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.car-header h3 {
  margin: 0;
  color: #333;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: bold;
}

.car-details {
  margin-bottom: 15px;
}

.car-details p {
  margin: 8px 0;
  color: #666;
  font-size: 14px;
}

.car-actions {
  display: flex;
  gap: 10px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.car-actions button {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-activate {
  background: #4CAF50;
  color: white;
}

.btn-activate:hover:not(:disabled) {
  background: #45a049;
}

.btn-block {
  background: #f44336;
  color: white;
}

.btn-block:hover:not(:disabled) {
  background: #da190b;
}

.car-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.pagination button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination button:hover:not(:disabled) {
  background: #f0f0f0;
}
```

## Quick Reference

### Get All Cars
```
GET /api/admin/cars?skip=0&limit=100
```

### Filter Online Cars
```
GET /api/admin/cars?status_filter=ONLINE
```

### Filter by Vehicle Owner
```
GET /api/admin/cars?vehicle_owner_id={owner_id}
```

### Filter by Car Type
```
GET /api/admin/cars?car_type_filter=SUV
```

### Combined Filters
```
GET /api/admin/cars?status_filter=ONLINE&car_type_filter=SEDAN_4_PLUS_1&skip=0&limit=50
```

## Integration Tips

1. **Click on Car**: Navigate to car details or documents
2. **Quick Actions**: Add activate/block buttons directly in the list
3. **Filtering**: Use filters to find specific cars quickly
4. **Pagination**: Handle large datasets with skip/limit
5. **Status Colors**: Use color coding for quick status identification

## Testing Checklist

- [ ] Get all cars (no filters)
- [ ] Filter by status (ONLINE, BLOCKED, etc.)
- [ ] Filter by vehicle owner ID
- [ ] Filter by car type
- [ ] Test pagination (skip/limit)
- [ ] Test combined filters
- [ ] Verify status counts are correct
- [ ] Test with invalid filters
- [ ] Test without authentication token

