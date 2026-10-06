// src/api/api.js

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { getCurrentApiBaseUrl } from '../../config/environment';

// Base URL now comes from config/environment.ts so there is a single place
// to update per-environment API hosts instead of duplicating them here.
const API_BASE_URL = `${getCurrentApiBaseUrl()}/api`;

// Authenticated Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const removeAccessToken = async () => {
  const router = useRouter();
  try {
    await AsyncStorage.removeItem('accessToken');
    console.log('Access token removed successfully');
    router.replace('/(auth)/sign-in');// Navigate to login screen after logout

  } catch (error) {
    console.error('Error removing access token:', error);
  }
};
// Attach token from AsyncStorage to requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      console.log("Token from AsyncStorage:", token);
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      // console.error('Failed to get token from AsyncStorage', error);
      Alert.alert('Session Expired', 'Please Login with your credentials');
      // removeAccessToken()

    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Screens across the app show `error.message` directly on failure - by
// default that's axios's generic "Request failed with status code 400",
// which tells a user nothing. Rewrite it here, once, so every screen gets
// the backend's real detail (or a plain-English fallback) for free.
const attachDetailedErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    error.message = detail;
  } else if (Array.isArray(detail) && detail.length) {
    // FastAPI 422 validation errors: [{ loc, msg, type }, ...] - loc's last
    // element is the actual field name (e.g. ["body", "cost_per_km"]) -
    // without it, every validation error read the same generic "Field
    // required" with no way to tell which field.
    error.message = detail
      .map((d) => {
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
  } else if (error.response?.status) {
    error.message = `Request could not be completed (${error.response.status}). Please try again.`;
  }
  return error;
};

// Response interceptor (optional)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // console.warn('Unauthorized access - maybe redirect to login');
      // console.log(error.response?.detail);
      const errorDetail = error.response.data?.detail || 'Unauthorized access';
      if(errorDetail == "Force Logout Action Raised"){
        Alert.alert('Force Logout', 'Admin Raised Force Logout, Please Login with your credentials');
      }else{
      Alert.alert('Session Expired', 'Please Login with your credentials');
      }
      removeAccessToken();
    }
    return Promise.reject(attachDetailedErrorMessage(error));
  }
);

// Public (unauthenticated) Axios instance
const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

publicApi.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(attachDetailedErrorMessage(error))
);

// ✅ Export both
export default api;        // Use this for authenticated requests
export { publicApi };     // Use this for public requests (e.g. `/data`)
