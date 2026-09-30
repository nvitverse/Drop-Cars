import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { DashboardData, fetchDashboardData, fetchAvailableDrivers, DriverDetail } from '@/services/orders/dashboardService';
import { useAuth } from './AuthContext';
import { validateTokenBeforeApiCall } from '@/utils/tokenValidator';

export interface FutureRide {
  id: string;
  booking_id: string;
  assignment_id?: string; // Add assignment_id for assignment operations
  pickup: string;
  drop: string;
  customer_name: string;
  customer_mobile: string;
  date: string;
  time: string;
  distance: number;
  fare_per_km: number;
  total_fare: number;
  status: string;
  assigned_driver: any | null;
  assigned_vehicle: any | null;
}

interface DashboardContextType {
  dashboardData: DashboardData | null;
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  refreshData: () => Promise<void>;
  forceRefreshDashboardData: () => Promise<void>;
  clearAllData: () => void;
  clearError: () => void;
  futureRides: FutureRide[];
  addFutureRide: (ride: FutureRide) => void;
  updateFutureRide: (ride: FutureRide) => void;
  availableDrivers: DriverDetail[];
  availableDriversLoading: boolean;
  availableDriversError: string | null;
  fetchAvailableDriversData: () => Promise<void>;
  refreshAvailableDrivers: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [futureRides, setFutureRides] = useState<FutureRide[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<DriverDetail[]>([]);
  const [availableDriversLoading, setAvailableDriversLoading] = useState(false);
  const [availableDriversError, setAvailableDriversError] = useState<string | null>(null);

  // Check if user is a Fleet Owner (not a driver)
  const isVehicleOwner = user && !user.driver_status;

  // Clear all dashboard data when component unmounts or resets
  const clearAllData = () => {
    console.log('🧹 Clearing all dashboard data...');
    setDashboardData(null);
    setError(null);
    setFutureRides([]);
    setAvailableDrivers([]);
    setAvailableDriversError(null);
    console.log('✅ All dashboard data cleared');
  };

  // Remove auto-fetching to improve app startup performance
  // Data will be fetched only when explicitly requested

  const fetchData = async () => {
    // Only fetch data if user is a Fleet Owner
    if (!isVehicleOwner) {
      console.log('ℹ️ Skipping dashboard data fetch - user is not a Fleet Owner');
      return;
    }

    // Validate token before making API call
    const isTokenValid = await validateTokenBeforeApiCall('owner');
    if (!isTokenValid) {
      console.log('❌ Token validation failed, skipping dashboard data fetch');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('📊 Fetching dashboard data from context...');
      const data = await fetchDashboardData();
      setDashboardData(data);
      console.log('✅ Dashboard data loaded in context:', {
        user: data.user_info,
        carCount: data.cars.length,
        driverCount: data.drivers.length
      });
    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard data in context:', error);
      const errorMessage = error.message || 'Failed to load dashboard data';
      setError(errorMessage);
      
      // If it's an authentication error, we might want to redirect to login
      if (error.message?.includes('No authentication token found') || 
          error.message?.includes('Authentication failed') || 
          error.message?.includes('401')) {
        console.log('🔐 Authentication error detected, user may need to login again');
        // Clear all data on authentication error
        setDashboardData(null);
        setError('Authentication failed. Please login again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await fetchData();
  };

  const forceRefreshDashboardData = async () => {
    console.log('🔄 Force refreshing dashboard data...');
    await fetchData();
  };

  const clearError = () => {
    setError(null);
  };

  const addFutureRide = (ride: FutureRide) => {
    setFutureRides(prev => {
      const exists = prev.find(r => (r.id || r.booking_id) === (ride.id || ride.booking_id));
      if (exists) {
        return prev;
      }
      return [ride, ...prev];
    });
  };

  const updateFutureRide = (ride: FutureRide) => {
    setFutureRides(prev => prev.map(r => (r.id === ride.id ? ride : r)));
  };

  const fetchAvailableDriversData = async () => {
    // Only fetch data if user is a Fleet Owner
    if (!isVehicleOwner) {
      console.log('ℹ️ Skipping available drivers fetch - user is not a Fleet Owner');
      return;
    }

    // Validate token before making API call
    const isTokenValid = await validateTokenBeforeApiCall('owner');
    if (!isTokenValid) {
      console.log('❌ Token validation failed, skipping available drivers fetch');
      return;
    }

    try {
      setAvailableDriversLoading(true);
      setAvailableDriversError(null);
      console.log('👥 Fetching available drivers data from context...');
      const drivers = await fetchAvailableDrivers();
      setAvailableDrivers(drivers);
      console.log('✅ Available drivers data loaded in context:', drivers.length, 'drivers');
    } catch (error: any) {
      console.error('❌ Failed to fetch available drivers data in context:', error);
      const errorMessage = error.message || 'Failed to load available drivers data';
      setAvailableDriversError(errorMessage);
      
      // If it's an authentication error, we might want to redirect to login
      if (error.message?.includes('Authentication failed') || error.message?.includes('401')) {
        console.log('🔐 Authentication error detected for available drivers, user may need to login again');
      }
    } finally {
      setAvailableDriversLoading(false);
    }
  };

  const refreshAvailableDrivers = async () => {
    await fetchAvailableDriversData();
  };

  return (
    <DashboardContext.Provider value={{
      dashboardData,
      loading,
      error,
      fetchData,
      refreshData,
      forceRefreshDashboardData,
      clearAllData,
      clearError,
      futureRides,
      addFutureRide,
      updateFutureRide,
      availableDrivers,
      availableDriversLoading,
      availableDriversError,
      fetchAvailableDriversData,
      refreshAvailableDrivers
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
