// Client for the website's optimisation settings (public_html/api/admin-app-site-settings.php) - same shared-key pattern as the other
// website-side mirrors (banners, coupons, blocked IPs). These are the values the website's booking flow really reads (advance payment,
// night / holiday surcharge, toll estimate, minimum fare, luggage / pet / peak surcharges, referral reward).

const WEBSITE_API_BASE = 'https://dropcars.in/api';
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface WebsiteSiteSettings {
  advancePaymentPercent: number;
  advancePaymentMin: number;
  advancePaymentUpi: string;
  nightSurchargePercent: number;
  holidaySurchargePercent: number;
  tollEstimatePerKm: number;
  minFareFloor: number;
  luggageSurcharge: number;
  petSurcharge: number;
  peakHourSurcharge: number;
  referralRewardAmount: number;
}

class SiteSettingsApiService {
  private async request<T>(options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${WEBSITE_API_BASE}/admin-app-site-settings.php`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Admin-App-Key': ADMIN_APP_KEY, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 404) throw new Error('The website settings service is not installed on the website yet.');
    if (!response.ok || data?.success === false) throw new Error(data?.message || `Request failed (${response.status})`);
    return data as T;
  }

  async get(): Promise<WebsiteSiteSettings> {
    const res = await this.request<{ success: boolean; settings: WebsiteSiteSettings }>();
    return res.settings;
  }

  async save(settings: Partial<WebsiteSiteSettings>): Promise<string> {
    const res = await this.request<{ success: boolean; message?: string }>({ method: 'POST', body: JSON.stringify(settings) });
    return res.message || 'Website settings saved';
  }
}

export const siteSettingsApi = new SiteSettingsApiService();
