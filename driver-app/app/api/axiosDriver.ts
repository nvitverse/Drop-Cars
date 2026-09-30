import { installRequestCache } from '@/utils/requestCache';
import axios from 'axios';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from '@/utils/secureStore';
import { emitSessionExpired } from '@/utils/session';
import { loginDriverAsOwner } from '@/services/driver/driverService';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && !!window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8000';
  }
  return 'https://drop-cars-api-207918408785.asia-south2.run.app';
};

const API_BASE_URL = getApiBaseUrl();

const axiosDriver = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
  },
  validateStatus: (status) => status >= 200 && status < 300,
});

let isShowingDriverAlert = false;
let lastAlertTimestamp = 0;

const showDriverAuthAlert = (title: string, message: string, onOk?: () => void) => {
  const now = Date.now();
  if (isShowingDriverAlert || (now - lastAlertTimestamp < 15000)) {
    return;
  }
  isShowingDriverAlert = true;
  lastAlertTimestamp = now;

  Alert.alert(title, message, [
    {
      text: 'OK',
      onPress: () => {
        isShowingDriverAlert = false;
        if (onOk) {
          onOk();
        } else {
          try {
            router.replace('/login');
          } catch (e) {}
        }
      },
    },
  ]);
};

let isRefreshingDriverToken = false;
let failedDriverQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processDriverQueue = (error: any, token: string | null = null) => {
  failedDriverQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedDriverQueue = [];
};

axiosDriver.interceptors.request.use(
  async (config: any) => {
    const isAuthEndpoint = config.url?.includes('/login') ||
                          config.url?.includes('/register') ||
                          config.url?.includes('/signup') ||
                          (config.url?.includes('/signin') && !config.url?.includes('signin-as-owner')) ||
                          config.url?.includes('/auth/') ||
                          config.url?.includes('/driver/login') ||
                          config.url?.includes('/firebase/verify');
    
    if (!isAuthEndpoint) {
      let token = await SecureStore.getItemAsync('driverAuthToken');
      if (!token) {
        token = await SecureStore.getItemAsync('authToken');
      }
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } else {
      const token = await SecureStore.getItemAsync('driverAuthToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // A 401 from a public/background request after logout is not an expired
    // session. Keep the request's auth state so the response handler can tell.
    config._hadAuthToken = Boolean(config.headers?.Authorization);

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const clearDriverSession = async () => {
  try {
    await SecureStore.deleteItemAsync('driverAuthToken');
    await SecureStore.deleteItemAsync('driverAuthInfo');
  } catch (error) {
    console.error('Error clearing driver session:', error);
  }
  try {
    // CarDriverContext's loadStoredDriverData() (runs on every provider
    // remount) decides isAuthenticated purely from THESE AsyncStorage keys,
    // not from the SecureStore ones just cleared above. Leaving them behind
    // let a stale login snapshot "resurrect" isAuthenticated=true on the
    // next remount while the real driverAuthToken this interceptor sends
    // requests with stayed deleted - every following driver-scoped call
    // 401'd again, repeating the "Session Expired" alert indefinitely
    // ("adikkadi") until a full manual logout+login. Found 2026-09-05
    // live-reproducing a real report; same root cause independently fixed
    // in CarDriverContext.tsx's clearAllData (the other path that reaches
    // this same stale state, via the GlobalSessionListener/emitSessionExpired
    // event) - fixed here too so THIS interceptor's own cleanup is complete
    // on its own, without depending on that listener's timing.
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('carDriver');
    await AsyncStorage.removeItem('carDriverToken');
  } catch (error) {
    console.error('Error clearing driver AsyncStorage session:', error);
  }
};

axiosDriver.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // A caller can mark a request `silentAuthCheck: true` (see
    // ProfilePhotoReminder.tsx) to say "I already handle my own failure,
    // don't touch global session state for this one." Without this, a
    // background best-effort check firing app-wide on every tab-layout
    // mount (ProfilePhotoReminder's GET /cardriver/me, run regardless of
    // which screen is open) could 401 for an unrelated reason and this
    // shared interceptor would clear the real driver session + show
    // "Session Expired" globally - exactly the "adikkadi, on every screen"
    // report this was chasing, since the failure had nothing to do with
    // whatever screen the user was actually looking at. Found 2026-09-05.
    if ((originalRequest as any)?.silentAuthCheck) {
      return Promise.reject(error);
    }

    // A 401 saying "wrong role for this endpoint" (token itself is fine,
    // e.g. an owner token hitting a driver-only route) must NOT be treated
    // as a real session expiry - same fix as axiosInstance.tsx, found
    // 2026-09-04 chasing a real "logged out on many pages" report.
    const errorDetailRaw = error.response?.data?.detail || '';
    const isRoleMismatch = errorDetailRaw === 'Not a fleet owner session' || errorDetailRaw === 'Not a driver session';
    const isAuthError = error.response?.status === 401 && !isRoleMismatch && originalRequest?._hadAuthToken;

    // Silent Auto-Recovery: If 401 occurs, try background re-auth via owner session
    if (isAuthError && originalRequest && !originalRequest._retry) {
      const ownerToken = await SecureStore.getItemAsync('authToken');
      if (ownerToken) {
        if (isRefreshingDriverToken) {
          return new Promise((resolve, reject) => {
            failedDriverQueue.push({ resolve, reject });
          })
            .then((newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axiosDriver(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshingDriverToken = true;

        try {
          console.log('🔄 Attempting silent driver session auto-refresh...');
          const loginRes = await loginDriverAsOwner();
          if (loginRes?.access_token) {
            const currentOwnerToken = await SecureStore.getItemAsync('authToken');
            if (!currentOwnerToken || currentOwnerToken !== ownerToken) {
              throw new Error('Owner session ended while driver authentication was refreshing.');
            }
            const newToken = loginRes.access_token;
            await SecureStore.setItemAsync('driverAuthToken', newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            processDriverQueue(null, newToken);
            console.log('✅ Driver session auto-refreshed successfully!');
            return axiosDriver(originalRequest);
          }
        } catch (refreshErr) {
          console.warn('⚠️ Silent driver session auto-refresh failed:', refreshErr);
          processDriverQueue(refreshErr, null);
        } finally {
          isRefreshingDriverToken = false;
        }
      }
    }

    if (isAuthError) {
      console.log('❌ Driver authentication error');
      const ownerToken = await SecureStore.getItemAsync('authToken');
      await clearDriverSession();

      // Only show Session Expired alert and redirect to /login if there is NO active owner session!
      // When an owner session exists, driver 401 errors should not disrupt the logged-in owner experience.
      if (!ownerToken) {
        const errorDetail = error.response?.data?.detail || 'Unauthorized access';
        const isForceLogout = errorDetail === 'Force Logout Action Raised';
        const alertTitle = isForceLogout ? 'Force Logout' : 'Session Expired';
        const alertMessage = isForceLogout
          ? 'Admin raised a force logout for drivers. Please login again.'
          : 'Your driver session has expired. Please login again.';

        showDriverAuthAlert(alertTitle, alertMessage);
        
        emitSessionExpired(
          isForceLogout ? 'Driver force logout - token version changed' : 'Driver session expired - Authentication error'
        );
      }
    }

    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      error.message = detail;
    } else if (Array.isArray(detail) && detail.length) {
      error.message = detail
        .map((d: any) => {
          const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
          const msg = d?.msg || String(d);
          return field && typeof field === 'string' ? `${field}: ${msg}` : msg;
        })
        .join('; ');
    } else if (error.code === 'ECONNABORTED') {
      error.message = 'The request took too long. Please check your connection and try again.';
    } else if (error.code === 'ERR_NETWORK' || !error.response) {
      error.message = 'Unable to connect to the server. Please check your internet connection.';
    } else if (error.response?.status >= 500) {
      error.message = 'Something went wrong on our end. Please try again in a moment.';
    } else if (error.response?.status === 429) {
      const d429 = error.response?.data?.detail;
      error.message = typeof d429 === 'string' && d429 ? d429 : 'Please wait a minute and try again.';
    } else if (error.response?.status) {
      error.message = `Request could not be completed (${error.response.status}). Please try again.`;
    }

    return Promise.reject(error);
  }
);

installRequestCache(axiosDriver);

export default axiosDriver;
