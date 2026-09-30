import axiosInstance from '@/app/api/axiosInstance';
import authService from '../auth/authService';

export interface CarDetail {
  id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  car_brand?: string;
  car_model?: string;
  car_year?: number;
  year?: number;
  year_of_the_car?: number; // API uses 'year_of_the_car'
  organization_id: string;
  vehicle_owner_id: string;
  rc_front_img_url?: string;
  rc_back_img_url?: string;
  insurance_img_url?: string;
  fc_img_url?: string;
  car_img_url?: string;
  created_at: string;
  updated_at: string;
}

export interface DriverDetail {
  id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  address?: string; // API uses 'address'
  adress?: string; // Backward compatibility for typo field name
  city?: string;
  pincode?: string;
  licence_number: string;
  organization_id: string;
  driver_status: string;
  licence_front_img: string;
  created_at: string;
}

export interface VehicleOwnerDetails {
  id: string;
  full_name: string;
  primary_mobile: string;
  secondary_mobile?: string;
  wallet_balance: number;
  organization_id: string;
  vehicle_owner_id: string;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  user_info: VehicleOwnerDetails;
  cars: CarDetail[];
  drivers: DriverDetail[];
  summary: {
    total_cars: number;
    total_drivers: number;
    wallet_balance: number;
  };
}

export const fetchDashboardData = async (): Promise<DashboardData> => {
  try {
    console.log('Fetching dashboard data...');
    
    const token = await authService.getToken();
    if (!token) {
      throw new Error('No authentication token found. Please login first.');
    }

    // 1. Fetch vehicle owner details using /api/users/vehicle-owner/me
    console.log('👤 Fetching vehicle owner details...');
    const ownerResponse = await axiosInstance.get('/api/users/vehicle-owner/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!ownerResponse.data) {
      throw new Error('Failed to fetch vehicle owner details');
    }

    const ownerDetails: VehicleOwnerDetails = ownerResponse.data;
    console.log('✅ Vehicle owner details received:', ownerDetails);

    // 2. Fetch all cars using /api/users/available-cars
    let cars: CarDetail[] = [];
    try {
      console.log('🚗 Fetching all cars...');
      const carsResponse = await axiosInstance.get('/api/users/available-cars', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
          });
          
          if (carsResponse.data && Array.isArray(carsResponse.data)) {
            cars = carsResponse.data;
        console.log(`✅ Cars fetched:`, cars.length, 'cars');
      }
    } catch (error) {
      console.error('❌ Failed to fetch cars:', error);
    }

    // 3. Fetch all drivers using /api/users/available-drivers
    let drivers: DriverDetail[] = [];
    try {
      console.log('👤 Fetching all drivers...');
      const driversResponse = await axiosInstance.get('/api/users/available-drivers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
          });
          
          if (driversResponse.data && Array.isArray(driversResponse.data)) {
        drivers = driversResponse.data;
        console.log(`✅ Drivers fetched:`, drivers.length, 'drivers');
      }
    } catch (error) {
      console.error('❌ Failed to fetch drivers:', error);
    }

    const dashboardData: DashboardData = {
      user_info: ownerDetails,
      cars,
      drivers,
      summary: {
        total_cars: cars.length,
        total_drivers: drivers.length,
        wallet_balance: ownerDetails.wallet_balance
      }
    };

    console.log('Dashboard data assembled:', {
      user: dashboardData.user_info,
      carCount: dashboardData.cars.length,
      driverCount: dashboardData.drivers.length,
      walletBalance: dashboardData.user_info.wallet_balance
    });

    return dashboardData;

  } catch (error: any) {
    console.error('❌ Failed to fetch dashboard data:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your connection.');
    } else if (error.code === 'ERR_NETWORK') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to fetch dashboard data');
    }
  }
};

export const refreshDashboardData = async (): Promise<DashboardData> => {
  console.log('🔄 Refreshing dashboard data...');
  return fetchDashboardData();
};

export const forceRefreshDashboardData = async (): Promise<DashboardData> => {
  console.log('🔄 Force refreshing dashboard data...');
  try {
    const freshData = await fetchDashboardData();
    console.log('✅ Dashboard data force refreshed successfully');
    return freshData;
  } catch (error) {
    console.error('❌ Force refresh failed:', error);
    throw error;
  }
};

// Fetch available drivers (for compatibility with existing code)
export const fetchAvailableDrivers = async (): Promise<DriverDetail[]> => {
  try {
    console.log('👥 Fetching available drivers...');
    const token = await authService.getToken();
    if (!token) {
      throw new Error('No authentication token found. Please login first.');
    }

    const driversResponse = await axiosInstance.get('/api/users/available-drivers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (driversResponse.data && Array.isArray(driversResponse.data)) {
      console.log('✅ Available drivers fetched:', driversResponse.data.length);
      return driversResponse.data;
    }
    return [];
  } catch (error: any) {
    console.error('❌ Failed to fetch available drivers:', error);
    throw error;
  }
};
