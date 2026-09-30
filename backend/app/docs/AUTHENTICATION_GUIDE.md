# Authentication Guide for Car Details and Car Driver APIs

## Overview

All car details and car driver endpoints now require bearer token authentication to ensure only authenticated vehicle owners can access and modify their data.

## Authentication Flow

1. **Login**: Vehicle owners must first login using the `/api/users/vehicleowner/login` endpoint
2. **Get Token**: The login response includes a `access_token` 
3. **Use Token**: Include the token in the Authorization header for all protected endpoints

## Protected Endpoints

### Car Details Endpoints
- `POST /api/users/cardetails/signup` - Add new car (requires authentication)
- `GET /api/users/cardetails/{car_id}` - Get car by ID (requires authentication)
- `GET /api/users/cardetails/organization/{organization_id}` - Get cars by organization (requires authentication)

### Car Driver Endpoints
- `POST /api/users/cardriver/signup` - Add new driver (requires authentication)
- `GET /api/users/cardriver/{driver_id}` - Get driver by ID (requires authentication)
- `GET /api/users/cardriver/organization/{organization_id}` - Get drivers by organization (requires authentication)
- `GET /api/users/cardriver/mobile/{mobile_number}` - Get driver by mobile (requires authentication)

## How to Use

### 1. Login to Get Token
```bash
curl -X POST "http://localhost:8000/api/users/vehicleowner/login" \
  -H "Content-Type: application/json" \
  -d '{
    "mobile_number": "9876543210",
    "password": "your_password"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "account_status": "Active",
  "car_driver_count": 2,
  "car_details_count": 1
}
```

### 2. Use Token for Protected Endpoints
```bash
curl -X POST "http://localhost:8000/api/users/cardetails/signup" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "car_name=Toyota Camry" \
  -F "car_type=SEDAN" \
  -F "car_number=MH-12-AB-1234" \
  -F "rc_front_img=@rc_front.jpg" \
  -F "rc_back_img=@rc_back.jpg" \
  -F "insurance_img=@insurance.jpg" \
  -F "fc_img=@fc.jpg" \
  -F "car_img=@car.jpg"
```

## Security Features

1. **Token Verification**: All requests are validated against the JWT token
2. **User Ownership**: Users can only access/modify their own cars and drivers
3. **Organization Isolation**: Users can only view data from their own organization
4. **Token Verification**: All requests are validated against the JWT token (no account status restrictions)
5. **Automatic ID Assignment**: Vehicle owner ID is automatically set from the authenticated user

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 403 Forbidden
```json
{
  "detail": "Access denied. You can only view your own cars."
}
```



## Important Notes

- The `vehicle_owner_id` field is now optional in the form data as it's automatically set from the authenticated user
- The `organization_id` field is also optional and will be set from the authenticated user if not provided
- All GET endpoints now verify that the requested data belongs to the authenticated user
- Token expiration is set to 30 minutes by default
- **No account status restrictions**: Both active and inactive accounts can access all operations
- **Secondary number is optional**: Users can register without providing a secondary number
- **GPay number removed**: The gpay_number field has been completely removed from the system
