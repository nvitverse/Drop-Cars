// Dedicated client for the website's core Tariffs mirror
// (public_html/api/admin-app-tariffs.php) - same auth pattern as the other
// website-side mirrors. Deliberately covers only the core per-vehicle-type
// rate/bata fields, not the dynamic/promo-pricing layer (date-range
// scheduling) - that stays website-only.

const WEBSITE_API_BASE = 'https://dropcars.in/api';
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface WebsiteTariff {
  id: number;
  vehicle_type: string;
  per_km_rate: number;
  driver_beta: number;
  trip_type: 'oneway' | 'round';
  passengers: number;
  luggage: number;
  is_ac: boolean;
  vehicle_model: string;
}

class TariffsApiService {
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

  async list(): Promise<{ success: boolean; tariffs: WebsiteTariff[] }> {
    return this.request('/admin-app-tariffs.php');
  }

  async save(tariff: Partial<WebsiteTariff> & { vehicle_type: string; per_km_rate: number }): Promise<{ success: boolean; message?: string }> {
    return this.request('/admin-app-tariffs.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'add_or_update', ...tariff }),
    });
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.request('/admin-app-tariffs.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  async getAirportTaxiTariffs(): Promise<{ success: boolean; airporttaxi_tariffs: any }> {
    return this.request('/admin-app-tariffs.php?type=airporttaxi');
  }

  async saveAirportTaxiTariffs(data: any): Promise<{ success: boolean; message?: string }> {
    return this.request('/admin-app-tariffs.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_airporttaxi_tariffs', airporttaxi_tariffs: data }),
    });
  }
}

export const tariffsApi = new TariffsApiService();
