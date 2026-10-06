import { getCurrentApiBaseUrl } from './environment';

// API Configuration
export const API_CONFIG = {
  // Base URL for the backend API (from environment)
  BASE_URL: getCurrentApiBaseUrl(),
  
  // API endpoints
  ENDPOINTS: {
    VENDOR_SIGNUP: '/api/users/vendor/signup',
    VENDOR_SIGNIN: '/api/users/vendor/signin',
    // New Order endpoints
    CREATE_QUOTE: '/api/orders/oneway/quote',
    CONFIRM_ORDER: '/api/orders/oneway/confirm',
    // Vendor Orders endpoint
    VENDOR_ORDERS: '/api/orders/vendor',
    // Transfer endpoints
    REQUEST_TRANSFER: '/api/transfer/request',
    CHECK_BALANCE: '/api/transfer/balance',
    TRANSFER_HISTORY: '/api/transfer/history',
    TRANSFER_STATISTICS: '/api/transfer/statistics',
  },
  
  // Request timeout in milliseconds
  TIMEOUT: 30000,
  
  // File upload limits
  UPLOAD_LIMITS: {
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png'],
  },
};

// Helper function to get full API URL
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Helper function to get vendor signup URL
export const getVendorSignupUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.VENDOR_SIGNUP);
};

// Helper function to get vendor signin URL
export const getVendorSigninUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.VENDOR_SIGNIN);
};

// Helper function to get create quote URL
export const getCreateQuoteUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.CREATE_QUOTE);
};

// Helper function to get confirm order URL
export const getConfirmOrderUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.CONFIRM_ORDER);
};

// Helper function to get vendor orders URL
export const getVendorOrdersUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.VENDOR_ORDERS);
};

// Helper function to get request transfer URL
export const getRequestTransferUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.REQUEST_TRANSFER);
};

// Helper function to get check balance URL
export const getCheckBalanceUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.CHECK_BALANCE);
};

// Helper function to get transfer history URL
export const getTransferHistoryUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.TRANSFER_HISTORY);
};

// Helper function to get transfer statistics URL
export const getTransferStatisticsUrl = (): string => {
  return getApiUrl(API_CONFIG.ENDPOINTS.TRANSFER_STATISTICS);
};

// Helper function to get current API base URL
export const getApiBaseUrl = (): string => {
  return API_CONFIG.BASE_URL;
};
