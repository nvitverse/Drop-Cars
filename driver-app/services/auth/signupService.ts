import axiosInstance from '@/app/api/axiosInstance';
import { authService, getAuthHeaders, loginVehicleOwner as authLoginVehicleOwner } from './authService';
import { appendFileToFormData } from '@/utils/formDataFile';

// Re-export for compatibility
export const loginVehicleOwner = authLoginVehicleOwner;

// Single API call interface matching your working Postman request
export interface SignupData {
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  password: string;
  address: string;
  aadhar_number: string;
  pan_number: string;
  organization_id: string;
  aadhar_front_img: any; // File object for FormData

}

// Documents param shape passed into signupAccount/signupAndLogin.
// Every doc should normally arrive as a *Url (already uploaded via
// uploadSignupDoc before Create Account was tappable). The raw uri fields
// are kept only as a fallback path - see signupAccount for details.
export interface SignupDocuments {
  aadharFrontUrl?: string | null;
  aadharBackUrl?: string | null;
  panUrl?: string | null;
  aadharFront?: string | null;
  aadharBack?: string | null;
  panImg?: string | null;
}

export interface SignupResponse {
  message: string;
  user_id: string;
  aadhar_img_url: string;
  status: string;
}

// Doc type accepted by the pre-signup single-document upload endpoint.
export type SignupDocType = 'aadhar_front' | 'aadhar_back' | 'pan';

export interface AadhaarExtracted {
  name: string | null;
  dob: string | null;
  gender: string | null;
  aadhaar_number: string | null;
  address: string | null;
  pincode: string | null;
}

export interface SignupDocUploadResponse {
  url: string;
  doc_type: string;
  extracted?: AadhaarExtracted | null; // Only present for aadhar_front
}

// Uploads ONE document (Aadhar front/back or PAN image) immediately after the
// user picks it, before the account exists. No auth token is available yet -
// the backend endpoint intentionally requires none - and axiosInstance's
// request interceptor is taught to skip the mandatory-token check for this
// URL (see the 'upload-signup-doc' check in app/api/axiosInstance.tsx).
// Returns the permanent GCS URL to be sent as a plain form field
// (aadhar_front_img_url / aadhar_back_img_url / pan_img_url) on final signup,
// instead of re-uploading the raw file in the big signup request.
export const uploadSignupDoc = async (uri: string, docType: SignupDocType): Promise<SignupDocUploadResponse> => {
  const formData = new FormData();
  const imageName = uri.split('/').pop() || `${docType}.jpg`;
  const imageType = imageName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  await appendFileToFormData(formData, 'file', uri, imageName, imageType);
  formData.append('doc_type', docType);

  try {
    const response = await axiosInstance.post('/api/users/vehicleowner/upload-signup-doc', formData, {
      timeout: 60000,
    });

    if (!response.data?.url) {
      throw new Error('Upload finished but no file link was returned by the server. Please try again.');
    }

    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Upload timed out. Please check your connection and try again.');
    }
    if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error while uploading. Please check your connection and try again.');
    }
    const data = error.response?.data;
    const detail = data?.detail ?? data?.message;
    if (typeof detail === 'string' && detail) {
      throw new Error(detail);
    }
    if (Array.isArray(detail) && detail.length) {
      throw new Error(detail.map((e: any) => e.msg || e.message || String(e)).join(', '));
    }
    throw new Error(error.message || 'Failed to upload document. Please try again.');
  }
};

/** Send a real OTP to the given email via the backend (SMTP). */
export const sendEmailOtp = async (email: string): Promise<{ message: string; expires_in_minutes: number }> => {
  const formData = new FormData();
  formData.append('email', email.trim().toLowerCase());
  try {
    const response = await axiosInstance.post('/api/users/vehicleowner/send-email-otp', formData, { timeout: 20000 });
    return response.data;
  } catch (error: any) {
    const detail = error.response?.data?.detail ?? error.response?.data?.message;
    throw new Error(typeof detail === 'string' && detail ? detail : (error.message || 'Failed to send verification email.'));
  }
};

/** Verify the OTP code the user typed against the backend-stored code. */
export const verifyEmailOtp = async (email: string, code: string): Promise<{ verified: boolean; email: string }> => {
  const formData = new FormData();
  formData.append('email', email.trim().toLowerCase());
  formData.append('code', code.trim());
  try {
    const response = await axiosInstance.post('/api/users/vehicleowner/verify-email-otp', formData, { timeout: 15000 });
    return response.data;
  } catch (error: any) {
    const detail = error.response?.data?.detail ?? error.response?.data?.message;
    throw new Error(typeof detail === 'string' && detail ? detail : (error.message || 'Verification failed.'));
  }
};

// Single signup API call using FormData for file upload
export const signupAccount = async (personalData: any, documents: SignupDocuments): Promise<SignupResponse> => {
  console.log('🚀 Starting signup process with FormData...');
  console.log('📤 Personal data received:', JSON.stringify(personalData, null, 2));
  console.log('📤 Documents received:', JSON.stringify(documents, null, 2));
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries}...`);
      
      // Create FormData for multipart/form-data upload
      const formData = new FormData();

      // Every document is now uploaded individually (via uploadSignupDoc)
      // the moment the user picks it, BEFORE Create Account is even
      // tappable - so by the time we get here we should always have the
      // permanent GCS URLs (documents.aadharFrontUrl / aadharBackUrl /
      // panUrl) and can send tiny string fields instead of raw file blobs.
      // This is what makes the final signup request small and fast instead
      // of bundling 2-3 images into one big multipart POST that used to
      // time out on slow connections.
      //
      // The raw-file fields (documents.aadharFront / aadharBack / panImg)
      // are kept ONLY as a fallback for the unexpected case where a URL
      // isn't available for some reason.
      if (documents.aadharFrontUrl) {
        formData.append('aadhar_front_img_url', documents.aadharFrontUrl);
        console.log('🔗 aadhar_front_img_url appended:', documents.aadharFrontUrl);
      } else if (documents.aadharFront) {
        const imageUri = documents.aadharFront;
        const imageName = imageUri.split('/').pop() || 'aadhar.jpg';
        const imageType = imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg';

        await appendFileToFormData(formData, 'aadhar_front_img', imageUri, imageName, imageType);

        console.log('🖼️ Fallback: aadhar_front_img file appended to FormData:', { uri: imageUri, type: imageType, name: imageName });
      }

      if (documents.aadharBackUrl) {
        formData.append('aadhar_back_img_url', documents.aadharBackUrl);
        console.log('🔗 aadhar_back_img_url appended:', documents.aadharBackUrl);
      } else if (documents.aadharBack) {
        const imageUri = documents.aadharBack;
        const imageName = imageUri.split('/').pop() || 'aadhar_back.jpg';
        const imageType = imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        await appendFileToFormData(formData, 'aadhar_back_img', imageUri, imageName, imageType);
        console.log('🖼️ Fallback: aadhar_back_img file appended to FormData');
      }

      if (documents.panUrl) {
        formData.append('pan_img_url', documents.panUrl);
        console.log('🔗 pan_img_url appended:', documents.panUrl);
      } else if (documents.panImg) {
        const imageUri = documents.panImg;
        const imageName = imageUri.split('/').pop() || 'pan.jpg';
        const imageType = imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        await appendFileToFormData(formData, 'pan_img', imageUri, imageName, imageType);
        console.log('🖼️ Fallback: pan_img file appended to FormData');
      }

      // Helper function to format phone numbers for backend - send 10 digits only
      const formatPhoneForBackend = (phone: string): string => {
        if (!phone || !phone.trim()) return '';
        
        console.log('📱 Original phone number:', phone);
        
        // Remove +91 prefix and any non-digit characters, keep only digits
        let cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
        
        console.log('📱 After removing +91 and non-digits:', cleanPhone);
        
        if (!cleanPhone) return '';
        
        // Return only the last 10 digits (in case there are more)
        const finalPhone = cleanPhone.slice(-10);
        
        console.log('📱 Final formatted phone (10 digits):', finalPhone);
        
        return finalPhone;
      };

       // Validate required fields before sending
       const fullName = personalData.fullName?.trim();
       const primaryNumber = formatPhoneForBackend(personalData.primaryMobile || '');
       const password = personalData.password?.trim();
       const address = personalData.address?.trim();
       const city = personalData.city?.trim();
       const aadharNumber = personalData.aadharNumber?.trim();
       const email = personalData.email?.trim().toLowerCase();

       if (!fullName) {
         throw new Error('Full name is required');
       }
       if (!primaryNumber || primaryNumber.length !== 10) {
         throw new Error('Valid 10-digit primary mobile number is required');
       }
       if (!password || password.length < 6) {
         throw new Error('Password must be at least 6 characters long');
       }
       if (!city) {
         throw new Error('City is required');
       }
       if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
         throw new Error('A valid email address is required');
       }
       if (!aadharNumber || aadharNumber.length !== 12) {
         throw new Error('Valid 12-digit Aadhar number is required');
       }
       const panNumberForValidation = personalData.panNumber?.trim();
       if (!panNumberForValidation) {
         throw new Error('PAN number is required');
       }
       if (!/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(panNumberForValidation)) {
         throw new Error('PAN number must be in the format ABCDE1234F (5 letters, 4 digits, 1 letter)');
       }
       if (!documents.aadharFrontUrl && !documents.aadharFront) {
         throw new Error('Please upload Aadhar front image');
       }
       if (!documents.aadharBackUrl && !documents.aadharBack) {
         throw new Error('Please upload Aadhar back image');
       }
       if (!documents.panUrl && !documents.panImg) {
         throw new Error('Please upload PAN card image');
       }

       // Append all other fields
       formData.append('full_name', fullName);
       formData.append('primary_number', primaryNumber);
       // Only append secondary_number if it has a value, otherwise skip it entirely
       const formattedSecondary = formatPhoneForBackend(personalData.secondaryMobile || '');
       if (formattedSecondary && formattedSecondary.length === 10) {
         formData.append('secondary_number', formattedSecondary);
       }
       // Don't append anything if secondary number is empty - let backend handle it as optional
      formData.append('password', password);
      formData.append('address', address || '');
      formData.append('city', personalData.city || '');
      formData.append('pincode', personalData.pincode || '');
      formData.append('aadhar_number', aadharNumber);
      // PAN number is now mandatory (validated above)
      formData.append('pan_number', panNumberForValidation.toUpperCase());
      // Email is now mandatory (validated above) and sent directly with signup
      // instead of the old best-effort post-signup PUT call.
      formData.append('email', email);

      console.log('📤 FormData created with fields:', {
        full_name: fullName,
        primary_number: primaryNumber,
        secondary_number: formattedSecondary || 'Not provided (skipped)',
        password: password,
        address: address,
        city: personalData.city || '',
        pincode: personalData.pincode || '',
        aadhar_number: aadharNumber,
        aadhar_front_img: documents.aadharFront ? 'File attached' : 'No file'
      });
      
      console.log('📱 Phone number validation:', {
        original_primary: personalData.primaryMobile,
        formatted_primary: primaryNumber,
        original_secondary: personalData.secondaryMobile,
        formatted_secondary: formattedSecondary || 'Not provided'
      });
      
      // Make the API call with FormData - no manual Content-Type,
      // axiosInstance's interceptor strips it so the platform sets its own boundary.
      const response = await axiosInstance.post('/api/users/vehicleowner/signup', formData, {
        timeout: 120000, // 2 minutes timeout for file uploads
      });
      
      console.log('✅ Signup API response received:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers
      });
      
      // Validate response data
      if (!response.data || response.data.status !== 'success') {
        throw new Error('Invalid response from server - missing or invalid status');
      }
      
      return response.data;
      
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Signup attempt ${attempt} failed:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
          timeout: error.config?.timeout
        }
      });
      
      // Log detailed backend error for 400 status
      if (error.response?.status === 400) {
        console.error('❌ Backend validation error details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
        
        // Check for specific error messages and provide user-friendly messages
        const errorData = error.response.data;
        if (errorData && typeof errorData === 'object') {
          const rawDetail = errorData.detail ?? errorData.message ?? errorData.error;
          const errorMessage = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail.map((e: any) => e.msg || e.message || String(e)).join(', ') : '');
          if (errorMessage) {
            throw new Error(errorMessage);
          }
        }
      }

      // If we got a successful response but axios treated it as an error
      if (error.response?.status >= 200 && error.response?.status < 300 && error.response?.data) {
        console.log('🔄 Converting error response to success response');
        return error.response.data;
      }

      // Don't retry on validation errors or client errors
      if (error.response?.status >= 400 && error.response?.status < 500) {
        console.log('🚫 Client error, not retrying');
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed, throw the last error
  console.error('❌ All signup attempts failed');
  
  // Provide specific error messages based on error type
  if (lastError.code === 'ECONNABORTED') {
    throw new Error('Request timeout - server is taking too long to respond. Please try again.');
  } else if (lastError.code === 'ERR_NETWORK') {
    throw new Error('Network error - please check your internet connection and try again.');
  } else if (lastError.code === 'ENOTFOUND') {
    throw new Error('Server not found - please check if the backend server is running.');
  } else if (lastError.response?.status === 422) {
    const data = lastError.response.data;
    const detail = data?.detail ?? data?.message ?? 'Invalid data provided';
    const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: any) => e.msg || e.message || String(e)).join(', ') : 'Validation error. Check all required fields.');
    console.error('🔍 422 Validation Error Details:', detail);
    throw new Error(msg);
  } else if (lastError.response?.status === 400) {
    const data = lastError.response.data;
    const detail = data?.detail ?? data?.message ?? data?.error;
    const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: any) => e.msg || e.message || String(e)).join(', ') : 'Invalid data provided');
    throw new Error(msg);
  } else if (lastError.response?.status === 500) {
    const data = lastError.response.data;
    const detail = data?.detail ?? data?.message ?? data?.error;
    const raw = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: any) => e.msg || e.message || String(e)).join(', ') : null);
    // Safety: never show more than 200 chars to avoid dumping huge SQL strings on screen
    const msg = raw && raw.length <= 200 ? raw : null;
    throw new Error(msg || 'Server error — please try again later or contact support.');
  } else if (lastError.response?.data?.message) {
    throw new Error(lastError.response.data.message);
  } else if (lastError.response?.status >= 400 && lastError.response?.status < 500 && lastError.response?.data) {
    const data = lastError.response.data;
    const detail = data?.detail ?? data?.message ?? data?.error;
    const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: any) => e.msg || e.message || String(e)).join(', ') : null);
    if (msg) throw new Error(msg);
  }
  throw new Error(lastError.message || 'Signup failed. Please try again.');
};

// Test function to check API connectivity
export const testSignupConnection = async () => {
  try {
    console.log('🧪 Testing signup endpoint connectivity...');
    const response = await axiosInstance.get('/api/users/vehicleowner/signup');
    console.log('✅ Signup endpoint accessible:', response.status);
    return true;
  } catch (error: any) {
    console.error('❌ Signup endpoint test failed:', error.message);
    return false;
  }
};

// Test function to validate data structure
export const testSignupDataStructure = (personalData: any, documents: any) => {
  console.log('🧪 Testing signup data structure for FormData...');
  
  const testData = {
    full_name: personalData.fullName || '',
    primary_number: personalData.primaryMobile || '',
    secondary_number: personalData.secondaryMobile || '',
    password: personalData.password || '',
    address: personalData.address || '',
    aadhar_number: personalData.aadharNumber || '',
    organization_id: personalData.organizationId || 'org_001',
    aadhar_front_img: documents.aadharFront ? 'File will be attached' : 'No file',
  };
  
  console.log('📊 Data Structure Test:');
  console.log('✅ Required fields present:', {
    full_name: !!testData.full_name,
    primary_number: !!testData.primary_number,
    password: !!testData.password,
    address: !!testData.address,
    aadhar_number: !!testData.aadhar_number,
    organization_id: !!testData.organization_id,
    aadhar_front_img: !!documents.aadharFront,
  });
  
  console.log('🔍 Field values:');
  Object.entries(testData).forEach(([key, value]) => {
    if (key !== 'aadhar_front_img') {
      console.log(`  ${key}: ${typeof value} = "${value}"`);
    } else {
      console.log(`  ${key}: ${documents.aadharFront ? 'File attached' : 'No file'}`);
    }
  });
  
  console.log('🖼️ Image details:', {
    uri: documents.aadharFront,
    type: documents.aadharFront ? (documents.aadharFront.endsWith('.png') ? 'image/png' : 'image/jpeg') : 'N/A',
    name: documents.aadharFront ? documents.aadharFront.split('/').pop() : 'N/A'
  });
  
  return testData;
};

// Convenience helper: perform signup then login to get JWT
// Thrown when signup itself succeeded but the immediate auto-login didn't -
// the account exists, so the caller should send the user to Login instead of
// treating this as a failed signup (retrying signup would just hit "phone
// number already registered").
export class SignupSucceededLoginFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignupSucceededLoginFailedError';
  }
}

export const signupAndLogin = async (personalData: any, documents: SignupDocuments) => {
  // First, perform signup
  const signupResponse = await signupAccount(personalData, documents);
  if (signupResponse.status !== 'success') {
    throw new Error('Signup did not complete successfully');
  }

  // Use the SAME phone number format for login as used in signup - send 10 digits only
  // Apply the same formatting function to ensure consistency
  const formatPhoneForBackend = (phone: string): string => {
    if (!phone || !phone.trim()) return '';
    // Remove +91 prefix and any non-digit characters, keep only 10 digits
    const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
    if (!cleanPhone) return '';
    // Return only the last 10 digits (in case there are more)
    return cleanPhone.slice(-10);
  };

  const mobileForLogin = formatPhoneForBackend(personalData.primaryMobile || '');

  console.log('🔐 Using consistent phone format for login:', {
    original: personalData.primaryMobile,
    formatted: mobileForLogin
  });

  // Then, login to obtain JWT token. The account already exists at this
  // point (signupAccount above succeeded) - a blip here must never be
  // reported as "signup failed", since retrying the whole signup would just
  // fail on a duplicate phone number. Retry a couple of times first (same
  // backoff shape as signupAccount); if it still doesn't come back, tell the
  // caller the account IS created so it can route to Login instead.
  const loginMaxRetries = 2;
  let lastLoginError: any;
  for (let attempt = 1; attempt <= loginMaxRetries; attempt++) {
    try {
      const loginResponse = await authLoginVehicleOwner(mobileForLogin, personalData.password);
      return { signup: signupResponse, login: loginResponse };
    } catch (error: any) {
      lastLoginError = error;
      console.warn(`⚠️ Auto-login after signup failed (attempt ${attempt}/${loginMaxRetries}):`, error?.message || error);
      if (attempt < loginMaxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw new SignupSucceededLoginFailedError(
    'Your account was created successfully, but we could not sign you in automatically. Please log in with your mobile number and password.'
  );
};

// Car Details API interface matching your Postman request exactly
export interface CarDetailsData {
  car_name: string;
  car_type: string;
  car_number: string;
  vehicle_owner_id: string;
  year_of_the_car: string; // Year as number
  rc_front_img: any; // File object for FormData
  rc_back_img: any; // File object for FormData
  insurance_img: any; // File object for FormData
  fc_img?: any; // File object for FormData (not needed for a vehicle within 2 years of registration)
  permit_img?: any; // File object for FormData
  car_img: any; // File object for FormData
  pollution_img?: any; // File object for FormData
  registration_date?: string; // YYYY-MM-DD, the date on the RC (an RC has no expiry date)
  insurance_expiry_date?: string; // YYYY-MM-DD
  fc_expiry_date?: string; // YYYY-MM-DD
  permit_expiry_date?: string; // YYYY-MM-DD
  pollution_expiry_date?: string; // YYYY-MM-DD
}

// Enhanced JWT verification interface matching your backend
export interface JWTVerificationResponse {
  verified: boolean;
  user_id: string;
  organization_id: string;
  token: string;
  message: string;
}

// Login response interface matching your backend
export interface LoginResponse {
  access_token: string;
  token_type: string;
  account_status: string;
  car_driver_count: number;
  car_details_count: number;
}

// Enhanced car details response with JWT verification
export interface CarDetailsResponse {
  message: string;
  car_id: string;
  status: string;
  car_details: {
    car_name: string;
    car_type: string;
    car_number: string;
    organization_id: string;
    vehicle_owner_id: string;
    rc_front_img_url: string;
    rc_back_img_url: string;
    insurance_img_url: string;
    fc_img_url: string;
    car_img_url: string;
  };
  jwt_verification?: JWTVerificationResponse;
}


// JWT verification function (now properly integrated with your backend)
export const verifyJWTToken = async (token: string): Promise<JWTVerificationResponse> => {
  try {
    console.log('🔐 Verifying JWT token...');
    
    // Use the token to make an authenticated request to a protected endpoint
    // This will verify the token is valid
    const response = await axiosInstance.get('/api/users/cardetails/organization/test', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // If we get here, the token is valid
    // Extract user info from the token or make another call to get user details
    const userInfo = await getUserInfoFromToken(token);
    
    return {
      verified: true,
      user_id: userInfo.user_id,
      organization_id: userInfo.organization_id,
      token: token,
      message: 'Token verified successfully'
    };
  } catch (error: any) {
    console.error('❌ JWT verification failed:', error);
    
    if (error.response?.status === 401) {
      throw new Error('JWT token is invalid or expired');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied - insufficient permissions');
    } else {
      throw new Error(`JWT verification failed: ${error.message || 'Unknown error'}`);
    }
  }
};

// Helper function to get user info from token
const getUserInfoFromToken = async (token: string) => {
  try {
    // Decode JWT token to get user info (this is a simplified approach)
    // In production, you might want to make an API call to get user details
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      const payload = JSON.parse(atob(tokenParts[1]));
      return {
        user_id: payload.sub || payload.user_id || 'unknown',
        organization_id: payload.organization_id || payload.org_id || 'unknown'
      };
    }
    throw new Error('Invalid token format');
  } catch (error) {
    console.error('❌ Failed to decode token:', error);
    return {
      user_id: 'unknown',
      organization_id: 'unknown'
    };
  }
};

// Enhanced car details API call with proper JWT authentication
export const addCarDetails = async (carData: CarDetailsData, onUploadProgress?: (percent: number) => void): Promise<CarDetailsResponse> => {
  console.log('🚗 Starting car details registration with JWT authentication...');
  console.log('📤 Car data received:', JSON.stringify(carData, null, 2));
  
  try {
    // Verify we have a valid token
    const token = await authService.getToken();
    if (!token) {
      throw new Error('No authentication token found. Please login first.');
    }
    
    // Create FormData for multipart/form-data upload
    const formData = new FormData();
    
    // Helper function to append image files - uses appendFileToFormData so
    // this actually uploads a real file on web (see that function's comment;
    // the old plain-object append here silently sent "[object Object]"
    // instead of the image on web, which is why "Could not add car" always
    // failed there while working fine on native).
    const appendImageFile = async (fieldName: string, imageUri: string, defaultName: string) => {
      if (imageUri) {
        const imageName = imageUri.split('/').pop() || defaultName;
        const imageType = imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg';

        await appendFileToFormData(formData, fieldName, imageUri, imageName, imageType);

        console.log(`🖼️ ${fieldName} appended to FormData:`, { uri: imageUri, type: imageType, name: imageName });
      } else {
        console.log(`⚠️ ${fieldName} not provided, skipping...`);
      }
    };

    // Append all image files
    await appendImageFile('rc_front_img', carData.rc_front_img, 'rc_front.jpg');
    await appendImageFile('rc_back_img', carData.rc_back_img, 'rc_back.jpg');
    await appendImageFile('insurance_img', carData.insurance_img, 'insurance.jpg');
    await appendImageFile('fc_img', carData.fc_img, 'fc.jpg');
    await appendImageFile('permit_img', carData.permit_img, 'permit.jpg');
    await appendImageFile('car_img', carData.car_img, 'car.jpg');
    await appendImageFile('pollution_img', carData.pollution_img, 'pollution.jpg');

    // Append text fields exactly as shown in Postman
    formData.append('car_name', carData.car_name || '');
    formData.append('car_type', carData.car_type || '');
    formData.append('car_number', carData.car_number || '');
    formData.append('vehicle_owner_id', carData.vehicle_owner_id || '');
    formData.append('year_of_the_car', carData.year_of_the_car?.toString() || '');
    if (carData.registration_date) formData.append('registration_date', carData.registration_date);
    if (carData.insurance_expiry_date) formData.append('insurance_expiry_date', carData.insurance_expiry_date);
    if (carData.fc_expiry_date) formData.append('fc_expiry_date', carData.fc_expiry_date);
    if (carData.permit_expiry_date) formData.append('permit_expiry_date', carData.permit_expiry_date);
    if (carData.pollution_expiry_date) formData.append('pollution_expiry_date', carData.pollution_expiry_date);
    
    console.log('📤 FormData created with fields:', {
      car_name: carData.car_name,
      car_type: carData.car_type,
      car_number: carData.car_number,
      vehicle_owner_id: carData.vehicle_owner_id,
      year_of_the_car: carData.year_of_the_car,
      rc_front_img: carData.rc_front_img ? 'File attached' : 'No file',
      rc_back_img: carData.rc_back_img ? 'File attached' : 'No file',
      insurance_img: carData.insurance_img ? 'File attached' : 'No file',
      fc_img: carData.fc_img ? 'File attached' : 'No file',
      car_img: carData.car_img ? 'File attached' : 'No file'
    });
    
    // Make the API call with FormData and JWT authentication
    // Endpoint: /api/users/cardetails/signup (matches Postman exactly)
    const authHeaders = await getAuthHeaders();
    
    console.log('🔍 Request details:', {
      url: '/api/users/cardetails/signup',
      method: 'POST',
      headers: { ...authHeaders },
      formDataKeys: ['car_name', 'car_type', 'car_number', 'vehicle_owner_id', 'year_of_the_car', 'rc_front_img', 'rc_back_img', 'insurance_img', 'fc_img', 'permit_img', 'car_img']
    });

    // No manual Content-Type - axiosInstance's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    const response = await axiosInstance.post('/api/users/cardetails/signup', formData, {
      headers: { ...authHeaders },
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    });
    
    console.log('✅ Car details API response received:', {
      status: response.status,
      data: response.data,
      headers: response.headers
    });
    
    // Check if the response is successful before validating
    if (response.status !== 200 && response.status !== 201) {
      const errorDetails = response.data?.detail || response.data?.message || 'Backend validation failed';
      console.error('🔍 Backend validation error:', {
        status: response.status,
        details: errorDetails,
        fullResponse: response.data
      });
      throw new Error(`Backend validation failed: ${errorDetails}`);
    }
    
    // Validate response data - ensure values are meaningful
    const responseData = response.data;
    
    // Check if response has success status
    if (responseData.status !== 'success') {
      throw new Error(`Backend returned non-success status: ${responseData.status}`);
    }
    
    // Validate car_id (should be a valid string)
    if (!responseData.car_id || typeof responseData.car_id !== 'string' || responseData.car_id.trim().length === 0) {
      throw new Error('Invalid car ID received from server');
    }
    
    // Validate image_urls object exists
    if (!responseData.image_urls || typeof responseData.image_urls !== 'object') {
      throw new Error('Image URLs not received from server');
    }
    
    const imageUrls = responseData.image_urls;
    
    // Validate all required image URLs exist and are valid
    const requiredImageFields = [
      'rc_front_img_url', 
      'rc_back_img_url', 
      'insurance_img_url', 
      'fc_img_url', 
      'car_img_url'
    ];
    
    for (const field of requiredImageFields) {
      if (!imageUrls[field] || typeof imageUrls[field] !== 'string' || imageUrls[field].trim().length === 0) {
        throw new Error(`${field.replace(/_/g, ' ')} not received from server`);
      }
    }
    
    console.log('✅ All response values validated successfully');
    console.log('✅ Car ID:', responseData.car_id);
    console.log('✅ Image URLs received:', Object.keys(imageUrls));
    
    return responseData;
  } catch (error: any) {
    console.error('❌ Car details registration failed with error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        timeout: error.config?.timeout
      }
    });

    // Provide specific error messages based on error type
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - server is taking too long to respond. Please try again.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error - please check your internet connection and try again.');
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('Server not found - please check if the backend server is running.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed - please login again to get a valid token.');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied - insufficient permissions for this operation.');
    } else if (error.response?.status === 422) {
      const errorDetails = error.response.data?.detail || error.response.data?.message || 'Invalid data provided';
      console.error('🔍 422 Validation Error Details:', errorDetails);
      throw new Error(`Validation error: ${errorDetails}. Check all required fields.`);
    } else if (error.response?.status === 400) {
      throw new Error(`Bad request: ${error.response.data?.message || 'Invalid data provided'}`);
    } else if (error.response?.status === 500) {
      throw new Error('Server error - please try again later or contact support.');
    } else if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else {
      throw new Error(`Car details registration failed: ${error.message || 'Unknown error occurred'}`);
    }
  }
};

// Enhanced car details API with JWT verification and automatic login
export const addCarDetailsWithLogin = async (
  carData: CarDetailsData, 
  userData: any, 
  onLoginSuccess: (user: any, token: string) => void
): Promise<CarDetailsResponse> => {
  try {
    console.log('🚗 Starting car details registration with automatic login...');
    
    // First, add car details (this will use the stored JWT token)
    const carResponse = await addCarDetails(carData);
    
    if (carResponse.status === 'success') {
      console.log('✅ Car details added successfully, proceeding with JWT verification...');
      
      // Get the JWT token from secure storage
      const token = await authService.getToken();
      
      if (token) {
        // Verify the JWT token
        const jwtVerification = await verifyJWTToken(token);
        
        if (jwtVerification.verified && 
            jwtVerification.user_id && 
            jwtVerification.organization_id &&
            jwtVerification.user_id.length > 0 &&
            jwtVerification.organization_id.length > 0) {
          
          console.log('✅ JWT verification successful, proceeding with automatic login...');
          
          // Create enhanced user object with car information
          const enhancedUser = {
            ...userData,
            id: jwtVerification.user_id,
            organizationId: jwtVerification.organization_id,
            cars: [{
              id: carResponse.car_id,
              name: carData.car_name,
              type: carData.car_type,
              number: carData.car_number,
              rcFrontUrl: carResponse.car_details.rc_front_img_url,
              rcBackUrl: carResponse.car_details.rc_back_img_url,
              insuranceUrl: carResponse.car_details.insurance_img_url,
              fcUrl: carResponse.car_details.fc_img_url,
              carUrl: carResponse.car_details.car_img_url
            }]
          };
          
          // Call the login success callback
          onLoginSuccess(enhancedUser, token);
          
          console.log('🎉 Automatic login completed successfully');
          
          // Return enhanced response with JWT verification data
          return {
            ...carResponse,
            jwt_verification: jwtVerification
          };
        } else {
          throw new Error('JWT verification failed - invalid user or organization data');
        }
      } else {
        throw new Error('No authentication token found');
      }
    } else {
      throw new Error('Car details registration was not successful');
    }
  } catch (error: any) {
    console.error('❌ Car details with login failed:', error);
    throw error;
  }
};

// Test function to check car details API connectivity
export const testCarDetailsConnection = async () => {
  try {
    console.log('🧪 Testing car details endpoint connectivity...');
    const response = await axiosInstance.get('/api/users/cardetails/signup');
    console.log('✅ Car details endpoint accessible:', response.status);
    return true;
  } catch (error: any) {
    console.error('❌ Car details endpoint test failed:', error.message);
    return false;
  }
};

// Test function to validate car details data structure
export const testCarDetailsDataStructure = (carData: CarDetailsData) => {
  console.log('🧪 Testing car details data structure for FormData...');
  
  const testData = {
    car_name: carData.car_name || '',
    car_type: carData.car_type || '',
    car_number: carData.car_number || '',
    vehicle_owner_id: carData.vehicle_owner_id || '',
    rc_front_img: carData.rc_front_img ? 'File will be attached' : 'No file',
    rc_back_img: carData.rc_back_img ? 'File will be attached' : 'No file',
    insurance_img: carData.insurance_img ? 'File will be attached' : 'No file',
    fc_img: carData.fc_img ? 'File will be attached' : 'No file',
    permit_img: carData.permit_img ? 'File will be attached' : 'No file',
    car_img: carData.car_img ? 'File will be attached' : 'No file',
  };
  
  console.log('📊 Car Details Data Structure Test:');
  console.log('✅ Required fields present:', {
    car_name: !!testData.car_name,
    car_type: !!testData.car_type,
    car_number: !!testData.car_number,
    vehicle_owner_id: !!testData.vehicle_owner_id,
    rc_front_img: !!carData.rc_front_img,
    rc_back_img: !!carData.rc_back_img,
    insurance_img: !!carData.insurance_img,
    fc_img: !!carData.fc_img,
    car_img: !!carData.car_img,
  });
  
  console.log('🔍 Field values:');
  Object.entries(testData).forEach(([key, value]) => {
    if (key.includes('_img')) {
      console.log(`  ${key}: ${carData[key as keyof CarDetailsData] ? 'File attached' : 'No file'}`);
    } else {
      console.log(`  ${key}: ${typeof value} = "${value}"`);
    }
  });
  
  console.log('🖼️ Image details:');
  const imageFields = ['rc_front_img', 'rc_back_img', 'insurance_img', 'fc_img', 'permit_img', 'car_img'];
  imageFields.forEach(field => {
    const imageUri = carData[field as keyof CarDetailsData];
    if (imageUri) {
      console.log(`  ${field}:`, {
        uri: imageUri,
        type: imageUri.endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: imageUri.split('/').pop()
      });
    } else {
      console.log(`  ${field}: No image provided`);
    }
  });
  
  return testData;
};