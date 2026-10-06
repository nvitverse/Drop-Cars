# Drop Cars Vendor App

A React Native mobile application for vendors to sign up and sign in to the Drop Cars platform.

## Features

- **Vendor Sign Up**: Multi-step registration form with image upload
- **Vendor Sign In**: Secure authentication with phone number and password
- **Image Upload**: Aadhar card image upload with validation (max 5MB)
- **Form Validation**: Comprehensive client-side validation
- **API Integration**: Full integration with backend vendor authentication APIs
- **Secure Storage**: JWT token and user data storage using AsyncStorage

## API Integration

The app integrates with the following backend endpoints:

### Vendor Signup
- **Endpoint**: `POST /api/users/vendor/signup`
- **Content-Type**: `multipart/form-data`
- **Features**: 
  - Creates new vendor account
  - Uploads Aadhar image to Google Cloud Storage
  - Implements rollback mechanism for failed operations

### Vendor Signin
- **Endpoint**: `POST /api/users/vendor/signin`
- **Content-Type**: `application/json`
- **Features**: 
  - Authenticates existing vendors
  - Returns JWT access token and vendor details

## Required Fields

### Signup Form
- **Full Name** (3-100 characters)
- **Primary Mobile Number** (Indian format: +919876543210 or 9876543210)
- **Secondary Mobile Number** (Optional, same format)
- **Address** (Minimum 10 characters)
- **Aadhar Number** (Exactly 12 digits)
- **GPay Number** (Indian mobile format)
- **Organization ID** (Optional)
- **Aadhar Image** (Optional, max 5MB, JPG/PNG)
- **Password** (Minimum 6 characters)

### Signin Form
- **Primary Mobile Number**
- **Password**

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Base URL
Edit `config/api.ts` and update the `BASE_URL` to match your backend server:
```typescript
export const API_CONFIG = {
  BASE_URL: 'http://your-backend-url:8000', // Update this
  // ... other config
};
```

### 3. Run the App
```bash
npm run dev
```

## Project Structure

```
Vendor App/
├── app/
│   ├── (auth)/
│   │   ├── sign-in.tsx          # Sign in screen
│   │   └── sign-up.tsx          # Sign up screen
│   └── (tabs)/                  # Main app screens
├── hooks/
│   └── useVendorAuth.ts         # Authentication hook
├── utils/
│   ├── imageUtils.ts            # Image handling utilities
│   └── validation.ts            # Form validation
├── config/
│   └── api.ts                   # API configuration
└── package.json
```

## Key Components

### useVendorAuth Hook
Custom hook that handles all authentication operations:
- `signUp(data)`: Register new vendor
- `signIn(data)`: Authenticate existing vendor
- `signOut()`: Clear user session
- `getStoredToken()`: Retrieve stored JWT token
- `getStoredVendorData()`: Retrieve stored vendor information

### Image Utilities
- `pickImage()`: Launch image picker with validation
- `validateImage()`: Validate image size and type
- `createImageFormData()`: Create FormData for image upload

### Validation
- Phone number validation (Indian format)
- Aadhar number validation (12 digits)
- Password validation (minimum 6 characters)
- Address validation (minimum 10 characters)

## Backend Requirements

The backend should implement the vendor API as documented in `.expo/docs/vendor_api.md`:

- **Database**: PostgreSQL with vendor and vendor_details tables
- **File Storage**: Google Cloud Storage for Aadhar images
- **Authentication**: JWT tokens with bcrypt password hashing
- **Validation**: Comprehensive input validation and error handling

## Error Handling

The app handles various error scenarios:
- **Validation Errors**: Client-side form validation
- **Network Errors**: API connection failures
- **Authentication Errors**: Invalid credentials
- **File Upload Errors**: Image size/type validation
- **Server Errors**: Backend operation failures

## Security Features

- **Password Hashing**: Backend uses bcrypt for password security
- **JWT Tokens**: Secure authentication with expiration
- **Input Validation**: Comprehensive validation on both client and server
- **File Validation**: Image type and size validation before upload
- **Secure Storage**: Sensitive data stored in AsyncStorage

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
```typescript
const testVendor = {
  full_name: "Test Vendor",
  primary_number: "+919876543213",
  password: "test123",
  address: "Test Address, Test City, Test State 123456",
  aadhar_number: "111111111111",
  gpay_number: "+919876543214"
};
```

## Dependencies

### Core Dependencies
- React Native 0.79.1
- Expo SDK 53
- React Navigation
- AsyncStorage for data persistence

### UI Dependencies
- Lucide React Native (icons)
- Expo Linear Gradient
- React Native Paper

### Image Handling
- Expo Image Picker
- React Native Image Picker

## Environment Configuration

### Development
- API Base URL: `http://localhost:8000`
- Debug mode enabled
- Development server

### Production
- API Base URL: Your production backend URL
- Debug mode disabled
- Production build

## Troubleshooting

### Common Issues

1. **Image Upload Fails**
   - Check image size (must be < 5MB)
   - Ensure image format is JPG/PNG
   - Verify backend GCS configuration

2. **API Connection Errors**
   - Verify backend server is running
   - Check API base URL configuration
   - Ensure network connectivity

3. **Form Validation Errors**
   - Check all required fields are filled
   - Verify phone number format (Indian mobile)
   - Ensure Aadhar number is exactly 12 digits

### Debug Mode
Enable debug logging by setting environment variables:
```bash
export EXPO_DEBUG=1
```

## Contributing

1. Follow the existing code structure
2. Add proper TypeScript types
3. Include error handling
4. Test on both iOS and Android
5. Update documentation for new features

## License

This project is proprietary software for Drop Cars platform.
