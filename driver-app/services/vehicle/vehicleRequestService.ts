import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

export interface VehicleRequestItem {
  orderId: number | string;
  carId?: number | string;
  carName?: string;
  carType: string;
  driverId?: number | string;
  driverName?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  approvedAt?: string;
  vendorNotes?: string;
}

const STORAGE_KEY = 'dropcars_vehicle_substitution_requests';

type Listener = () => void;
const listeners = new Set<Listener>();

// In-memory cache for fast synchronous access
let memoryCache: Record<string, VehicleRequestItem> = {};
let isInitialized = false;

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Error in vehicleRequest listener', e);
    }
  });
};

const initCache = async () => {
  if (isInitialized) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      memoryCache = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load vehicle requests from storage', e);
  } finally {
    isInitialized = true;
  }
};

// Initial call
initCache();

export const vehicleRequestService = {
  async getAll(): Promise<Record<string, VehicleRequestItem>> {
    await initCache();
    return { ...memoryCache };
  },

  getRequest(orderId: number | string): VehicleRequestItem | null {
    const key = String(orderId);
    return memoryCache[key] || null;
  },

  async submitRequest(item: {
    orderId: number | string;
    carType: string;
    carName?: string;
    carId?: number | string;
    driverId?: number | string;
    driverName?: string;
  }): Promise<VehicleRequestItem> {
    await initCache();
    const key = String(item.orderId);
    const newItem: VehicleRequestItem = {
      orderId: item.orderId,
      carType: item.carType,
      carName: item.carName || item.carType,
      carId: item.carId,
      driverId: item.driverId,
      driverName: item.driverName,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    memoryCache[key] = newItem;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
    } catch (e) {
      console.error('Error saving vehicle request', e);
    }
    notifyListeners();
    return newItem;
  },

  async approveRequest(orderId: number | string, notes?: string): Promise<VehicleRequestItem | null> {
    await initCache();
    const key = String(orderId);
    const existing = memoryCache[key] || {
      orderId,
      carType: 'SUV',
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    const updated: VehicleRequestItem = {
      ...existing,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      vendorNotes: notes || 'Approved by Vendor',
    };
    memoryCache[key] = updated;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
    } catch (e) {
      console.error('Error saving approved vehicle request', e);
    }
    notifyListeners();
    return updated;
  },

  async rejectRequest(orderId: number | string, reason?: string): Promise<VehicleRequestItem | null> {
    await initCache();
    const key = String(orderId);
    const existing = memoryCache[key] || {
      orderId,
      carType: 'SUV',
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    const updated: VehicleRequestItem = {
      ...existing,
      status: 'REJECTED',
      vendorNotes: reason || 'Declined by Vendor',
    };
    memoryCache[key] = updated;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
    } catch (e) {
      console.error('Error saving rejected vehicle request', e);
    }
    notifyListeners();
    return updated;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Custom React hook to reactively track the vehicle request status of an order
 */
export function useVehicleRequest(orderId: number | string | undefined) {
  const [request, setRequest] = useState<VehicleRequestItem | null>(() => {
    return orderId ? vehicleRequestService.getRequest(orderId) : null;
  });

  useEffect(() => {
    if (!orderId) return;
    setRequest(vehicleRequestService.getRequest(orderId));

    const unsubscribe = vehicleRequestService.subscribe(() => {
      setRequest(vehicleRequestService.getRequest(orderId));
    });

    return () => unsubscribe();
  }, [orderId]);

  return request;
}
