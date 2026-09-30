# Admin Add Money to Vehicle Owner API Documentation

## Overview

This API allows admin users to add money to vehicle owner accounts. The process involves:
1. Searching for a vehicle owner by their primary phone number
2. Adding money to their wallet with optional transaction details and image

All endpoints require admin authentication via JWT bearer token.

---

## Authentication

All endpoints require admin authentication. Include the admin's JWT token in the Authorization header:

```
Authorization: Bearer <admin_jwt_token>
```

---

## API Endpoints

### 1. Search Vehicle Owner by Primary Number

Searches for a vehicle owner by their primary phone number to retrieve their information.

**Endpoint:** `POST /api/admin/search-vehicle-owner`

**Authentication:** Required (Admin token)

**Request Body:**
```json
{
  "primary_number": "9876543210"
}
```

**Response:**
```json
{
  "vehicle_owner_id": "123e4567-e89b-12d3-a456-426614174000",
  "full_name": "John Doe",
  "primary_number": "9876543210",
  "secondary_number": "9876543211",
  "wallet_balance": 5000,
  "aadhar_number": "123456789012",
  "address": "123 Main St",
  "city": "Mumbai",
  "pincode": "400001",
  "account_status": "Active"
}
```

**Response Fields:**
- `vehicle_owner_id` (UUID): Unique identifier for the vehicle owner
- `full_name` (string): Full name of the vehicle owner
- `primary_number` (string): Primary phone number
- `secondary_number` (string, optional): Secondary phone number
- `wallet_balance` (integer): Current wallet balance in paise
- `aadhar_number` (string): Aadhar number
- `address` (string): Physical address
- `city` (string): City name
- `pincode` (string): Postal code
- `account_status` (string): Account status (Active, Inactive, Pending)

**Error Responses:**
- `404 Not Found`: Vehicle owner with the given primary number not found
- `500 Internal Server Error`: Server error

---

### 2. Add Money to Vehicle Owner

Adds money to a vehicle owner's wallet. Updates the wallet balance and creates a ledger entry.

**Endpoint:** `POST /api/admin/add-money-to-vehicle-owner`

**Authentication:** Required (Admin token)

**Content-Type:** `multipart/form-data`

**Request Body (multipart/form-data):**
```
vehicle_owner_id: "123e4567-e89b-12d3-a456-426614174001"
transaction_value: 10000
notes: "Payment for service completion"
reference_value: "REF-12345" (optional)
```

**Request Form Data:**
- `vehicle_owner_id` (string, required): UUID of the vehicle owner
- `transaction_value` (integer, required): Amount to add in paise. Must be greater than 0.
- `notes` (string, optional): Transaction notes
- `reference_value` (string, optional): Reference string for the transaction
- `transaction_img` (file, optional): Transaction image/document
  - Allowed formats: .jpg, .jpeg, .png, .pdf

**Response:**
```json
{
  "transaction_id": "123e4567-e89b-12d3-a456-426614174000",
  "vehicle_owner_id": "123e4567-e89b-12d3-a456-426614174001",
  "transaction_value": 10000,
  "transaction_img": "https://storage.googleapis.com/bucket/admin_transactions/uuid.jpg",
  "reference_value": "REF-12345",
  "vehicle_owner_ledger_id": "123e4567-e89b-12d3-a456-426614174002",
  "new_wallet_balance": 15000,
  "created_at": "2025-01-15T10:30:00Z"
}
```

**Response Fields:**
- `transaction_id` (UUID): Unique identifier for the transaction
- `vehicle_owner_id` (UUID): Vehicle owner ID
- `transaction_value` (integer): Amount added in paise
- `transaction_img` (string, optional): GCS URL of the transaction image
- `reference_value` (string, optional): Reference string for the transaction
- `vehicle_owner_ledger_id` (UUID): Reference to wallet ledger entry
- `new_wallet_balance` (integer): Updated wallet balance in paise
- `created_at` (datetime): Timestamp of transaction

**Business Logic:**
1. Validates that the vehicle owner exists
2. Validates that `transaction_value` is greater than 0
3. Updates the vehicle owner's wallet balance
4. Creates a CREDIT entry in the wallet ledger
5. Links the ledger entry to the admin transaction
6. If `transaction_img` is provided:
   - Validates file format (.jpg, .jpeg, .png, .pdf)
   - Uploads to Google Cloud Storage (GCS)
   - Stores the GCS URL in the transaction record
7. Creates a record in `admin_add_money_to_vehicle_owner` table with `reference_value` if provided

**Error Responses:**
- `400 Bad Request`: Invalid file type
- `404 Not Found`: Vehicle owner not found
- `500 Internal Server Error`: Server error

---

## Database Schema

### Table: `admin_add_money_to_vehicle_owner`

Stores admin transactions to add money to vehicle owners.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `vehicle_owner_id` | UUID | Foreign key to vehicle_owner table |
| `transaction_value` | Integer | Amount added in paise (mandatory) |
| `transaction_img` | String | GCS URL of transaction image (optional) |
| `reference_value` | String | Reference string for the transaction (optional) |
| `vehicle_owner_ledger_id` | UUID | Foreign key to wallet_ledger table (optional) |
| `created_at` | Timestamp | Transaction timestamp |

### Table: `wallet_ledger`

Stores wallet transaction history. Entries created with:
- `reference_type`: "ADMIN_ADD_MONEY"
- `entry_type`: "CREDIT"
- `reference_id`: UUID of the admin transaction

---

## Example Usage

### 1. Search for Vehicle Owner

**Request:**
```bash
curl -X POST "https://api.example.com/api/admin/search-vehicle-owner" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_number": "9876543210"
  }'
```

**Response:**
```json
{
  "vehicle_owner_id": "abc123...",
  "full_name": "John Doe",
  "primary_number": "9876543210",
  "wallet_balance": 5000,
  ...
}
```

### 2. Add Money with Transaction Image

**Request:**
```bash
curl -X POST "https://api.example.com/api/admin/add-money-to-vehicle-owner" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "vehicle_owner_id=abc123..." \
  -F "transaction_value=10000" \
  -F "notes=Payment for service" \
  -F "reference_value=REF-12345" \
  -F "transaction_img=@/path/to/receipt.jpg"
```

**Response:**
```json
{
  "transaction_id": "def456...",
  "vehicle_owner_id": "abc123...",
  "transaction_value": 10000,
  "transaction_img": "https://storage.googleapis.com/...",
  "reference_value": "REF-12345",
  "new_wallet_balance": 15000,
  ...
}
```

### 3. Add Money Without Image

**Request:**
```bash
curl -X POST "https://api.example.com/api/admin/add-money-to-vehicle-owner" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "vehicle_owner_id=abc123..." \
  -F "transaction_value=5000" \
  -F "notes=Bonus payment" \
  -F "reference_value=REF-67890"
```

---

## Notes

1. **Transaction Value is Mandatory**: Must be provided and greater than 0. The wallet balance will always be updated.

2. **Transaction Image is Optional**: Image uploads are stored in Google Cloud Storage under the `admin_transactions` folder.

3. **Reference Value is Optional**: Can be used to store custom reference information like invoice numbers, order IDs, etc.

4. **Wallet Ledger**: A ledger entry is always created when adding money to the wallet.

5. **Balance Updates**: Wallet balance updates are atomic - both the balance and ledger entry are created in the same transaction.

6. **Currency**: All amounts are in paise (smallest currency unit). Divide by 100 to get the amount in the main currency unit.

---

## Error Handling

| Error Code | Description | Solution |
|------------|-------------|----------|
| 400 Bad Request | Invalid request data or file type | Check request body and file format |
| 401 Unauthorized | Invalid or missing admin token | Provide valid admin JWT token |
| 404 Not Found | Vehicle owner not found | Verify the vehicle owner exists |
| 500 Internal Server Error | Server error | Contact support |

---

## Testing

To test the API:

1. **Get Admin Token**: Use admin signin endpoint
2. **Search Vehicle Owner**: Use the primary number to find a vehicle owner
3. **Add Money**: Use the vehicle owner ID to add money
4. **Verify**: Check the wallet ledger and balance updates

---

## Security Notes

- Admin authentication is required for all endpoints
- Transaction images are stored in secure GCS buckets
- All database operations use transactions for data consistency
- File uploads validate file types before processing

