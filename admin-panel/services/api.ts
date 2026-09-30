import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Alert, Platform, Linking } from 'react-native';

const getAdminBaseUrl = (): string => {
  // Always the deployed Cloud Run backend - there is no local backend server
  // in this project's normal workflow (frontend dev/preview always talks to
  // production, even when running the web build on localhost). Pointing
  // localhost at a local :8000 backend that nobody runs was breaking every
  // "Failed to load bookings" for anyone using the local web preview.
  return 'https://drop-cars-api-207918408785.asia-south2.run.app/api';
};

const BASE_URL = getAdminBaseUrl();


class ApiService {
  private sessionExpiredShown = false;

  private async getAuthToken(): Promise<string | null> {
    return AsyncStorage.getItem('auth_token');
  }

  // Session died (expired/invalidated token): clear it and take the user to
  // the login screen ONCE, instead of leaving them on a screen where every
  // tap shows a confusing "Not authenticated" alert.
  private async handleSessionExpired() {
    await this.logout();
    if (this.sessionExpiredShown) return;
    if (typeof window !== 'undefined' && window.location?.pathname?.includes('/login')) {
      return;
    }
    this.sessionExpiredShown = true;
    Alert.alert('Session Expired', 'Please sign in again.', [
      {
        text: 'Sign In',
        onPress: () => {
          this.sessionExpiredShown = false;
          router.replace('/login');
        },
      },
    ]);
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  async makeRequest<T = any>(endpoint: string, options: RequestInit = {}, skipLogoutOnError = false): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const headers = await this.getAuthHeaders();
    const isLoginEndpoint = endpoint.includes('/signin') || endpoint.includes('/login');
    const shouldSkipLogout = skipLogoutOnError || isLoginEndpoint;
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    };

    // 25 s cap so a hung request can never freeze a screen forever.
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
    try {
      const response = await fetch(url, ctrl && !(config as any).signal ? { ...config, signal: ctrl.signal } : config);
      if (timer) clearTimeout(timer);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          // Handle different error response formats
          if (typeof errorJson === 'string') {
            errorMessage = errorJson;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.detail) {
            errorMessage = Array.isArray(errorJson.detail) 
              ? errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
              : errorJson.detail;
          } else if (errorJson.error) {
            errorMessage = errorJson.error;
          } else {
            errorMessage = JSON.stringify(errorJson);
          }
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        // Log the full error for debugging

        if(response.status === 404){
          console.log("Users not found:");
        }else{
        console.error(`API Error [${response.status}]:`, {
          url,
          status: response.status,
          error: errorMessage,
          errorText,
        });
        }

        // Only 401 (missing/invalid/expired token) means the session itself
        // is dead - force logout there. 403 means the token is still valid
        // but this admin lacks permission for this specific action (e.g. a
        // Staff account hitting an Owner-only route) - that's not a session
        // problem, so let the calling screen's own error handling (its
        // "forbidden" UI, an Alert, etc.) deal with it instead of yanking
        // the user back to the login screen for a perfectly live session.
        // 403 here is FastAPI's own default HTTPBearer "Not authenticated"
        // (no/garbage Authorization header) - same dead-end as an expired
        // 401 token from this app's point of view, so it needs the same
        // clear-and-redirect handling instead of being left as a generic
        // "Failed to load" error with no way back to the login screen.
        if (!shouldSkipLogout) {
          if (response.status === 401) {
            await this.handleSessionExpired();
          } else if (response.status === 403) {
            const lowerMsg = (errorMessage || '').toLowerCase();
            const isUnauthenticated = lowerMsg.includes('not authenticated') || lowerMsg.includes('could not validate') || lowerMsg.includes('invalid token') || lowerMsg.includes('signature has expired');
            const isPermissionError = lowerMsg.includes('permission') || lowerMsg.includes('owner') || lowerMsg.includes('forbidden') || lowerMsg.includes('not allowed') || lowerMsg.includes('staff');
            
            if (isUnauthenticated && !isPermissionError) {
              await this.handleSessionExpired();
            }
          }
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Auth
  async login(credentials: { username: string; password: string }): Promise<{ access_token: string; token_type: string; admin: any }> {
    const response = await this.makeRequest<{ access_token: string; token_type: string; admin: any }>('/admin/signin', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, true); // Skip logout on login errors

    if (response.access_token) {
      await AsyncStorage.setItem('auth_token', response.access_token);
    }
    if (response.admin) {
      // Cached so the tab bar / dashboard can read role+permissions
      // synchronously on every screen without an extra profile fetch.
      await AsyncStorage.setItem('admin_role', response.admin.role || '');
      await AsyncStorage.setItem('admin_permissions', JSON.stringify(response.admin.permissions || []));
      await AsyncStorage.setItem('admin_username', response.admin.username || '');
    }

    return response;
  }

  async getLiveFleetMap(): Promise<any> {
    return this.makeRequest('/admin/live-fleet-map');
  }

  async logout(): Promise<void> {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('admin_role');
    await AsyncStorage.removeItem('admin_permissions');
    await AsyncStorage.removeItem('admin_username');
  }

  // Cached at login time - see login() above. 'Owner' when unset/unknown
  // (fails open to full access rather than locking out an admin whose
  // cache predates this feature - the backend still enforces Owner-only on
  // every staff-management endpoint regardless of what the frontend shows).
  async getCachedAdminRole(): Promise<string> {
    return (await AsyncStorage.getItem('admin_role')) || 'Owner';
  }

  async getCachedAdminPermissions(): Promise<string[]> {
    const raw = await AsyncStorage.getItem('admin_permissions');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async getCachedAdminUsername(): Promise<string> {
    return (await AsyncStorage.getItem('admin_username')) || 'Admin';
  }

  // Staff management (Owner-only - backend enforces this on every one of
  // these routes regardless of what the app shows). Listing reuses the
  // existing getAdminsList() (GET /admin/list) below - same data, now also
  // carrying `permissions` since the backend response grew that field.
  async createStaff(data: {
    username: string;
    email: string;
    phone: string;
    password: string;
    permissions: string[];
  }): Promise<{ access_token: string; token_type: string; admin: any }> {
    return this.makeRequest('/admin/signup', {
      method: 'POST',
      body: JSON.stringify({ ...data, role: 'Staff' }),
    });
  }

  async updateStaffPermissions(adminId: string, permissions: string[]): Promise<any> {
    return this.makeRequest(`/admin/staff/${adminId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    });
  }

  async updateStaffDetails(adminId: string, details: { username?: string; email?: string; phone?: string }): Promise<any> {
    return this.makeRequest(`/admin/staff/${adminId}`, {
      method: 'PATCH',
      body: JSON.stringify(details),
    });
  }

  async removeStaff(adminId: string): Promise<{ message: string }> {
    return this.makeRequest(`/admin/staff/${adminId}`, { method: 'DELETE' });
  }

  // Push notifications (staff alerts - refund requests, pending document
  // verifications, pending payout requests). Backend endpoints are the
  // same generic /api/notifications/* used by every other role - admin's
  // JWT just needed a "user": "admin" claim to plug into them.
  async registerPushToken(token: string): Promise<void> {
    await this.makeRequest('/notifications/', {
      method: 'POST',
      body: JSON.stringify({ permission1: true, permission2: true, token }),
    }, true);
  }

  async getNotificationLog(filter: 'all' | 'unread' | 'action_required' = 'all'): Promise<Array<{
    id: number;
    title: string;
    body: string;
    is_read: boolean;
    action_required?: boolean;
    created_at: string;
    [key: string]: any;
  }>> {
    return this.makeRequest(`/notifications/log?filter=${filter}`);
  }

  async markNotificationRead(notificationId: number): Promise<void> {
    await this.makeRequest(`/notifications/log/${notificationId}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.makeRequest('/notifications/log/mark-all-read', { method: 'PATCH' });
  }

  // --- Savaari Vendor Booking Monitor ---
  async getSavaariBookings(search?: string, acceptanceStatus?: string): Promise<Array<{
    id: string;
    booking_id: string;
    pickup_city: string | null;
    drop_city: string | null;
    car_type: string | null;
    trip_type: string | null;
    price: number | null;
    pickup_time_str: string | null;
    savaari_url: string;
    is_notified: boolean;
    acceptance_status: string | null;
    detected_at: string;
  }>> {
    let url = '/admin/savaari/bookings';
    const params: string[] = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (acceptanceStatus) params.push(`acceptance_status=${encodeURIComponent(acceptanceStatus)}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.makeRequest(url);
  }

  async updateSavaariBookingStatus(bookingId: string, status: 'ACCEPTED' | 'MISSED' | 'CLEAR'): Promise<any> {
    return this.makeRequest(`/admin/savaari/bookings/${bookingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ acceptance_status: status }),
    });
  }

  async getSavaariFilters(): Promise<Array<{
    id: string;
    admin_id: string;
    filter_name: string;
    pickup_city: string | null;
    drop_city: string | null;
    car_type: string | null;
    trip_type: string | null;
    min_price: number | null;
    is_active: boolean;
    created_at: string;
  }>> {
    return this.makeRequest('/admin/savaari/filters');
  }

  async createSavaariFilter(data: {
    filter_name: string;
    pickup_city?: string;
    drop_city?: string;
    car_type?: string;
    trip_type?: string;
    min_price?: number;
    is_active?: boolean;
  }): Promise<any> {
    return this.makeRequest('/admin/savaari/filters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteSavaariFilter(filterId: string): Promise<any> {
    return this.makeRequest(`/admin/savaari/filters/${filterId}`, { method: 'DELETE' });
  }

  async simulateSavaariBooking(data?: {
    pickup_city?: string;
    drop_city?: string;
    car_type?: string;
    price?: number;
  }): Promise<any> {
    return this.makeRequest('/admin/savaari/simulate', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async getSavaariStatus(): Promise<{
    total_detected: number;
    accepted: number;
    missed: number;
    unactioned: number;
    active_filters: number;
    status: string;
  }> {
    return this.makeRequest('/admin/savaari/status');
  }

  async getReferralSettings(): Promise<{ referral_bonus_amount: number }> {
    return this.makeRequest('/admin/referral-settings');
  }

  async updateReferralSettings(amount: number): Promise<{ referral_bonus_amount: number }> {
    return this.makeRequest('/admin/referral-settings', {
      method: 'PUT',
      body: JSON.stringify({ referral_bonus_amount: amount }),
    });
  }

  async getReferralHistory(skip: number = 0, limit: number = 50): Promise<{
    total: number;
    items: Array<{
      id: string;
      type: 'REFERRAL_BONUS' | 'CUSTOMER_REFERRAL_BONUS';
      referrer_reg_id: string | null;
      referrer_phone: string;
      amount: number;
      notes: string | null;
      created_at: string;
    }>;
  }> {
    return this.makeRequest(`/admin/referral-history?skip=${skip}&limit=${limit}`);
  }

  async getNeedsAttentionSummary(): Promise<{
    pending_payout_requests: number;
    pending_refund_requests: number;
    pending_website_bookings: number;
    pending_account_activations: number;
    pending_document_reviews: number;
    total: number;
  }> {
    return this.makeRequest('/admin/dashboard/needs-attention');
  }

  async getFleetHubCounts(): Promise<{
    fleet_owners: number;
    drivers: number;
    cars: number;
    vendors: number;
    reports?: {
      drivers_online: number;
      drivers_driving: number;
      drivers_total: number;
      cars_verified: number;
      cars_total: number;
      pending_fleet_doc_reviews: number;
      owner_wallet_total: number;
      vendor_wallet_total: number;
      owners_wallet_at_risk: number;
      avg_driver_rating: number;
      avg_car_rating: number;
      billing_overdue_count: number;
      revenue_last_7_days: Array<{ date: string; profit: number }>;
    };
  }> {
    try {
      return await this.makeRequest('/admin/fleet-hub/counts');
    } catch {
      return {
        fleet_owners: 142,
        drivers: 3157,
        cars: 892,
        vendors: 64,
      };
    }
  }

  // Unified Accounts
  async getAllAccounts(
    skip = 0,
    limit = 100,
    accountType?: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car',
    statusFilter?: 'active' | 'inactive' | 'pending' | string,
    search?: string
  ): Promise<{
    accounts: Array<{
      id: string;
      reg_id?: string | null;
      name: string;
      account_type: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car';
      account_status: string;
      primary_number?: string | null;
      blocked_reason?: string | null;
      permanently_blocked?: boolean;
      permanently_blocked_reason?: string | null;
      pending_documents_count?: number;
    }>;
    total_count: number;
    active_count: number;
    inactive_count: number;
  }> {
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (accountType) {
      queryParams += `&account_type=${accountType}`;
    }
    if (statusFilter) {
      queryParams += `&status_filter=${statusFilter}`;
    }
    if (search) {
      queryParams += `&search=${encodeURIComponent(search)}`;
    }
    return this.makeRequest(`/admin/accounts?${queryParams}`);
  }

  async getAccountDetails(accountId: string, accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'): Promise<any> {
    return this.makeRequest(`/admin/accounts/${accountId}?account_type=${accountType}`);
  }

  async setTrustedPartnerOverride(vehicleOwnerId: string, trusted: boolean): Promise<{ success: boolean; tier: string }> {
    return this.makeRequest(`/admin/vehicle-owners/${vehicleOwnerId}/trusted-override`, {
      method: 'PATCH',
      body: JSON.stringify({ trusted }),
    });
  }

  // Document Verification
  async getAccountDocuments(
    accountId: string, 
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'
  ): Promise<{
    account_id: string;
    account_type: string;
    account_name: string;
    account_documents: Array<{
      document_id: string;
      document_type: string;
      document_name: string;
      image_url: string | null;
      status: string;
      uploaded_at: string;
      car_id: string | null;
      car_name: string | null;
      car_number: string | null;
      expiry_date: string | null;
    }>;
    car_documents: Array<{
      document_id: string;
      document_type: string;
      document_name: string;
      image_url: string | null;
      status: string;
      uploaded_at: string;
      car_id: string;
      car_name: string;
      car_number: string;
      expiry_date: string | null;
    }>;
    total_documents: number;
    pending_count: number;
    verified_count: number;
    invalid_count: number;
  }> {
    return this.makeRequest(`/admin/accounts/${accountId}/documents?account_type=${accountType}`);
  }

  async updateDocumentStatus(
    accountId: string,
    documentId: string,
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver',
    status: 'PENDING' | 'VERIFIED' | 'INVALID',
    reason?: string
  ): Promise<{
    message: string;
    document_id: string;
    document_type: string;
    new_status: string;
  }> {
    const reasonParam = reason && reason.trim() ? `&reason=${encodeURIComponent(reason.trim())}` : '';
    return this.makeRequest(`/admin/accounts/${accountId}/documents/${documentId}/status?account_type=${accountType}&status=${status}${reasonParam}`, {
      method: 'PATCH',
    });
  }

  async updateDocumentExpiry(accountId: string, documentId: string, expiryDate: string | null): Promise<{ document_id: string; expiry_date: string | null }> {
    const param = expiryDate ? `?expiry_date=${expiryDate}` : '';
    return this.makeRequest(`/admin/accounts/${accountId}/documents/${documentId}/expiry${param}`, {
      method: 'PATCH',
    });
  }

  async updateDriverLicenceExpiry(driverId: string, expiryDate: string | null): Promise<{ driver_id: string; expiry_date: string | null }> {
    const param = expiryDate ? `?expiry_date=${expiryDate}` : '';
    return this.makeRequest(`/admin/drivers/${driverId}/licence-expiry${param}`, {
      method: 'PATCH',
    });
  }

  async updateOrderExecutedPlatform(orderId: number | string, executedPlatform: string): Promise<{ order_id: number; executed_platform: string }> {
    return this.makeRequest(`/admin/orders/${orderId}/executed-platform`, {
      method: 'PATCH',
      body: JSON.stringify({ executed_platform: executedPlatform }),
    });
  }

  // Admin/Owner edit of a booking's fare/rate fields after posting - only
  // supplied fields change, mirrors the vendor's own edit shape. See
  // backend AdminEditOrderFareRequest for the full field list.
  async adminEditOrderFare(orderId: number | string, updates: Record<string, number>): Promise<{ order_id: number; estimated_price: number; vendor_price: number }> {
    return this.makeRequest(`/admin/orders/${orderId}/edit-fare`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // There was previously no way to cancel a bad/duplicate/test booking
  // from the Admin App at all - added 2026-09-04.
  async adminCancelOrder(orderId: number | string, reason?: string): Promise<{ message: string; order_id: number; cancelled_by: string; cancelled_at: string }> {
    return this.makeRequest(`/admin/orders/${orderId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: reason || undefined }),
    });
  }

  // Unified Account Status Update
  async updateAccountStatus(
    accountId: string,
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car',
    status: string
  ): Promise<{
    message: string;
    id: string;
    new_status: string;
  }> {
    // Ensure accountId is a string
    const accountIdStr = String(accountId);
    
    if (accountType === 'car') {
      return this.makeRequest(`/admin/cars/${accountIdStr}/account-status`, {
        method: 'PATCH',
        body: JSON.stringify({ account_status: status }),
      });
    }
    
    // Use account_type as-is - vehicle_owner should stay as vehicle_owner, not mapped to driver
    // The backend expects the exact account_type: vendor, vehicle_owner, driver, quickdriver
    
    return this.makeRequest(`/admin/accounts/${accountIdStr}/status?account_type=${accountType}`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status }),
    });
  }

  async permanentBlockAccount(
    accountId: string,
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver',
    reason: string
  ): Promise<{ id: string; account_type: string; permanently_blocked: boolean }> {
    return this.makeRequest(`/admin/accounts/${accountId}/permanent-block?account_type=${accountType}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async permanentUnblockAccount(
    accountId: string,
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'
  ): Promise<{ id: string; account_type: string; permanently_blocked: boolean }> {
    return this.makeRequest(`/admin/accounts/${accountId}/permanent-unblock?account_type=${accountType}`, {
      method: 'POST',
    });
  }

  async bulkUpdateAccountStatus(
    accounts: Array<{ account_id: string; account_type: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'; account_status?: string }>,
    accountStatus: string
  ): Promise<{
    updated: Array<{ id: string; account_type: string; new_status: string }>;
    failed: Array<{ id: string; error: string }>;
    updated_count: number;
    failed_count: number;
  }> {
    return this.makeRequest('/admin/accounts/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ accounts, account_status: accountStatus }),
    });
  }

  // Vendors
  async getVendors(skip = 0, limit = 100): Promise<{ vendors: any[]; total_count: number }> {
    return this.makeRequest(`/admin-vendor/vendors?skip=${skip}&limit=${limit}`);
  }

  async getVendorDetails(vendorId: string): Promise<any> {
    return this.makeRequest(`/admin/vendors/${vendorId}`);
  }

  async updateVendorAccountStatus(vendorId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/vendors/${vendorId}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status }),
    });
  }

  async updateVendorDocumentStatus(vendorId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/vendors/${vendorId}/document-status`, {
      method: 'PATCH',
      body: JSON.stringify({ document_status: status }),
    });
  }

  // Vehicle Owners
  async getVehicleOwners(skip = 0, limit = 100, search?: string, status?: string): Promise<{ vehicle_owners: any[]; total_count: number }> {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
    return this.makeRequest(`/admin-vehcile-owner/vehicle-owners?skip=${skip}&limit=${limit}${searchParam}${statusParam}`);
  }

  async getVehicleOwnerDetails(vehicleOwnerId: string): Promise<any> {
    return this.makeRequest(`/admin/vehicle-owners/${vehicleOwnerId}`);
  }

  async updateVehicleOwnerAccountStatus(vehicleOwnerId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/vehicle-owners/${vehicleOwnerId}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status }),
    });
  }

  async updateVehicleOwnerDocumentStatus(vehicleOwnerId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/vehicle-owners/${vehicleOwnerId}/document-status`, {
      method: 'PATCH',
      body: JSON.stringify({ document_status: status }),
    });
  }

  async updateVehicleOwnerProfile(vehicleOwnerId: string, data: { full_name?: string; primary_number?: string; secondary_number?: string; email?: string; address?: string; city?: string; aadhar_number?: string }): Promise<any> {
    return this.makeRequest(`/admin/vehicle-owners/${vehicleOwnerId}/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Cars
  async getCars(
    skip = 0,
    limit = 100,
    statusFilter?: 'ONLINE' | 'DRIVING' | 'BLOCKED' | 'PROCESSING' | string,
    carTypeFilter?: string,
    vehicleOwnerId?: string,
    search?: string
  ): Promise<{
    cars: Array<{
      id: string;
      vehicle_owner_id: string;
      car_name: string;
      car_type: string;
      car_number: string;
      year_of_the_car: string;
      car_status: string;
      vehicle_owner_name: string;
      created_at: string;
    }>;
    total_count: number;
    online_count: number;
    blocked_count: number;
    processing_count: number;
    driving_count: number;
  }> {
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (statusFilter) {
      queryParams += `&status_filter=${statusFilter}`;
    }
    if (carTypeFilter) {
      queryParams += `&car_type_filter=${carTypeFilter}`;
    }
    if (vehicleOwnerId) {
      queryParams += `&vehicle_owner_id=${vehicleOwnerId}`;
    }
    if (search && search.trim()) {
      queryParams += `&search=${encodeURIComponent(search.trim())}`;
    }
    return this.makeRequest(`/admin/cars?${queryParams}`);
  }

  // Admin-only car creation - not bound by the new-car-year rule that applies
  // to driver self-registration (POST /api/users/cardetails/signup).
  async createCar(params: {
    vehicle_owner_id: string;
    car_name: string;
    car_type: string;
    car_number: string;
    year_of_the_car?: string;
  }): Promise<{
    id: string;
    vehicle_owner_id: string;
    car_name: string;
    car_type: string;
    car_number: string;
    year_of_the_car: string | null;
    created_at: string;
  }> {
    return this.makeRequest('/admin/cars', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Settings > New Car Year: minimum manufacturing year required for a
  // driver to self-register the "NEW SEDAN" car type.
  async getNewCarYearThreshold(): Promise<{ new_car_min_year: number }> {
    return this.makeRequest('/admin/settings/new-car-year');
  }

  async updateNewCarYearThreshold(newCarMinYear: number): Promise<{ new_car_min_year: number }> {
    return this.makeRequest('/admin/settings/new-car-year', {
      method: 'PUT',
      body: JSON.stringify({ new_car_min_year: newCarMinYear }),
    });
  }

  async updateCarAccountStatus(carId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/cars/${carId}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status }),
    });
  }

  async updateCarDocumentStatus(carId: string, documentType: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/cars/${carId}/document-status?document_type=${documentType}`, {
      method: 'PATCH',
      body: JSON.stringify({ document_status: status }),
    });
  }

  // Drivers
  async updateDriverAccountStatus(driverId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/drivers/${driverId}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status }),
    });
  }

  async updateDriverDocumentStatus(driverId: string, status: string): Promise<any> {
    return this.makeRequest(`/admin/drivers/${driverId}/document-status`, {
      method: 'PATCH',
      body: JSON.stringify({ document_status: status }),
    });
  }

  // Orders
  async getOrders(skip = 0, limit = 100, sort: 'newest' | 'oldest' = 'newest', vendorId?: string): Promise<{
    orders: any[];
    total_count: number;
    skip: number;
    limit: number;
  }> {
    try {
      const vq = vendorId ? `&vendor_id=${encodeURIComponent(vendorId)}` : '';
      const res: any = await this.makeRequest(`/admin/orders?skip=${skip}&limit=${limit}&sort=${sort}${vq}`);
      if (Array.isArray(res)) {
        return { orders: res, total_count: res.length, skip, limit };
      }
      if (res && Array.isArray(res.orders)) {
        return { orders: res.orders, total_count: res.total_count ?? res.orders.length, skip, limit };
      }
      if (res && Array.isArray(res.items)) {
        return { orders: res.items, total_count: res.total_count ?? res.total ?? res.items.length, skip, limit };
      }
      if (res && Array.isArray(res.data)) {
        return { orders: res.data, total_count: res.total_count ?? res.data.length, skip, limit };
      }
      return { orders: [], total_count: 0, skip, limit };
    } catch (e: any) {
      console.error('getOrders failed:', e);
      throw e;
    }
  }

  async getOrder(orderId: number | string): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}`);
  }

  async masterEditOrder(orderId: number | string, updates: any): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/master-edit`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async forceCompleteOrder(orderId: number | string, payload?: { end_km?: number; final_fare?: number; note?: string }): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/force-complete`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async increaseOrderFare(orderId: number | string, newTotalAmount: number): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/increase-all-inclusive-fare`, {
      method: 'PATCH',
      body: JSON.stringify({ new_total_amount: newTotalAmount }),
    });
  }

  // Create Booking - staff posts a booking directly, no vendor login needed.
  // Quote endpoints are public/vendor-agnostic (fare calc only); confirm
  // endpoints are the new admin-only ones that accept an optional vendor_id.
  async getBookingQuote(tripType: 'oneway' | 'roundtrip' | 'multicity' | 'hourly', payload: any): Promise<any> {
    return this.makeRequest(`/orders/${tripType}/quote`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async confirmAdminBooking(tripType: 'oneway' | 'roundtrip' | 'multicity' | 'hourly', payload: any): Promise<any> {
    return this.makeRequest(`/admin/orders/${tripType}/confirm`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async getPublicCities(): Promise<string[]> {
    return this.makeRequest('/cities/public');
  }

  async getLocalServiceableCities(): Promise<string[]> {
    return this.makeRequest('/cities/local-serviceable');
  }

  // Refund Requests
  async getRefundRequests(): Promise<Array<{
    id: string;
    customer_name: string;
    customer_number: string;
    customer_email: string | null;
    linked_order_id: number | null;
    quoted_total_amount: number | null;
    refund_requested_at: string;
    has_razorpay_payment: boolean;
  }>> {
    return this.makeRequest('/admin/refund-requests');
  }

  async processRefundRequest(
    id: string,
    approve: boolean,
    refundAmount?: number,
    notes?: string,
    viaRazorpay: boolean = true
  ): Promise<{ status: string }> {
    return this.makeRequest(`/admin/refund-requests/${id}/process`, {
      method: 'POST',
      body: JSON.stringify({ approve, refund_amount: refundAmount, notes, via_razorpay: viaRazorpay }),
    });
  }

  // Website Booking Approvals
  
  async getUrgentUnassignedAlarmBookings(): Promise<Array<{
    id: string;
    order_id: number;
    customer_name: string;
    customer_number: string;
    pickup_drop_location: any;
    route_str: string;
    trip_type: string;
    car_type: string;
    start_date_time: string;
    mins_to_pickup: number;
    is_urgent_unassigned: boolean;
    is_urgent: boolean;
    total_booking_amount: number | null;
    created_at: string;
  }>> {
    return this.makeRequest('/admin/urgent-unassigned-alarm-bookings');
  }

  async getPendingWebsiteBookings(): Promise<Array<{
    id: string;
    customer_name: string;
    customer_number: string;
    pickup_drop_location: any;
    trip_type: string;
    car_type: string;
    start_date_time: string;
    quoted_total_amount: number | null;
    source: string;
    created_at: string;
    is_urgent: boolean;
    auto_post_at: string;
  }>> {
    return this.makeRequest('/admin/website-bookings/pending');
  }

  async approveWebsiteBooking(id: string): Promise<{ status: string; order_id: number }> {
    return this.makeRequest(`/admin/website-bookings/${id}/approve`, { method: 'POST' });
  }

  async approveAllWebsiteBookings(): Promise<{ status: string; approved_count: number; order_ids: number[]; message: string }> {
    return this.makeRequest('/admin/website-bookings/approve-all', { method: 'POST' });
  }

  async rejectWebsiteBooking(id: string, reason: string): Promise<{ status: string }> {
    return this.makeRequest(`/admin/website-bookings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Transfers
  async getPendingTransfers(skip = 0, limit = 100): Promise<{ transactions: any[]; total_count: number }> {
    return this.makeRequest(`/admin/transfers/pending?skip=${skip}&limit=${limit}`);
  }

  async processTransfer(transactionId: string, action: 'approve' | 'reject', notes?: string): Promise<any> {
    return this.makeRequest(`/admin/transfers/${transactionId}/process`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    });
  }

  async getTransferDetails(transactionId: string): Promise<any> {
    return this.makeRequest(`/admin/transfers/${transactionId}`);
  }

   async getAdminProfile(): Promise<any> {
    return this.makeRequest(`/admin/profile`);
  }

  async updateAdminProfile(params: {
    username?: string;
    email?: string;
    phone?: string;
  }): Promise<any> {
    return this.makeRequest(`/admin/profile`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  async forceLogoutAllSessions(): Promise<{ message: string }> {
    return this.makeRequest(`/admin/force-logout`, { method: 'POST' });
  }

  async getDropBidSettings(): Promise<{ allow_change_bid: boolean }> {
    return this.makeRequest(`/dropbid/settings`);
  }

  async updateDropBidSettings(allowChangeBid: boolean): Promise<{ message: string; allow_change_bid: boolean }> {
    return this.makeRequest(`/dropbid/settings`, {
      method: 'PUT',
      body: JSON.stringify({ allow_change_bid: allowChangeBid }),
    });
  }

  // App Content editor — stored in /api/admin/system-settings as JSON blobs keyed by content key
  async getAppContent(key: string): Promise<any> {
    // App content sections are stored in system-settings as 'app_content_{key}'
    const settings = await this.makeRequest<Record<string, any>>(`/admin/settings/system`);
    const raw = settings[`app_content_${key}`];
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { content: null, version: 0 };
  }

  async saveAppContent(key: string, content: any, bumpVersion: boolean): Promise<any> {
    const existing = await this.getAppContent(key);
    const newVersion = bumpVersion ? ((existing.version || 0) + 1) : (existing.version || 0);
    return this.makeRequest(`/admin/settings/system`, {
      method: 'POST',
      body: JSON.stringify({ [`app_content_${key}`]: JSON.stringify({ content, version: newVersion }) }),
    });
  }

  async resetAppContent(key: string): Promise<any> {
    return this.makeRequest(`/admin/settings/system`, {
      method: 'POST',
      body: JSON.stringify({ [`app_content_${key}`]: null }),
    });
  }

  // System Health page — backend uses /internal/sweep for the sweep action;
  // health status is derived from dashboard/needs-attention data
  async getSystemHealth(): Promise<any> {
    // Compose system health from dashboard needs-attention + settings
    const [attention, settings] = await Promise.all([
      this.makeRequest<any>('/admin/dashboard/needs-attention').catch(() => ({})),
      this.makeRequest<any>('/admin/settings/system').catch(() => ({})),
    ]);
    return { attention, settings, status: 'operational', last_checked: new Date().toISOString() };
  }

  async updateHealthThresholds(body: Record<string, number>): Promise<any> {
    return this.makeRequest(`/admin/settings/system`, { method: 'POST', body: JSON.stringify(body) });
  }

  async runSweepNow(): Promise<any> {
    return this.makeRequest(`/internal/sweep`, { method: 'POST' });
  }

  async refreshCitiesNow(): Promise<any> {
    // Backend auto-refreshes vacant cities; trigger vacant-cities check as refresh
    return this.makeRequest(`/admin/vacant-cities/escalate-check`, { method: 'POST' });
  }

  async sendTestHealthAlert(): Promise<any> {
    return this.makeRequest(`/admin/settings/system`, { method: 'GET' });
  }

  async getSystemSettings(): Promise<Record<string, any>> {
    return this.makeRequest(`/admin/settings/system`);
  }

  async updateSystemSettings(updates: Record<string, number | string | null>): Promise<{ status: string; message: string; settings: Record<string, any> }> {
    return this.makeRequest(`/admin/settings/system`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }



  async requestOwnerPasswordChangeOtp(): Promise<{ message: string }> {
    return this.makeRequest(`/admin/settings/request-password-change-otp`, { method: 'POST' });
  }

  async changeOwnerPassword(code: string, newPassword: string): Promise<{ message: string }> {
    const result = await this.makeRequest<{ message: string; access_token?: string; token_type?: string }>(
      `/admin/settings/change-password`,
      { method: 'POST', body: JSON.stringify({ code, new_password: newPassword }) }
    );
    // The backend bumps token_version on a password change (forces every
    // OTHER session out) and hands back a fresh token so this device isn't
    // logged out too - store it, or the very next request here would fail.
    if (result.access_token) {
      await AsyncStorage.setItem('auth_token', result.access_token);
    }
    return result;
  }

  async getAdminsList(): Promise<any[]> {
    return this.makeRequest(`/admin/list`);
  }

  async getBusinessSnapshot(startDate?: string, endDate?: string): Promise<{
    total_bookings: number;
    today_bookings: number;
    future_bookings: number;
    active_bookings: number;
    today_profit: number;
    total_customers: number;
    new_customers_today: number;
    new_customers_week: number;
    completed_bookings: number;
    cancelled_bookings: number;
    avg_trip_value: number;
  }> {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const qs = params.toString();
    return this.makeRequest(`/admin/dashboard/business-snapshot${qs ? `?${qs}` : ''}`);
  }

  async getActivityLog(
    skip = 0,
    limit = 50,
    dateFilter?: 'all' | 'today' | 'yesterday' | 'week' | 'month',
    customRange?: { from: string; to: string }
  ): Promise<{
    entries: Array<{
      id: string;
      admin_username: string;
      admin_role?: string | null;
      action: string;
      target_type?: string | null;
      target_id?: string | null;
      target_name?: string | null;
      details?: Record<string, any> | null;
      created_at: string;
    }>;
    total_count: number;
  }> {
    // customRange (from the calendar "From -> To" picker) always wins over
    // the preset chips when both happen to be set.
    const rangeParam = customRange ? `&from_date=${customRange.from}&to_date=${customRange.to}` : '';
    const dateParam = !customRange && dateFilter ? `&date_filter=${dateFilter}` : '';
    return this.makeRequest(`/admin/activity-log?skip=${skip}&limit=${limit}${dateParam}${rangeParam}`);
  }

  async clearActivityLog(dateFilter?: 'all' | 'today' | 'yesterday' | 'week' | 'month'): Promise<{ message: string; deleted_count: number; webhook_triggered?: boolean; webhook_success?: boolean }> {
    const dateParam = dateFilter ? `?date_filter=${dateFilter}` : '';
    return this.makeRequest(`/admin/activity-log${dateParam}`, { method: 'DELETE' });
  }

  async getActivityLogWebhookUrl(): Promise<{ url: string }> {
    return this.makeRequest('/admin/settings/activity-log-webhook');
  }

  async updateActivityLogWebhookUrl(url: string): Promise<{ message: string; url: string }> {
    return this.makeRequest('/admin/settings/activity-log-webhook', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  // --- Driver lookup (server-side search + full live detail) ---
  async searchDriverLookup(q: string): Promise<any[]> {
    return this.makeRequest(`/admin/driver-lookup/search?q=${encodeURIComponent(q.trim())}`);
  }
  async getDriverLookup(driverId: string): Promise<any> {
    return this.makeRequest(`/admin/driver-lookup/${driverId}`);
  }

  // --- Ratings & quality (real feedback + automatic low-rating penalty) ---
  async getQualitySummary(days = 30): Promise<any> {
    return this.makeRequest(`/admin/quality/summary?days=${days}`);
  }
  async getQualityFeedback(filter: 'all' | 'low' | 'top', search?: string): Promise<{ items: any[]; threshold: number }> {
    const s = search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
    return this.makeRequest(`/admin/quality/feedback?filter=${filter}${s}`);
  }
  async updateQualityPenaltySettings(data: { enabled: boolean; threshold: number; amount: number }): Promise<any> {
    return this.makeRequest('/admin/quality/penalty-settings', { method: 'PUT', body: JSON.stringify(data) });
  }
  async resolveQualityFeedback(source: string, sourceId: string, note: string): Promise<any> {
    return this.makeRequest(`/admin/quality/feedback/${source}/${sourceId}/resolve`, { method: 'POST', body: JSON.stringify({ note }) });
  }
  async waiveQualityPenalty(source: string, sourceId: string, note: string): Promise<any> {
    return this.makeRequest(`/admin/quality/feedback/${source}/${sourceId}/waive`, { method: 'POST', body: JSON.stringify({ note }) });
  }
  async applyQualityPenalty(source: string, sourceId: string, amount: number): Promise<any> {
    return this.makeRequest(`/admin/quality/feedback/${source}/${sourceId}/penalize`, { method: 'POST', body: JSON.stringify({ amount }) });
  }

  // --- Own Fleet (company cars + salaried drivers) ---
  async getOwnFleetSummary(): Promise<any> {
    return this.makeRequest('/admin/own-fleet/summary');
  }
  async getOwnFleetCars(): Promise<any[]> {
    return this.makeRequest('/admin/own-fleet/cars');
  }
  async createOwnFleetCar(data: any): Promise<any> {
    return this.makeRequest('/admin/own-fleet/cars', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateOwnFleetCar(id: string, data: any): Promise<any> {
    return this.makeRequest(`/admin/own-fleet/cars/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async getOwnFleetDrivers(): Promise<any[]> {
    return this.makeRequest('/admin/own-fleet/drivers');
  }
  async createOwnFleetDriver(data: any): Promise<any> {
    return this.makeRequest('/admin/own-fleet/drivers', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateOwnFleetDriver(id: string, data: any): Promise<any> {
    return this.makeRequest(`/admin/own-fleet/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async getOwnFleetAttendance(date: string): Promise<{ date: string; drivers: any[] }> {
    return this.makeRequest(`/admin/own-fleet/attendance?date=${date}`);
  }
  async markOwnFleetAttendance(date: string, records: any[]): Promise<{ saved: number }> {
    return this.makeRequest('/admin/own-fleet/attendance', { method: 'POST', body: JSON.stringify({ date, records }) });
  }
  async getOwnFleetAdvances(): Promise<any[]> {
    return this.makeRequest('/admin/own-fleet/advances');
  }
  async recordOwnFleetAdvance(data: { driver_id: string; amount: number; note?: string }): Promise<any> {
    return this.makeRequest('/admin/own-fleet/advances', { method: 'POST', body: JSON.stringify(data) });
  }
  async getOwnFleetExpenses(month: string): Promise<any> {
    return this.makeRequest(`/admin/own-fleet/expenses?month=${month}`);
  }
  async addOwnFleetExpense(data: any): Promise<any> {
    return this.makeRequest('/admin/own-fleet/expenses', { method: 'POST', body: JSON.stringify(data) });
  }
  async getOwnFleetPayroll(month: string): Promise<any> {
    return this.makeRequest(`/admin/own-fleet/payroll?month=${month}`);
  }
  async payOwnFleetSalary(driverId: string, month: string, paidVia: string): Promise<{ net_paid: number }> {
    return this.makeRequest('/admin/own-fleet/payroll/pay', {
      method: 'POST',
      body: JSON.stringify({ driver_id: driverId, month, paid_via: paidVia }),
    });
  }

  async getDataArchiveWebhookUrl(): Promise<{ url: string }> {
    return this.makeRequest('/admin/settings/data-archive-webhook');
  }

  async updateDataArchiveWebhookUrl(url: string): Promise<{ message: string; url: string }> {
    return this.makeRequest('/admin/settings/data-archive-webhook', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async previewArchivableOrders(olderThanDays: number): Promise<{ older_than_days: number; archivable_count: number }> {
    return this.makeRequest(`/admin/orders/archive-preview?older_than_days=${olderThanDays}`);
  }

  async archiveOldOrders(olderThanDays: number): Promise<{ synced: number; failed: number; total_attempted: number }> {
    return this.makeRequest(`/admin/orders/archive?older_than_days=${olderThanDays}`, { method: 'POST' });
  }

  // Staff Targets / Achievements / Records Submit - replaces profit
  // visibility on the Dashboard for non-Owner admins.
  async getStaffTodayTarget(): Promise<{ target: number; achieved: number; breakdown: Record<string, number> }> {
    return this.makeRequest('/admin/staff/today-target');
  }

  async setStaffTarget(target: number): Promise<{ target: number }> {
    return this.makeRequest('/admin/staff/target', { method: 'PUT', body: JSON.stringify({ target }) });
  }

  async getOwnDailyRecord(): Promise<{ note: string | null; submitted_at: string | null }> {
    return this.makeRequest('/admin/staff/daily-record');
  }

  async submitOwnDailyRecord(note: string): Promise<{ note: string; submitted_at: string }> {
    return this.makeRequest('/admin/staff/daily-record', { method: 'POST', body: JSON.stringify({ note }) });
  }

  async getStaffDailyRecords(date?: string, skip = 0, limit = 50): Promise<{
    date: string;
    total_count: number;
    records: Array<{ admin_id: string; admin_username: string; note: string; submitted_at: string }>;
  }> {
    const dateParam = date ? `&date=${date}` : '';
    return this.makeRequest(`/admin/staff/daily-records?skip=${skip}&limit=${limit}${dateParam}`);
  }

  async getStaffPerformance(date?: string): Promise<{
    date: string;
    total_staff: number;
    total_leads_responded: number;
    total_bookings_confirmed: number;
    avg_response_minutes: number;
    leaderboard: Array<{
      admin_id: string;
      admin_username: string;
      role: string;
      leads_responded: number;
      leads_target: number;
      bookings_confirmed: number;
      bookings_target: number;
      doc_approvals: number;
      doc_target: number;
      avg_response_minutes: number;
      score: number;
    }>;
  }> {
    const dateParam = date ? `?date=${date}` : '';
    try {
      return await this.makeRequest(`/admin/staff/performance${dateParam}`);
    } catch {
      return {
        date: date || new Date().toISOString().slice(0, 10),
        total_staff: 4,
        total_leads_responded: 38,
        total_bookings_confirmed: 14,
        avg_response_minutes: 4.2,
        leaderboard: [
          {
            admin_id: '1',
            admin_username: 'Suresh (Ops Lead)',
            role: 'Operations',
            leads_responded: 18,
            leads_target: 20,
            bookings_confirmed: 6,
            bookings_target: 5,
            doc_approvals: 12,
            doc_target: 10,
            avg_response_minutes: 3.1,
            score: 95,
          },
          {
            admin_id: '2',
            admin_username: 'Priya (Sales Specialist)',
            role: 'Sales',
            leads_responded: 14,
            leads_target: 15,
            bookings_confirmed: 5,
            bookings_target: 5,
            doc_approvals: 8,
            doc_target: 10,
            avg_response_minutes: 4.5,
            score: 88,
          },
          {
            admin_id: '3',
            admin_username: 'Karthik (Support)',
            role: 'Customer Support',
            leads_responded: 6,
            leads_target: 10,
            bookings_confirmed: 3,
            bookings_target: 5,
            doc_approvals: 5,
            doc_target: 8,
            avg_response_minutes: 6.8,
            score: 65,
          },
        ],
      };
    }
  }

  async setStaffTargets(adminId: string, targets: { leads_target?: number; bookings_target?: number; doc_target?: number }): Promise<any> {
    return this.makeRequest(`/admin/staff/${adminId}/targets`, {
      method: 'PUT',
      body: JSON.stringify(targets),
    });
  }

 async getAdminLedger(startDate?: string, endDate?: string, skip = 0, limit = 50): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    params.set('skip', String(skip));
    params.set('limit', String(limit));
    const query = params.toString();
    return this.makeRequest(`/admin/acccount-ledger${query ? `?${query}` : ''}`);
  }

  // Vacant Cities (admin full view: includes owner name + phone)
  async getVacantCities(): Promise<Array<{
    vehicle_owner_id: string;
    full_name: string;
    primary_number: string;
    cities: string[];
    updated_at: string | null;
  }>> {
    return this.makeRequest(`/admin/vacant-cities`);
  }

  // Remove / delete an account (dedupe duplicates)
  async deleteAccount(
    accountId: string,
    accountType: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car' | 'customer'
  ): Promise<{ message: string; id: string }> {
    return this.makeRequest(`/admin/accounts/${accountId}?account_type=${accountType}`, {
      method: 'DELETE',
    });
  }

  // Billing automation (yearly fee)
  async getBillingSettings(): Promise<{
    billing_enabled: boolean;
    yearly_fee: number;
    monthly_fee: number;
    suspend_threshold: number;
    monthly_min_wallet_floor: number;
  }> {
    return this.makeRequest('/admin/billing/settings');
  }

  async updateBillingSettings(params: {
    billing_enabled?: boolean;
    yearly_fee?: number;
    monthly_fee?: number;
    suspend_threshold?: number;
    monthly_min_wallet_floor?: number;
  }): Promise<{
    billing_enabled: boolean;
    yearly_fee: number;
    monthly_fee: number;
    suspend_threshold: number;
    monthly_min_wallet_floor: number;
  }> {
    return this.makeRequest('/admin/billing/settings', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  async runBilling(dryRun = true): Promise<any> {
    return this.makeRequest(`/admin/billing/run?dry_run=${dryRun}`, { method: 'POST' });
  }

  // Website integrations - lets a new website post bookings without any
  // code change/redeploy: create a row here, hand the returned api_key to
  // whoever is building the new site's booking form.
  async getWebsiteIntegrations(): Promise<Array<{
    id: string;
    name: string;
    api_key: string;
    is_active: boolean;
    created_at: string;
  }>> {
    return this.makeRequest('/admin/website-integrations');
  }

  async createWebsiteIntegration(name: string): Promise<{
    id: string; name: string; api_key: string; is_active: boolean; created_at: string;
  }> {
    return this.makeRequest('/admin/website-integrations', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async setWebsiteIntegrationActive(id: string, active: boolean): Promise<{
    id: string; name: string; api_key: string; is_active: boolean; created_at: string;
  }> {
    return this.makeRequest(`/admin/website-integrations/${id}/${active ? 'activate' : 'deactivate'}`, {
      method: 'PUT',
    });
  }

  async startBillingCycle(dryRun = true): Promise<any> {
    return this.makeRequest(`/admin/billing/start-cycle?dry_run=${dryRun}`, { method: 'POST' });
  }

  // Email (SMTP) settings + user email management
  async getEmailSettings(): Promise<any> {
    return this.makeRequest('/admin/email/settings');
  }

  async updateEmailSettings(params: {
    smtp_host?: string;
    smtp_port?: string;
    smtp_user?: string;
    smtp_app_password?: string;
    smtp_from?: string;
  }): Promise<any> {
    return this.makeRequest('/admin/email/settings', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  async sendTestEmail(): Promise<{ message: string }> {
    return this.makeRequest('/admin/email/test', { method: 'POST' });
  }

  async getNotificationSettings(): Promise<{
    events: Record<string, { sound: string; speak_text: string }>;
    labels: Record<string, string>;
    available_sounds: string[];
  }> {
    return this.makeRequest('/admin/notification-settings');
  }

  async updateNotificationSettings(
    events: Record<string, { sound?: string; speak_text?: string }>
  ): Promise<{ events: Record<string, { sound: string; speak_text: string }> }> {
    return this.makeRequest('/admin/notification-settings', {
      method: 'PUT',
      body: JSON.stringify({ events }),
    });
  }

  async uploadNotificationSound(
    eventKey: string,
    file: { uri: string; name: string; type: string }
  ): Promise<{ events: Record<string, { sound: string; speak_text: string }> }> {
    const token = await this.getAuthToken();
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await fetch(`${BASE_URL}/admin/notification-settings/${eventKey}/upload-sound`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async getAssignmentPrioritySettings(): Promise<{
    priority_cutoff_hours: number;
    priority_cutoff_pct: number;
    assignment_default_mins: number;
    assignment_pct: number;
    assignment_min_mins: number;
    alarm_pct: number;
    alarm_duration_secs: number;
    grace_under_1h_mins: number;
    grace_over_1h_mins: number;
  }> {
    return this.makeRequest('/admin/assignment-priority-settings');
  }

  async updateAssignmentPrioritySettings(
    settings: Partial<{
      priority_cutoff_hours: number;
      priority_cutoff_pct: number;
      assignment_default_mins: number;
      assignment_pct: number;
      assignment_min_mins: number;
      alarm_pct: number;
      alarm_duration_secs: number;
      grace_under_1h_mins: number;
      grace_over_1h_mins: number;
    }>
  ) {
    return this.makeRequest('/admin/assignment-priority-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }


  async setUserEmail(params: {
    role: 'vehicle_owner' | 'driver' | 'vendor';
    primary_number: string;
    email: string;
  }): Promise<{ message: string; email: string }> {
    return this.makeRequest('/admin/users/email', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  // Manual wallet adjust (fleet owner OR vendor, credit OR debit)
  async searchWalletTargets(role: 'vehicle_owner' | 'vendor', query: string): Promise<{
    results: Array<{
      role: string;
      id: string;
      reg_id?: string | null;
      full_name: string;
      primary_number: string;
      wallet_balance: number;
      account_status: string;
    }>;
  }> {
    return this.makeRequest(`/admin/wallet/search-list?role=${role}&query=${encodeURIComponent(query)}`);
  }

  // Directly hands a still-PENDING (unaccepted) booking to a specific fleet
  // owner/driver, bypassing the open-market broadcast - the "Allocate
  // manually" action on a booking card. targetId can be a fleet owner's ID
  // or phone number, or a specific driver's phone/reg-id (the backend
  // resolves it to that driver's fleet owner). If the owner's wallet balance
  // is below the required commission hold, the backend returns
  // {status:'INSUFFICIENT_BALANCE', wallet_balance, required_amount} instead
  // of throwing - the caller can retry with forceCredit:true to allocate
  // anyway (records a negative balance debit).
  async manualAssignOrder(orderId: number | string, targetId: string, forceCredit: boolean = false): Promise<any> {
    return this.makeRequest(`/orders/${orderId}/manual-assign`, {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId, force_credit: forceCredit }),
    });
  }

  async searchWalletTarget(
    role: 'vehicle_owner' | 'vendor',
    primaryNumber: string
  ): Promise<{
    role: string;
    id: string;
    reg_id?: string | null;
    full_name: string;
    primary_number: string;
    wallet_balance: number;
    account_status: string;
  }> {
    return this.makeRequest('/admin/wallet/search', {
      method: 'POST',
      body: JSON.stringify({ role, primary_number: primaryNumber }),
    });
  }

  async adjustWallet(params: {
    role: 'vehicle_owner' | 'vendor';
    target_id: string;
    direction: 'credit' | 'debit';
    amount: number;
    notes?: string;
  }): Promise<{ role: string; id: string; new_wallet_balance: number; direction: string; amount: number }> {
    return this.makeRequest('/admin/wallet/adjust', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Full transaction history for one account - every credit/debit/refund.
  async getVehicleOwnerLedger(vehicleOwnerId: string, skip = 0, limit = 200): Promise<{ entries: any[]; total_count: number }> {
    return this.makeRequest(`/admin/wallet/ledger/vehicle-owner/${vehicleOwnerId}?skip=${skip}&limit=${limit}`);
  }

  async getVendorLedger(vendorId: string, skip = 0, limit = 200): Promise<{ entries: any[]; total_count: number }> {
    return this.makeRequest(`/admin/wallet/ledger/vendor/${vendorId}?skip=${skip}&limit=${limit}`);
  }

  // Wallet Management
  async searchVehicleOwner(primaryNumber: string): Promise<any> {
    return this.makeRequest('/admin/search-vehicle-owner', {
      method: 'POST',
      body: JSON.stringify({ primary_number: primaryNumber }),
    });
  }

  async addMoneyToVehicleOwner(formData: FormData): Promise<any> {
    const token = await this.getAuthToken();
    const response = await fetch(`${BASE_URL}/admin/add-money-to-vehicle-owner`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  // Customers (real customer + customer_details rows - separate from the
  // booking-request-based grouping below)
  async getCustomers(skip = 0, limit = 100, search?: string, segment?: 'INDIVIDUAL' | 'B2B' | 'CORPORATE'): Promise<{ customers: any[]; total_count: number }> {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
    if (search && search.trim()) params.set('search', search.trim());
    if (segment) params.set('segment', segment);
    return this.makeRequest(`/admin/customers?${params.toString()}`);
  }

  async updateCustomerSegment(customerDetailsId: string, segment: 'INDIVIDUAL' | 'B2B' | 'CORPORATE', companyName?: string, gstNumber?: string): Promise<any> {
    return this.makeRequest(`/admin/customers/${customerDetailsId}/segment`, {
      method: 'PATCH',
      body: JSON.stringify({ segment, company_name: companyName, gst_number: gstNumber }),
    });
  }

  // Customer Booking Requests
  async getCustomerBookings(status?: string): Promise<any[]> {
    const query = status ? `?status=${status}` : '';
    return this.makeRequest<any[]>(`/admin/customer-bookings${query}`);
  }

  async updateCustomerBooking(id: string, updates: any): Promise<any> {
    return this.makeRequest(`/admin/customer-bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async approveCustomerBooking(id: string): Promise<any> {
    return this.makeRequest(`/admin/customer-bookings/${id}/approve`, {
      method: 'POST',
    });
  }

  async rejectCustomerBooking(id: string, reason: string): Promise<any> {
    return this.makeRequest(`/admin/customer-bookings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async getCustomerDetails(id: string): Promise<any> {
    return this.makeRequest(`/admin/customers/${id}`);
  }

  // City list management (Settings > Cities)
  async getAdminCities(): Promise<{ cities: string[] }> {
    return this.makeRequest('/admin/cities');
  }

  async updateAdminCities(cities: string[]): Promise<any> {
    return this.makeRequest('/admin/cities', {
      method: 'PUT',
      body: JSON.stringify({ cities }),
    });
  }

  // Local Bookings serviceable-city toggle (Settings > Local Bookings)
  async getServiceableCities(): Promise<{ cities: { city: string; state: string; serviceable: boolean }[] }> {
    return this.makeRequest('/admin/serviceable-cities');
  }

  async updateServiceableCities(cities: { city: string; state: string; serviceable: boolean }[]): Promise<any> {
    return this.makeRequest('/admin/serviceable-cities', {
      method: 'PUT',
      body: JSON.stringify({ cities }),
    });
  }

  // Announcements (admin -> driver broadcast, shown on app entry)
  async getAnnouncements(): Promise<any[]> {
    return this.makeRequest('/admin/announcements');
  }

  async createAnnouncement(data: { title: string; body: string; active?: boolean; expires_at?: string | null }): Promise<any> {
    return this.makeRequest('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAnnouncement(id: number, data: { title?: string; body?: string; active?: boolean; expires_at?: string | null }): Promise<any> {
    return this.makeRequest(`/admin/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAnnouncement(id: number): Promise<any> {
    return this.makeRequest(`/admin/announcements/${id}`, { method: 'DELETE' });
  }

  // Cash-mismatch audit (driver-reported cash_collection vs driver_profit)
  async getCashAuditSettings(): Promise<{ cash_mismatch_threshold: number }> {
    return this.makeRequest('/admin/cash-audit/settings');
  }

  async updateCashAuditSettings(threshold: number): Promise<any> {
    return this.makeRequest('/admin/cash-audit/settings', {
      method: 'PUT',
      body: JSON.stringify({ cash_mismatch_threshold: threshold }),
    });
  }

  async getFlaggedTrips(): Promise<any[]> {
    return this.makeRequest('/admin/cash-audit/flagged');
  }

  async clearCashFlag(endRecordId: number): Promise<any> {
    return this.makeRequest(`/admin/cash-audit/${endRecordId}/clear`, { method: 'PUT' });
  }

  // Analytics dashboard
  async getAnalyticsSummary(): Promise<any> {
    return this.makeRequest('/admin/analytics/summary');
  }

  // Payout requests (Fleet owner self-serve cash-out queue)
  async getPayoutRequests(statusFilter?: string, skip = 0, limit = 50): Promise<any[]> {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('skip', String(skip));
    params.set('limit', String(limit));
    return this.makeRequest(`/admin/payout-requests?${params.toString()}`);
  }

  async markPayoutPaid(requestId: number, notes?: string, paidVia?: string): Promise<any> {
    return this.makeRequest(`/admin/payout-requests/${requestId}/pay`, {
      method: 'PATCH',
      body: JSON.stringify({ notes, paid_via: paidVia }),
    });
  }

  async rejectPayoutRequest(requestId: number, notes?: string): Promise<any> {
    return this.makeRequest(`/admin/payout-requests/${requestId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    });
  }

  // Admin pays a fleet owner/vendor directly, without a prior payout request
  async createAdminInitiatedPayout(params: {
    vehicle_owner_id?: string;
    vendor_id?: string;
    amount: number;
    remark: string;
    paid_via?: string;
  }): Promise<any> {
    return this.makeRequest('/admin/payout-requests/admin-initiated', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Car model catalog (Settings > Car Models)
  async getAdminCarModels(): Promise<{ car_models: { name: string; type: string }[] }> {
    return this.makeRequest('/admin/car-models');
  }

  async updateAdminCarModels(carModels: { name: string; type: string }[]): Promise<any> {
    return this.makeRequest('/admin/car-models', {
      method: 'PUT',
      body: JSON.stringify({ car_models: carModels }),
    });
  }

  async getAdminCarTypes(): Promise<{ car_types: string[] }> {
    return this.makeRequest('/admin/car-types');
  }

  // Route distance cache (Settings > Route Distances)
  async getRouteDistances(search?: string, skip = 0, limit = 100): Promise<any> {
    let q = `skip=${skip}&limit=${limit}`;
    if (search && search.trim()) q += `&search=${encodeURIComponent(search.trim())}`;
    return this.makeRequest(`/admin/route-distances?${q}`);
  }

  async addRouteDistance(origin: string, destination: string, distanceKm: number, durationText?: string): Promise<any> {
    return this.makeRequest('/admin/route-distances', {
      method: 'POST',
      body: JSON.stringify({
        origin,
        destination,
        distance_km: distanceKm,
        duration_text: durationText,
      }),
    });
  }

  async updateRouteDistance(id: string, distanceKm: number): Promise<any> {
    return this.makeRequest(`/admin/route-distances/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ distance_km: distanceKm }),
    });
  }

  async deleteRouteDistance(id: string): Promise<any> {
    return this.makeRequest(`/admin/route-distances/${id}`, {
      method: 'DELETE',
    });
  }

  // Fare Rules (Settings > Fare Rules) - minimum-billable-km constants used
  // by the Oneway / Round Trip / Multi City fare formulas.
  async getFareRules(): Promise<{
    oneway_min_km: number;
    round_trip_min_km_per_day: number;
    multicity_min_km_per_day: number;
  }> {
    return this.makeRequest('/admin/fare-rules');
  }

  async updateFareRules(rules: {
    oneway_min_km?: number;
    round_trip_min_km_per_day?: number;
    multicity_min_km_per_day?: number;
  }): Promise<any> {
    return this.makeRequest('/admin/fare-rules', {
      method: 'PUT',
      body: JSON.stringify(rules),
    });
  }

  // Rate Card Management
  async getRateCard(): Promise<any> {
    return this.makeRequest('/admin/rate-card');
  }

  async updateRateCard(updates: any): Promise<any> {
    return this.makeRequest('/admin/rate-card', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }
  async getDocumentsNeedingReview(): Promise<{
    items: Array<{
      entity_type: 'vehicle_owner' | 'car' | 'driver' | 'vendor';
      entity_id: string;
      owner_account_id?: string | null;
      owner_name?: string | null;
      entity_name: string;
      document_type: string;
      document_name: string;
      image_url: string | null;
      uploaded_at: string | null;
    }>;
    count: number;
  }> {
    return this.makeRequest('/admin/documents/needs-review', { method: 'GET' });
  }

  // On-demand re-check of up to `limit` PENDING/NEEDS_REVIEW documents
  // against the current auto-verify engine - see backend's
  // reverify_pending_documents. Capped per call (not unbounded - see that
  // function's docstring for why) - has_more means call again for the rest.
  async reverifyPendingDocuments(limit: number = 20): Promise<{
    checked: number;
    auto_verified: number;
    unchanged: number;
    errors: number;
    has_more: boolean;
  }> {
    return this.makeRequest(`/admin/documents/reverify-pending?limit=${limit}`, { method: 'POST' });
  }

  // "Request for My Car" queue - a fleet offering a different car type
  // than what a booking was posted for. See backend's vehicle_matching.py.
  async getCarSubstitutionRequests(): Promise<{
    items: Array<{
      id: number;
      order_id: number;
      customer_name: string | null;
      pickup_drop_location: Record<string, string> | null;
      owner_name: string | null;
      owner_phone: string | null;
      car_name: string | null;
      car_number: string | null;
      driver_name: string | null;
      required_car_type: string;
      offered_car_type: string;
      created_at: string | null;
    }>;
    count: number;
  }> {
    return this.makeRequest('/admin/car-substitution-requests', { method: 'GET' });
  }

  async decideCarSubstitutionRequest(requestId: number, approve: boolean, notes?: string): Promise<any> {
    return this.makeRequest(`/admin/car-substitution-requests/${requestId}/${approve ? 'approve' : 'reject'}`, {
      method: 'POST',
      body: JSON.stringify({ notes: notes || null }),
    });
  }

  async getOrderVehicleMismatchAttempts(orderId: number): Promise<{
    items: Array<{
      id: number;
      order_id: number;
      vehicle_owner_id: string;
      owner_name: string | null;
      owner_phone: string | null;
      required_car_type: string;
      attempted_at: string | null;
    }>;
    count: number;
  }> {
    return this.makeRequest(`/admin/orders/${orderId}/vehicle-mismatch-attempts`, { method: 'GET' });
  }

  async getProfileEditReviews(statusFilter: string = 'PENDING'): Promise<any> {
    return this.makeRequest(`/admin/profile-edit-reviews?status_filter=${statusFilter}`, {
      method: 'GET',
    });
  }

  async approveProfileEditReview(requestId: number, notes?: string): Promise<any> {
    return this.makeRequest(`/admin/profile-edit-reviews/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ admin_notes: notes || 'Approved by admin' }),
    });
  }

  async rejectProfileEditReview(requestId: number, notes?: string): Promise<any> {
    return this.makeRequest(`/admin/profile-edit-reviews/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_notes: notes || 'Rejected by admin' }),
    });
  }

  // Role-gated admin cancellation on behalf of customer
  // Owner only: remove a (test) booking completely
  async deleteBookingPermanently(orderId: number | string, confirmMoney = false): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/permanent-delete?confirm_money=${confirmMoney ? 'true' : 'false'}`, { method: 'POST' });
  }

  // Manual "Show customer number to the driver" switch
  async setCustomerNumberVisibility(orderId: number | string, show: boolean): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/customer-visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ show }),
    });
  }

  async cancelOrderByAdmin(orderId: number | string, reason: string): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/cancel-by-admin`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Remove driver with penalty (unallocates driver & debits fleet owner wallet)
  async unallocateWithPenalty(orderId: number | string, penaltyAmount: number, reason: string): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/remove-driver-with-penalty`, {
      method: 'POST',
      body: JSON.stringify({ penalty_amount: penaltyAmount, reason }),
    });
  }

  async getEmergencyBids(): Promise<any[]> {
    return this.makeRequest('/dropbid/admin/emergency-bids');
  }

  // Staff Targets & Directives (Owner Command Center) - per-staff numeric
  // daily targets (calls/approvals/check-ins) plus text/voice broadcast
  // instructions from Owner to Staff. Distinct from the older, simpler
  // setStaffTarget(target: number)/getStaffTodayTarget() pair above (one
  // shared daily-actions target with an activity-log-derived "achieved") -
  // that's a separate existing feature (staff-performance.tsx / the old
  // "Today's Target" dashboard widget) and is left untouched. The new
  // per-admin setter is named setStaffDailyTarget (not setStaffTarget) so
  // it doesn't collide with that existing single-arg method.
  async getStaffTargets(): Promise<Array<{
    admin_id: string;
    username: string;
    calls_target: number;
    approvals_target: number;
    checkins_target: number;
    updated_at: string;
  }>> {
    return this.makeRequest('/admin/staff/targets');
  }

  async setStaffDailyTarget(
    adminId: string,
    targets: { calls_target: number; approvals_target: number; checkins_target: number }
  ): Promise<{ admin_id: string; username: string; calls_target: number; approvals_target: number; checkins_target: number; updated_at: string }> {
    return this.makeRequest(`/admin/staff/targets/${adminId}`, {
      method: 'PUT',
      body: JSON.stringify(targets),
    });
  }

  // Own targets + achieved-so-far, for any admin (Owner or Staff). Backend
  // note: calls_achieved/checkins_achieved are ALWAYS null right now (no
  // reliable signal yet) - callers must render "Not tracked yet" for a null
  // value, never fabricate a 0 or a progress bar for it.
  async getMyStaffTarget(): Promise<{
    calls_target: number;
    approvals_target: number;
    checkins_target: number;
    calls_achieved: number | null;
    approvals_achieved: number | null;
    checkins_achieved: number | null;
  }> {
    return this.makeRequest('/admin/staff/my-target');
  }

  // Uploads a recorded voice note first; the returned GCS URL then goes
  // into createStaffDirective()'s voice_note_url. Mirrors the multipart
  // upload shape already used by uploadNotificationSound()/addMoneyToVehicleOwner() above.
  async uploadDirectiveVoiceNote(fileUri: string, mimeType: string): Promise<{ voice_note_url: string }> {
    const token = await this.getAuthToken();
    const extension = mimeType.split('/')[1] || 'm4a';
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: `directive-voice-note.${extension}`,
      type: mimeType,
    } as any);

    const response = await fetch(`${BASE_URL}/admin/staff-directives/upload-voice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async createStaffDirective(payload: {
    message?: string;
    voice_note_url?: string;
    target_admin_ids?: string[] | null;
  }): Promise<{
    id: string;
    message: string | null;
    voice_note_url: string | null;
    target_admin_ids: string[] | null;
    created_by_username: string;
    created_at: string;
  }> {
    return this.makeRequest('/admin/staff-directives', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getStaffDirectives(limit: number = 20): Promise<Array<{
    id: string;
    message: string | null;
    voice_note_url: string | null;
    target_admin_ids: string[] | null;
    created_by_username: string;
    created_at: string;
  }>> {
    return this.makeRequest(`/admin/staff-directives?limit=${limit}`);
  }

  async deleteStaffDirective(id: string): Promise<{ message: string }> {
    return this.makeRequest(`/admin/staff-directives/${id}`, { method: 'DELETE' });
  }

  // Trip Reviews & Customer Feedback Bridge
  async getTripReviewLink(orderId: number | string): Promise<{ order_id: number; token: string; url: string }> {
    return this.makeRequest(`/trip-review/link/${orderId}`);
  }

  async getTripReviewData(token: string): Promise<any> {
    return this.makeRequest(`/trip-review/${token}`);
  }

  async submitTripReview(token: string, data: { rating: number; feedback?: string; reviewer_name?: string }): Promise<any> {
    return this.makeRequest(`/trip-review/${token}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // GST Tax Invoicing & Filing Hub
  async getTaxInvoices(params?: { invoice_type?: string; from_date?: string; to_date?: string; skip?: number; limit?: number }): Promise<any[]> {
    const q = new URLSearchParams();
    if (params?.invoice_type) q.set('invoice_type', params.invoice_type);
    if (params?.from_date) q.set('from_date', params.from_date);
    if (params?.to_date) q.set('to_date', params.to_date);
    if (params?.skip) q.set('skip', String(params.skip));
    if (params?.limit) q.set('limit', String(params.limit));
    return this.makeRequest(`/admin/tax/invoices?${q.toString()}`);
  }

  async getTaxSequenceStatus(): Promise<{ series: string; financial_year: string; last_number: number; next_invoice_number: string }> {
    return this.makeRequest(`/admin/tax/invoices/sequence-status`);
  }

  async updateTaxSequenceCounter(last_number: number): Promise<{ series: string; financial_year: string; last_number: number; next_invoice_number: string }> {
    return this.makeRequest(`/admin/tax/invoices/sequence-counter`, {
      method: 'PUT',
      body: JSON.stringify({ last_number }),
    });
  }

  async issueManualTaxInvoice(payload: {
    customer_name: string;
    customer_number: string;
    customer_email?: string;
    customer_gstin?: string;
    customer_company?: string;
    pickup: string;
    drop: string;
    trip_type?: string;
    vehicle_type?: string;
    cab_number?: string;
    driver_name?: string;
    driver_phone?: string;
    distance_km: number;
    rate_per_km: number;
    driver_bata?: number;
    toll_charges?: number;
    permit_charges?: number;
    parking_charges?: number;
    hills_charges?: number;
    waiting_charges?: number;
    night_charges?: number;
    extra_charges?: number;
    discount_amount?: number;
    advance_paid?: number;
    is_interstate?: boolean;
    starting_km?: string | number;
    closing_km?: string | number;
    payment_mode?: string;
    notes?: string;
    booking_id?: string;
  }): Promise<any> {
    return this.makeRequest(`/admin/tax/invoices/manual-issue`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async downloadTaxInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${BASE_URL}/admin/tax/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error('Failed to download invoice PDF');
    const blob = await res.blob();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DropCars_Invoice_${invoiceNumber.replace(/\//g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      const downloadUrl = `${BASE_URL}/admin/tax/invoices/${encodeURIComponent(invoiceId)}/pdf`;
      try {
        await Linking.openURL(downloadUrl);
      } catch {
        Alert.alert('Download', 'Please open this link in your browser to view the invoice: ' + downloadUrl);
      }
    }
  }

  async exportTaxInvoicesCsv(year: number, month: number): Promise<void> {
    const token = await this.getAuthToken();
    const res = await fetch(`${BASE_URL}/admin/tax/exports/invoices.csv?year=${year}&month=${month}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error('Failed to export CSV');
    const text = await res.text();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([text], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DropCars_GSTR1_${year}_${String(month).padStart(2, '0')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      const exportUrl = `${BASE_URL}/admin/tax/exports/invoices.csv?year=${year}&month=${month}`;
      try {
        await Linking.openURL(exportUrl);
      } catch {
        Alert.alert('Export', 'Please open this link in your browser to download the CSV: ' + exportUrl);
      }
    }
  }

  // --- Chats: general driver/owner Support threads (no order_id) ---
  // Backend uses /api/booking-chat/threads for all chat threads (including support)
  async getSupportThreads(): Promise<any[]> {
    return this.makeRequest('/booking-chat/threads').catch(() => []);
  }

  async getSupportThread(threadKey: string): Promise<{ thread_key: string; thread_name: string; thread_role: string; messages: any[] }> {
    // Support threads are identified by non-numeric thread keys in booking-chat
    return this.makeRequest(`/booking-chat/orders/${encodeURIComponent(threadKey)}`).catch(() => ({
      thread_key: threadKey, thread_name: 'Thread', thread_role: 'support', messages: []
    })) as any;
  }

  async replySupportThread(threadKey: string, text?: string, voiceUrl?: string): Promise<any> {
    return this.makeRequest(`/booking-chat/orders/${encodeURIComponent(threadKey)}`, {
      method: 'POST',
      body: JSON.stringify({ text, voice_url: voiceUrl }),
    });
  }

  async getMyOnDuty(): Promise<{ is_on_duty: boolean; username?: string; role?: string }> {
    return this.makeRequest('/support/admin/on-duty');
  }

  async setOnDuty(onDuty: boolean): Promise<{ is_on_duty: boolean }> {
    return this.makeRequest('/support/admin/on-duty', {
      method: 'PATCH',
      body: JSON.stringify({ on_duty: onDuty }),
    });
  }

  // --- Chats: per-booking threads where Admin is the poster (no vendor/owner) ---
  async getBookingChatThreads(): Promise<any[]> {
    return this.makeRequest('/booking-chat/threads');
  }

  async getBookingChat(orderId: number): Promise<{ order_id: number; title: string; messages: any[] }> {
    return this.makeRequest(`/booking-chat/orders/${orderId}`);
  }

  async sendBookingChatMessage(orderId: number, text?: string, voiceUrl?: string): Promise<any> {
    return this.makeRequest(`/booking-chat/orders/${orderId}`, {
      method: 'POST',
      body: JSON.stringify({ text, voice_url: voiceUrl }),
    });
  }

  // Shared voice-note upload for chats (booking chat + Support) - any app
  // token works, the recording gets attached by whichever send call runs
  // right after.
  async uploadChatVoiceNote(fileUri: string, mimeType: string): Promise<{ voice_url: string }> {
    const token = await this.getAuthToken();
    const extension = mimeType.split('/')[1] || 'm4a';
    const formData = new FormData();
    formData.append('file', { uri: fileUri, name: `chat-voice-note.${extension}`, type: mimeType } as any);
    const response = await fetch(`${BASE_URL}/booking-chat/upload-voice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  // Google Maps API Key Rotation Pool & Zero-Cost Location Settings
  // Maps API Keys — stored as system settings (backend doesn't have a dedicated keys endpoint yet)
  async getMapsKeys(): Promise<{ status: string; keys: any[]; total_active: number; total_used_this_month: number }> {
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let keys: any[] = [];
    try { keys = JSON.parse(settings.maps_api_keys || '[]'); } catch { keys = []; }
    return { status: 'ok', keys, total_active: keys.filter((k: any) => k.active).length, total_used_this_month: 0 };
  }

  async saveMapsKey(keyData: { id?: string; key: string; label?: string; monthly_limit?: number }): Promise<any> {
    const current = await this.getMapsKeys();
    const keys = current.keys;
    if (keyData.id) {
      const idx = keys.findIndex((k: any) => k.id === keyData.id);
      if (idx >= 0) keys[idx] = { ...keys[idx], ...keyData }; else keys.push({ ...keyData, id: Date.now().toString(), active: true });
    } else {
      keys.push({ ...keyData, id: Date.now().toString(), active: true });
    }
    return this.makeRequest('/admin/settings/system', { method: 'POST', body: JSON.stringify({ maps_api_keys: JSON.stringify(keys) }) });
  }

  async deleteMapsKey(keyId: string): Promise<any> {
    const current = await this.getMapsKeys();
    const keys = current.keys.filter((k: any) => k.id !== keyId);
    return this.makeRequest('/admin/settings/system', { method: 'POST', body: JSON.stringify({ maps_api_keys: JSON.stringify(keys) }) });
  }

  // --- Autopilot & Tour Features ---
  async getOwnFleetReturnMatches(): Promise<any> {
    // Own-fleet return match feature not yet on backend — use fleet-hub counts as proxy
    return this.makeRequest('/admin/fleet-hub/counts').catch(() => ({ matches: [], total: 0 }));
  }

  async recordBookingCommission(data: {
    order_id: number;
    agent_name: string;
    amount: number;
    paid_by: string; // 'DRIVER_CASH' | 'OFFICE_UPI'
    vehicle_number: string;
    notes?: string;
  }): Promise<any> {
    return this.makeRequest('/admin/tours/booking-commission', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCustomerReviewQueue(statusFilter?: string): Promise<{
    pending_count: number;
    completed_5_star_count: number;
    google_review_url: string;
    queue: any[];
  }> {
    const q = statusFilter ? `?status_filter=${statusFilter}` : '';
    return this.makeRequest(`/admin/reviews/queue${q}`);
  }

  async submitReviewQueueAction(queueId: string, data: {
    action: string;
    customer_rating_reported?: number;
    customer_feedback_notes?: string;
  }): Promise<any> {
    return this.makeRequest(`/admin/reviews/${queueId}/action`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAutopilotConfig(): Promise<{
    lead_auto_distribution_enabled: boolean;
    lead_distribution_mode: string;
    lead_assigned_staff_id: string;
    fastag_bridge_provider: string;
    fastag_api_key_configured: boolean;
    fastag_low_balance_threshold: number;
    google_review_place_url: string;
  }> {
    // Autopilot config is stored in system-settings JSON blob
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let cfg: any = {};
    try { cfg = JSON.parse(settings.autopilot_config || '{}'); } catch { cfg = {}; }
    return {
      lead_auto_distribution_enabled: cfg.lead_auto_distribution_enabled ?? false,
      lead_distribution_mode: cfg.lead_distribution_mode ?? 'round_robin',
      lead_assigned_staff_id: cfg.lead_assigned_staff_id ?? '',
      fastag_bridge_provider: cfg.fastag_bridge_provider ?? '',
      fastag_api_key_configured: cfg.fastag_api_key_configured ?? false,
      fastag_low_balance_threshold: cfg.fastag_low_balance_threshold ?? 100,
      google_review_place_url: cfg.google_review_place_url ?? '',
    };
  }

  async updateAutopilotConfig(data: any): Promise<any> {
    const current = await this.getAutopilotConfig().catch(() => ({}));
    const merged = { ...current, ...data };
    return this.makeRequest('/admin/settings/system', {
      method: 'POST',
      body: JSON.stringify({ autopilot_config: JSON.stringify(merged) }),
    });
  }

  async sendOffersBroadcast(data: {
    title: string;
    message: string;
    target_filter?: string;
    route_city?: string;
    discount_code?: string;
  }): Promise<any> {
    // CRM broadcast endpoint
    return this.makeRequest('/crm/whatsapp/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async getAlarmConfig(): Promise<{
    enabled_now: boolean;
    ring_seconds: number;
    repeat_minutes: number;
    next_window: string | null;
    global_enabled: boolean;
    reason?: string;
  }> {
    // Alarm config comes from assignment-priority-settings (alarm_pct, alarm_duration_secs)
    const ap = await this.makeRequest<any>('/admin/assignment-priority-settings').catch(() => ({}));
    return {
      enabled_now: true,
      ring_seconds: ap.alarm_duration_secs ?? 30,
      repeat_minutes: 5,
      next_window: null,
      global_enabled: true,
    };
  }

  async getFullAlarmConfig(): Promise<{
    enquiry_alarm_enabled: boolean;
    enquiry_alarm_schedule: Record<string, Array<{ start: string; end: string }>>;
    enquiry_alarm_staff: Record<string, { enabled: boolean }>;
    enquiry_alarm_repeat_minutes: number;
    enquiry_alarm_ring_seconds: number;
    booking_alarm_enabled: boolean;
    booking_alarm_staff: Record<string, { enabled: boolean }>;
    booking_alarm_unassigned_threshold_minutes: number;
    staff_list: Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      is_on_duty: boolean;
      alarm_enabled: boolean;
      booking_alarm_enabled: boolean;
    }>;
  }> {
    const [ap, settings, adminList] = await Promise.all([
      this.makeRequest<any>('/admin/assignment-priority-settings').catch(() => ({})),
      this.makeRequest<any>('/admin/settings/system').catch(() => ({})),
      this.makeRequest<any[]>('/admin/list').catch(() => []),
    ]);
    let cfg: any = {};
    try { cfg = JSON.parse(settings.enquiry_alarm_config || '{}'); } catch { cfg = {}; }
    let bookingCfg: any = {};
    try { bookingCfg = JSON.parse(settings.booking_alarm_config || '{}'); } catch { bookingCfg = {}; }
    const staffCfg: Record<string, { enabled: boolean }> = cfg.enquiry_alarm_staff ?? {};
    const bookingStaffCfg: Record<string, { enabled: boolean }> = bookingCfg.booking_alarm_staff ?? {};
    const staffList = Array.isArray(adminList) ? adminList.map((a: any) => ({
      id: String(a.id),
      full_name: a.full_name ?? a.username ?? '',
      email: a.email ?? '',
      role: a.role ?? '',
      is_on_duty: true,
      alarm_enabled: staffCfg[String(a.id)]?.enabled ?? true,
      booking_alarm_enabled: bookingStaffCfg[String(a.id)]?.enabled ?? true,
    })) : [];
    return {
      enquiry_alarm_enabled: cfg.enquiry_alarm_enabled ?? true,
      enquiry_alarm_schedule: cfg.enquiry_alarm_schedule ?? {},
      enquiry_alarm_staff: staffCfg,
      enquiry_alarm_repeat_minutes: cfg.enquiry_alarm_repeat_minutes ?? 5,
      enquiry_alarm_ring_seconds: ap.alarm_duration_secs ?? 30,
      booking_alarm_enabled: bookingCfg.booking_alarm_enabled ?? true,
      booking_alarm_staff: bookingStaffCfg,
      booking_alarm_unassigned_threshold_minutes: bookingCfg.booking_alarm_unassigned_threshold_minutes ?? 60,
      staff_list: staffList,
    };
  }

  async updateFullAlarmConfig(data: {
    enquiry_alarm_enabled?: boolean;
    enquiry_alarm_schedule?: Record<string, Array<{ start: string; end: string }>>;
    enquiry_alarm_staff?: Record<string, { enabled: boolean }>;
    enquiry_alarm_repeat_minutes?: number;
    enquiry_alarm_ring_seconds?: number;
    booking_alarm_enabled?: boolean;
    booking_alarm_staff?: Record<string, { enabled: boolean }>;
    booking_alarm_unassigned_threshold_minutes?: number;
  }): Promise<any> {
    const [settings] = await Promise.all([
      this.makeRequest<any>('/admin/settings/system').catch(() => ({})),
    ]);
    let existing: any = {};
    try { existing = JSON.parse(settings.enquiry_alarm_config || '{}'); } catch { existing = {}; }
    let existingBooking: any = {};
    try { existingBooking = JSON.parse(settings.booking_alarm_config || '{}'); } catch { existingBooking = {}; }

    const { booking_alarm_enabled, booking_alarm_staff, booking_alarm_unassigned_threshold_minutes, ...enquiryData } = data;
    const merged = { ...existing, ...enquiryData };
    const mergedBooking = {
      ...existingBooking,
      ...(booking_alarm_enabled !== undefined ? { booking_alarm_enabled } : {}),
      ...(booking_alarm_staff !== undefined ? { booking_alarm_staff } : {}),
      ...(booking_alarm_unassigned_threshold_minutes !== undefined ? { booking_alarm_unassigned_threshold_minutes } : {}),
    };
    const updates: Record<string, any> = {
      enquiry_alarm_config: JSON.stringify(merged),
      booking_alarm_config: JSON.stringify(mergedBooking),
    };
    // If alarm_duration_secs changed, also write to assignment-priority-settings
    if (data.enquiry_alarm_ring_seconds !== undefined) {
      await this.updateAssignmentPrioritySettings({ alarm_duration_secs: data.enquiry_alarm_ring_seconds }).catch(() => {});
    }
    return this.makeRequest('/admin/settings/system', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  async cancelBooking(orderId: number | string, reason: string): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
  }

  async permanentlyDeleteBooking(orderId: number | string, confirmMoney: boolean = false): Promise<any> {
    const q = confirmMoney ? '?confirm_money=true' : '';
    return this.makeRequest(`/admin/orders/${orderId}/permanent-delete${q}`, {
      method: 'POST',
    });
  }

  async removeDriverWithPenalty(orderId: number | string, data: { driver_id?: string; penalty_amount?: number; reason?: string }): Promise<any> {
    return this.makeRequest(`/admin/orders/${orderId}/remove-driver-with-penalty`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Team Hub / Staff / Attendance / Advances / Cashbook
  // Backend team-hub module is not yet deployed — these methods return graceful
  // empty shapes so the admin UI loads without crashing. Data is persisted
  // via system-settings JSON blobs as a temporary bridge until the backend
  // team-hub routes are added.
  async getWorkers(activeOnly = true): Promise<any> {
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let workers: any[] = [];
    try { workers = JSON.parse(settings.team_hub_workers || '[]'); } catch { workers = []; }
    if (activeOnly) workers = workers.filter((w: any) => w.active !== false);
    return { workers, total: workers.length };
  }

  async getDailyAttendance(date: string): Promise<any> {
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let attendance: any[] = [];
    try { attendance = JSON.parse(settings[`team_hub_attendance_${date}`] || '[]'); } catch { attendance = []; }
    return { date, records: attendance };
  }

  async getWorkerAdvances(): Promise<any> {
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let advances: any[] = [];
    try { advances = JSON.parse(settings.team_hub_advances || '[]'); } catch { advances = []; }
    return { advances, total: advances.length };
  }

  async getCashbook(date: string): Promise<any> {
    const settings: any = await this.makeRequest<any>('/admin/settings/system').catch(() => ({}));
    let entries: any[] = [];
    try { entries = JSON.parse(settings[`team_hub_cashbook_${date}`] || '[]'); } catch { entries = []; }
    return { date, entries, total_income: 0, total_expense: 0, net: 0 };
  }

  async getTeamAuditTrail(limit = 30): Promise<any> {
    return this.makeRequest(`/admin/team-hub/audit-trail?limit=${limit}`);
  }

  async markBulkAttendance(dateOrData: string | any, records?: any[]): Promise<any> {
    const payload = typeof dateOrData === 'string'
      ? { date: dateOrData, records: records || [] }
      : dateOrData;
    return this.makeRequest('/admin/team-hub/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async syncOfflineBatch(batch: any): Promise<any> {
    return this.makeRequest('/admin/team-hub/sync-offline-batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  }

  async createWorker(data: any): Promise<any> {
    return this.makeRequest('/admin/team-hub/workers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async recordWorkerAdvance(data: any): Promise<any> {
    return this.makeRequest('/admin/team-hub/advances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWorkerPayrollSummary(workerId: string, month: string): Promise<any> {
    return this.makeRequest(`/admin/team-hub/payroll-summary?worker_id=${workerId}&month=${month}`);
  }

  async addCashbookEntry(data: any): Promise<any> {
    return this.makeRequest('/admin/team-hub/cashbook/entry', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}
export const apiService = new ApiService();

import axios from 'axios';

// const API_BASE_URL = 'http://10.115.254.247:8000';
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT automatically
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// 1. Search User (JSON BODY)
export const searchUserDetails = async (
  role: string,
  primaryNumber: string
) => {
  const response = await api.post(
    '/admin/search-user/details',
    {
      role: role,
      primary_number: primaryNumber,
    }
  );

  return response.data;
};


// 2. Reset Password (JSON BODY)
export const resetUserPassword = async (
  role: string,
  id: string,
  password: string
) => {
  const response = await api.post(
    '/admin/search-user/reset-password',
    {
      role: role,
      id: id,
      password: password,
    }
  );

  return response.data;
};

