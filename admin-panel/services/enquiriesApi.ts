// Dedicated client for the website's Enquiry Management mirror
// (public_html/api/admin-app-enquiries.php on the separate PHP/MySQL
// website codebase) - NOT the FastAPI backend api.ts talks to. Different
// domain, different auth (a static shared key, not the admin JWT).

import { alertHealth } from './alertHealth';
import { isFutureLead } from '@/utils/performance';

const WEBSITE_API_BASE = 'https://dropcars.in/api';
// Must match ADMIN_APP_API_KEY in the website's config/env.php.
const ADMIN_APP_KEY = '853c85a3cce0431aacea03c4f121d4f5b081063f8d1bad12ee254c784c529dc5';

export const WEBSITE_BRANDS = [
  { id: 'all', name: 'All Brands', domain: 'all' },
  { id: 'dropcars', name: 'Drop Cars', domain: 'dropcars.in' },
  { id: '24droptaxi', name: '24 Drop Taxi', domain: '24drop-taxi.in' },
  { id: 'tatataxi', name: 'Tata Taxi', domain: 'tatataxi.in' },
  { id: 'tatacalltaxi', name: 'Tata Call Taxi', domain: 'tatacalltaxi.in' },
  { id: 'yellowboard', name: 'Yellow Board', domain: 'yellowboard.in' },
  { id: 'arunachala', name: 'Arunachala Travels', domain: 'arunachalatravels.in' },
  { id: 'mukiltravels', name: 'Mukil Travels', domain: 'mukiltravels.in' },
];

// Quick-pick reasons for the "Responded" action on a Not Responded lead -
// each just sets `lead_stage` (+ is_touched=1) via saveStage() below, so
// staff can log WHY a lead moved to Responded without typing a note every
// time, and the Responded tab can filter by these later. "Fake enquiry"
// is deliberately NOT here - it reuses the existing dedicated 'fake'
// action instead (hides it from both tabs entirely, not just Responded).
export const RESPONSE_REASONS = [
  { key: 'awaiting_confirmation', label: 'Awaiting customer confirmation' },
  { key: 'reschedule_requested', label: 'Reschedule requested' },
  { key: 'confirming_soon', label: 'Will confirm shortly' },
  { key: 'invalid_number', label: 'Invalid / wrong number' },
];

export const CAB_CLASSES = [
  { id: 'BUDGET', label: '🟢 Budget (Economy)', color: '#10B981', badge: 'Mini/Hatchback' },
  { id: 'FLEXI_BID', label: '🟡 Flexi-Fare (Bidding)', color: '#F59E0B', badge: 'Negotiable' },
  { id: 'PREMIUM', label: '🔷 Comfort (Premium)', color: '#3B82F6', badge: 'Sedan/SUV' },
  { id: 'ELITE', label: '👑 Elite (Luxury)', color: '#EC4899', badge: 'Innova Crysta' },
];

export interface WebsiteEnquiry {
  id: number;
  booking_id: string | null;
  name: string | null;
  phone: string | null;
  pickup: string | null;
  drop_location: string | null;
  trip_type: string | null;
  vehicle_type: string | null;
  class_tier?: 'BUDGET' | 'FLEXI_BID' | 'PREMIUM' | 'ELITE' | null;
  travel_date: string | null;
  travel_time: string | null;
  fare_estimate: number | null; // customer price
  extra_charges?: number | null; // customer price, on top of fare_estimate
  cost_per_km?: number | null; // driver price - what the Driver/Vendor App shows
  extra_cost_per_km?: number | null; // driver price, on top of cost_per_km
  include_gst?: boolean;
  gst_percent?: number;
  gst_amount?: number;
  status: string | null;
  booking_status: string | null;
  website: string | null;
  source: string | null;
  dispatcher_notes: string | null;
  assigned_dispatcher: string | null;
  followup_time: string | null;
  lead_stage: string | null;
  is_touched: boolean;
  acknowledged_at?: string | null;
  response_time_seconds?: number | null;
  acknowledged_by?: string | null;
  created_at: string | null;
}

export interface EnquiryListResponse {
  success: boolean;
  tab: 'not_responded' | 'responded';
  counts: { not_responded: number; responded: number };
  total_count: number;
  page: number;
  total_pages: number;
  enquiries: WebsiteEnquiry[];
  message?: string;
}

class EnquiriesApiService {
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

  async list(params: { tab: 'not_responded' | 'responded'; website?: string; search?: string; page?: number; stage?: string }): Promise<EnquiryListResponse> {
    const q = new URLSearchParams();
    q.set('tab', params.tab);
    q.set('website', params.website || 'all');
    if (params.search) q.set('search', params.search);
    if (params.stage) q.set('stage', params.stage);
    q.set('page', String(params.page || 1));
    return this.request<EnquiryListResponse>(`/admin-app-enquiries.php?${q.toString()}`);
  }

  async action(id: number, action: string, extra: Record<string, any> = {}): Promise<{ success: boolean; message?: string; booking_id?: string }> {
    return this.request(`/admin-app-enquiries.php`, {
      method: 'POST',
      body: JSON.stringify({ id, action, ...extra }),
    });
  }

  // NOTE: there is deliberately no "acknowledgeEnquiry" here anymore.
  // "I Acknowledge" on the alarm popup (EnquiryAlarmHost) only silences
  // the alarm for that lead on this device - it does NOT mark the lead as
  // responded (an earlier version wired it to 'mark_touched', which
  // wrongly moved a merely-seen lead into the Responded tab; fixed
  // 2026-09-04). Actually responding uses saveStage() below, which is
  // the real is_touched=1 action, backed by a reason.
  async saveStage(id: number, stage: string): Promise<{ success: boolean; message?: string }> {
    return this.action(id, 'save_stage', { stage });
  }

  async customizeBooking(id: number, data: {
    pickup?: string;
    drop_location?: string;
    trip_type?: string;
    vehicle_type?: string;
    travel_date?: string;
    travel_time?: string;
    fare_estimate?: number; // customer price
    extra_charges?: number; // customer price, on top of fare_estimate
    cost_per_km?: number; // driver price - what the Driver/Vendor App shows
    extra_cost_per_km?: number; // driver price, on top of cost_per_km
    include_gst?: boolean;
    gst_percent?: number;
    gst_amount?: number;
    notes?: string;
  }): Promise<{ success: boolean; message?: string }> {
    return this.action(id, 'customize_booking', data);
  }

  async createLead(data: {
    name: string;
    phone: string;
    pickup: string;
    drop_location: string;
    trip_type?: string;
    vehicle_type?: string;
    travel_date?: string;
    travel_time?: string;
    fare_estimate?: number;
    advance_requested?: number;
    notes?: string;
    website?: string;
  }): Promise<{ success: boolean; message?: string; id?: number; enquiry?: WebsiteEnquiry }> {
    return this.request(`/admin-app-enquiries.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'create_lead', ...data }),
    });
  }

  async fetchUnacknowledgedResult(): Promise<{ success: boolean; enquiries: WebsiteEnquiry[]; error?: string }> {
    try {
      const res = await this.list({ tab: 'not_responded', page: 1 });
      const unack = (res.enquiries || []).filter((e: any) => {
        const isTouched = Boolean(e.is_touched) || e.is_touched === 1 || e.is_touched === '1' || String(e.is_touched).toLowerCase() === 'true';
        const hasAck = !!e.acknowledged_at && e.acknowledged_at !== '0000-00-00 00:00:00' && e.acknowledged_at !== 'null';
        return !isTouched && !hasAck;
      });
      alertHealth.recordPollSuccess(unack.length);
      return { success: true, enquiries: unack };
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      alertHealth.recordPollError(errMsg);
      return { success: false, enquiries: [], error: errMsg };
    }
  }

  async getUnacknowledgedEnquiries(): Promise<WebsiteEnquiry[]> {
    const result = await this.fetchUnacknowledgedResult();
    return result.enquiries;
  }

  // Registers this device's Expo push token with the WEBSITE codebase
  async registerPushToken(token: string, deviceLabel: string = ''): Promise<{ success: boolean }> {
    return this.request(`/admin-app-enquiries.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'register_push_token', token, device_label: deviceLabel }),
    });
  }

  // Fetch count of leads with future travel dates that require follow-up
  async getFutureLeadsCount(): Promise<number> {
    try {
      const [notResp, resp] = await Promise.allSettled([
        this.list({ tab: 'not_responded', page: 1 }),
        this.list({ tab: 'responded', page: 1 }),
      ]);
      const notRespList = notResp.status === 'fulfilled' ? (notResp.value?.enquiries || []) : [];
      const respList = resp.status === 'fulfilled' ? (resp.value?.enquiries || []) : [];

      const combined = [...notRespList, ...respList];
      const seen = new Set<number>();
      let count = 0;

      for (const e of combined) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          // Check if future travel date and not converted to booking
          if (isFutureLead(e.travel_date) && !e.booking_id && e.lead_stage !== 'cancelled' && e.lead_stage !== 'fake') {
            count++;
          }
        }
      }
      return count;
    } catch {
      return 0;
    }
  }
}

export const enquiriesApi = new EnquiriesApiService();
