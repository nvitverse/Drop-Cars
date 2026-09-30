import axiosInstance from '@/app/api/axiosInstance';
import axiosDriver from '@/app/api/axiosDriver';
import authService, { getAuthHeaders } from '../auth/authService';
import * as SecureStore from '@/utils/secureStore';

// Driver details interface for listing
export interface DriverDetails {
  driver_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  licence_number: string;
  adress: string;
  organization_id: string;
  vehicle_owner_id: string;
  // Image fields for file uploads (matching Postman request)
  licence_front_img?: any; // File object for FormData
  rc_front_img?: any; // File object for FormData
  rc_back_img?: any; // File object for FormData
  insurance_img?: any; // File object for FormData
  fc_img?: any; // File object for FormData
  car_img?: any; // File object for FormData
  // URL fields for display (after upload)
  licence_front_img_url?: string;
  rc_front_img_url?: string;
  rc_back_img_url?: string;
  insurance_img_url?: string;
  fc_img_url?: string;
  car_img_url?: string;
  licence_expiry_date?: string;
  expiry_date?: string;
  password?: string; // Added for compatibility
}

// Driver login interfaces
export interface DriverLoginRequest {
  mobile_number: string;
  password: string;
}

export interface DriverLoginResponse {
  access_token: string;
  token_type: string;
  driver_id: string;
  full_name: string;
  primary_number: string;
  status: string;
  message: string;
  driver_status?: string;
}

// Get all drivers for a vehicle owner - using only /api/users/available-drivers
export const getDrivers = async (): Promise<DriverDetails[]> => {
  console.log('👨‍💼 Fetching drivers list...');
  
  try {
    const token = await authService.getToken();
    if (!token) {
      throw new Error('No authentication token found. Please login first.');
    }

    const response = await axiosInstance.get('/api/users/available-drivers', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        limit: 100,
        offset: 0,
        status: 'all'
      }
    });

    console.log('✅ Drivers list fetched successfully:', response.data);
    return response.data.drivers || response.data || [];
  } catch (error: any) {
    console.error('❌ Failed to fetch drivers:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      params: error.config?.params
    });
    
    // Provide more specific error messages
    if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Bad request';
      throw new Error(`Driver listing failed: ${errorDetail}. Please check if you have drivers registered.`);
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver listing endpoint not found. Please check the API configuration.');
    } else {
      throw new Error(`Failed to fetch drivers: ${error.message}`);
    }
  }
};

// Driver login function
export const loginDriver = async (mobileNumber: string, password: string): Promise<DriverLoginResponse> => {
  try {
    console.log('🚗 Starting driver login...');
    console.log('📱 Mobile (input):', mobileNumber);
    
    // Format phone number for backend - send 10 digits only
    const formatPhoneForBackend = (phone: string): string => {
      if (!phone || !phone.trim()) return '';
      // Remove +91 prefix and any non-digit characters, keep only 10 digits
      const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
      if (!cleanPhone) return '';
      // Return only the last 10 digits (in case there are more)
      return cleanPhone.slice(-10);
    };

    const payload = {
      primary_number: formatPhoneForBackend(mobileNumber),
      password,
    };

    console.log('🔐 Attempting driver login with payload:', { ...payload, password: '***' });

    const response = await axiosDriver.post('/api/users/cardriver/signin', payload);

    console.log('✅ Driver login successful:', response.data);
    // Persist driver token for axiosDriver interceptor
    if (response.data?.access_token) {
      await SecureStore.setItemAsync('driverAuthToken', response.data.access_token);
    }
    if (response.data?.driver_id) {
      await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({
        driverId: response.data.driver_id,
        fullName: response.data.full_name,
        primaryNumber: response.data.primary_number,
        driver_status: response.data.driver_status || response.data.status,
      }));
    }
    return response.data;
  } catch (error: any) {
    console.error('❌ Driver login failed:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Incorrect password. Please try again.');
    } else if (error.response?.status === 400) {
      throw new Error(error.response.data?.detail || 'Login failed');
    } else if (error.response?.status === 404 && error.response?.data?.detail === 'NOT_REGISTERED') {
      // Distinct, matchable message so the login screen can show a specific
      // "not registered" explanation instead of a generic failure.
      throw new Error('NOT_REGISTERED_AS_DRIVER');
    } else {
      throw new Error(`Login failed: ${error.message || 'Unknown error occurred'}`);
    }
  }
};

/**
 * One-tap owner->driver switch: if the logged-in owner's number is ALSO a
 * registered duty driver, the backend issues a driver session with no
 * password (the owner is already authenticated). Stores the same keys as a
 * normal driver login. Throws with a clear message when the number is not
 * registered as a driver.
 */
export const loginDriverAsOwner = async (): Promise<DriverLoginResponse> => {
  const axiosInstance = (await import('@/app/api/axiosInstance')).default;
  try {
    const ownerTokenAtStart = await SecureStore.getItemAsync('authToken');
    if (!ownerTokenAtStart) {
      throw new Error('Fleet driver session is no longer active.');
    }
    // Establishing (or refreshing) the DRIVER sub-session is orthogonal to
    // whether the caller's OWNER session is valid - a failure here (no
    // CarDriver row yet, a transient hiccup) must never force-logout the
    // owner's own perfectly-valid login. See axiosInstance.tsx's
    // silentAuthCheck handling.
    const response = await axiosInstance.post('/api/users/cardriver/signin-as-owner', {}, { silentAuthCheck: true } as any);
    if (response.data?.access_token) {
      const currentOwnerToken = await SecureStore.getItemAsync('authToken');
      if (currentOwnerToken === ownerTokenAtStart) {
        await SecureStore.setItemAsync('driverAuthToken', response.data.access_token);
      }
      // NOTE: Do NOT set driverLastLogin here - driverLastLogin is reserved ONLY for explicit Duty Driver logins.
      // Setting it here causes app/index.tsx on cold start/refresh to think a Duty Driver logged in most recently,
      // which redirects Fleet Owners to /quick-dashboard upon browser refresh.
    }
    if (response.data?.driver_id) {
      const currentOwnerToken = await SecureStore.getItemAsync('authToken');
      if (currentOwnerToken === ownerTokenAtStart) {
        await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({
          driverId: response.data.driver_id,
          fullName: response.data.full_name,
          primaryNumber: response.data.primary_number,
          driver_status: response.data.driver_status || response.data.status,
        }));
      }
    }
    return response.data;
  } catch (error: any) {
    const detail = error?.response?.data?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Could not switch to driver mode.');
  }
};

/**
 * Firebase Phone Auth sign-in (POST /api/users/cardriver/firebase/verify).
 * Client already verified the phone number via Firebase (see
 * utils/phoneAuth.ts) and got a Firebase ID token - this just exchanges it
 * for a real driver session, and stores it under the EXACT same
 * SecureStore keys as loginDriver()/loginDriverAsOwner() above
 * (driverAuthToken, driverAuthInfo, driverLastLogin) so app/index.tsx's
 * cold-start routing and every other screen that reads those keys work
 * identically regardless of which method the driver signed in with.
 * Backend never creates a new driver from this call - a phone number with
 * no matching driver record throws the same NOT_REGISTERED_AS_DRIVER
 * message loginDriver() already throws, so the UI can show one shared
 * "not registered, ask your fleet owner to add you" message either way.
 */
export const loginDriverWithFirebase = async (firebaseIdToken: string): Promise<DriverLoginResponse> => {
  const axiosInstance = (await import('@/app/api/axiosInstance')).default;
  try {
    const response = await axiosInstance.post('/api/users/cardriver/firebase/verify', { id_token: firebaseIdToken });
    if (response.data?.access_token) {
      await SecureStore.setItemAsync('driverAuthToken', response.data.access_token);
      await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
    }
    if (response.data?.driver_id) {
      await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({
        driverId: response.data.driver_id,
        fullName: response.data.full_name,
        primaryNumber: response.data.primary_number,
        driver_status: response.data.driver_status || response.data.status,
      }));
    }
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404 && error?.response?.data?.detail === 'NOT_REGISTERED') {
      throw new Error('NOT_REGISTERED_AS_DRIVER');
    }
    if (error?.response?.status === 403) {
      throw new Error(error.response.data?.detail || 'This account is blocked.');
    }
    const detail = error?.response?.data?.detail;
    throw new Error(typeof detail === 'string' ? detail : `Sign-in failed: ${error?.message || 'Unknown error'}`);
  }
};

// Add driver details function
export const addDriverDetails = async (driverData: DriverDetails): Promise<any> => {
  try {
    console.log('👤 Adding driver details:', driverData);
    
    // Format phone numbers for backend - send 10 digits only
    const formatPhoneForBackend = (phone: string): string => {
      if (!phone || !phone.trim()) return '';
      // Remove +91 prefix and any non-digit characters, keep only 10 digits
      const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
      if (!cleanPhone) return '';
      // Return only the last 10 digits (in case there are more)
      return cleanPhone.slice(-10);
    };
    
    // Create FormData for multipart/form-data upload (matching Postman request)
    const formData = new FormData();
    
    // Add text fields (matching the Postman request exactly)
    formData.append('full_name', driverData.full_name || '');
    formData.append('primary_number', formatPhoneForBackend(driverData.primary_number));
    
    // Only add secondary_number if it has a value
    const formattedSecondary = formatPhoneForBackend(driverData.secondary_number || '');
    if (formattedSecondary) {
      formData.append('secondary_number', formattedSecondary);
    }
    
    formData.append('password', driverData.password || '');
    formData.append('licence_number', driverData.licence_number || '');
    formData.append('adress', driverData.adress || '');
    formData.append('organization_id', driverData.organization_id || 'org_123');
    formData.append('vehicle_owner_id', driverData.vehicle_owner_id || '');
    
    if (driverData.licence_expiry_date || driverData.expiry_date) {
      const exp = driverData.licence_expiry_date || driverData.expiry_date;
      formData.append('licence_expiry_date', exp || '');
      formData.append('expiry_date', exp || '');
    }

    // Backend expects only licence_front_img in this endpoint
    if (driverData.licence_front_img) {
      formData.append('licence_front_img', driverData.licence_front_img);
    }
    
    console.log('📱 Driver phone number formatting:', {
      original_primary: driverData.primary_number,
      formatted_primary: formatPhoneForBackend(driverData.primary_number),
      original_secondary: driverData.secondary_number,
      formatted_secondary: formattedSecondary || 'Not provided'
    });
    
    console.log('📤 FormData created for driver signup:', {
      full_name: driverData.full_name,
      primary_number: formatPhoneForBackend(driverData.primary_number),
      secondary_number: formattedSecondary || 'Not provided',
      password: driverData.password,
      licence_number: driverData.licence_number,
      adress: driverData.adress,
      organization_id: driverData.organization_id,
      vehicle_owner_id: driverData.vehicle_owner_id,
      images: {
        licence_front_img: driverData.licence_front_img ? 'File attached' : 'No file',
        rc_front_img: driverData.rc_front_img ? 'File attached' : 'No file',
        rc_back_img: driverData.rc_back_img ? 'File attached' : 'No file',
        insurance_img: driverData.insurance_img ? 'File attached' : 'No file',
        fc_img: driverData.fc_img ? 'File attached' : 'No file',
        car_img: driverData.car_img ? 'File attached' : 'No file'
      }
    });
    
    const authHeaders = await getAuthHeaders();
    
    // No manual Content-Type - axiosInstance's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    const response = await axiosInstance.post('/api/users/cardriver/signup', formData, {
      headers: { ...authHeaders },
      timeout: 120000, // 2 minutes timeout for file uploads
    });

    console.log('✅ Driver details added successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Failed to add driver details:', error);
    
    // Provide user-friendly error messages
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      const errorMessage = errorData?.detail || errorData?.message || errorData?.error || '';
      
      if (errorMessage.toLowerCase().includes('mobile') && errorMessage.toLowerCase().includes('exist')) {
        throw new Error('This mobile number is already registered for a driver. Please use a different mobile number.');
      } else if (errorMessage.toLowerCase().includes('licence') && errorMessage.toLowerCase().includes('exist')) {
        throw new Error('This licence number is already registered. Please use a different licence number.');
      } else if (errorMessage.toLowerCase().includes('validation') || errorMessage.toLowerCase().includes('required')) {
        throw new Error(`Please check driver information: ${errorMessage}`);
      } else if (errorMessage) {
        throw new Error(errorMessage);
      }
    } else if (error.response?.status === 404) {
      throw new Error('Driver registration service is not available. Please try again later.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again and try adding the driver.');
    }
    
    throw error;
  }
};
