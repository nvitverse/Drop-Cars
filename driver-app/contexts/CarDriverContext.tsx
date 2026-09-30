import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from '@/utils/secureStore';
import {
  CarDriverResponse,
  CarDriverSignupRequest,
  CarDriverSigninRequest,
  CarDriverAuthResponse,
  CarDriverStatusResponse,
  signupCarDriver,
  signinCarDriver,
  setDriverOnline,
  setDriverOffline,
  getCarDriver,
  // getDriversByOrganization, // removed: organization APIs not supported
  getCarDriverByMobile,
  updateCarDriverProfile,
  deleteCarDriver,
  searchDrivers
} from '@/services/driver/carDriverService';
import { loginDriverAsOwner } from '@/services/driver/driverService';

interface CarDriverContextType {
  // Driver state
  driver: CarDriverResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Authentication methods
  signup: (request: CarDriverSignupRequest) => Promise<void>;
  signin: (request: CarDriverSigninRequest) => Promise<void>;
  // Own-cum-driver quick switch (Duty tab / POST /cardriver/signin-as-owner)
  // - no password, the owner is already authenticated. Ends in the exact
  // same context state (driver + isAuthenticated + storage) signin() does,
  // so car-driver/dashboard and every other car-driver/* screen can't tell
  // the difference - this is NOT a separate, parallel session mechanism.
  signinAsOwner: () => Promise<void>;
  signout: () => Promise<void>;
  
  // Status management
  goOnline: () => Promise<void>;
  goOffline: () => Promise<void>;
  
  // Profile management
  updateProfile: (updates: Partial<CarDriverResponse>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  
  // Data fetching
  refreshDriverData: () => Promise<void>;
  getDriversForOrganization: (organizationId: string) => Promise<CarDriverResponse[]>; // deprecated
  searchDriversByFilters: (filters: any) => Promise<CarDriverResponse[]>;
  
  // Utility methods
  clearError: () => void;
  clearAllData: () => void;
  debugTokenStorage: () => Promise<{ asyncToken: string | null; secureToken: string | null }>;
}

const CarDriverContext = createContext<CarDriverContextType | undefined>(undefined);

interface CarDriverProviderProps {
  children: ReactNode;
}

export const CarDriverProvider: React.FC<CarDriverProviderProps> = ({ children }) => {
  const [driver, setDriver] = useState<CarDriverResponse | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load stored driver data on app start
  useEffect(() => {
    loadStoredDriverData();
  }, []);

  const loadStoredDriverData = async () => {
    try {
      setIsLoading(true);
      
      // Fast local storage check only - no API calls on startup
      const storedDriver = await AsyncStorage.getItem('carDriver');
      const storedToken = await AsyncStorage.getItem('carDriverToken');
      
      if (storedDriver && storedToken) {
        const driverData = JSON.parse(storedDriver);
        setDriver(driverData);
        setIsAuthenticated(true);
        console.log('✅ Stored driver data loaded (fast startup):', driverData.full_name);
      } else {
        console.log('ℹ️ No stored driver data found, driver needs to login');
      }
    } catch (error) {
      console.error('❌ Failed to load stored driver data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const storeDriverData = async (driverData: CarDriverResponse, token: string) => {
    try {
      // Store in AsyncStorage for CarDriverContext
      await AsyncStorage.setItem('carDriver', JSON.stringify(driverData));
      await AsyncStorage.setItem('carDriverToken', token);
      
      // Also store in SecureStore for axiosDriver interceptor
      await SecureStore.setItemAsync('driverAuthToken', token);
      await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify({
        driverId: driverData.id,
        fullName: driverData.full_name,
        primaryNumber: driverData.primary_number,
        driver_status: driverData.status
      }));
      
      console.log('✅ Driver data stored successfully in both AsyncStorage and SecureStore');
      console.log('🔍 Token storage verification:', {
        tokenLength: token.length,
        tokenPreview: `${token.substring(0, 20)}...`,
        driverId: driverData.id
      });
    } catch (error) {
      console.error('❌ Failed to store driver data:', error);
    }
  };

  const clearStoredData = async () => {
    try {
      // Clear AsyncStorage
      await AsyncStorage.removeItem('carDriver');
      await AsyncStorage.removeItem('carDriverToken');
      
      // Clear SecureStore
      await SecureStore.deleteItemAsync('driverAuthToken');
      await SecureStore.deleteItemAsync('driverAuthInfo');
      
      console.log('✅ Stored driver data cleared from both AsyncStorage and SecureStore');
    } catch (error) {
      console.error('❌ Failed to clear stored driver data:', error);
    }
  };

  const signup = async (request: CarDriverSignupRequest): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('👤 Starting car driver signup...');
      const response: CarDriverAuthResponse = await signupCarDriver(request);
      
      if (response.success && response.driver && response.token) {
        setDriver(response.driver);
        setIsAuthenticated(true);
        await storeDriverData(response.driver, response.token);
        console.log('✅ Car driver signup successful');
      } else {
        throw new Error(response.message || 'Signup failed');
      }
    } catch (error: any) {
      console.error('❌ Car driver signup failed:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signin = async (request: CarDriverSigninRequest): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔐 Starting car driver signin...');
      const response: CarDriverAuthResponse = await signinCarDriver(request);
      
      if (response.success && response.driver && response.token) {
        // Store password temporarily for verification refresh
        await SecureStore.setItemAsync('driverTempPassword', request.password);
        
        // Store driver login response for verification page
        await SecureStore.setItemAsync('driverLoginResponse', JSON.stringify(response));
        
        // Store driver user data
        await SecureStore.setItemAsync('driverUser', JSON.stringify({
          primary_number: request.primary_number,
          full_name: response.driver.full_name
        }));
        
        setDriver(response.driver);
        setIsAuthenticated(true);
        await storeDriverData(response.driver, response.token);
        console.log('✅ Car driver signin successful');
      } else {
        throw new Error(response.message || 'Signin failed');
      }
    } catch (error: any) {
      console.error('❌ Car driver signin failed:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signinAsOwner = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('👤 Starting own-cum-driver quick switch...');
      const loginResponse = await loginDriverAsOwner();

      const initialStatus = (loginResponse.driver_status as any) || 'OFFLINE';
      const fullDriver: CarDriverResponse = {
        id: loginResponse.driver_id,
        full_name: loginResponse.full_name || 'Driver',
        primary_number: loginResponse.primary_number || '',
        driver_status: initialStatus,
        status: initialStatus,
        address: '',
        city: '',
        is_owner_driver: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as CarDriverResponse;

      // Attempt background profile enhancement if available
      try {
        const fetched = await getCarDriver(loginResponse.driver_id);
        if (fetched && fetched.id) {
          Object.assign(fullDriver, fetched);
        }
      } catch (fetchErr) {
        console.log('ℹ️ Extra driver profile fetch skipped:', fetchErr);
      }

      setDriver(fullDriver);
      setIsAuthenticated(true);
      setError(null);
      await storeDriverData(fullDriver, loginResponse.access_token);
      console.log('✅ Own-cum-driver quick switch successful');
    } catch (error: any) {
      // Previously this caught a real login failure and silently faked a
      // successful, fully-authenticated session ("Mukil Travels", a fixed
      // phone number) instead of surfacing the error - meaning a network
      // blip or backend outage looked exactly like a normal login. A failed
      // login must fail, not fabricate an identity.
      console.error('❌ Own-cum-driver quick switch failed:', error?.message);
      setError(error?.message || 'Could not start your duty session. Please try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Set driver offline before signing out
      if (driver) {
        try {
          await setDriverOffline();
          console.log('✅ Driver set offline before signout');
        } catch (error) {
          console.warn('⚠️ Failed to set driver offline:', error);
        }
      }
      
      setDriver(null);
      setIsAuthenticated(false);
      await clearStoredData();
      console.log('✅ Car driver signout successful');
    } catch (error) {
      console.error('❌ Car driver signout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const goOnline = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      let updatedObj: CarDriverResponse | null = null;
      setDriver(prev => {
        if (!prev) return null;
        updatedObj = { ...prev, status: 'ONLINE' as any, driver_status: 'ONLINE' as any };
        return updatedObj;
      });

      if (updatedObj) {
        await AsyncStorage.setItem('carDriver', JSON.stringify(updatedObj)).catch(() => {});
      }
      
      console.log('🟢 Setting driver online...');
      try {
        await setDriverOnline();
      } catch (err) {
        console.warn('⚠️ Background server online toggle notice:', err);
      }
      console.log('✅ Driver set online successfully');
    } catch (error: any) {
      console.error('❌ Failed to set driver online:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const goOffline = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      let updatedObj: CarDriverResponse | null = null;
      setDriver(prev => {
        if (!prev) return null;
        updatedObj = { ...prev, status: 'OFFLINE' as any, driver_status: 'OFFLINE' as any };
        return updatedObj;
      });

      if (updatedObj) {
        await AsyncStorage.setItem('carDriver', JSON.stringify(updatedObj)).catch(() => {});
      }
      
      console.log('🔴 Setting driver offline...');
      try {
        await setDriverOffline();
      } catch (err) {
        console.warn('⚠️ Background server offline toggle notice:', err);
      }
      console.log('✅ Driver set offline successfully');
    } catch (error: any) {
      console.error('❌ Failed to set driver offline:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<CarDriverResponse>): Promise<void> => {
    if (!driver) {
      throw new Error('No driver logged in');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('✏️ Updating driver profile...');
      const updatedDriver = await updateCarDriverProfile(driver.id, updates);
      
      setDriver(updatedDriver);
      const token = await AsyncStorage.getItem('carDriverToken') || '';
      await storeDriverData(updatedDriver, token);
      console.log('✅ Driver profile updated successfully');
    } catch (error: any) {
      console.error('❌ Failed to update driver profile:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!driver) {
      throw new Error('No driver logged in');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🗑️ Deleting driver account...');
      await deleteCarDriver(driver.id);
      
      setDriver(null);
      setIsAuthenticated(false);
      await clearStoredData();
      console.log('✅ Driver account deleted successfully');
    } catch (error: any) {
      console.error('❌ Failed to delete driver account:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDriverData = async (): Promise<void> => {
    if (!driver) {
      throw new Error('No driver logged in');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔄 Refreshing driver data...');
      const freshDriver = await getCarDriver(driver.id);
      
      setDriver(freshDriver);
      const token = await AsyncStorage.getItem('carDriverToken') || '';
      await storeDriverData(freshDriver, token);
      console.log('✅ Driver data refreshed successfully');
    } catch (error: any) {
      console.error('❌ Failed to refresh driver data:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getDriversForOrganization = async (_organizationId: string): Promise<CarDriverResponse[]> => {
    console.warn('getDriversForOrganization is deprecated: organization APIs are not available');
    return [];
  };

  const searchDriversByFilters = async (filters: any): Promise<CarDriverResponse[]> => {
    try {
      console.log('🔍 Searching drivers with filters:', filters);
      const drivers = await searchDrivers(filters);
      console.log('✅ Drivers search successful:', drivers.length);
      return drivers;
    } catch (error: any) {
      console.error('❌ Failed to search drivers:', error);
      throw error;
    }
  };

  const clearError = () => {
    setError(null);
  };

  const clearAllData = () => {
    console.log('🧹 Clearing all car driver data...');
    setDriver(null);
    setIsAuthenticated(false);
    setError(null);
    // Was in-memory state only - AsyncStorage's 'carDriver'/'carDriverToken'
    // (what loadStoredDriverData's next mount checks to decide
    // isAuthenticated) were never actually cleared here, only by
    // clearStoredData (used on explicit logout/delete-account). The real,
    // live "adikkadi session expired" bug: axiosDriver's interceptor clears
    // SecureStore's driverAuthToken on a 401 and fires this via
    // GlobalSessionListener, but the stale AsyncStorage snapshot survives -
    // so the NEXT app/provider remount resurrects isAuthenticated=true from
    // it (real assigned orders render fine again), while the SecureStore
    // token axiosDriver actually sends requests with stays gone. Every
    // subsequent driver-scoped call 401s again, repeating forever until a
    // real logout+login. Found 2026-09-05 live-reproducing the report.
    clearStoredData().catch(() => {});
  };

  // Debug function to check token storage
  const debugTokenStorage = async () => {
    try {
      const asyncToken = await AsyncStorage.getItem('carDriverToken');
      const secureToken = await SecureStore.getItemAsync('driverAuthToken');
      
      console.log('🔍 Token storage debug:', {
        asyncStorageToken: {
          exists: !!asyncToken,
          length: asyncToken?.length || 0,
          preview: asyncToken ? `${asyncToken.substring(0, 20)}...` : 'None'
        },
        secureStoreToken: {
          exists: !!secureToken,
          length: secureToken?.length || 0,
          preview: secureToken ? `${secureToken.substring(0, 20)}...` : 'None'
        }
      });
      
      return { asyncToken, secureToken };
    } catch (error) {
      console.error('❌ Error debugging token storage:', error);
      return { asyncToken: null, secureToken: null };
    }
  };

  const value: CarDriverContextType = {
    driver,
    isAuthenticated,
    isLoading,
    error,
    signup,
    signin,
    signinAsOwner,
    signout,
    goOnline,
    goOffline,
    updateProfile,
    deleteAccount,
    refreshDriverData,
    getDriversForOrganization,
    searchDriversByFilters,
    clearError,
    clearAllData,
    debugTokenStorage
  };

  return (
    <CarDriverContext.Provider value={value}>
      {children}
    </CarDriverContext.Provider>
  );
};

export const useCarDriver = (): CarDriverContextType => {
  const context = useContext(CarDriverContext);
  if (context === undefined) {
    throw new Error('useCarDriver must be used within a CarDriverProvider');
  }
  return context;
};
