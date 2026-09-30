import { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as SecureStore from '@/utils/secureStore';
import { onSessionExpired } from '@/utils/session';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import axiosInstance from '@/app/api/axiosInstance';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LanguageSelectScreen, { HAS_SEEN_LANGUAGE_SELECT_KEY } from '@/components/LanguageSelectScreen';

export default function IndexScreen() {
  const router = useRouter();
  const { setUser } = useAuth();
  const { signout } = useCarDriver();
  const { t } = useLanguage();
  const [userRole, setUserRole] = useState<'owner' | 'driver' | null>(null);
  const [sessionExpiredCleared, setSessionExpiredCleared] = useState(false);
  // First-launch language picker (same as the Vendor App): shown once before
  // the normal auth routing; either choosing or skipping continues to it.
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  
  // Add refs to prevent multiple simultaneous checks and navigation loops
  const isCheckingAuth = useRef(false);
  const hasNavigated = useRef(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only check auth once on mount
    if (!isCheckingAuth.current && !hasNavigated.current) {
      AsyncStorage.getItem(HAS_SEEN_LANGUAGE_SELECT_KEY)
        .then((seen) => {
          if (seen) checkAuthStatus();
          else setShowLanguageSelect(true);
        })
        .catch(() => checkAuthStatus());
    }
    
    const off = onSessionExpired(async () => {
      try { Alert.alert(t('index.sessionExpiredTitle'), t('index.sessionExpiredBody')); } catch {}
      
      // Mark that session was expired - this will prevent auto-login
      setSessionExpiredCleared(true);
      
      // Clear data based on current role
      if (userRole === 'owner') {
        try { 
          await SecureStore.deleteItemAsync('authToken'); 
          await SecureStore.deleteItemAsync('userData');
          await SecureStore.deleteItemAsync('loginResponse');
          await SecureStore.deleteItemAsync('ownerLastLogin');
        } catch {}
      } else if (userRole === 'driver') {
        try { 
          await signout(); 
          await SecureStore.deleteItemAsync('driverAuthToken');
          await SecureStore.deleteItemAsync('driverAuthInfo');
          await SecureStore.deleteItemAsync('driverLastLogin');
        } catch {}
      }
      
      setUserRole(null);
      hasNavigated.current = false; // Reset navigation flag
      router.replace('/login');
    });
    
    return () => {
      off();
      // Clear timeout on unmount
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  const checkAuthStatus = async () => {
    // Prevent multiple simultaneous checks
    if (isCheckingAuth.current || hasNavigated.current) {
      console.log('⏸️ Auth check already in progress or navigation already happened, skipping...');
      return;
    }
    
    isCheckingAuth.current = true;
    
    try {
      // If session was explicitly expired, don't auto-login
      if (sessionExpiredCleared) {
        console.log('🛑 Session was expired, skipping auto-login');
        isCheckingAuth.current = false;
        return;
      }
      
      // Small delay to allow any pending SecureStore operations to complete
      // This prevents race conditions when navigating between login screens
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Check for Fleet Owner authentication
      const voToken = await SecureStore.getItemAsync('authToken');
      const voUserData = await SecureStore.getItemAsync('userData');
      const voLastLogin = await SecureStore.getItemAsync('ownerLastLogin'); // Timestamp
      
      // Check for Quick Driver authentication
      const driverToken = await SecureStore.getItemAsync('driverAuthToken');
      const driverUserData = await SecureStore.getItemAsync('driverAuthInfo');
      const driverLastLogin = await SecureStore.getItemAsync('driverLastLogin'); // Timestamp
      // Check for last active role preference
      const lastActiveRole = await SecureStore.getItemAsync('lastActiveRole');
      
      console.log('🔍 Auth check:', {
        hasVOToken: !!voToken,
        hasVOUserData: !!voUserData,
        voLastLogin,
        hasDriverToken: !!driverToken,
        hasDriverUserData: !!driverUserData,
        driverLastLogin,
        lastActiveRole,
      });
      
      // Determine which user logged in most recently
      const hasOwnerAuth = voToken && voUserData;
      const hasDriverAuth = driverToken && driverUserData;
      
      // Mark navigation flag before navigating to prevent loops
      if (hasOwnerAuth && hasDriverAuth) {
        // Both tokens exist - only route to driver if lastActiveRole was explicitly set to 'driver' AND driverLastLogin exists
        const ownerTime = voLastLogin ? parseInt(voLastLogin) : 0;
        const driverTime = driverLastLogin ? parseInt(driverLastLogin) : 0;
        
        console.log('⚠️ Both auths exist:', {
          lastActiveRole,
          ownerTime,
          driverTime
        });
        
        if (lastActiveRole === 'driver' && driverLastLogin && driverTime > ownerTime) {
          // Driver explicitly active
          console.log('✅ Driver mode explicitly active, routing to driver dashboard');
          setUserRole('driver');
          const driverInfo = JSON.parse(driverUserData);
          setUser(driverInfo);
          hasNavigated.current = true;
          router.replace('/quick-dashboard');
          return;
        } else {
          // Fleet Owner session takes precedence
          console.log('✅ Fleet Owner session active, prioritizing owner dashboard');
        }
      }
      
      // Check authentication based on current context
      // If both exist and owner is more recent, use owner
      if (hasOwnerAuth) {
        // Fleet Owner logged in - prioritize fleet owner authentication
        console.log('✅ Fleet Owner authentication found');
        setUserRole('owner');
        setUser(JSON.parse(voUserData));
        
        // Fetch login response to get car/driver counts and account status
        try {
          const loginDataStr = await SecureStore.getItemAsync('loginResponse');
          if (loginDataStr) {
            let loginData = JSON.parse(loginDataStr);
            // The cached counts can be stale (e.g. a driver was added but
            // the cache refresh didn't land) which sent the owner back into
            // Add Driver on every launch. Ask the server for the real
            // counts first; fall back to the cache only if offline.
            try {
              const fresh = await axiosInstance.get('/api/users/vehicle-owner/status-counts', { timeout: 8000, silentAuthCheck: true } as any);
              if (fresh?.data) {
                loginData = { ...loginData, ...fresh.data };
                await SecureStore.setItemAsync('loginResponse', JSON.stringify(loginData));
              }
            } catch {}
            const carCount = loginData.car_details_count ?? 0;
            const driverCount = loginData.car_driver_count ?? 0;
            const accountStatus = loginData.account_status || loginData.user?.account_status || 'Active';
            const isEmailMissing = loginData.email_missing === true && !loginData.email && !loginData.user?.email;
            
            console.log('📊 Account status:', {
              carCount,
              driverCount,
              accountStatus,
              isEmailMissing
            });
            
            // Mark navigation flag before navigating
            hasNavigated.current = true;
            
            // Determine where to redirect based on counts and status
            // PRIORITY: Check document completion FIRST, then account status
            if (carCount === 0) {
              console.log('🚗 No cars → redirect to add-car');
              router.replace('/add-car?flow=signup');
            } else if (driverCount === 0) {
              console.log('👤 No drivers → redirect to add-driver');
              router.replace('/add-driver?flow=signup');
            } else if (accountStatus?.toLowerCase() === 'blocked') {
              console.log('⏳ Account blocked → redirect to verification');
              router.replace('/verification');
            } else {
              const isTrustedPartner = loginData.tier === 'PREFERRED' || loginData.is_trusted_partner === true || loginData.subscription_type === 'YEARLY' || loginData.subscription_type === 'MONTHLY';
              if (!isTrustedPartner) {
                try {
                  const lastPromptStr = await AsyncStorage.getItem('last_trusted_prompt_time');
                  const lastPrompt = lastPromptStr ? parseInt(lastPromptStr, 10) : 0;
                  const now = Date.now();
                  // Prompt standard partners periodically (e.g. once per 12 hours) on app open
                  if (now - lastPrompt > 12 * 60 * 60 * 1000) {
                    await AsyncStorage.setItem('last_trusted_prompt_time', String(now));
                    console.log('👑 Standard partner → showing Trusted Partner screen');
                    router.replace('/subscription?flow=launch_prompt' as any);
                    return;
                  }
                } catch (promptErr) {
                  console.warn('Prompt check error:', promptErr);
                }
              }
              console.log('✅ All good → redirect to dashboard');
              router.replace('/(tabs)');
            }
          } else {
            // No login response data, default to dashboard
            console.log('ℹ️ No login response data, defaulting to dashboard');
            hasNavigated.current = true;
            router.replace('/(tabs)');
          }
        } catch (error) {
          console.error('❌ Error checking login data:', error);
          hasNavigated.current = true;
          router.replace('/(tabs)');
        }
      } else if (driverToken && driverUserData) {
        // Driver logged in - only if no fleet owner auth
        console.log('✅ Driver authentication found');
        setUserRole('driver');
        const driverInfo = JSON.parse(driverUserData);
        setUser(driverInfo);
        hasNavigated.current = true;
        router.replace('/quick-dashboard');
      } else {
        // No authentication found
        console.log('❌ No authentication found');
        setUserRole(null);
        hasNavigated.current = true;
        router.replace('/login');
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      setUserRole(null);
      hasNavigated.current = true;
      router.replace('/login');
    } finally {
      isCheckingAuth.current = false;
    }
  };

  if (showLanguageSelect) {
    return (
      <LanguageSelectScreen
        onDone={() => {
          setShowLanguageSelect(false);
          checkAuthStatus();
        }}
      />
    );
  }

  // Brand loading picture with the animated loader while the session is being checked
  return <AppLoadingScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3B82F6',
  },
});