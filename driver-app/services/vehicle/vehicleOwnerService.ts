import axiosInstance from '@/app/api/axiosInstance';
import { getAuthHeaders } from '@/services/auth/authService';
import * as SecureStore from '@/utils/secureStore';
import { extractUserIdFromJWT } from '@/utils/jwtDecoder';

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const safePickLoc = (v: any): Record<string, string> => {
  if (!v) return {};
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return v;
};

export interface PendingOrder {
  id: string | null;
  order_id: number;
  vehicle_owner_id: string;
  driver_id: string | null;
  car_id: string | null;
  assignment_status: string; // PENDING
  assigned_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  vendor_id: string;
  trip_type: string; // Oneway, Roundtrip, etc.
  car_type: string; // Sedan, SUV, etc.
  pickup_drop_location: Record<string, string>; // { "0": "CityA", "1": "CityB" }
  start_date_time: string;
  customer_name: string;
  customer_number: string;
  cost_per_km: number; // may be 0
  extra_cost_per_km: number;
  driver_allowance: number;
  extra_driver_allowance: number;
  permit_charges: number;
  extra_permit_charges: number;
  hill_charges: number;
  toll_charges: number;
  waiting_time?: number | null;
  waiting_charge?: number | null;
  night_charges?: number | null;
  pickup_notes: string | null;
  trip_status: string; // PENDING
  pick_near_city: string;
  trip_distance: number; // km
  trip_time: string;
  platform_fees_percent: number;
  estimated_price: number ;
  vendor_price: number | null;
  order_created_at: string;
  // Fare transparency: display-only, doesn't change any charge calculation.
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[] | null;
}

export interface PendingOrderView extends PendingOrder {
  pickup_city: string;
  drop_city: string;
  per_km_price: number | null; // derived when backend sends 0
  total_amount: number | null; // vendor_price || estimated_price
}

export async function getPendingOrders(params?: { limit?: number; page?: number }): Promise<PendingOrderView[]> {
  const authHeaders = await getAuthHeaders(); // VO Bearer token
  console.warn('VO pending orders fetch start', { hasAuth: !!(authHeaders as any)?.Authorization });
  const t0 = Date.now();
  const response = await axiosInstance.get('/api/orders/vehicle_owner/pending', {
    headers: authHeaders,
    params: { limit: params?.limit ?? 20, page: params?.page ?? 1 },
  }); 
  console.log('VO pending orders fetch response:', response.data);
  const ms = Date.now() - t0;
  console.log('⏱️ VO pending orders fetched in ms:', ms);

  const data: PendingOrder[] = Array.isArray(response.data) ? response.data : [];
  console.warn('VO pending orders count:', data.length);
  if (data.length > 0) {
    const sample = data[0];
    console.warn('VO pending sample:', {
      order_id: sample.order_id,
      trip_type: sample.trip_type,
      car_type: sample.car_type,
      estimated_price: sample.estimated_price,
      vendor_price: sample.vendor_price,
      distance: sample.trip_distance,
      time: sample.trip_time,
    });
    console.log('sample types', {
      vendor_price: typeof (sample as any)?.vendor_price,
      estimated_price: typeof (sample as any)?.estimated_price,
      trip_distance: typeof (sample as any)?.trip_distance,
      pickup_drop_location: typeof (sample as any)?.pickup_drop_location,
    });
  }

  return data.map((o) => {
    const loc = safePickLoc((o as any).pickup_drop_location);
    const cities = Object.values(loc || {});
    const pickup_city = cities[0] || '';
    const drop_city = cities[1] || '';

    const vendor = toNumber((o as any).vendor_price) ?? undefined;
    const estimate = toNumber((o as any).estimated_price) ?? undefined;
    const total_amount = vendor ?? estimate ?? null;

    const distance = toNumber((o as any).trip_distance) ?? toNumber((o as any).distance) ?? 0;
    const cost_per_km = toNumber((o as any).cost_per_km);

    const per_km_price = total_amount != null && distance > 0
      ? Math.round(((total_amount as number) / (distance as number)) * 100) / 100
      : cost_per_km;

    return {
      ...o,
      pickup_city,
      drop_city,
      total_amount,
      per_km_price: per_km_price === 0 ? null : per_km_price,
    } as PendingOrderView;
  });
}

export interface FutureRide {
  id: string;
  order_id: number;
  vehicle_owner_id: string;
  driver_id: string | null;
  car_id: string | null;
  assignment_status: string;
  assigned_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: Record<string, string>;
  start_date_time: string;
  customer_name: string;
  customer_number: string;
  cost_per_km: number;
  extra_cost_per_km: number;
  driver_allowance: number;
  extra_driver_allowance: number;
  permit_charges: number;
  extra_permit_charges: number;
  hill_charges: number;
  toll_charges: number;
  waiting_time?: number | null;
  waiting_charge?: number | null;
  night_charges?: number | null;
  pickup_notes: string | null;
  trip_status: string;
  pick_near_city: string;
  trip_distance: number;
  trip_time: string;
  platform_fees_percent: number;
  estimated_price: number;
  vendor_price: number | null;
  order_created_at: string;
  pickup_city?: string;
  drop_city?: string;
  total_amount?: number | null;
  per_km_price?: number | null;
  assigned_driver_name?: string | null;
  assigned_driver_phone?: string | null;
  assigned_car_name?: string | null;
  assigned_car_number?: string | null;
}

export interface FutureRideView extends FutureRide {
  pickup_city: string;
  drop_city: string;
  total_amount: number | null;
  per_km_price: number | null;
}

// Get future rides (pending orders) using the correct API
export async function getFutureRidesForVehicleOwner(): Promise<FutureRideView[]> {
  try {
    console.log('🚗 Fetching future rides (pending orders) for Vehicle Owner...');

    // Get Auth headers (VO Bearer token)
    const authHeaders = await getAuthHeaders();
    console.log('🔑 Auth headers ready:', !!(authHeaders as any)?.Authorization);

    // No need to extract user ID - the API uses JWT token to identify the vehicle owner

    // Fetch pending orders using the correct API
    const response = await axiosInstance.get('/api/orders/vehicle-owner/pending', {
      headers: authHeaders,
    });

    const data: PendingOrder[] = Array.isArray(response.data) ? response.data : [];
    console.log(`✅ Future rides fetched: ${data.length} orders`);

    // No filtering needed - API already returns orders for the authenticated vehicle owner
    const filteredData = data;

    if (filteredData.length > 0) {
      console.log('📦 Sample future ride:', {
        id: filteredData[0].id,
        trip_type: filteredData[0].trip_type,
        car_type: filteredData[0].car_type,
        estimated_price: filteredData[0].estimated_price,
        vendor_price: filteredData[0].vendor_price,
        trip_distance: filteredData[0].trip_distance,
        pickup_drop_location: filteredData[0].pickup_drop_location,
      });
    }

    // Map the data to FutureRideView format
    return filteredData.map((order) => {
      const loc = safePickLoc(order.pickup_drop_location);
      const cities = Object.values(loc || {});
      const pickup_city = cities[0] || 'Unknown';
      const drop_city = cities[1] || 'Unknown';

      const vendor = toNumber(order.vendor_price) ?? undefined;
      const estimate = toNumber(order.estimated_price) ?? undefined;
      const total_amount = vendor ?? estimate ?? 0;

      const distance = toNumber(order.trip_distance) ?? 0;
      const cost_per_km = toNumber(order.cost_per_km);

      const per_km_price = total_amount > 0 && distance > 0
        ? Math.round((total_amount / distance) * 100) / 100
        : cost_per_km;

      return {
        ...order,
        pickup_city,
        drop_city,
        total_amount,
        per_km_price: per_km_price === 0 ? null : per_km_price,
      } as FutureRideView;
    });
  } catch (error: any) {
    console.error('❌ Failed to fetch future rides:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      console.warn('⚠️ No pending orders found');
      return [];
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else {
      throw new Error(error.message || 'Failed to fetch future rides');
    }
  }
}

// Get completed/cancelled orders using the non-pending API
export async function getCompletedOrdersForVehicleOwner(
  options?: { startDate?: string; endDate?: string }
): Promise<FutureRideView[]> {
  try {
    console.log('📋 Fetching completed orders for Vehicle Owner...', options);

    // Get Auth headers (VO Bearer token)
    const authHeaders = await getAuthHeaders();
    console.log('🔑 Auth headers ready:', !!(authHeaders as any)?.Authorization);

    // No need to extract user ID - the API uses JWT token to identify the vehicle owner

    // Build optional date-range query params. Omitting both preserves the
    // old backend behavior of returning everything.
    const params: Record<string, string> = {};
    if (options?.startDate) params.start_date = options.startDate;
    if (options?.endDate) params.end_date = options.endDate;

    // Fetch non-pending orders using the correct API
    const response = await axiosInstance.get('/api/orders/vehicle-owner/non-pending', {
      headers: authHeaders,
      params: Object.keys(params).length > 0 ? params : undefined,
    });

    console.log('📊 API Response:', {
      status: response.status,
      dataLength: response.data?.length,
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      sampleData: response.data?.[0] || 'No data'
    });

    const data: PendingOrder[] = Array.isArray(response.data) ? response.data : [];
    console.log(`✅ Completed orders fetched: ${data.length} orders`);

    // No filtering needed - API already returns orders for the authenticated vehicle owner
    const filteredData = data;

    if (filteredData.length > 0) {
      console.log('📦 Sample completed order:', {
        id: filteredData[0].id,
        trip_status: filteredData[0].trip_status,
        assignment_status: filteredData[0].assignment_status,
        estimated_price: filteredData[0].estimated_price,
        vendor_price: filteredData[0].vendor_price,
        trip_distance: filteredData[0].trip_distance,
      });
    }

    // Map the data to FutureRideView format
    return filteredData.map((order) => {
      const loc = safePickLoc(order.pickup_drop_location);
      const cities = Object.values(loc || {});
      const pickup_city = cities[0] || 'Unknown';
      const drop_city = cities[1] || 'Unknown';

      const vendor = toNumber(order.vendor_price) ?? undefined;
      const estimate = toNumber(order.estimated_price) ?? undefined;
      const total_amount = vendor ?? estimate ?? 0;

      const distance = toNumber(order.trip_distance) ?? 0;
      const cost_per_km = toNumber(order.cost_per_km);

      const per_km_price = total_amount > 0 && distance > 0
        ? Math.round((total_amount / distance) * 100) / 100
        : cost_per_km;

      return {
        ...order,
        pickup_city,
        drop_city,
        total_amount,
        per_km_price: per_km_price === 0 ? null : per_km_price,
      } as FutureRideView;
    });
  } catch (error: any) {
    console.error('❌ Failed to fetch completed orders:', error);
    
    // Check if error is related to invalid car_type enum
    const errorDetail = error.response?.data?.detail || error.message || '';
    if (errorDetail.includes('is not among the defined enum values') || 
        errorDetail.includes('CAR_TYPE_ENUM') ||
        (errorDetail.includes('SEDAN') && errorDetail.includes('enum'))) {
      console.warn('⚠️ Backend enum validation error - some orders may have outdated car types');
      // Return empty array to prevent app crash, but log the issue
      console.error('⚠️ Cannot fetch completed orders due to invalid car_type values in database. Please contact support.');
      return [];
    }
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 404) {
      console.warn('⚠️ No completed orders found');
      return [];
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again later.');
    } else {
      throw new Error(error.message || 'Failed to fetch completed orders');
    }
  }
}

export async function increaseAllInclusiveFare(
  orderId: number,
  newTotalAmount: number
): Promise<{ status: string; order_id: number; old_total_amount: number; new_total_amount: number; message: string }> {
  const authHeaders = await getAuthHeaders();
  const response = await axiosInstance.patch(
    `/api/orders/${orderId}/increase-all-inclusive-fare`,
    { new_total_amount: Math.round(newTotalAmount) },
    { headers: authHeaders }
  );
  return response.data;
}

