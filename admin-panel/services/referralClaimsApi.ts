// Dedicated client for the website's customer reward-redemption claims
// (public_html/api/admin-app-referral-claims.php) - same auth pattern as
// the other website-side mirrors (a static shared key, not the admin JWT).

const WEBSITE_API_BASE = 'https://dropcars.in/api';
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export interface ReferralClaim {
  id: number;
  customer_name: string;
  customer_phone: string;
  amount: number;
  redeem_code: string;
  status: 'pending' | 'claimed';
  created_at: string;
}

class ReferralClaimsApiService {
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

  async list(status: 'pending' | 'claimed' | 'all' = 'pending'): Promise<{ success: boolean; claims: ReferralClaim[] }> {
    return this.request(`/admin-app-referral-claims.php?status=${status}`);
  }

  async markClaimed(id: number): Promise<{ success: boolean }> {
    return this.request('/admin-app-referral-claims.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'mark_claimed', id }),
    });
  }
}

export const referralClaimsApi = new ReferralClaimsApiService();
