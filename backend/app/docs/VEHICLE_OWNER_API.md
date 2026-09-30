## Vehicle Owner API - Signup and Login

All paths are prefixed with `/api/users`. Base URL for local dev: `http://localhost:8000`.

### Signup
- **Endpoint**: `POST /api/users/vehicleowner/signup`
- **Description**: Create a new vehicle owner, upload Aadhar front image, and persist details.
- **Consumes**: `multipart/form-data`

#### Form fields
- **full_name**: string, 3-100 chars
- **primary_number**: string, valid Indian mobile (`+919876543210` or `9876543210`)
- **secondary_number**: string, optional, valid Indian mobile
- **password**: string, min 6 chars
- **address**: string, min 10 chars
- **aadhar_number**: string, exactly 12 digits
- **organization_id**: string, optional
- **aadhar_front_img**: file, required image (JPEG/PNG), max size 5 MB

Validation errors on the form will return HTTP 422 with details.

#### Success response
- **Status**: 200 OK
- **Body**:
```json
{
  "message": "Vehicle owner registered successfully",
  "user_id": "<uuid>",
  "aadhar_img_url": "https://.../aadhar_front.jpg",
  "status": "success"
}
```

#### Error responses
- 400: Invalid file type (non-image)
- 400: Image too large (> 5 MB)
- 400: Duplicate primary mobile number
- 400: Duplicate secondary mobile number
- 400: Duplicate Aadhar number
- 500: Database error while creating user
- 500: Failed to upload image to cloud storage
- 500: Failed to update user record with image URL (image uploaded but not linked)

#### Example (curl)
```bash
curl -X POST "http://localhost:8000/api/users/vehicleowner/signup" \
  -F "full_name=Jane Doe" \
  -F "primary_number=9876543210" \
  -F "secondary_number=9876543211" \
  -F "password=secret123" \
  -F "address=123 Main Street, Mumbai" \
  -F "aadhar_number=123456789012" \
  -F "organization_id=org_123" \
  -F "aadhar_front_img=@/path/to/aadhar.jpg"
```

### Login
- **Endpoint**: `POST /api/users/vehicleowner/login`
- **Description**: Authenticate a vehicle owner and return a JWT access token.
- **Consumes**: `application/json`

#### Request body
```json
{
  "mobile_number": "9876543210",
  "password": "secret123"
}
```

#### Success response
- **Status**: 200 OK
- **Body**:
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "account_status": "Inactive",
  "car_driver_count": 0,
  "car_details_count": 0
}
```
- Notes:
  - `account_status` values: "Active" | "Inactive" | "Pending".
  - Token expiry: 30 minutes.

#### Error responses
- 400: Invalid credentials

#### Example (curl)
```bash
curl -X POST "http://localhost:8000/api/users/vehicleowner/login" \
  -H "Content-Type: application/json" \
  -d '{
    "mobile_number": "9876543210",
    "password": "secret123"
  }'
```

### Using the access token
Include the token in the `Authorization` header for protected endpoints:
```http
Authorization: Bearer <access_token>
```

For more details on protected endpoints, see `AUTHENTICATION_GUIDE.md`.

---

### Authentication Overview (Brief)
- **Obtain token**: Login via `POST /api/users/vehicleowner/login`.
- **Use token**: Send `Authorization: Bearer <access_token>` for protected endpoints.
- **Expiry**: Tokens expire in 30 minutes; re-login to refresh.

### Signup Requirements (Brief)
- Valid Indian mobile for primary (and secondary if provided).
- Password length ≥ 6.
- Address length ≥ 10.
- Aadhar number exactly 12 digits.
- Aadhar front image must be an image file ≤ 5 MB.

### Signup Flow (Brief)
1. Submit form fields and `aadhar_front_img` (multipart/form-data).
2. Server creates the user in DB.
3. On success, image is uploaded to cloud storage.
4. DB is updated with the image URL. On failure, appropriate 500 error is returned.

### Login Flow (Brief)
1. Submit JSON with `mobile_number` and `password`.
2. Server validates credentials.
3. On success, returns JWT `access_token`, `token_type`, `account_status`, and related counts.

---

### Add Driver (Protected)
- **Endpoint**: `POST /api/users/cardriver/signup`
- **Requires**: `Authorization: Bearer <access_token>` (vehicle owner)
- **Consumes**: `multipart/form-data`
- **Form fields**:
  - `full_name` (3-100)
  - `primary_number` (Indian mobile)
  - `secondary_number` (Indian mobile)
  - `password` (min 6)
  - `licence_number` (5-20)
  - `adress` (min 10)
  - `organization_id` (optional)
  - `licence_front_img` (image ≤ 5 MB)
- Notes:
  - `vehicle_owner_id` is auto-set from the token; do not send it.
- **Success 200**:
```json
{"message":"Car driver registered successfully","driver_id":"<uuid>","license_img_url":"https://...","status":"success"}
```
- **Errors**: 400 (invalid image type/size, duplicate primary/secondary/licence number), 500 (DB or upload/update failure)
- **Example**:
```bash
curl -X POST "http://localhost:8000/api/users/cardriver/signup" \
  -H "Authorization: Bearer <access_token>" \
  -F "full_name=John Driver" \
  -F "primary_number=9876500000" \
  -F "secondary_number=9876500001" \
  -F "password=secret123" \
  -F "licence_number=DL-0123456789" \
  -F "adress=123 Driver Street, Mumbai" \
  -F "organization_id=org_123" \
  -F "licence_front_img=@/path/to/license.jpg"
```

### Add Car (Protected)
- **Endpoint**: `POST /api/users/cardetails/signup`
- **Requires**: `Authorization: Bearer <access_token>` (vehicle owner)
- **Consumes**: `multipart/form-data`
- **Form fields**:
  - `car_name` (2-100)
  - `car_type` (one of: `SEDAN`, `SUV`, `INNOVA`)
  - `car_number` (5-20; letters/numbers/spaces/hyphens)
  - `organization_id` (optional)
  - Images (all required, each ≤ 5 MB): `rc_front_img`, `rc_back_img`, `insurance_img`, `fc_img`, `car_img`
- Notes:
  - `vehicle_owner_id` is auto-set from the token; do not send it.
- **Success 200**:
```json
{"message":"Car details registered successfully","car_id":"<uuid>","image_urls":{"rc_front_img_url":"https://..."},"status":"success"}
```
- **Errors**: 400 (invalid image type/size, duplicate car number), 500 (DB or upload/update failure)
- **Example**:
```bash
curl -X POST "http://localhost:8000/api/users/cardetails/signup" \
  -H "Authorization: Bearer <access_token>" \
  -F "car_name=Toyota Camry" \
  -F "car_type=SEDAN" \
  -F "car_number=MH-12-AB-1234" \
  -F "organization_id=org_123" \
  -F "rc_front_img=@/path/to/rc_front.jpg" \
  -F "insurance_img=@/path/to/insurance.jpg" \
  -F "fc_img=@/path/to/fc.jpg" \
  -F "car_img=@/path/to/car.jpg"
```

---

## Complete Vehicle Owner Flow

### 1. Initial Setup Flow
```
Vehicle Owner → Signup → Upload Aadhar → Account Created (INACTIVE)
     ↓
  Login → Get Access Token → Ready to Manage Fleet
```

### 2. Driver Management Flow
```
Vehicle Owner (with token) → Add Driver → Upload License Image → Driver Created (BLOCKED)
     ↓
  Driver can be assigned to cars
  Driver status: BLOCKED → ONLINE → DRIVING
```

### 3. Car Management Flow
```
Vehicle Owner (with token) → Add Car → Upload 5 Required Images → Car Registered
     ↓
  Car can be assigned to drivers
  Car details stored with all document images
```

### 4. Complete Workflow
```
1. Vehicle Owner Signup
   ├── Fill personal details (name, mobile, address, Aadhar)
   ├── Upload Aadhar front image
   └── Account created with INACTIVE status

2. Vehicle Owner Login
   ├── Provide mobile and password
   ├── Receive JWT access token (30 min expiry)
   └── View current fleet counts

3. Add Drivers (Protected)
   ├── Include Bearer token in header
   ├── Fill driver details (name, mobile, license, address)
   ├── Upload driver license image
   └── Driver created under vehicle owner's account

4. Add Cars (Protected)
   ├── Include Bearer token in header
   ├── Fill car details (name, type, registration number)
   ├── Upload 5 required images (RC front/back, insurance, FC, car)
   └── Car registered under vehicle owner's account

5. Fleet Management
   ├── View all drivers and cars
   ├── Monitor driver status (BLOCKED/ONLINE/DRIVING)
   ├── Access all uploaded images and documents
   └── Manage organization-based fleet
```

### 5. Data Flow Architecture
```
Client → FastAPI → Database (PostgreSQL)
  ↓           ↓
Image → GCS Storage ← Image URLs stored in DB
  ↓
Protected endpoints require valid JWT token
```

### 6. Error Handling Flow
```
Validation Error → HTTP 422 (Form validation)
Duplicate Data → HTTP 400 (Business logic)
Image Upload Fail → HTTP 500 (GCS error)
Database Error → HTTP 500 (DB error)
Authentication Fail → HTTP 401 (Invalid token)
Authorization Fail → HTTP 403 (Access denied)
```

### 7. Security Flow
```
1. Password hashing using bcrypt
2. JWT token generation with 30-min expiry
3. Bearer token authentication for all protected endpoints
4. User isolation (vehicle owners can only access their own data)
5. Organization-based access control
```
