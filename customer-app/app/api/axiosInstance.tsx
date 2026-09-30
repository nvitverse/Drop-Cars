// src/api/axiosInstance.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const getApiBaseUrl = (): string => {
  // Always the deployed Cloud Run backend - there is no local backend
  // server in this project's normal workflow (see the identical bug fixed
  // in the Admin App's services/api.ts: pointing localhost at a local
  // :8000 backend nobody runs broke every API call on the local web
  // preview with a silent connection-refused).
  return 'https://drop-cars-api-207918408785.asia-south2.run.app';
};

const axiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor with auth tokens and FormData support
axiosInstance.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // For FormData bodies, let the platform set its own Content-Type (with the
    // required multipart boundary) instead of forcing a bare
    // 'multipart/form-data' string - that breaks uploads with a 400
    // "Missing boundary in multipart" error.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      console.log('📤 FormData detected, letting the platform set its own multipart boundary');
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors globally
    return Promise.reject(error);
  }
);

export default axiosInstance;
