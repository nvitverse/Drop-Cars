import AsyncStorage from '@react-native-async-storage/async-storage';

const getAdminBaseUrl = (): string => {
  if (typeof window !== 'undefined' && !!window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8000/api';
  }
  return 'https://drop-cars-api-207918408785.asia-south2.run.app/api';
};

const BASE_URL = getAdminBaseUrl();

export interface CrmLead {
  id: string;
  name: string | null;
  phone: string;
  pickup_location: string | null;
  drop_location: string | null;
  pickup_date: string | null;
  source: string;
  status: string;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmMetricsSummary {
  today_calls_count: number;
  total_leads_count: number;
  new_leads_count: number;
  converted_leads_count: number;
}

export interface CrmLeadsResponse {
  total: number;
  leads: CrmLead[];
  metrics_summary: CrmMetricsSummary;
}

export interface OwnerFinancials {
  monthly_ad_budget: number;
  total_leads: number;
  converted_leads: number;
  total_calls: number;
  ad_calls: number;
  web_calls: number;
  cost_per_lead: number;
  cost_per_conversion: number;
}

export interface CrmSettingsData {
  id?: string;
  webhook_secret_key: string;
  monthly_ad_budget: number;
  google_ads_customer_id: string | null;
}

class CrmApiService {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await AsyncStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getLeads(status?: string, source?: string, search?: string): Promise<CrmLeadsResponse> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (status && status !== 'All') params.append('status', status);
    if (source && source !== 'All') params.append('source', source);
    if (search) params.append('search', search);

    const res = await fetch(`${BASE_URL}/crm/leads?${params.toString()}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch CRM leads');
    return res.json();
  }

  async updateLead(leadId: string, payload: { status?: string; notes?: string; assigned_to?: string }): Promise<any> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BASE_URL}/crm/leads/${leadId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update CRM lead');
    return res.json();
  }

  async convertLeadToBooking(leadId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BASE_URL}/crm/leads/${leadId}/convert`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Failed to convert lead to booking');
    return res.json();
  }

  async getOwnerFinancials(role: string = 'owner'): Promise<OwnerFinancials> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BASE_URL}/crm/owner/financials?user_role=${role}`, { headers });
    if (!res.ok) throw new Error('Access denied or failed to load financials');
    return res.json();
  }

  async getCrmSettings(role: string = 'owner'): Promise<CrmSettingsData> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BASE_URL}/crm/owner/settings?user_role=${role}`, { headers });
    if (!res.ok) throw new Error('Access denied or failed to load CRM settings');
    return res.json();
  }

  async updateCrmSettings(payload: Partial<CrmSettingsData>, role: string = 'owner'): Promise<any> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${BASE_URL}/crm/owner/settings?user_role=${role}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update CRM settings');
    return res.json();
  }

  async syncGoogleSheets(): Promise<{ success: boolean; message: string; synced_count?: number }> {
    const res = await fetch('https://dropcars.in/api/admin-app-sync-sheets.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-App-Key': '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new Error(data?.message || 'Failed to sync with Google Sheets');
    }
    return data;
  }
}

export const crmApi = new CrmApiService();
