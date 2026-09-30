# Account Status Update API Guide

This guide explains how to activate/deactivate accounts using the unified account status update API.

## API Endpoint

### Unified Account Status Update
**Method:** `PATCH`  
**URL:** `/api/admin/accounts/{account_id}/status`

**Headers:**
```
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Query Parameters:**
- `account_type` (required): `vendor`, `vehicle_owner`, `driver`, or `quickdriver`

**Request Body (JSON):**
```json
{
    "account_status": "Active"
}
```

## Valid Status Values

### For Vendors & Vehicle Owners:
- `"Active"` - Account is active and can use the system
- `"Inactive"` - Account is inactive and cannot use the system  
- `"Pending"` - Account is pending approval

### For Drivers:
- `"ONLINE"` - Driver is online and available
- `"OFFLINE"` - Driver is offline
- `"DRIVING"` - Driver is currently on a trip
- `"BLOCKED"` - Driver is blocked
- `"PROCESSING"` - Driver account is being processed

## Response

**Success Response (200 OK):**
```json
{
    "message": "Vendor account status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "new_status": "Active"
}
```

**Error Response (400 Bad Request):**
```json
{
    "detail": "Invalid account status. Must be one of: ACTIVE, INACTIVE, PENDING"
}
```

## Postman Examples

### Example 1: Activate a Vendor Account

**Request:**
```
PATCH {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440000/status?account_type=vendor
```

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Body:**
```json
{
    "account_status": "Active"
}
```

**Response:**
```json
{
    "message": "Vendor account status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "new_status": "Active"
}
```

### Example 2: Deactivate a Vehicle Owner Account

**Request:**
```
PATCH {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440001/status?account_type=vehicle_owner
```

**Body:**
```json
{
    "account_status": "Inactive"
}
```

**Response:**
```json
{
    "message": "Vehicle owner account status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "new_status": "Inactive"
}
```

### Example 3: Block a Driver

**Request:**
```
PATCH {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440002/status?account_type=driver
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
    "message": "Driver account status updated successfully",
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "new_status": "BLOCKED"
}
```

### Example 4: Set Account to Pending

**Request:**
```
PATCH {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440000/status?account_type=vendor
```

**Body:**
```json
{
    "account_status": "Pending"
}
```

## Frontend Implementation

### React/Next.js Example

```tsx
// components/AccountStatusUpdate.tsx
import React, { useState } from 'react';

interface AccountStatusUpdateProps {
  accountId: string;
  accountType: string;
  currentStatus: string;
  onStatusUpdate: () => void;
}

export default function AccountStatusUpdate({
  accountId,
  accountType,
  currentStatus,
  onStatusUpdate
}: AccountStatusUpdateProps) {
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const updateStatus = async (status: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/admin/accounts/${accountId}/status?account_type=${accountType}`,
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
        alert(`Status updated to ${data.new_status}`);
        onStatusUpdate(); // Refresh the account list
      } else {
        const error = await response.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update account status');
    } finally {
      setLoading(false);
    }
  };

  // Get available statuses based on account type
  const getAvailableStatuses = () => {
    if (accountType === 'driver' || accountType === 'quickdriver') {
      return ['ONLINE', 'OFFLINE', 'DRIVING', 'BLOCKED', 'PROCESSING'];
    } else {
      return ['Active', 'Inactive', 'Pending'];
    }
  };

  const availableStatuses = getAvailableStatuses();

  return (
    <div className="account-status-update">
      <h3>Update Account Status</h3>
      <p>Current Status: <strong>{currentStatus}</strong></p>
      
      <div className="status-buttons">
        {availableStatuses.map((status) => (
          <button
            key={status}
            onClick={() => updateStatus(status)}
            disabled={loading || status === currentStatus}
            className={`status-btn ${status.toLowerCase()}`}
          >
            {status === 'Active' && '✓ '}
            {status === 'Inactive' && '✗ '}
            {status === 'BLOCKED' && '🚫 '}
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
<!-- components/AccountStatusUpdate.vue -->
<template>
  <div class="account-status-update">
    <h3>Update Account Status</h3>
    <p>Current Status: <strong>{{ currentStatus }}</strong></p>
    
    <div class="status-buttons">
      <button
        v-for="status in availableStatuses"
        :key="status"
        @click="updateStatus(status)"
        :disabled="loading || status === currentStatus"
        :class="['status-btn', status.toLowerCase()]"
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
    accountId: String,
    accountType: String,
    currentStatus: String
  },
  data() {
    return {
      loading: false
    };
  },
  computed: {
    availableStatuses() {
      if (this.accountType === 'driver' || this.accountType === 'quickdriver') {
        return ['ONLINE', 'OFFLINE', 'DRIVING', 'BLOCKED', 'PROCESSING'];
      } else {
        return ['Active', 'Inactive', 'Pending'];
      }
    }
  },
  methods: {
    async updateStatus(status) {
      this.loading = true;
      try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(
          `/api/admin/accounts/${this.accountId}/status?account_type=${this.accountType}`,
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
          alert(`Status updated to ${data.new_status}`);
          this.$emit('status-updated');
        } else {
          const error = await response.json();
          alert(`Error: ${error.detail}`);
        }
      } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update account status');
      } finally {
        this.loading = false;
      }
    },
    getStatusIcon(status) {
      const icons = {
        'Active': '✓',
        'Inactive': '✗',
        'BLOCKED': '🚫',
        'ONLINE': '🟢',
        'OFFLINE': '⚫',
        'DRIVING': '🚗'
      };
      return icons[status] || '';
    }
  }
};
</script>
```

### CSS Styles

```css
.account-status-update {
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

.status-btn.active {
  background: #4CAF50;
  color: white;
}

.status-btn.inactive {
  background: #f44336;
  color: white;
}

.status-btn.pending {
  background: #ff9800;
  color: white;
}

.status-btn.online {
  background: #4CAF50;
  color: white;
}

.status-btn.offline {
  background: #757575;
  color: white;
}

.status-btn.blocked {
  background: #f44336;
  color: white;
}

.status-btn.driving {
  background: #2196F3;
  color: white;
}

.status-btn.processing {
  background: #ff9800;
  color: white;
}

.status-btn:hover:not(:disabled) {
  opacity: 0.8;
  transform: translateY(-2px);
}

.status-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## Integration with Account List

Here's how to integrate status update in your account list:

```tsx
// In your AccountList component
const handleStatusUpdate = async (accountId: string, accountType: string, newStatus: string) => {
  const token = localStorage.getItem('admin_token');
  const response = await fetch(
    `/api/admin/accounts/${accountId}/status?account_type=${accountType}`,
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
    // Refresh the account list
    fetchAccounts();
  }
};
```

## Quick Reference

### Activate Account
```bash
PATCH /api/admin/accounts/{id}/status?account_type={type}
Body: { "account_status": "Active" }
```

### Deactivate Account
```bash
PATCH /api/admin/accounts/{id}/status?account_type={type}
Body: { "account_status": "Inactive" }
```

### Block Driver
```bash
PATCH /api/admin/accounts/{id}/status?account_type=driver
Body: { "account_status": "BLOCKED" }
```

## Error Handling

Common errors and solutions:

1. **401 Unauthorized**: Make sure you're sending a valid admin token
2. **404 Not Found**: Check that the account_id and account_type are correct
3. **400 Bad Request**: Verify the status value matches the account type requirements
4. **500 Internal Server Error**: Check server logs for details

## Testing Checklist

- [ ] Activate a vendor account
- [ ] Deactivate a vendor account
- [ ] Activate a vehicle owner account
- [ ] Deactivate a vehicle owner account
- [ ] Set driver to ONLINE
- [ ] Set driver to OFFLINE
- [ ] Block a driver
- [ ] Set account to Pending
- [ ] Test with invalid status values
- [ ] Test with invalid account_id
- [ ] Test without authentication token

