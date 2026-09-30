import { installRequestCache, clearRequestCache } from '@/utils/requestCache';
import axios from 'axios';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from '@/utils/secureStore';
import { emitSessionExpired } from '@/utils/session';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && !!window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8000';
  }
  return 'https://drop-cars-api-207918408785.asia-south2.run.app';
};

const API_BASE_URL = getApiBaseUrl();
console.log('🔧 API Config:', { baseURL: API_BASE_URL });

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout to 60 seconds for file uploads
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  // Add retry configuration
  maxRedirects: 5,
  // Treat only 2xx as success so 4xx surfaces to catch blocks
  validateStatus: (status) => status >= 200 && status < 300,
});

// Mask sensitive values in logs. Matches password/token/authorization plus
// document-number fields (aadhaar, dl_number/license) that also should never
// hit the console, case-insensitively against the key name.
const SENSITIVE_KEY_RE = /password|token|authorization|aadhaar|dl_number|license/i;

const mask = (key: string, value: any) => {
  if (SENSITIVE_KEY_RE.test(key || '')) {
    return '***';
  }
  return value;
};

// Recursively walk a JSON-ish request body (plain object/array) and mask any
// field whose key matches SENSITIVE_KEY_RE, at any depth. Used so the JSON
// request-body logger below is exactly as safe as the FormData logger,
// which already masks its (flat) parts via `mask` above.
const deepMask = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map((item) => deepMask(item));
  }
  if (data && typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const value = (data as any)[key];
      result[key] = SENSITIVE_KEY_RE.test(key)
        ? '***'
        : (value && typeof value === 'object' ? deepMask(value) : value);
    }
    return result;
  }
  return data;
};

// Request interceptor with logging
axiosInstance.interceptors.request.use(
  async (config: any) => {
    console.log('🚀 Request:', {
      method: config.method?.toUpperCase(),
      url: `${config.baseURL}${config.url}`,
      data: config.data instanceof FormData ? 'FormData (file upload)' : deepMask(config.data),
      contentType: config.headers['Content-Type'],
      timeout: config.timeout
    });

    // Skip token validation for login, registration, and password-reset endpoints
    const isAuthEndpoint = config.url?.includes('/login') ||
                          config.url?.includes('/register') ||
                          config.url?.includes('/signup') ||
                          (config.url?.includes('/signin') && !config.url?.includes('signin-as-owner')) ||
                          config.url?.includes('upload-signup-doc') ||
                          config.url?.includes('send-email-otp') ||
                          config.url?.includes('verify-email-otp') ||
                          config.url?.includes('email-otp') ||
                          config.url?.includes('/auth/') ||
                          config.url?.includes('/forgot-password') ||
                          config.url?.includes('/request-reset-otp') ||
                          config.url?.includes('/reset-password') ||
                          config.url?.includes('/email/') ||
                          config.url?.includes('public-request-admin-help') ||
                          config.url?.includes('/support/guest') ||
                          config.url?.includes('/firebase/verify');
    
    if (!isAuthEndpoint) {
      // Check for valid token before making request (only for non-auth endpoints)
      const token = await SecureStore.getItemAsync('authToken');
      if (!token) {
        // On fresh app open (no token), do NOT emit session expired. Just block the request.
        console.log('❌ No auth token found, blocking non-auth request without emitting session event');
        return Promise.reject(new Error('No authentication token found. Please login first.'));
      }
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // For auth endpoints, try to attach token if available (for refresh scenarios)
      const token = await SecureStore.getItemAsync('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    console.log('🔐 Auth attached:', !!config.headers.Authorization);
    
    // For FormData bodies, do NOT set Content-Type ourselves - the browser/RN
    // networking layer must generate it, since a real multipart body needs a
    // unique boundary string in the header that only it can compute. Setting
    // a bare 'multipart/form-data' (no boundary) here breaks every upload
    // with a 400 "Missing boundary in multipart" error. Just delete the
    // 'application/json' default set above so nothing stale is sent instead.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      // Increase timeout for file uploads
      config.timeout = 120000; // 2 minutes for file uploads
      console.log('📤 FormData detected, letting the platform set its own multipart boundary; timeout raised to 120s');

      // React Native FormData does not expose entries(); it keeps an internal _parts array
      // We will log keys and basic meta only (masking sensitive text)
      const parts = (config.data as any)?._parts;
      if (Array.isArray(parts)) {
        const debugParts = parts.map((p: any) => {
          const [key, value] = p || [];
          if (!key) return null;
          if (value && typeof value === 'object' && (value.uri || value.name)) {
            return { key, value: { uri: !!value.uri, name: value.name || 'file', type: value.type || 'binary' } };
          }
          return { key, value: mask(key, value) };
        }).filter(Boolean);
        console.log('🧾 FormData fields:', debugParts);
      }
    }
    
    return config;
  },
  (error: any) => Promise.reject(error)
);

const removeAccessToken = async () => {
  clearRequestCache();
  try {
    await SecureStore.deleteItemAsync('authToken');
    console.log('🗑️ Cleared authToken');
  } catch (error) {
    console.error('Error clearing authToken:', error);
  }

  try {
    await SecureStore.deleteItemAsync('userData');
    console.log('🗑️ Cleared userData');
  } catch (error) {
    console.error('Error clearing userData:', error);
  }
};

let isShowingAuthAlert = false;
let lastAuthAlertTime = 0;

const showAuthAlert = (title: string, message: string, onOk?: () => void) => {
  const now = Date.now();
  if (isShowingAuthAlert || (now - lastAuthAlertTime < 15000)) return;
  isShowingAuthAlert = true;
  lastAuthAlertTime = now;

  Alert.alert(title, message, [
    {
      text: 'OK',
      onPress: () => {
        isShowingAuthAlert = false;
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

// Response interceptor with enhanced error logging
axiosInstance.interceptors.response.use(
  (response: any) => {
    console.log('✅ Response:', { 
      status: response.status, 
      statusText: response.statusText,
      data: response.data,
      headers: response.headers,
      config: {
        url: response.config?.url,
        method: response.config?.method,
        timeout: response.config?.timeout
      }
    });
    return response;
  },
  async (error: any) => {
    // A caller can mark a request `silentAuthCheck: true` to say "this
    // isn't about whether the OWNER's own session is valid, don't touch
    // it on failure" - e.g. loginDriverAsOwner() posting to
    // /cardriver/signin-as-owner, which is about establishing a separate
    // DRIVER sub-session and is called in the background on every app
    // start (AuthContext.tsx's "pre-warm driver token"). Without this, a
    // failure there (for any reason - no CarDriver row yet, a transient
    // hiccup) force-logged the owner out of their OWN valid session, even
    // though nothing about their own login was actually invalid - a real
    // "click a trip card, session expires" report traced to exactly this
    // 2026-09-05.
    if ((error.config as any)?.silentAuthCheck) {
      return Promise.reject(error);
    }

    console.error('❌ API Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method,
      timeout: error.config?.timeout,
      data: error.response?.data,
      // Check if we got a partial response
      isPartialResponse: error.response?.status >= 200 && error.response?.status < 300,
      // Check if it's a timeout
      isTimeout: error.code === 'ECONNABORTED',
      // Check if it's a network error
      isNetworkError: error.code === 'ERR_NETWORK'
    });
    
    // If we got a successful response but axios still treats it as an error
    if (error.response?.status >= 200 && error.response?.status < 300) {
      console.log('🔄 Converting partial success response to success');
      return Promise.resolve(error.response);
    }
    
    // Only clear tokens and emit session expired for AUTHENTICATION errors (401)
    // NOT for permission errors (403), client errors (400, 404, etc.) or server errors (500)
    const errorDetailRaw = error.response?.data?.detail || '';
    // A 401 with one of these details means the TOKEN itself is fine - it's
    // just the wrong role/session type for this one endpoint (e.g. an
    // owner-only session hitting a driver-only analytics endpoint like
    // /wallet/earnings-summary). Found 2026-09-04 - this was logging out
    // a perfectly valid, logged-in owner session just because ONE
    // background call (that already silently ignores its own errors) hit
    // the wrong endpoint - real "many pages, right after opening them" bug.
    const isRoleMismatch = errorDetailRaw === 'Not a fleet owner session' || errorDetailRaw === 'Not a driver session';
    const isGuestOrAuthUrl = error.config?.url?.includes('/support/guest') ||
                             error.config?.url?.includes('/login') ||
                             error.config?.url?.includes('/public-request-admin-help');
    const isAuthError = error.response?.status === 401 && !isRoleMismatch && !isGuestOrAuthUrl;

    if (isAuthError) {
      console.log('🔐 Authentication error detected (401), clearing tokens...');

      const errorDetail = errorDetailRaw || 'Unauthorized access';
      const isForceLogout = errorDetail === 'Force Logout Action Raised';
      const alertTitle = isForceLogout ? 'Force Logout' : 'Session Expired';
      const alertMessage = isForceLogout
        ? 'Admin raised a force logout. Please login again with your credentials.'
        : 'Your session has expired. Please login again.';

      showAuthAlert(alertTitle, alertMessage);
      await removeAccessToken();

      // Emit session expired event
      emitSessionExpired(
        isForceLogout ? 'Force logout - token version changed' : 'Session expired - Please login again'
      );
    } else {
      // For non-auth errors (400, 404, 500, etc.), just log them without clearing tokens
      console.log('⚠️ Non-authentication error, keeping tokens intact:', {
        status: error.response?.status,
        message: error.response?.data?.detail || error.message
      });
    }

    // Screens across the app show `error.message` directly on failure - by
    // default that's axios's generic "Request failed with status code 500",
    // which tells a user nothing. Rewrite it here, once, so every screen
    // gets the backend's real detail (or a plain-English fallback) for free
    // instead of each catch block having to know to look at response.data.
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      error.message = detail;
    } else if (Array.isArray(detail) && detail.length) {
      // FastAPI 422 validation errors: [{ loc, msg, type }, ...] - loc's
      // last element is the actual field name (e.g. ["body", "address"]) -
      // without it, every validation error read the same generic "Field
      // required" with no way to tell which field.
      error.message = detail
        .map((d: any) => {
          const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
          const msg = d?.msg || String(d);
          return field && typeof field === 'string' ? `${field}: ${msg}` : msg;
        })
        .join('; ');
    } else if (error.code === 'ECONNABORTED') {
      error.message = 'The request took too long. Please check your connection and try again.';
    } else if (error.code === 'ERR_NETWORK') {
      error.message = 'Unable to connect to the server. Please check your internet connection.';
    } else if (!error.response && error.message) {
      // Preserve explicit error message set by client interceptor or caller
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

installRequestCache(axiosInstance);

export default axiosInstance;