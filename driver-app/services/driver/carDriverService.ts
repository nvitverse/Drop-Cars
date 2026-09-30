export const getDriverAssignedOrders = async (): Promise<any[]> => {
  try {
    console.log('🧾 Fetching driver assigned orders...');
    const response = await axiosDriver.get('/api/assignments/driver/assigned-orders');
    return Array.isArray(response.data) ? response.data : [];
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('ℹ️ No assigned orders.');
      return [];
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Not authenticated/authorized. Please login as Driver.');
    }
    throw error;
  }
};

export const startTrip = async (orderId: number, startKm?: number, imgUri?: string, otp?: string) => {
  try {
    console.log('🚗 Starting trip for order:', orderId);

    // Validate required parameters
    if (!startKm || startKm <= 0) {
      throw new Error('Start KM must be provided and greater than 0');
    }

    if (!imgUri) {
      throw new Error('Speedometer image is required to start trip');
    }

    // otp is genuinely optional here - self-sourced (Create Booking) trips
    // never get one (see trip/start.tsx's otpRequired). The backend Form
    // field still needs SOME string present, so send '' rather than
    // omitting it - it only ever gets compared when the assignment
    // actually has a stored OTP (see start_trip in order_assignments.py).

    const form = new FormData();

    // Add required fields according to API specification
    form.append('start_km', String(startKm)); // integer - required
    form.append('otp', (otp || '').trim()); // string - Form field required, but only compared when the assignment actually has a stored OTP
    // Uses appendFileToFormData so this actually uploads a real file on web
    // instead of the literal string "[object Object]" (see that function's
    // comment for why).
    await appendFileToFormData(form, 'speedometer_img', imgUri, 'speedometer.jpg', 'image/jpeg'); // string($binary) - required

    console.log('📤 Sending start trip request:', {
      orderId,
      startKm,
      hasImage: !!imgUri
    });
    
    // No manual Content-Type - axiosDriver's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    const response = await axiosDriver.post(`/api/assignments/driver/start-trip/${orderId}`, form);

    console.log('✅ Trip started successfully:', response.data);
    
    // Log the response data according to API specification
    if (response.data) {
      console.log('📊 Trip Start Response:', {
        message: response.data.message,
        end_record_id: response.data.end_record_id,
        start_km: response.data.start_km,
        speedometer_img_url: response.data.speedometer_img_url
      });
    }
    
    return response.data;
  } catch (error: any) {
    console.error('❌ Failed to start trip:', error);
    console.error('❌ Error details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Handle specific validation errors
    if (error.response?.status === 422) {
      const validationErrors = error.response.data?.detail || [];
      if (Array.isArray(validationErrors)) {
        const errorMessages = validationErrors.map((err: any) => err.msg || err.message).join(', ');
        throw new Error(`Validation error: ${errorMessages}`);
      } else {
        throw new Error(`Validation error: ${error.response.data?.detail}`);
      }
    }
    
    throw error;
  }
};

export const endTrip = async (orderId: number, endKm?: number, contact?: string, imgUri?: string, tollCharges?: number, tollChargeUpdate?: boolean, waitingTime?: number, cashCollection?: number, otp?: string, extraChargesCollected?: { label: string; amount: number }[], distanceReason?: string) => {
  try {
    console.log('🏁 Ending trip for order:', orderId);

    // Validate required parameters
    if (!endKm || endKm <= 0) {
      throw new Error('End KM must be provided and greater than 0');
    }

    if (!imgUri) {
      throw new Error('End speedometer image is required to end trip');
    }

    // otp is genuinely optional here - self-sourced (Create Booking) trips
    // never get one (see trip/end.tsx's otpRequired). The backend Form
    // field still needs SOME string present, so send '' rather than
    // omitting it - it only ever gets compared when the assignment
    // actually has a stored OTP (see end_trip in order_assignments.py).

    const form = new FormData();

    // Add required fields according to API specification
    form.append('end_km', String(endKm)); // integer - required
    form.append('otp', (otp || '').trim()); // string - Form field required, but only compared when the assignment actually has a stored OTP
    // Uses appendFileToFormData so this actually uploads a real file on web
    // instead of the literal string "[object Object]" (see that function's
    // comment for why).
    await appendFileToFormData(form, 'close_speedometer_img', imgUri, 'close_speedometer.jpg', 'image/jpeg'); // string($binary) - required
    
    // Add toll charge update flag if provided
    if (tollChargeUpdate !== undefined) {
      form.append('toll_charge_update', String(tollChargeUpdate));
      console.log('💰 Toll charge update flag:', tollChargeUpdate);
    }
    
    // Add updated toll charges - only when toll_charge_update is true (per latest spec)
    if (tollChargeUpdate === true) {
      if (tollCharges !== undefined && tollCharges >= 0) {
        form.append('updated_toll_charges', String(tollCharges));
        console.log('💰 Adding updated toll charges (toll_charge_update=true):', tollCharges);
      } else {
        // Send empty to indicate no value when required field is missing
        form.append('updated_toll_charges', '');
        console.log('💰 Toll charge update is true but no amount provided, sending empty');
      }
    } else {
      // When false, do not send updated_toll_charges
      console.log('💰 Toll charge update is false, not sending updated_toll_charges');
    }
    
    // Add waiting_time for multicity orders
    if (waitingTime !== undefined && waitingTime >= 0) {
      form.append('waiting_time', String(waitingTime));
      console.log('⏱️ Adding waiting time:', waitingTime);
    }

    // Cash collected from the customer at trip end - settled against
    // driver_profit into the wallet server-side (see TRIP_SETTLEMENT_BALANCE).
    if (cashCollection !== undefined && cashCollection >= 0) {
      form.append('cash_collection', String(cashCollection));
    }

    // Why the driven km differs from the route distance (only sent when the server asked for it)
    if (distanceReason && distanceReason.trim()) {
      form.append('distance_reason', distanceReason.trim());
    }

    // Audit record only (never netted against cash_collection/driver_profit)
    // - what the driver actually collected for each non-bundled charge_item,
    // e.g. State Tax. See EndRecord.extra_charges_collected.
    if (extraChargesCollected && extraChargesCollected.length > 0) {
      form.append('extra_charges_collected', JSON.stringify(extraChargesCollected));
    }

    console.log('📤 Sending end trip request:', {
      orderId,
      endKm,
      hasImage: !!imgUri,
      tollCharges,
      tollChargeUpdate,
      waitingTime
    });
    
    // No manual Content-Type - axiosDriver's interceptor strips it for
    // FormData bodies so the platform can set its own boundary.
    const response = await axiosDriver.post(`/api/orders/driver/end-trip/${orderId}`, form);

    console.log('✅ Trip ended successfully:', response.data);
    
    // Log the response data according to API specification
    if (response.data) {
      console.log('📊 Trip End Response:', {
        message: response.data.message,
        end_record_id: response.data.end_record_id,
        end_km: response.data.end_km,
        close_speedometer_img_url: response.data.close_speedometer_img_url,
        total_km: response.data.total_km,
      });
    }
    
    return response.data;
  } catch (error: any) {
    console.error('❌ Failed to end trip:', error);
    console.error('❌ Error details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Handle specific validation errors
    if (error.response?.status === 422) {
      const validationErrors = error.response.data?.detail || [];
      if (Array.isArray(validationErrors)) {
        const errorMessages = validationErrors.map((err: any) => err.msg || err.message).join(', ');
        throw new Error(`Validation error: ${errorMessages}`);
      } else {
        throw new Error(`Validation error: ${error.response.data?.detail}`);
      }
    }
    
    throw error;
  }
};

/**
 * Get driver assigned order report for a specific order
 * GET /api/orders/driver/assigned-orders/{order_id} 
 */
export const getDriverAssignedOrderReport = async (orderId: number): Promise<any[]> => {
  try {
    console.log('🧾 Fetching driver assigned order report for order:', orderId);
    // Ensure driver bearer is attached explicitly (in addition to interceptor)
    const token = await SecureStore.getItemAsync('driverAuthToken');
    const response = await axiosDriver.get(`/api/assignments/driver/assigned-orders/${orderId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = Array.isArray(response.data) ? response.data : [];
    if (data.length > 0) {
      const s = data[0];
      console.log('📄 Assigned order report sample:', {
        order_id: s.order_id,
        total_km: s.total_km,
        customer_price: s.customer_price,
        updated_toll_charge: s.updated_toll_charge,
        toll_charges: s.toll_charges,
      });
    }
    return data;
  } catch (error: any) {
    console.error('❌ Failed to fetch driver assigned order report:', error);
    if (error.response?.status === 422) {
      const validationErrors = error.response.data?.detail || [];
      if (Array.isArray(validationErrors)) {
        const errorMessages = validationErrors.map((err: any) => err.msg || err.message).join(', ');
        throw new Error(`Validation error: ${errorMessages}`);
      } else {
        throw new Error(`Validation error: ${error.response.data?.detail}`);
      }
    }
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    }
    throw error;
  }
};
import axiosInstance from '@/app/api/axiosInstance';
import axiosDriver from '@/app/api/axiosDriver';
import { getAuthHeaders } from '@/services/auth/authService';
import * as SecureStore from '@/utils/secureStore';
import { appendFileToFormData } from '@/utils/formDataFile';

// Car Driver interfaces
export interface CarDriverSignupRequest {
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  address: string;
  aadhar_number: string;
  organization_id: string;
  password: string;
  email?: string;
  license_number?: string;
  experience_years?: number;
  vehicle_preferences?: string[];
}

export interface CarDriverSigninRequest {
  primary_number: string;
  password: string;
}

export interface CarDriverResponse {
  id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  address: string;
  aadhar_number: string;
  organization_id: string;
  status: 'ONLINE' | 'DRIVING' | 'BLOCKED' | 'PROCESSING' | 'offline'| 'inactive' | 'OFFLINE';
  driver_status?: string;
  email?: string;
  license_number?: string;
  experience_years?: number;
  vehicle_preferences?: string[];
  rating_avg?: number;
  rating_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CarDriverAuthResponse {
  success: boolean;
  message: string;
  driver?: CarDriverResponse;
  token?: string;
  refresh_token?: string;
}

export interface CarDriverStatusResponse {
  success: boolean;
  message: string;
  status?: 'online' | 'offline';
}

/**
 * Sign up a new car driver
 */
export const signupCarDriver = async (request: CarDriverSignupRequest): Promise<CarDriverAuthResponse> => {
  try {
    console.log('👤 Signing up car driver:', { 
      full_name: request.full_name, 
      primary_number: request.primary_number,
      organization_id: request.organization_id 
    });

    const response = await axiosInstance.post('/api/users/cardriver/signup', request);

    if (response.data) {
      console.log('✅ Car driver signup successful:', response.data);
      
      // Check if the response has the expected format
      if (response.data.success && response.data.driver && response.data.token) {
        return response.data;
      }
      
      // If response doesn't have expected format, try to normalize it
      if (response.data.driver || response.data.user) {
        const driver = response.data.driver || response.data.user;
        const token = response.data.token || response.data.access_token || response.data.jwt_token;
        
        if (driver && token) {
          console.log('🔧 Normalizing response format for compatibility');
          return {
            success: true,
            message: 'Signup successful',
            driver: driver,
            token: token,
            refresh_token: response.data.refresh_token
          };
        }
      }
      
      return response.data;
    }

    throw new Error('No response data received from signup');
  } catch (error: any) {
    console.error('❌ Car driver signup failed:', error);

    if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid signup data';
      throw new Error(`Signup failed: ${errorDetail}`);
    } else if (error.response?.status === 409) {
      throw new Error('Driver with this mobile number already exists');
    } else if (error.response?.status === 422) {
      const errorDetail = error.response.data?.detail || 'Validation error';
      throw new Error(`Validation error: ${errorDetail}`);
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to sign up car driver');
    }
  }
};

/**
 * Sign in a car driver
 */
export const signinCarDriver = async (request: CarDriverSigninRequest): Promise<CarDriverAuthResponse> => {
  try {
    console.log('🔐 Signing in car driver:', { primary_number: request.primary_number });

    const response = await axiosInstance.post('/api/users/cardriver/signin', request);

    if (response.data) {
      console.log('✅ Car driver signin successful:', response.data);
      
      // Check if the response has the expected format
      if (response.data.success && response.data.driver && response.data.token) {
        return response.data;
      }
      
      // If response doesn't have expected format, try to normalize it
      if (response.data.driver || response.data.user) {
        const driver = response.data.driver || response.data.user;
        const token = response.data.token || response.data.access_token || response.data.jwt_token;
        
        if (driver && token) {
          console.log('🔧 Normalizing response format for compatibility');
          await SecureStore.setItemAsync('driverAuthToken', token);
          await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({ 
            driverId: driver.id, 
            fullName: driver.full_name,
            driver_status: driver.status || driver.driver_status
          }));
          return {
            success: true,
            message: 'Signin successful',
            driver: driver,
            token: token,
            refresh_token: response.data.refresh_token
          };
        }
      }
      
      // If still no token, throw specific error
      if (!response.data.token && !response.data.access_token && !response.data.jwt_token) {
        throw new Error('No access token received from server');
      }
      
      // Persist token if present
      const token = response.data.token || response.data.access_token || response.data.jwt_token;
      const driver = response.data.driver || response.data.user;
      if (token && driver) {
        await SecureStore.setItemAsync('driverAuthToken', token);
        await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({ driverId: driver.id, fullName: driver.full_name }));
      }
      return response.data;
    }

    throw new Error('No response data received from signin');
  } catch (error: any) {
    console.error('❌ Car driver signin failed:', error);

    if (error.response?.status === 401) {
      throw new Error('Invalid mobile number or password');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found. Please check your mobile number');
    } else if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid signin data';
      throw new Error(`Signin failed: ${errorDetail}`);
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to sign in car driver');
    }
  }
};

/**
 * Set driver online - put /api/users/cardriver/online
 */
export const setDriverOnline = async (): Promise<CarDriverStatusResponse> => {
  try {
    console.log('🟢 Setting driver online...');

    const response = await axiosDriver.put('/api/users/cardriver/online');

    console.log('✅ Driver set online successfully:', response.data);
    return {
      success: true,
      message: 'Driver set online successfully',
      status: 'online',
      ...response.data
    };
  } catch (error: any) {
    console.error('❌ Failed to set driver online:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found');
    } else if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid request';
      throw new Error(`Failed to set online: ${errorDetail}`);
    } else {
      throw new Error(error.message || 'Failed to set driver online');
    }
  }
};

/**
 * Set driver offline - put /api/users/cardriver/offline
 */
export const setDriverOffline = async (): Promise<CarDriverStatusResponse> => {
  try {
    console.log('🔴 Setting driver offline...');

    const response = await axiosDriver.put('/api/users/cardriver/offline');

    console.log('✅ Driver set offline successfully:', response.data);
    return {
      success: true,
      message: 'Driver set offline successfully',
      status: 'offline',
      ...response.data
    };
  } catch (error: any) {
    console.error('❌ Failed to set driver offline:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found');
    } else if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid request';
      throw new Error(`Failed to set offline: ${errorDetail}`);
    } else {
      throw new Error(error.message || 'Failed to set driver offline');
    }
  }
};

/**
 * Get car driver by ID
 */
export const getCarDriver = async (driverId: string): Promise<CarDriverResponse> => {
  try {
    console.log('👤 Fetching car driver:', driverId);

    // VO-scoped endpoint; keep VO token here
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get(`/api/users/cardriver/${driverId}`, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Car driver fetched successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from driver fetch');
  } catch (error: any) {
    console.error('❌ Failed to fetch car driver:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to fetch car driver');
    }
  }
};

/**
 * Get drivers by vehicle owner ID
 */
export const getDriversByVehicleOwner = async (vehicleOwnerId: string): Promise<CarDriverResponse[]> => {
  try {
    console.log('👥 Fetching drivers by vehicle owner ID:', vehicleOwnerId);

    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get(`/api/users/cardriver/vehicle-owner/${vehicleOwnerId}`, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Drivers fetched by vehicle owner successfully:', response.data.length, 'drivers');
      return response.data;
    }

    return [];
  } catch (error: any) {
    console.error('❌ Failed to fetch drivers by vehicle owner:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      console.log('⚠️ No drivers found for vehicle owner:', vehicleOwnerId);
      return [];
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to fetch drivers by vehicle owner');
    }
  }
};


export const getCarDriverByMobile = async (mobileNumber: string): Promise<CarDriverResponse> => {
  try {
    console.log('📱 Fetching car driver by mobile:', mobileNumber);

    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get(`/api/users/cardriver/mobile/${mobileNumber}`, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Car driver fetched by mobile successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from driver fetch');
  } catch (error: any) {
    console.error('❌ Failed to fetch car driver by mobile:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found with this mobile number');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to fetch car driver by mobile');
    }
  }
};

/**
 * Update car driver profile
 */
export const updateCarDriverProfile = async (
  driverId: string, 
  updates: Partial<CarDriverResponse>
): Promise<CarDriverResponse> => {
  try {
    console.log('✏️ Updating car driver profile:', driverId, updates);

    const licenceNumberUpdate = (updates as any).licence_number || (updates as any).license_number;
    if (licenceNumberUpdate) {
      console.log('⏳ Submitting driver licence_number update to Admin Review Queue:', driverId);
      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: driverId,
        user_type: 'DRIVER',
        user_name: updates.full_name || 'Driver',
        user_phone: updates.primary_number || '',
        field_name: 'licence_number', // British spelling required by backend
        proposed_value: licenceNumberUpdate,
      });

      // Strip whichever spelling the caller actually used - licenceNumberUpdate
      // above already reads both, so the direct-update payload below must
      // drop both too, or the American-spelling variant would slip through
      // to the unreviewed PUT call while also being submitted for review.
      const { licence_number, license_number, ...directUpdates } = updates as any;
      if (Object.keys(directUpdates).length === 0) {
        return {
          id: driverId,
          ...updates,
          message: 'Licence number update submitted for Admin Review and pending approval.',
        } as any;
      }
      updates = directUpdates;
    }

    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.put(`/api/users/cardriver/${driverId}`, updates, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Car driver profile updated successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from profile update');
  } catch (error: any) {
    console.error('❌ Failed to update car driver profile:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found');
    } else if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid update data';
      throw new Error(`Profile update failed: ${errorDetail}`);
    } else if (error.response?.status === 422) {
      const errorDetail = error.response.data?.detail || 'Validation error';
      throw new Error(`Validation error: ${errorDetail}`);
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to update car driver profile');
    }
  }
};

/**
 * Delete car driver
 */
export const deleteCarDriver = async (driverId: string): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('🗑️ Deleting car driver:', driverId);

    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.delete(`/api/users/cardriver/${driverId}`, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Car driver deleted successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from driver deletion');
  } catch (error: any) {
    console.error('❌ Failed to delete car driver:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Driver not found');
    } else if (error.response?.status === 400) {
      const errorDetail = error.response.data?.detail || error.response.data?.message || 'Invalid request';
      throw new Error(`Driver deletion failed: ${errorDetail}`);
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to delete car driver');
    }
  }
};

/**
 * Search drivers with filters
 */
export const searchDrivers = async (filters: {
  organization_id?: string;
  status?: 'online' | 'offline'| 'inactive';
  vehicle_type?: string;
  experience_min?: number;
  experience_max?: number;
  location?: string;
}): Promise<CarDriverResponse[]> => {
  try {
    console.log('🔍 Searching drivers with filters:', filters);

    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get('/api/users/cardriver/search', {
      headers: authHeaders,
      params: filters
    });

    if (response.data) {
      console.log('✅ Drivers search successful:', response.data.length, 'drivers found');
      return response.data;
    }

    return [];
  } catch (error: any) {
    console.error('❌ Failed to search drivers:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      console.log('⚠️ No drivers found with given filters');
      return [];
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to search drivers');
    }
  }
};


