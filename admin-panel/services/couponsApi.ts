// Dedicated client for the website's Coupons/Promotions mirror
// (public_html/api/admin-app-coupons.php on the separate PHP/MySQL website
// codebase) - NOT the FastAPI backend api.ts talks to. Same auth pattern as
// enquiriesApi.ts (a static shared key, not the admin JWT).

const WEBSITE_API_BASE = 'https://dropcars.in/api';
// Must match ADMIN_APP_API_KEY in the website's config/env.php - same key
// enquiriesApi.ts uses.
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface WebsiteCoupon {
  id: number;
  title: string;
  code: string;
  discount_type: 'flat' | 'percentage';
  discount_value: number;
  expiry_date: string | null;
  apply_to_trip_type: 'all' | 'one_way' | 'round_trip' | 'hourly_rental';
  min_booking_amount: number;
  is_active: boolean;
  created_at: string | null;
}

export interface CouponListResponse {
  success: boolean;
  total_count: number;
  page: number;
  total_pages: number;
  coupons: WebsiteCoupon[];
  message?: string;
}

class CouponsApiService {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${WEBSITE_API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-App-Key': ADMIN_APP_KEY,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || `Request failed (${response.status})`);
    }
    return data as T;
  }

  async list(page: number = 1): Promise<CouponListResponse> {
    return this.request<CouponListResponse>(`/admin-app-coupons.php?page=${page}`);
  }

  async save(coupon: Partial<WebsiteCoupon> & { title: string; code: string }): Promise<{ success: boolean; message?: string; id?: number }> {
    return this.request(`/admin-app-coupons.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'add_or_update', ...coupon }),
    });
  }

  async toggle(id: number, isActive: boolean): Promise<{ success: boolean }> {
    return this.request(`/admin-app-coupons.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'toggle', id, is_active: isActive }),
    });
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.request(`/admin-app-coupons.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }
}

export const couponsApi = new CouponsApiService();
