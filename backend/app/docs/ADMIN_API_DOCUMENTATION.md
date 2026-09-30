# Admin API Documentation

## Overview

The Admin API provides comprehensive authentication and management capabilities for administrative users in the Drop Cars system. This includes admin signup, signin, profile management, and JWT token generation.

## Features

- **Admin Authentication**: Secure signup and signin with JWT tokens
- **Profile Management**: View and update admin profiles
- **Role-Based Access**: Different permission levels (Owner, Manager)
- **JWT Security**: Secure token-based authentication
- **Admin Management**: List and view admin accounts

## Authentication Flow

1. **Admin Signup**: Create new admin account
2. **Admin Signin**: Authenticate and receive JWT token
3. **Use Token**: Include token in Authorization header for protected endpoints
4. **Token Format**: `Bearer {jwt_token}`

## API Endpoints

### 1. Admin Signup

**POST** `/api/admin/signup`

Creates a new admin account and returns JWT access token.

**Request Body:**
```json
{
    "username": "admin_user",
    "email": "admin@dropcars.com",
    "phone": "9876543210",
    "role": "Manager",
    "password": "securepassword123",
    "organization_id": "org_123"
}
```

**Response:**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "admin": {
        "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
        "username": "admin_user",
        "email": "admin@dropcars.com",
        "phone": "9876543210",
        "role": "Manager",
        "organization_id": "org_123",
        "created_at": "2025-08-13T12:00:00Z"
    }
}
```

**Validation Rules:**
- Username: 3-50 characters
- Email: Valid email format
- Phone: Exactly 10 digits
- Password: Minimum 6 characters
- Role: Admin role (Owner, Manager, etc.)

### 2. Admin Signin

**POST** `/api/admin/signin`

Authenticates admin credentials and returns JWT access token.

**Request Body:**
```json
{
    "username": "admin_user",
    "password": "securepassword123"
}
```

**Response:** Same as signup response with existing admin details.

**Error Responses:**
- `401 Unauthorized`: Invalid username or password

### 3. Get Admin Profile

**GET** `/api/admin/profile`

Returns the profile of the currently authenticated admin.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
    "username": "admin_user",
    "email": "admin@dropcars.com",
    "phone": "9876543210",
    "role": "Manager",
    "organization_id": "org_123",
    "created_at": "2025-08-13T12:00:00Z"
}
```

### 4. Update Admin Profile

**PUT** `/api/admin/profile`

Updates the profile of the currently authenticated admin.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Request Body:**
```json
{
    "email": "newemail@dropcars.com",
    "phone": "9876543211"
}
```

**Response:** Updated admin profile details.

### 5. List All Admins

**GET** `/api/admin/list?skip=0&limit=100`

Returns a list of all admin accounts (requires Owner or Manager role).

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
- `skip`: Number of records to skip (pagination)
- `limit`: Number of records to return (max 100)

**Response:**
```json
[
    {
        "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
        "username": "admin_user",
        "email": "admin@dropcars.com",
        "phone": "9876543210",
        "role": "Manager",
        "organization_id": "org_123",
        "created_at": "2025-08-13T12:00:00Z"
    }
]
```

**Permission Required:** Owner or Manager role

### 6. Get Admin by ID

**GET** `/api/admin/{admin_id}`

Returns details of a specific admin account (requires Owner or Manager role).

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response:** Admin account details.

**Permission Required:** Owner or Manager role

## JWT Token Usage

### Token Structure
The JWT token contains:
- `sub`: Admin ID (subject)
- `exp`: Expiration timestamp
- `iat`: Issued at timestamp

### Including Token in Requests
```bash
curl -X GET "http://localhost:8000/api/admin/profile" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Expiration
- Default expiration: 30 minutes
- Token must be refreshed by re-authenticating

## Role-Based Permissions

### Owner Role
- Full access to all admin functions
- Can create, view, and manage all admin accounts
- Can access all system endpoints

### Manager Role
- Can view admin lists and details
- Can manage their own profile
- Limited access to sensitive operations

### Regular Admin
- Basic profile management
- Access to assigned functions only

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
    "detail": "Admin with this username already registered"
}
```

**401 Unauthorized:**
```json
{
    "detail": "Invalid username or password"
}
```

**403 Forbidden:**
```json
{
    "detail": "Insufficient permissions to list all admins"
}
```

**404 Not Found:**
```json
{
    "detail": "Admin not found"
}
```

**500 Internal Server Error:**
```json
{
    "detail": "Internal server error: {error_message}"
}
```

## Security Features

- **Password Hashing**: Bcrypt encryption for secure password storage
- **JWT Tokens**: Secure, stateless authentication
- **Input Validation**: Comprehensive validation for all inputs
- **Role-Based Access**: Granular permission control
- **Unique Constraints**: Username, email, and phone uniqueness enforced

## Best Practices

### For Admins
- Use strong, unique passwords
- Keep JWT tokens secure
- Log out by discarding tokens
- Regularly update profile information

### For Developers
- Always validate JWT tokens
- Check role permissions before operations
- Implement proper error handling
- Use HTTPS in production

## Testing Examples

### Create Admin Account
```bash
curl -X POST "http://localhost:8000/api/admin/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_admin",
    "email": "test@dropcars.com",
    "phone": "9876543210",
    "role": "Manager",
    "password": "testpass123",
    "organization_id": "test_org"
  }'
```

### Admin Signin
```bash
curl -X POST "http://localhost:8000/api/admin/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_admin",
    "password": "testpass123"
  }'
```

### Access Protected Endpoint
```bash
curl -X GET "http://localhost:8000/api/admin/profile" \
  -H "Authorization: Bearer {your_jwt_token}"
```

## Integration with Transfer System

Once authenticated as an admin, you can:

1. **View Pending Transfers**: `GET /api/admin/transfers/pending`
2. **Process Transfers**: `POST /api/admin/transfers/{id}/process`
3. **View Transfer Details**: `GET /api/admin/transfers/{id}`
4. **Check Vendor Balances**: `GET /api/admin/vendors/{id}/balance`

## Future Enhancements

- **Password Reset**: Email-based password recovery
- **Two-Factor Authentication**: Enhanced security
- **Session Management**: Active session tracking
- **Audit Logging**: Complete action history
- **API Rate Limiting**: Prevent abuse
