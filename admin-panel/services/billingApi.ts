import { apiService } from './api';

// Invoices & Estimates (backend: api/routes/billing_docs.py). Everything here is plain JSON; the totals always come from the server so
// the app, the PDF and the public link can never disagree.

export interface BillingLine { label: string; amount: number; kind?: 'FARE' | 'CHARGE'; taxable?: boolean | null; included?: boolean; note?: string | null }
export interface BillingBrand {
  id: string; code: string; name: string; legal_name?: string | null; tagline?: string | null; domain?: string | null; phone?: string | null;
  whatsapp?: string | null; email?: string | null; address?: string | null; state?: string | null; state_code?: string | null; gstin?: string | null;
  pan?: string | null; sac_code?: string | null; gst_rate: number; gst_applies_to: 'KM_FARE' | 'ALL'; invoice_prefix: string; estimate_prefix: string;
  bank_account_name?: string | null; bank_name?: string | null; bank_account_number?: string | null; bank_ifsc?: string | null; bank_branch?: string | null;
  upi_id?: string | null; terms_invoice?: string | null; terms_estimate?: string | null; rules_text?: string | null; footer_note?: string | null; highlights?: string | null;
  signatory?: string | null; primary_color?: string | null; estimate_valid_days: number; advance_percent: number; payment_links_enabled: boolean;
  is_default: boolean; is_active: boolean;
}
export interface BillingTotals {
  gross: number; discount: number; subtotal: number; taxable_value: number; gst_amount: number; cgst: number; sgst: number; igst: number;
  total_amount: number; amount_due: number; paid_amount: number; balance_due: number; gst_pending: number; payable_now: number;
  advance_requested: number; payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
}
export interface BillingDoc {
  id: string; doc_type: 'INVOICE' | 'ESTIMATE'; number: string; status: string; payment_status: string; date?: string | null;
  brand: Partial<BillingBrand>; brand_id?: string | null; booking_ref?: string | null; order_id?: number | null;
  customer: { name?: string; phone?: string; email?: string; gstin?: string; company?: string; address?: string; state?: string };
  trip: Record<string, any>; lines: BillingLine[];
  gst: { mode: 'NONE' | 'EXTRA' | 'INCLUDED'; rate: number; collection: 'COLLECT' | 'SHOW_ONLY' | 'PAY_LATER'; applies_to: string; interstate: boolean; override?: number | null };
  discount: number; discount_label?: string | null; advance_requested: number; totals: BillingTotals; payments: any[]; payment_links: any[];
  valid_until?: string | null; notes?: string | null; terms?: string; terms_override?: string | null; share_token?: string | null;
  converted_from_id?: string | null; converted_to_id?: string | null; cancel_reason?: string | null; history: any[];
  created_by?: string | null; created_at?: string | null; prepared_by?: { name?: string | null; phone?: string | null };
  shared_by?: { name?: string | null; at?: string | null; detail?: string | null }[];
}
export type TariffMethod = 'KM_BATA' | 'SLAB_DROP' | 'SLAB_ROUND' | 'LOCAL' | 'DAY_RENT' | 'PACKAGE';
export interface RateCard {
  id: string; brand_id: string; method: TariffMethod; method_label: string; vehicle_key?: string | null; vehicle_name?: string | null; name?: string | null;
  params: Record<string, any>; is_active: boolean; sort_order: number;
}
export interface PricingRule {
  id: string; brand_id?: string | null; name: string; scope: 'STATE' | 'LOCATION' | 'ROUTE' | 'HILL' | 'ALL'; keywords: string[]; route_from: string[]; route_to: string[];
  match_on: 'ANY' | 'PICKUP' | 'DROP' | 'BOTH'; effect: string; effect_label?: string; value?: number | null; label?: string | null; params: Record<string, any>;
  trip_types: string[]; vehicles: string[]; valid_from?: string | null; valid_to?: string | null; auto_apply: boolean; is_active: boolean; priority: number; note?: string | null;
}
export interface RuleSuggestion {
  rule: PricingRule; matched: string[]; auto_apply: boolean; kind: 'ADJUST' | 'CHARGE'; summary: string;
  adjust?: Record<string, number>; line?: { label: string; amount: number; kind: string; included: boolean } | null;
}
export interface EstimateLinesIn {
  adjust?: Record<string, number>;
  method?: TariffMethod; rate_card_id?: string; params?: Record<string, any>; km?: number; days?: number; hours?: string; trip_type?: string; amount?: number; name?: string;
}
export interface BillingRow {
  id: string; doc_type: string; number: string; status: string; payment_status: string; customer_name?: string; customer_phone?: string;
  booking_ref?: string; brand?: string; brand_color?: string; gst_mode: string; total_amount: number; balance_due: number; paid_amount: number;
  valid_until?: string | null; created_at?: string; created_by?: string | null; created_by_phone?: string | null;
}

const j = (body: any) => ({ method: 'POST', body: JSON.stringify(body) });

export const billingApi = {
  brands: (): Promise<BillingBrand[]> => apiService.makeRequest('/admin/billing/brands'),
  createBrand: (b: Partial<BillingBrand>): Promise<BillingBrand> => apiService.makeRequest('/admin/billing/brands', j(b)),
  updateBrand: (id: string, b: Partial<BillingBrand>): Promise<BillingBrand> => apiService.makeRequest(`/admin/billing/brands/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  options: (): Promise<any> => apiService.makeRequest('/admin/billing/options'),
  prefill: (ref: string, brandId?: string): Promise<any> =>
    apiService.makeRequest(`/admin/billing/prefill?ref=${encodeURIComponent(ref)}${brandId ? `&brand_id=${brandId}` : ''}`),
  fareLines: (b: { trip_type: string; km: number; rate_per_km: number; extra_rate_per_km?: number; bata_per_day?: number; days?: number; adjust?: Record<string, number> }): Promise<{ lines: BillingLine[]; notes?: string[] }> =>
    apiService.makeRequest('/admin/billing/fare-lines', j(b)),
  calc: (b: any): Promise<BillingTotals> => apiService.makeRequest('/admin/billing/calc', j(b)),
  rateCards: (brandId?: string, includeInactive = false): Promise<RateCard[]> =>
    apiService.makeRequest(`/admin/billing/rate-cards?${brandId ? `brand_id=${brandId}&` : ''}${includeInactive ? 'include_inactive=true' : ''}`),
  createRateCard: (b: Partial<RateCard> & { brand_id: string }): Promise<RateCard> => apiService.makeRequest('/admin/billing/rate-cards', j(b)),
  updateRateCard: (id: string, b: Partial<RateCard>): Promise<RateCard> => apiService.makeRequest(`/admin/billing/rate-cards/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteRateCard: (id: string): Promise<any> => apiService.makeRequest(`/admin/billing/rate-cards/${id}`, { method: 'DELETE' }),
  estimateLines: (b: EstimateLinesIn): Promise<{ lines: BillingLine[]; notes: string[]; meta: Record<string, any>; method: TariffMethod }> =>
    apiService.makeRequest('/admin/billing/estimate-lines', j(b)),
  rules: (brandId?: string): Promise<{ rules: PricingRule[]; effects: { key: string; label: string }[]; scopes: string[] }> =>
    apiService.makeRequest(`/admin/billing/rules${brandId ? `?brand_id=${brandId}` : ''}`),
  createRule: (b: Partial<PricingRule>): Promise<PricingRule> => apiService.makeRequest('/admin/billing/rules', j(b)),
  updateRule: (id: string, b: Partial<PricingRule>): Promise<PricingRule> => apiService.makeRequest(`/admin/billing/rules/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteRule: (id: string): Promise<any> => apiService.makeRequest(`/admin/billing/rules/${id}`, { method: 'DELETE' }),
  suggestRules: (b: { brand_id?: string; pickup?: string; drop?: string; via?: string[]; trip_type?: string; days?: number; km?: number; vehicle?: string; on_date?: string; fare_total?: number }): Promise<{ suggestions: RuleSuggestion[] }> =>
    apiService.makeRequest('/admin/billing/rules/suggest', j(b)),
  staff: (): Promise<string[]> => apiService.makeRequest('/admin/billing/staff'),
  list: (q: { doc_type?: string; status?: string; brand_id?: string; search?: string; created_by?: string; skip?: number } = {}): Promise<BillingRow[]> => {
    const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return apiService.makeRequest(`/admin/billing/documents${p ? `?${p}` : ''}`);
  },
  get: (id: string): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}`),
  create: (b: any): Promise<BillingDoc> => apiService.makeRequest('/admin/billing/documents', j(b)),
  update: (id: string, b: any): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  issue: (id: string): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}/issue`, { method: 'POST' }),
  cancel: (id: string, reason: string): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}/cancel`, j({ reason })),
  convert: (id: string): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}/convert`, { method: 'POST' }),
  addPayment: (id: string, b: { amount: number; mode: string; ref?: string; note?: string; purpose?: string }): Promise<BillingDoc> =>
    apiService.makeRequest(`/admin/billing/documents/${id}/payments`, j(b)),
  removePayment: (id: string, paymentId: string): Promise<BillingDoc> => apiService.makeRequest(`/admin/billing/documents/${id}/payments/${paymentId}`, { method: 'DELETE' }),
  createLink: (id: string, purpose: string, amount?: number): Promise<{ link: any; document: BillingDoc }> =>
    apiService.makeRequest(`/admin/billing/documents/${id}/links`, j({ purpose, amount })),
  checkLinks: (id: string): Promise<{ newly_paid: number; document: BillingDoc }> => apiService.makeRequest(`/admin/billing/documents/${id}/links/check`, { method: 'POST' }),
  share: (id: string): Promise<{ public_url: string; pdf_url: string; message: string; whatsapp_url?: string | null; phone?: string | null; email_subject: string }> =>
    apiService.makeRequest(`/admin/billing/documents/${id}/share`),
};
