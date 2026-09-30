import axiosInstance from '@/app/api/axiosInstance';
import authService from '../auth/authService';

// Car details interface for listing
export interface CarDetails {
  car_id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  organization_id: string;
  vehicle_owner_id: string;
  rc_front_img_url?: string;
  rc_back_img_url?: string;
  insurance_img_url?: string;
  fc_img_url?: string;
  car_img_url?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Get all cars for a vehicle owner - using only /api/users/available-cars
export const getCars = async (): Promise<CarDetails[]> => {
  console.log('🚗 Fetching cars list...');
  
  try {
    const token = await authService.getToken();
    if (!token) {
      throw new Error('No authentication token found. Please login first.');
    }

    const response = await axiosInstance.get('/api/users/available-cars', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        limit: 100,
        offset: 0,
        status: 'all'
      }
    });

    console.log('✅ Cars list fetched successfully:', response.data);
    return response.data.cars || response.data || [];
  } catch (error: any) {
    console.error('❌ Failed to fetch cars:', {
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
      throw new Error(`Car listing failed: ${errorDetail}. Please check if you have cars registered.`);
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      throw new Error('Car listing endpoint not found. Please check the API configuration.');
    } else {
      throw new Error(`Failed to fetch cars: ${error.message}`);
    }
  }
};