# Vendor API Documentation

This document provides comprehensive information about the Vendor Signup and Signin APIs, including request/response formats, examples, and error handling.

## Overview

The Vendor API consists of two main endpoints:
1. **Vendor Signup** - Creates a new vendor account with credentials and details
2. **Vendor Signin** - Authenticates existing vendors

### Database Structure

The vendor data is stored in two related tables:
- **`vendor`** - Stores authentication credentials and account status
- **`vendor_details`** - Stores detailed vendor information including personal details

The tables are linked via `vendor_id` (from vendor table) → `vendor_details.vendor_id`

## API Endpoints

### 1. Vendor Signup

**Endpoint:** `POST /api/users/vendor/signup`

**Description:** Creates a new vendor account with both credentials and details. Uploads aadhar image to Google Cloud Storage (GCS) and stores the URL in the database. Implements rollback mechanism - if database insertion fails, the uploaded image is deleted from GCS.

**Content-Type:** `multipart/form-data`

#### Request Parameters

| Parameter | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `full_name` | string | Yes | Full name of the vendor | 3-100 characters |
| `primary_number` | string | Yes | Primary mobile number | Indian mobile format (+919876543210 or 9876543210) |
| `secondary_number` | string | No | Secondary mobile number | Indian mobile format |
| `password` | string | Yes | Account password | Minimum 6 characters |
| `address` | string | Yes | Vendor's address | Minimum 10 characters |
| `aadhar_number` | string | Yes | Aadhar card number | Exactly 12 digits |
| `gpay_number` | string | Yes | GPay mobile number | Indian mobile format |
| `organization_id` | string | No | Organization identifier | Optional |
| `aadhar_image` | file | No | Aadhar front image | Image file, max 5MB |

#### Request Example

```bash
curl -X POST "http://localhost:8000/api/users/vendor/signup" \
  -H "Content-Type: multipart/form-data" \
  -F "full_name=John Doe" \
  -F "primary_number=+919876543210" \
  -F "secondary_number=+919876543211" \
  -F "password=secure123" \
  -F "address=123 Main Street, Mumbai, Maharashtra 400001" \
  -F "aadhar_number=123456789012" \
  -F "gpay_number=+919876543212" \
  -F "organization_id=ORG001" \
  -F "aadhar_image=@/path/to/aadhar_front.jpg"
```

#### Response Example (Success - 201 Created)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMjkwZjFlZS02YzU0LTRiMDEtOTBlNi1kNzAxNzQ4ZjA4NTEiLCJleHAiOjE3MzQ1NjgwMDB9.example",
  "token_type": "bearer",
  "vendor": {
    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "organization_id": "ORG001",
    "full_name": "John Doe",
    "primary_number": "+919876543210",
    "secondary_number": "+919876543211",
    "gpay_number": "+919876543212",
    "wallet_balance": 0,
    "aadhar_number": "123456789012",
    "aadhar_front_img": "https://storage.googleapis.com/drop-cars-files/vendor_details/aadhar/uuid.jpg",
    "address": "123 Main Street, Mumbai, Maharashtra 400001",
    "account_status": "Pending",
    "created_at": "2025-01-13T12:00:00Z"
  }
}
```

#### Error Responses

**400 Bad Request - Validation Errors**
```json
{
  "detail": "Vendor with this primary number already registered"
}
```

```json
{
  "detail": "Aadhar number already registered"
}
```

```json
{
  "detail": "GPay number already registered"
}
```

```json
{
  "detail": "File must be an image"
}
```

```json
{
  "detail": "Image size must be less than 5MB"
}
```

**500 Internal Server Error**
```json
{
  "detail": "Failed to create vendor: Database connection error"
}
```

### 2. Vendor Signin

**Endpoint:** `POST /api/users/vendor/signin`

**Description:** Authenticates vendor with primary number and password. Returns access token and vendor details upon successful authentication.

**Content-Type:** `application/json`

#### Request Body

```json
{
  "primary_number": "+919876543210",
  "password": "secure123"
}
```

#### Request Example

```bash
curl -X POST "http://localhost:8000/api/users/vendor/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_number": "+919876543210",
    "password": "secure123"
  }'
```

#### Response Example (Success - 200 OK)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMjkwZjFlZS02YzU0LTRiMDEtOTBlNi1kNzAxNzQ4ZjA4NTEiLCJleHAiOjE3MzQ1NjgwMDB9.example",
  "token_type": "bearer",
  "vendor": {
    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "organization_id": "ORG001",
    "full_name": "John Doe",
    "primary_number": "+919876543210",
    "secondary_number": "+919876543211",
    "gpay_number": "+919876543212",
    "wallet_balance": 0,
    "aadhar_number": "123456789012",
    "aadhar_front_img": "https://storage.googleapis.com/drop-cars-files/vendor_details/aadhar/uuid.jpg",
    "address": "123 Main Street, Mumbai, Maharashtra 400001",
    "account_status": "Pending",
    "created_at": "2025-01-13T12:00:00Z"
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "detail": "Invalid primary number or password"
}
```

**404 Not Found**
```json
{
  "detail": "Vendor details not found"
}
```

## Database Schema

### Vendor Table (`vendor`)
```sql
CREATE TABLE vendor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id VARCHAR,
    primary_number VARCHAR NOT NULL UNIQUE,
    hashed_password VARCHAR NOT NULL,
    account_status account_status_enum DEFAULT 'Inactive',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Vendor Details Table (`vendor_details`)
```sql
CREATE TABLE vendor_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendor(id),
    organization_id VARCHAR,
    full_name VARCHAR NOT NULL,
    primary_number VARCHAR NOT NULL UNIQUE,
    secondary_number VARCHAR UNIQUE,
    wallet_balance INTEGER NOT NULL DEFAULT 0,
    gpay_number VARCHAR NOT NULL UNIQUE,
    aadhar_number VARCHAR NOT NULL UNIQUE,
    aadhar_front_img VARCHAR UNIQUE,
    adress VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Key Features

### 1. Data Validation
- **Phone Numbers**: Validates Indian mobile number format
- **Aadhar Number**: Ensures exactly 12 digits
- **Password**: Minimum 6 characters
- **Image**: Validates file type and size (max 5MB)

### 2. GCS Integration
- Aadhar images are uploaded to Google Cloud Storage
- Images are stored in `vendor_details/aadhar/` folder
- Public URLs are stored in the database
- Automatic cleanup on failed database operations

### 3. Rollback Mechanism
- If database insertion fails, uploaded images are automatically deleted from GCS
- Ensures data consistency between storage and database

### 4. Security Features
- Password hashing using bcrypt
- JWT token-based authentication
- Unique constraints on critical fields (phone numbers, aadhar, gpay)

### 5. Account Status Management
- New vendors start with "Pending" status
- Status can be updated to "Active" or "Inactive" by admin

## Example Data

### Sample Vendor Registration Data
```json
{
  "full_name": "Rahul Sharma",
  "primary_number": "+919876543210",
  "secondary_number": "+919876543211",
  "password": "secure123",
  "address": "456 Park Street, Bangalore, Karnataka 560001",
  "aadhar_number": "987654321098",
  "gpay_number": "+919876543212",
  "organization_id": "VENDOR_001"
}
```

### Sample Database Records

**Vendor Table:**
```sql
INSERT INTO vendor (id, organization_id, primary_number, hashed_password, account_status) 
VALUES (
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'VENDOR_001',
  '+919876543210',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK2',
  'Pending'
);
```

**Vendor Details Table:**
```sql
INSERT INTO vendor_details (
  id, vendor_id, organization_id, full_name, primary_number, 
  secondary_number, gpay_number, aadhar_number, aadhar_front_img, adress
) VALUES (
  'e390f2ff-7d65-5c12-1f17-e8128595g162',
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'VENDOR_001',
  'Rahul Sharma',
  '+919876543210',
  '+919876543211',
  '+919876543212',
  '987654321098',
  'https://storage.googleapis.com/drop-cars-files/vendor_details/aadhar/uuid.jpg',
  '456 Park Street, Bangalore, Karnataka 560001'
);
```

## Error Handling

The API implements comprehensive error handling:

1. **Validation Errors**: Returns 400 with specific validation messages
2. **Duplicate Data**: Returns 400 for existing phone numbers, aadhar, or gpay
3. **Authentication Errors**: Returns 401 for invalid credentials
4. **Database Errors**: Returns 500 with rollback and GCS cleanup
5. **File Upload Errors**: Validates file type and size before processing

## Testing

### Test Cases

1. **Successful Signup**: Valid data with image upload
2. **Signup without Image**: Valid data without optional image
3. **Duplicate Phone Number**: Attempt to register with existing phone
4. **Invalid Image**: Non-image file upload
5. **Large Image**: Image exceeding 5MB limit
6. **Successful Signin**: Valid credentials
7. **Invalid Signin**: Wrong password or phone number

### Sample Test Data

```python
# Test vendor data
test_vendor = {
    "full_name": "Test Vendor",
    "primary_number": "+919876543213",
    "password": "test123",
    "address": "Test Address, Test City, Test State 123456",
    "aadhar_number": "111111111111",
    "gpay_number": "+919876543214"
}

# Test signin data
test_signin = {
    "primary_number": "+919876543213",
    "password": "test123"
}
```

## Security Considerations

1. **Password Security**: Passwords are hashed using bcrypt
2. **Token Security**: JWT tokens with expiration (30 minutes)
3. **Input Validation**: Comprehensive validation for all inputs
4. **File Security**: Image file type and size validation
5. **Database Security**: Unique constraints and proper relationships
6. **GCS Security**: Proper file cleanup on failures

## Dependencies

- FastAPI
- SQLAlchemy
- Passlib (bcrypt)
- Python-Jose (JWT)
- Google Cloud Storage
- Pydantic (validation)
- Python-multipart (file uploads)
