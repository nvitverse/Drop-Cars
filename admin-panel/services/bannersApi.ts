// Dedicated client for the website's Banners mirror
// (public_html/api/admin-app-banners.php) - same auth pattern as the other
// website-side mirrors (a static shared key, not the admin JWT).

const WEBSITE_API_BASE = 'https://dropcars.in/api';
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface WebsiteBanner {
  id: number;
  type: 'image' | 'text';
  content: string;
  link_url: string;
  coupon_code: string;
  is_popup: boolean;
  is_active: boolean;
  created_at: string | null;
}

class BannersApiService {
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

  async list(): Promise<{ success: boolean; banners: WebsiteBanner[] }> {
    return this.request('/admin-app-banners.php');
  }

  async save(banner: Partial<WebsiteBanner> & { content: string }): Promise<{ success: boolean; message?: string; id?: number }> {
    return this.request('/admin-app-banners.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'add_or_update', ...banner }),
    });
  }

  async toggle(id: number, isActive: boolean): Promise<{ success: boolean }> {
    return this.request('/admin-app-banners.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'toggle', id, is_active: isActive }),
    });
  }

  async remove(id: number): Promise<{ success: boolean }> {
    return this.request('/admin-app-banners.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
  }

  async getFestivalSettings(): Promise<{ success: boolean; festival: any }> {
    return this.request('/admin-app-banners.php?type=festival');
  }

  async saveFestivalSettings(festival: any): Promise<{ success: boolean; message?: string }> {
    return this.request('/admin-app-banners.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_festival', festival }),
    });
  }
}

export const bannersApi = new BannersApiService();
