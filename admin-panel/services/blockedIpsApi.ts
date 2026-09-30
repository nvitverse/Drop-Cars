// Dedicated client for the website's Blocked IPs mirror
// (public_html/api/admin-app-blocked-ips.php) - same auth pattern as
// enquiriesApi.ts/couponsApi.ts (a static shared key, not the admin JWT).

const WEBSITE_API_BASE = 'https://dropcars.in/api';
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface BlockedIp {
  id: number;
  ip_address: string;
  reason: string;
  blocked_at: string | null;
}

class BlockedIpsApiService {
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

  async list(): Promise<{ success: boolean; total_count: number; blocked_ips: BlockedIp[] }> {
    return this.request('/admin-app-blocked-ips.php');
  }

  async block(ipAddress: string, reason?: string): Promise<{ success: boolean }> {
    return this.request('/admin-app-blocked-ips.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'block', ip_address: ipAddress, reason }),
    });
  }

  async unblock(id: number): Promise<{ success: boolean }> {
    return this.request('/admin-app-blocked-ips.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'unblock', id }),
    });
  }
}

export const blockedIpsApi = new BlockedIpsApiService();
