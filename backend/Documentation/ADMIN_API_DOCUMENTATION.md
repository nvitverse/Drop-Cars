# Admin API Documentation

Complete API documentation for the Admin Panel APIs including Vendor Management, Vehicle Owner Management, Transfer Transactions, and Wallet Management.

## Table of Contents

1. [Authentication](#authentication)
2. [Vendor Management APIs](#vendor-management-apis)
3. [Vehicle Owner Management APIs](#vehicle-owner-management-apis)
4. [Car Management APIs](#car-management-apis)
5. [Driver Management APIs](#driver-management-apis)
6. [Transfer Transaction APIs](#transfer-transaction-apis)
7. [Admin Wallet Management APIs](#admin-wallet-management-apis)
8. [Data Models & Schemas](#data-models--schemas)
9. [Enums Reference](#enums-reference)

---

## Authentication

All admin APIs require authentication using a Bearer token obtained from the admin signin endpoint.

**Authorization Header:**
```
Authorization: Bearer <access_token>
```

**Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vendors" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Vendor Management APIs

### 1. List All Vendors

Get a paginated list of all vendors in the system.

**Endpoint:** `GET /api/admin/vendors`

**Query Parameters:**
- `skip` (integer, optional): Number of records to skip. Default: 0
- `limit` (integer, optional): Number of records to return. Default: 100, Max: 1000

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vendors?skip=0&limit=10" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "vendors": [
    {
      "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
      "full_name": "John Doe",
      "primary_number": "9876543210",
      "secondary_number": "9876543211",
      "gpay_number": "9876543212",
      "wallet_balance": 5000,
      "bank_balance": 2000,
      "aadhar_number": "123456789012",
      "aadhar_front_img": "https://storage.googleapis.com/...",
      "address": "123 Main Street",
      "city": "Mumbai",
      "pincode": "400001",
      "created_at": "2025-01-13T12:00:00Z"
    }
  ],
  "total_count": 150
}
```

**Response Fields:**
- `vendors` (array): List of vendor objects
  - `id` (UUID): Vendor details ID
  - `vendor_id` (UUID): Vendor credentials ID
  - `full_name` (string): Full name of vendor
  - `primary_number` (string): Primary mobile number
  - `secondary_number` (string, nullable): Secondary mobile number
  - `gpay_number` (string): GPay number
  - `wallet_balance` (integer): Wallet balance in paise
  - `bank_balance` (integer): Bank balance in paise
  - `aadhar_number` (string): 12-digit Aadhar number
  - `aadhar_front_img` (string, nullable): GCS URL of Aadhar front image
  - `address` (string): Address
  - `city` (string): City
  - `pincode` (string): 6-digit pincode
  - `created_at` (datetime): Creation timestamp
- `total_count` (integer): Total number of vendors

---

### 2. Get Vendor Full Details

Get complete details of a specific vendor including documents and account status.

**Endpoint:** `GET /api/admin/vendors/{vendor_id}`

**Path Parameters:**
- `vendor_id` (UUID): Vendor ID

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vendors/d290f1ee-6c54-4b01-90e6-d701748f0851" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
  "full_name": "John Doe",
  "primary_number": "9876543210",
  "secondary_number": "9876543211",
  "gpay_number": "9876543212",
  "wallet_balance": 5000,
  "bank_balance": 2000,
  "aadhar_number": "123456789012",
  "aadhar_front_img": "https://storage.googleapis.com/...",
  "aadhar_status": "VERIFIED",
  "address": "123 Main Street",
  "city": "Mumbai",
  "pincode": "400001",
  "account_status": "Active",
  "documents": {
    "aadhar": {
      "document_type": "aadhar",
      "status": "VERIFIED",
      "image_url": "https://storage.googleapis.com/... (signed URL)"
    }
  },
  "created_at": "2025-01-13T12:00:00Z"
}
```

**Response Fields:**
- All fields from list response, plus:
  - `aadhar_status` (string): Document status (PENDING, VERIFIED, INVALID)
  - `account_status` (string): Account status (Active, Inactive, Pending)
  - `documents` (object): Dictionary of documents with signed URLs

---

### 3. Update Vendor Account Status

Update the account status of a vendor.

**Endpoint:** `PATCH /api/admin/vendors/{vendor_id}/account-status`

**Path Parameters:**
- `vendor_id` (UUID): Vendor ID

**Request Body:**
```json
{
  "account_status": "ACTIVE"
}
```

**Valid Values for `account_status`:**
- `ACTIVE` or `Active` - Account is active
- `INACTIVE` or `Inactive` - Account is inactive
- `PENDING` or `Pending` - Account is pending approval

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/vendors/d290f1ee-6c54-4b01-90e6-d701748f0851/account-status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"account_status": "ACTIVE"}'
```

**Response:**
```json
{
  "message": "Vendor account status updated successfully",
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
  "new_status": "Active"
}
```

---

### 4. Update Vendor Document Status

Update the document verification status of a vendor.

**Endpoint:** `PATCH /api/admin/vendors/{vendor_id}/document-status`

**Path Parameters:**
- `vendor_id` (UUID): Vendor ID

**Request Body:**
```json
{
  "document_status": "VERIFIED"
}
```

**Valid Values for `document_status`:**
- `PENDING` - Document verification pending
- `VERIFIED` - Document verified
- `INVALID` - Document invalid/rejected

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/vendors/d290f1ee-6c54-4b01-90e6-d701748f0851/document-status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"document_status": "VERIFIED"}'
```

**Response:**
```json
{
  "message": "Vendor document status updated successfully",
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "VERIFIED"
}
```

---

## Vehicle Owner Management APIs

### 1. List All Vehicle Owners

Get a paginated list of all vehicle owners in the system.

**Endpoint:** `GET /api/admin/vehicle-owners`

**Query Parameters:**
- `skip` (integer, optional): Number of records to skip. Default: 0
- `limit` (integer, optional): Number of records to return. Default: 100, Max: 1000

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vehicle-owners?skip=0&limit=10" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "vehicle_owners": [
    {
      "id": "a290f1ee-6c54-4b01-90e6-d701748f0851",
      "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
      "full_name": "Jane Smith",
      "primary_number": "9876543213",
      "secondary_number": "9876543214",
      "wallet_balance": 10000,
      "aadhar_number": "987654321098",
      "aadhar_front_img": "https://storage.googleapis.com/...",
      "address": "456 Park Avenue",
      "city": "Delhi",
      "pincode": "110001",
      "created_at": "2025-01-13T12:00:00Z"
    }
  ],
  "total_count": 200
}
```

**Response Fields:**
- `vehicle_owners` (array): List of vehicle owner objects
  - `id` (UUID): Vehicle owner details ID
  - `vehicle_owner_id` (UUID): Vehicle owner credentials ID
  - `full_name` (string): Full name
  - `primary_number` (string): Primary mobile number
  - `secondary_number` (string, nullable): Secondary mobile number
  - `wallet_balance` (integer): Wallet balance in paise
  - `aadhar_number` (string): 12-digit Aadhar number
  - `aadhar_front_img` (string, nullable): GCS URL of Aadhar front image
  - `address` (string): Address
  - `city` (string): City
  - `pincode` (string): 6-digit pincode
  - `created_at` (datetime): Creation timestamp
- `total_count` (integer): Total number of vehicle owners

---

### 2. Get Vehicle Owner Full Details with Cars and Drivers

Get complete details of a vehicle owner including all their cars and drivers.

**Endpoint:** `GET /api/admin/vehicle-owners/{vehicle_owner_id}`

**Path Parameters:**
- `vehicle_owner_id` (UUID): Vehicle owner ID

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vehicle-owners/a290f1ee-6c54-4b01-90e6-d701748f0851" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "vehicle_owner": {
    "id": "a290f1ee-6c54-4b01-90e6-d701748f0851",
    "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
    "full_name": "Jane Smith",
    "primary_number": "9876543213",
    "secondary_number": "9876543214",
    "wallet_balance": 10000,
    "aadhar_number": "987654321098",
    "aadhar_front_img": "https://storage.googleapis.com/...",
    "aadhar_status": "VERIFIED",
    "address": "456 Park Avenue",
    "city": "Delhi",
    "pincode": "110001",
    "account_status": "Active",
    "documents": {
      "aadhar": {
        "document_type": "aadhar",
        "status": "VERIFIED",
        "image_url": "https://storage.googleapis.com/... (signed URL)"
      }
    },
    "created_at": "2025-01-13T12:00:00Z"
  },
  "cars": [
    {
      "id": "b290f1ee-6c54-4b01-90e6-d701748f0851",
      "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
      "car_name": "Toyota Camry",
      "car_type": "SEDAN",
      "car_number": "MH-12-AB-1234",
      "year_of_the_car": "2020",
      "rc_front_img_url": "https://storage.googleapis.com/...",
      "rc_front_status": "VERIFIED",
      "rc_back_img_url": "https://storage.googleapis.com/...",
      "rc_back_status": "VERIFIED",
      "insurance_img_url": "https://storage.googleapis.com/...",
      "insurance_status": "VERIFIED",
      "fc_img_url": "https://storage.googleapis.com/...",
      "fc_status": "VERIFIED",
      "car_img_url": "https://storage.googleapis.com/...",
      "car_img_status": "VERIFIED",
      "car_status": "ONLINE",
      "created_at": "2025-01-13T12:00:00Z"
    }
  ],
  "drivers": [
    {
      "id": "c290f1ee-6c54-4b01-90e6-d701748f0851",
      "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
      "full_name": "Driver Name",
      "primary_number": "9876543215",
      "secondary_number": "9876543216",
      "licence_number": "DL-1234567890",
      "licence_front_img": "https://storage.googleapis.com/...",
      "licence_front_status": "VERIFIED",
      "address": "789 Driver Street",
      "city": "Delhi",
      "pincode": "110002",
      "driver_status": "ONLINE",
      "created_at": "2025-01-13T12:00:00Z"
    }
  ]
}
```

**Response Fields:**
- `vehicle_owner` (object): Vehicle owner details (same structure as vendor full details)
- `cars` (array): List of cars owned by the vehicle owner
  - Each car includes all document statuses and signed URLs for document images
- `drivers` (array): List of drivers associated with the vehicle owner
  - Each driver includes license status and signed URL for license image

---

### 3. Update Vehicle Owner Account Status

Update the account status of a vehicle owner.

**Endpoint:** `PATCH /api/admin/vehicle-owners/{vehicle_owner_id}/account-status`

**Path Parameters:**
- `vehicle_owner_id` (UUID): Vehicle owner ID

**Request Body:**
```json
{
  "account_status": "ACTIVE"
}
```

**Valid Values:** Same as vendor account status

**Response:**
```json
{
  "message": "Vehicle owner account status updated successfully",
  "id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
  "new_status": "Active"
}
```

---

### 4. Update Vehicle Owner Document Status

Update the document verification status of a vehicle owner.

**Endpoint:** `PATCH /api/admin/vehicle-owners/{vehicle_owner_id}/document-status`

**Path Parameters:**
- `vehicle_owner_id` (UUID): Vehicle owner ID

**Request Body:**
```json
{
  "document_status": "VERIFIED"
}
```

**Valid Values:** Same as vendor document status

**Response:**
```json
{
  "message": "Vehicle owner document status updated successfully",
  "id": "a290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "VERIFIED"
}
```

---

## Car Management APIs

### 1. Update Car Account Status

Update the status of a car (available, blocked, etc.).

**Endpoint:** `PATCH /api/admin/cars/{car_id}/account-status`

**Path Parameters:**
- `car_id` (UUID): Car ID

**Request Body:**
```json
{
  "account_status": "ONLINE"
}
```

**Valid Values for `account_status`:**
- `ONLINE` - Car is online and available
- `DRIVING` - Car is currently on a trip
- `BLOCKED` - Car is blocked
- `PROCESSING` - Car documents are being processed

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/cars/b290f1ee-6c54-4b01-90e6-d701748f0851/account-status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"account_status": "ONLINE"}'
```

**Response:**
```json
{
  "message": "Car status updated successfully",
  "id": "b290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "ONLINE"
}
```

---

### 2. Update Car Document Status

Update the document verification status for a specific car document.

**Endpoint:** `PATCH /api/admin/cars/{car_id}/document-status?document_type={document_type}`

**Path Parameters:**
- `car_id` (UUID): Car ID

**Query Parameters:**
- `document_type` (string, required): Type of document to update
  - Valid values: `rc_front`, `rc_back`, `insurance`, `fc`, `car_img`

**Request Body:**
```json
{
  "document_status": "VERIFIED"
}
```

**Valid Values for `document_status`:**
- `PENDING` - Verification pending
- `VERIFIED` - Document verified
- `INVALID` - Document invalid/rejected

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/cars/b290f1ee-6c54-4b01-90e6-d701748f0851/document-status?document_type=rc_front" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"document_status": "VERIFIED"}'
```

**Response:**
```json
{
  "message": "Car rc_front document status updated successfully",
  "id": "b290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "VERIFIED"
}
```

---

## Driver Management APIs

### 1. Update Driver Account Status

Update the status of a driver.

**Endpoint:** `PATCH /api/admin/drivers/{driver_id}/account-status`

**Path Parameters:**
- `driver_id` (UUID): Driver ID

**Request Body:**
```json
{
  "account_status": "ONLINE"
}
```

**Valid Values for `account_status`:**
- `ONLINE` - Driver is online and available
- `OFFLINE` - Driver is offline
- `DRIVING` - Driver is currently driving
- `BLOCKED` - Driver is blocked
- `PROCESSING` - Driver documents are being processed

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/drivers/c290f1ee-6c54-4b01-90e6-d701748f0851/account-status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"account_status": "ONLINE"}'
```

**Response:**
```json
{
  "message": "Driver status updated successfully",
  "id": "c290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "ONLINE"
}
```

---

### 2. Update Driver Document Status

Update the license verification status of a driver.

**Endpoint:** `PATCH /api/admin/drivers/{driver_id}/document-status`

**Path Parameters:**
- `driver_id` (UUID): Driver ID

**Request Body:**
```json
{
  "document_status": "VERIFIED"
}
```

**Valid Values:** Same as other document statuses (PENDING, VERIFIED, INVALID)

**Request Example:**
```bash
curl -X PATCH "https://api.example.com/api/admin/drivers/c290f1ee-6c54-4b01-90e6-d701748f0851/document-status" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"document_status": "VERIFIED"}'
```

**Response:**
```json
{
  "message": "Driver document status updated successfully",
  "id": "c290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_status": "VERIFIED"
}
```

---

## Transfer Transaction APIs

### 1. List All Pending Transfer Requests

Get all pending transfer requests that need admin approval.

**Endpoint:** `GET /api/admin/transfers/pending`

**Query Parameters:**
- `skip` (integer, optional): Number of records to skip. Default: 0
- `limit` (integer, optional): Number of records to return. Default: 100, Max: 1000

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/transfers/pending?skip=0&limit=10" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "t290f1ee-6c54-4b01-90e6-d701748f0851",
      "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
      "requested_amount": 5000,
      "wallet_balance_before": 10000,
      "bank_balance_before": 2000,
      "wallet_balance_after": null,
      "bank_balance_after": null,
      "status": "Pending",
      "admin_notes": null,
      "created_at": "2025-01-13T12:00:00Z",
      "updated_at": "2025-01-13T12:00:00Z"
    }
  ],
  "total_count": 25
}
```

**Response Fields:**
- `transactions` (array): List of transfer transaction objects
  - `id` (UUID): Transaction ID
  - `vendor_id` (UUID): Vendor who requested the transfer
  - `requested_amount` (integer): Amount requested in paise
  - `wallet_balance_before` (integer): Wallet balance before transfer
  - `bank_balance_before` (integer): Bank balance before transfer
  - `wallet_balance_after` (integer, nullable): Wallet balance after transfer (null if pending)
  - `bank_balance_after` (integer, nullable): Bank balance after transfer (null if pending)
  - `status` (string): Transfer status (Pending, Approved, Rejected)
  - `admin_notes` (string, nullable): Notes from admin
  - `created_at` (datetime): Request creation time
  - `updated_at` (datetime): Last update time
- `total_count` (integer): Total number of pending transfers

---

### 2. Approve or Reject Transfer Request

Process a pending transfer request by approving or rejecting it.

**Endpoint:** `POST /api/admin/transfers/{transaction_id}/process`

**Path Parameters:**
- `transaction_id` (UUID): Transfer transaction ID

**Request Body:**
```json
{
  "action": "approve",
  "notes": "Transfer approved. Payment verified."
}
```

**Valid Values for `action`:**
- `approve` - Approve the transfer (moves money from wallet to bank balance)
- `reject` - Reject the transfer (no balance changes)

**Request Example:**
```bash
curl -X POST "https://api.example.com/api/admin/transfers/t290f1ee-6c54-4b01-90e6-d701748f0851/process" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "notes": "Transfer approved. Payment verified."
  }'
```

**Response:**
```json
{
  "id": "t290f1ee-6c54-4b01-90e6-d701748f0851",
  "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
  "requested_amount": 5000,
  "wallet_balance_before": 10000,
  "bank_balance_before": 2000,
  "wallet_balance_after": 5000,
  "bank_balance_after": 7000,
  "status": "Approved",
  "admin_notes": "Transfer approved. Payment verified.",
  "created_at": "2025-01-13T12:00:00Z",
  "updated_at": "2025-01-13T13:00:00Z"
}
```

**Note:** When approved:
- `wallet_balance_after` = `wallet_balance_before` - `requested_amount`
- `bank_balance_after` = `bank_balance_before` + `requested_amount`
- Status changes to "Approved"

When rejected:
- Balances remain unchanged
- Status changes to "Rejected"

---

### 3. Get Transfer Transaction Details

Get detailed information about a specific transfer transaction.

**Endpoint:** `GET /api/admin/transfers/{transaction_id}`

**Path Parameters:**
- `transaction_id` (UUID): Transfer transaction ID

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/transfers/t290f1ee-6c54-4b01-90e6-d701748f0851" \
  -H "Authorization: Bearer <token>"
```

**Response:** Same structure as transfer transaction object in list response

---

### 4. Get Vendor Balance (Admin View)

Get wallet and bank balance for a specific vendor.

**Endpoint:** `GET /api/admin/vendors/{vendor_id}/balance`

**Path Parameters:**
- `vendor_id` (UUID): Vendor ID

**Request Example:**
```bash
curl -X GET "https://api.example.com/api/admin/vendors/d290f1ee-6c54-4b01-90e6-d701748f0852/balance" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "vendor_id": "d290f1ee-6c54-4b01-90e6-d701748f0852",
  "wallet_balance": 5000,
  "bank_balance": 7000,
  "total_balance": 12000
}
```

---

## Admin Wallet Management APIs

### 1. Search Vehicle Owner by Primary Number

Search for a vehicle owner using their primary phone number before adding money.

**Endpoint:** `POST /api/admin/search-vehicle-owner`

**Request Body:**
```json
{
  "primary_number": "9876543213"
}
```

**Request Example:**
```bash
curl -X POST "https://api.example.com/api/admin/search-vehicle-owner" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"primary_number": "9876543213"}'
```

**Response:**
```json
{
  "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
  "full_name": "Jane Smith",
  "primary_number": "9876543213",
  "secondary_number": "9876543214",
  "wallet_balance": 10000,
  "aadhar_number": "987654321098",
  "address": "456 Park Avenue",
  "city": "Delhi",
  "pincode": "110001",
  "account_status": "Active"
}
```

---

### 2. Add Money to Vehicle Owner

Add money to a vehicle owner's wallet. This creates a transaction and updates the wallet balance.

**Endpoint:** `POST /api/admin/add-money-to-vehicle-owner`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `vehicle_owner_id` (string, required): Vehicle owner ID (UUID)
- `transaction_value` (integer, required): Amount in paise (e.g., 10000 = ₹100.00)
- `notes` (string, optional): Transaction notes
- `reference_value` (string, optional): Reference string for the transaction
- `transaction_img` (file, optional): Transaction image/proof (jpg, jpeg, png, pdf, max 5MB)

**Request Example:**
```bash
curl -X POST "https://api.example.com/api/admin/add-money-to-vehicle-owner" \
  -H "Authorization: Bearer <token>" \
  -F "vehicle_owner_id=a290f1ee-6c54-4b01-90e6-d701748f0852" \
  -F "transaction_value=10000" \
  -F "notes=Payment for order #12345" \
  -F "reference_value=PAY-12345" \
  -F "transaction_img=@/path/to/receipt.jpg"
```

**Response:**
```json
{
  "transaction_id": "e290f1ee-6c54-4b01-90e6-d701748f0851",
  "vehicle_owner_id": "a290f1ee-6c54-4b01-90e6-d701748f0852",
  "transaction_value": 10000,
  "transaction_img": "https://storage.googleapis.com/admin_transactions/...",
  "reference_value": "PAY-12345",
  "vehicle_owner_ledger_id": "f290f1ee-6c54-4b01-90e6-d701748f0851",
  "new_wallet_balance": 20000,
  "created_at": "2025-01-13T14:00:00Z"
}
```

**Response Fields:**
- `transaction_id` (UUID): Admin transaction ID
- `vehicle_owner_id` (UUID): Vehicle owner ID
- `transaction_value` (integer): Amount added in paise
- `transaction_img` (string, nullable): GCS URL of transaction proof image
- `reference_value` (string, nullable): Reference string provided
- `vehicle_owner_ledger_id` (UUID, nullable): Wallet ledger entry ID
- `new_wallet_balance` (integer): Updated wallet balance in paise
- `created_at` (datetime): Transaction creation time

**Important Notes:**
- Amount is specified in **paise** (smallest currency unit)
- Example: 10000 paise = ₹100.00
- Transaction image is optional but recommended for record-keeping
- Allowed image formats: jpg, jpeg, png, pdf
- Maximum file size: 5MB

---

## Data Models & Schemas

### Vendor List Response Schema

```json
{
  "vendors": [
    {
      "id": "UUID",
      "vendor_id": "UUID",
      "full_name": "string",
      "primary_number": "string",
      "secondary_number": "string | null",
      "gpay_number": "string",
      "wallet_balance": "integer",
      "bank_balance": "integer",
      "aadhar_number": "string",
      "aadhar_front_img": "string | null",
      "address": "string",
      "city": "string",
      "pincode": "string",
      "created_at": "datetime"
    }
  ],
  "total_count": "integer"
}
```

### Vehicle Owner Full Details Schema

```json
{
  "vehicle_owner": {
    "id": "UUID",
    "vehicle_owner_id": "UUID",
    "full_name": "string",
    "primary_number": "string",
    "secondary_number": "string | null",
    "wallet_balance": "integer",
    "aadhar_number": "string",
    "aadhar_front_img": "string | null",
    "aadhar_status": "string | null",
    "address": "string",
    "city": "string",
    "pincode": "string",
    "account_status": "string",
    "documents": {
      "aadhar": {
        "document_type": "string",
        "status": "string | null",
        "image_url": "string | null"
      }
    },
    "created_at": "datetime"
  },
  "cars": ["CarListItem"],
  "drivers": ["DriverListItem"]
}
```

### Status Update Request Schema

```json
{
  "account_status": "string"  // For account status updates
}
```

or

```json
{
  "document_status": "string"  // For document status updates
}
```

### Status Update Response Schema

```json
{
  "message": "string",
  "id": "UUID",
  "new_status": "string"
}
```

### Transfer Transaction Schema

```json
{
  "id": "UUID",
  "vendor_id": "UUID",
  "requested_amount": "integer",
  "wallet_balance_before": "integer",
  "bank_balance_before": "integer",
  "wallet_balance_after": "integer | null",
  "bank_balance_after": "integer | null",
  "status": "string",
  "admin_notes": "string | null",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

## Enums Reference

### Account Status Enum (Vendor & Vehicle Owner)

| Enum Name | Value | Description |
|-----------|-------|-------------|
| `ACTIVE` | `Active` | Account is active and operational |
| `INACTIVE` | `Inactive` | Account is inactive |
| `PENDING` | `Pending` | Account is pending approval |

**Table:** `vendor`, `vehicle_owner`  
**Field:** `account_status`

---

### Document Status Enum

| Enum Name | Value | Description |
|-----------|-------|-------------|
| `PENDING` | `PENDING` | Document verification is pending |
| `VERIFIED` | `VERIFIED` | Document has been verified |
| `INVALID` | `INVALID` | Document is invalid or rejected |

**Tables:** `vendor_details`, `vehicle_owner_details`, `car_details`, `car_driver`  
**Fields:** 
- Vendor: `aadhar_status`
- Vehicle Owner: `aadhar_status`
- Car: `rc_front_status`, `rc_back_status`, `insurance_status`, `fc_status`, `car_img_status`
- Driver: `licence_front_status`

---

### Car Status Enum

| Enum Name | Value | Description |
|-----------|-------|-------------|
| `ONLINE` | `ONLINE` | Car is online and available for bookings |
| `DRIVING` | `DRIVING` | Car is currently on a trip |
| `BLOCKED` | `BLOCKED` | Car is blocked from service |
| `PROCESSING` | `PROCESSING` | Car documents are being processed |

**Table:** `car_details`  
**Field:** `car_status`

---

### Car Type Enum

| Enum Name | Value |
|-----------|-------|
| `SEDAN` | `SEDAN` |
| `SUV` | `SUV` |
| `INNOVA` | `INNOVA` |
| `NEW_SEDAN` | `NEW_SEDAN` |
| `HATCHBACK` | `HATCHBACK` |
| `INNOVA_CRYSTA` | `INNOVA_CRYSTA` |

**Table:** `car_details`  
**Field:** `car_type`

---

### Driver Status Enum

| Enum Name | Value | Description |
|-----------|-------|-------------|
| `ONLINE` | `ONLINE` | Driver is online and available |
| `OFFLINE` | `OFFLINE` | Driver is offline |
| `DRIVING` | `DRIVING` | Driver is currently driving |
| `BLOCKED` | `BLOCKED` | Driver is blocked |
| `PROCESSING` | `PROCESSING` | Driver documents are being processed |

**Table:** `car_driver`  
**Field:** `driver_status`

---

### Transfer Status Enum

| Enum Name | Value | Description |
|-----------|-------|-------------|
| `PENDING` | `Pending` | Transfer request is pending admin approval |
| `APPROVED` | `Approved` | Transfer has been approved and processed |
| `REJECTED` | `Rejected` | Transfer has been rejected |

**Table:** `transfer_transactions`  
**Field:** `status`

---

## Error Responses

All APIs return standard HTTP status codes:

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

**Error Response Format:**
```json
{
  "detail": "Error message description"
}
```

**Example:**
```json
{
  "detail": "Vendor not found"
}
```

---

## Notes

1. **Currency:** All monetary values are in **paise** (Indian currency smallest unit). To convert to rupees, divide by 100. Example: 10000 paise = ₹100.00

2. **Image URLs:** Document image URLs are GCS (Google Cloud Storage) URLs. Full details endpoints return signed URLs that expire after 2 minutes. List endpoints return regular GCS URLs.

3. **Pagination:** All list endpoints support pagination using `skip` and `limit` parameters. Maximum `limit` is 1000.

4. **UUID Format:** All IDs are UUIDs (Universally Unique Identifiers) in the format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

5. **DateTime Format:** All datetime fields use ISO 8601 format: `YYYY-MM-DDTHH:mm:ssZ`

6. **Authentication:** All admin endpoints require Bearer token authentication. Obtain the token from the admin signin endpoint.

7. **Status Updates:** Status fields are case-insensitive. You can send either enum names (ACTIVE, INACTIVE, etc.) or values (Active, Inactive, etc.).

---

## API Base URL

All endpoints are prefixed with `/api`:
- Base URL: `https://api.example.com/api`

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-13
