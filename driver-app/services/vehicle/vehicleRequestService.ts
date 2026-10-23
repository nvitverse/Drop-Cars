import { useState, useEffect } from 'react';
import axiosInstance from '@/app/api/axiosInstance';

/**
 * "Request for my car": a fleet without the booking's exact vehicle type offers another car of its own.
 * The SERVER is the only truth now (it used to be a phone-only marker, so a request the server refused still showed as "Requested"
 * and the poster / office never saw anything). The booking's poster or the office approves; approval is a pass - the driver then accepts
 * the booking the normal way (wallet hold as usual, and he is told how much to recharge if he is short).
 */
export interface VehicleRequestItem {
  orderId: number | string;
  requestId?: number;
  carId?: number | string;
  carName?: string;
  carType: string;
  driverId?: number | string;
  driverName?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  approvedAt?: string;
  vendorNotes?: string;
  /** rupees still to recharge when it was approved (0 = the wallet already covers the hold) */
  fundsNeeded?: number;
  requiredHold?: number;
  decidedBy?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let memoryCache: Record<string, VehicleRequestItem> = {};
let lastRefreshAt = 0;

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Error in vehicleRequest listener', e);
    }
  });
};

const messageOf = (e: any): string => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return e?.message || 'Could not send the request. Please try again.';
};

export const vehicleRequestService = {
  /** Pull the fleet's requests from the server (PENDING, REJECTED and approved-but-not-yet-accepted). */
  async refresh(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastRefreshAt < 8000) return;
    lastRefreshAt = now;
    try {
      const res = await axiosInstance.get('/api/orders/vehicle-owner/substitution-requests', { noCache: true } as any);
      const next: Record<string, VehicleRequestItem> = {};
      for (const r of Array.isArray(res?.data) ? res.data : []) {
        const status = String(r.request_status || 'PENDING').toUpperCase() as VehicleRequestItem['status'];
        next[String(r.order_id)] = {
          orderId: r.order_id,
          requestId: r.request_id,
          carType: r.offered_car_type || r.required_car_type,
          carName: r.assigned_car_name || r.offered_car_type,
          driverName: r.assigned_driver_name,
          status,
          requestedAt: r.created_at,
          approvedAt: status === 'APPROVED' ? r.decided_at : undefined,
          vendorNotes: r.admin_notes || undefined,
          fundsNeeded: r.funds_needed ?? undefined,
          requiredHold: r.required_hold ?? undefined,
          decidedBy: r.decided_by_name || r.decided_by_kind || undefined,
        };
      }
      memoryCache = next;
      notifyListeners();
    } catch {
      // offline / server hiccup: keep what we have
    }
  },

  async getAll(): Promise<Record<string, VehicleRequestItem>> {
    return { ...memoryCache };
  },

  getRequest(orderId: number | string): VehicleRequestItem | null {
    return memoryCache[String(orderId)] || null;
  },

  hasPending(): boolean {
    return Object.values(memoryCache).some((r) => r.status === 'PENDING');
  },

  /** Send the request to the server. Throws with the server's own reason (expired document, not enough seats, no driver chosen ...). */
  async submitRequest(item: {
    orderId: number | string;
    carType: string;
    carName?: string;
    carId?: number | string;
    driverId?: number | string;
    driverName?: string;
  }): Promise<VehicleRequestItem> {
    if (!item.carId) throw new Error('Choose the car you want to offer.');
    try {
      await axiosInstance.post('/api/assignments/car-substitution-request', {
        order_id: Number(item.orderId),
        car_id: String(item.carId),
        driver_id: item.driverId ? String(item.driverId) : undefined,
      });
    } catch (e: any) {
      throw new Error(messageOf(e));
    }
    const created: VehicleRequestItem = {
      orderId: item.orderId,
      carType: item.carType,
      carName: item.carName || item.carType,
      carId: item.carId,
      driverId: item.driverId,
      driverName: item.driverName,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    memoryCache[String(item.orderId)] = created;
    notifyListeners();
    this.refresh(true);
    return created;
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
