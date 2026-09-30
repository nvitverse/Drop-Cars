# Postman Testing Guide for Admin Account Management APIs

## Prerequisites

1. **Base URL**: Replace `{BASE_URL}` with your server URL (e.g., `http://localhost:8000` or `https://your-api-domain.com`)
2. **Admin Authentication**: All endpoints require admin authentication via Bearer token

---

## Step 1: Get Admin Access Token

### Admin Signin
**Method:** `POST`  
**URL:** `{BASE_URL}/api/admin/signin`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
    "username": "admin_user",
    "password": "your_password"
}
```

**Example Response:**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMjkwZjFlZS02YzU0LTRiMDEtOTBlNi1kNzAxNzQ4ZjA4NTEiLCJleHAiOjE3MDAwMDAwMDB9.example_token",
    "token_type": "bearer",
    "admin": {
        "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
        "username": "admin_user",
        "email": "admin@dropcars.com",
        "phone": "9876543210",
        "role": "Manager",
        "organization_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
        "created_at": "2025-01-13T12:00:00Z"
    }
}
```

**Copy the `access_token` value for use in subsequent requests.**

---

## Step 2: Test API 1 - Get All Accounts

### Endpoint: Get All Accounts
**Method:** `GET`  
**URL:** `{BASE_URL}/api/admin/accounts`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Test Cases:

#### Test Case 1: Get All Accounts (No Filters)
**Query Parameters:** (Leave empty or use defaults)
- `skip`: 0 (optional, default: 0)
- `limit`: 100 (optional, default: 100)

**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts?skip=0&limit=100
```

**Expected Response:**
```json
{
    "accounts": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "John Doe",
            "account_type": "vendor",
            "account_status": "Active"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "name": "Jane Smith",
            "account_type": "vehicle_owner",
            "account_status": "Active"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "name": "Driver Name",
            "account_type": "driver",
            "account_status": "ONLINE"
        }
    ],
    "total_count": 150,
    "active_count": 120,
    "inactive_count": 30
}
```

#### Test Case 2: Filter by Account Type (Vendors Only)
**Query Parameters:**
- `account_type`: `vendor`
- `skip`: 0
- `limit`: 50

**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts?account_type=vendor&skip=0&limit=50
```

**Expected Response:**
```json
{
    "accounts": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "John Doe",
            "account_type": "vendor",
            "account_status": "Active"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440003",
            "name": "Another Vendor",
            "account_type": "vendor",
            "account_status": "Inactive"
        }
    ],
    "total_count": 45,
    "active_count": 30,
    "inactive_count": 15
}
```

#### Test Case 3: Filter by Status (Active Accounts Only)
**Query Parameters:**
- `status_filter`: `active`
- `skip`: 0
- `limit`: 100

**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts?status_filter=active&skip=0&limit=100
```

**Expected Response:**
```json
{
    "accounts": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "John Doe",
            "account_type": "vendor",
            "account_status": "Active"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "name": "Jane Smith",
            "account_type": "vehicle_owner",
            "account_status": "Active"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "name": "Driver Name",
            "account_type": "driver",
            "account_status": "ONLINE"
        }
    ],
    "total_count": 120,
    "active_count": 120,
    "inactive_count": 0
}
```

#### Test Case 4: Filter by Account Type and Status
**Query Parameters:**
- `account_type`: `driver`
- `status_filter`: `ONLINE`
- `skip`: 0
- `limit`: 50

**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts?account_type=driver&status_filter=ONLINE&skip=0&limit=50
```

**Expected Response:**
```json
{
    "accounts": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "name": "Driver Name",
            "account_type": "driver",
            "account_status": "ONLINE"
        }
    ],
    "total_count": 25,
    "active_count": 25,
    "inactive_count": 0
}
```

#### Test Case 5: Filter Inactive Vehicle Owners
**Query Parameters:**
- `account_type`: `vehicle_owner`
- `status_filter`: `inactive`
- `skip`: 0
- `limit`: 100

**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts?account_type=vehicle_owner&status_filter=inactive&skip=0&limit=100
```

---

## Step 3: Test API 2 - Get Account Details by ID

### Endpoint: Get Account Full Details
**Method:** `GET`  
**URL:** `{BASE_URL}/api/admin/accounts/{account_id}`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Parameters:**
- `account_type`: Required - One of: `vendor`, `vehicle_owner`, `driver`, `quickdriver`

### Test Cases:

#### Test Case 1: Get Vendor Details
**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440000?account_type=vendor
```

**Expected Response:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "account_type": "vendor",
    "account_status": "Active",
    "vendor_id": "550e8400-e29b-41d4-a716-446655440000",
    "full_name": "John Doe",
    "primary_number": "9876543210",
    "secondary_number": "9876543211",
    "gpay_number": "9876543210",
    "wallet_balance": 50000,
    "bank_balance": 100000,
    "aadhar_number": "1234 5678 9012",
    "aadhar_front_img": "https://storage.googleapis.com/...",
    "aadhar_status": "VERIFIED",
    "address": "123 Main Street",
    "city": "Mumbai",
    "pincode": "400001",
    "licence_number": null,
    "licence_front_img": null,
    "licence_front_status": null,
    "created_at": "2025-01-01T10:00:00Z",
    "documents": {
        "aadhar": {
            "document_type": "aadhar",
            "status": "VERIFIED",
            "image_url": "https://storage.googleapis.com/..."
        }
    }
}
```

#### Test Case 2: Get Vehicle Owner Details
**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440001?account_type=vehicle_owner
```

**Expected Response:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "account_type": "vehicle_owner",
    "account_status": "Active",
    "vendor_id": null,
    "vehicle_owner_id": "550e8400-e29b-41d4-a716-446655440001",
    "full_name": "Jane Smith",
    "primary_number": "9876543220",
    "secondary_number": "9876543221",
    "gpay_number": null,
    "wallet_balance": 75000,
    "bank_balance": null,
    "aadhar_number": "2345 6789 0123",
    "aadhar_front_img": "https://storage.googleapis.com/...",
    "aadhar_status": "VERIFIED",
    "address": "456 Park Avenue",
    "city": "Delhi",
    "pincode": "110001",
    "licence_number": null,
    "licence_front_img": null,
    "licence_front_status": null,
    "created_at": "2025-01-02T11:00:00Z",
    "documents": {
        "aadhar": {
            "document_type": "aadhar",
            "status": "VERIFIED",
            "image_url": "https://storage.googleapis.com/..."
        }
    }
}
```

#### Test Case 3: Get Driver Details
**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440002?account_type=driver
```

**Expected Response:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "account_type": "driver",
    "account_status": "ONLINE",
    "vendor_id": null,
    "vehicle_owner_id": "550e8400-e29b-41d4-a716-446655440001",
    "full_name": "Driver Name",
    "primary_number": "9876543230",
    "secondary_number": "9876543231",
    "gpay_number": null,
    "wallet_balance": null,
    "bank_balance": null,
    "aadhar_number": null,
    "aadhar_front_img": null,
    "aadhar_status": null,
    "address": "789 Driver Street",
    "city": "Bangalore",
    "pincode": "560001",
    "licence_number": "DL1234567890",
    "licence_front_img": "https://storage.googleapis.com/...",
    "licence_front_status": "VERIFIED",
    "created_at": "2025-01-03T12:00:00Z",
    "documents": {
        "licence": {
            "document_type": "licence",
            "status": "VERIFIED",
            "image_url": "https://storage.googleapis.com/..."
        }
    }
}
```

#### Test Case 4: Get Driver Details (Using quickdriver)
**Full URL Example:**
```
GET {BASE_URL}/api/admin/accounts/550e8400-e29b-41d4-a716-446655440002?account_type=quickdriver
```

**Note:** `quickdriver` is treated the same as `driver`

---

## Postman Collection Setup

### Environment Variables (Optional)
Create a Postman environment with:
- `base_url`: Your API base URL
- `admin_token`: Store the access token after signin

### Collection Structure
1. **Admin Authentication**
   - Admin Signin

2. **Account Management**
   - Get All Accounts
   - Get All Accounts (Filter by Type)
   - Get All Accounts (Filter by Status)
   - Get All Accounts (Filter by Type & Status)
   - Get Vendor Details
   - Get Vehicle Owner Details
   - Get Driver Details

---

## Common Status Values

### For Vendors & Vehicle Owners:
- `Active`
- `Inactive`
- `Pending`

### For Drivers:
- `ONLINE`
- `OFFLINE`
- `DRIVING`
- `BLOCKED`
- `PROCESSING`

### Filter Values:
- `active` - Returns active vendors/owners and ONLINE/DRIVING drivers
- `inactive` - Returns inactive vendors/owners and OFFLINE/BLOCKED/PROCESSING drivers
- `pending` - Returns pending vendors/owners only

---

## Error Responses

### 401 Unauthorized (Missing/Invalid Token)
```json
{
    "detail": "Not authenticated"
}
```

### 404 Not Found (Account Not Found)
```json
{
    "detail": "Account not found with ID 550e8400-e29b-41d4-a716-446655440000 and type vendor"
}
```

### 422 Validation Error (Invalid Query Parameters)
```json
{
    "detail": [
        {
            "loc": ["query", "account_type"],
            "msg": "field required",
            "type": "value_error.missing"
        }
    ]
}
```

---

## Tips for Testing

1. **Save Token**: After signin, save the `access_token` to use in all subsequent requests
2. **Use Variables**: Use Postman variables for `{account_id}` to easily test different accounts
3. **Test Filters**: Try different combinations of `account_type` and `status_filter`
4. **Check Pagination**: Test with different `skip` and `limit` values
5. **Verify Counts**: Check that `active_count + inactive_count` equals `total_count` (or close, depending on pending status)

---

## Quick Test Checklist

- [ ] Admin signin successful
- [ ] Get all accounts (no filters)
- [ ] Get all accounts (filter by vendor)
- [ ] Get all accounts (filter by vehicle_owner)
- [ ] Get all accounts (filter by driver)
- [ ] Get all accounts (filter by active status)
- [ ] Get all accounts (filter by inactive status)
- [ ] Get vendor details by ID
- [ ] Get vehicle owner details by ID
- [ ] Get driver details by ID
- [ ] Test pagination (skip/limit)
- [ ] Test error cases (invalid ID, missing account_type)

