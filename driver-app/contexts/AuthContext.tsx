import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as SecureStore from '@/utils/secureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, getCompleteUserData } from '@/services/auth/authService';
import { getBubblePreference, startPersistentService, stopPersistentService } from '@/services/bubble/bubbleOverlay';

interface User {
  id: string;
  fullName: string;
  primaryMobile: string;
  secondaryMobile?: string;
  password: string;
  address: string;
  aadharNumber: string;
  languages: string[];
  documents: any;
  driver_status?: string; // Add driver status for drivers
  account_status?: string; // Add account status for fleet owners
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  refreshUserData: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user data on app start
  useEffect(() => {
    loadUserDataOnStart();
  }, []);

  const loadUserDataOnStart = async () => {
    try {
      setIsLoading(true);
      
      // Fast local storage check only - no API calls on startup
      const localUser = await SecureStore.getItemAsync('userData');
      if (localUser) {
        const userData = JSON.parse(localUser);
        setUser(userData);
        console.log('✅ User data loaded from local storage (fast startup)');

        // App relaunch with an existing session - pre-warm driver token if needed
        SecureStore.getItemAsync('authToken').then((ownerToken) => {
          if (ownerToken) {
            import('@/services/driver/driverService').then(({ loginDriverAsOwner }) => {
              loginDriverAsOwner().catch(() => {});
            });
          }
        });

        getBubblePreference().then((enabled) => {
          if (enabled) startPersistentService();
        });
        return;
      }

      // If no local data, user needs to login
      console.log('ℹ️ No local user data found, user needs to login');
    } catch (error) {
      console.error('❌ Failed to load user data on start:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData: User, token: string) => {
    try {
      // Save to SecureStore
      await SecureStore.setItemAsync('authToken', token);
      
      // Store owner login timestamp
      await SecureStore.setItemAsync('ownerLastLogin', Date.now().toString());
      
      // Save password for verification page refresh functionality
      if (userData.password) {
        await SecureStore.setItemAsync('tempPassword', userData.password);
      }
      
      // Save locally only
      await SecureStore.setItemAsync('userData', JSON.stringify(userData));
      
      setUser(userData);
      console.log('✅ User logged in successfully and saved locally:', userData);

      // Trigger data refresh after successful login
      console.log('🔄 User login completed, contexts will auto-refresh data');

      // Keep the process alive for background booking alerts if the driver
      // has opted into the bubble feature (Settings) - no-ops if not, or if
      // overlay permission isn't granted yet.
      getBubblePreference().then((enabled) => {
        if (enabled) startPersistentService();
      });
    } catch (error) {
      console.error('❌ Login failed:', error);
      throw new Error('Failed to save authentication data');
    }
  };

  const logout = async () => {
    try {
      console.log('🔄 Starting comprehensive logout process...');

      // No point keeping a "watching for bookings" foreground service alive
      // for a session that's about to be signed out of.
      stopPersistentService();

      // Clear auth service data
      await authService.logout();
      
      // Clear all SecureStore items (Fleet Owner data)
      const secureStoreKeys = [
        'userData',
        'authToken',
        'loginResponse',
        'notificationsEnabled',
        'expoPushToken',
        'driverAuthToken',
        'driverAuthInfo',
        'ownerLastLogin',
        'driverLastLogin',
        'lastActiveRole',
        'driverLoginResponse',
        'driverTempPassword',
        'tempPassword'
      ];
      
      for (const key of secureStoreKeys) {
        try {
          await SecureStore.deleteItemAsync(key);
          console.log(`✅ Cleared SecureStore key: ${key}`);
        } catch (error) {
          console.log(`ℹ️ SecureStore key ${key} not found or already cleared`);
        }
      }
      
      // Clear all AsyncStorage items (Car Driver data)
      const asyncStorageKeys = [
        'carDriver',
        'carDriverToken'
      ];
      
      for (const key of asyncStorageKeys) {
        try {
          await AsyncStorage.removeItem(key);
          console.log(`✅ Cleared AsyncStorage key: ${key}`);
        } catch (error) {
          console.log(`ℹ️ AsyncStorage key ${key} not found or already cleared`);
        }
      }
      
      // Clear user state
      setUser(null);
      
      // User state will be set to null, which will trigger useEffect in other contexts
      
      console.log('✅ Comprehensive logout completed - all user data cleared');
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Even if there's an error, clear the user state
      setUser(null);
    }
  };

  const refreshUserData = async () => {
    try {
      const userData = await getCompleteUserData();
      if (userData) {
        const contextUser: User = {
          id: userData.id,
          fullName: userData.fullName,
          primaryMobile: userData.primaryMobile,
          secondaryMobile: userData.secondaryMobile,
          password: '',
          address: userData.address,
          aadharNumber: userData.aadharNumber,
          languages: userData.languages,
          documents: {},
          account_status: (userData as any).account_status
        };
        setUser(contextUser);
        
        // Update local storage with refreshed data
        await SecureStore.setItemAsync('userData', JSON.stringify(contextUser));
        console.log('✅ User data refreshed and saved locally:', contextUser);
      }
    } catch (error) {
      console.error('❌ Failed to refresh user data:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser, refreshUserData, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
