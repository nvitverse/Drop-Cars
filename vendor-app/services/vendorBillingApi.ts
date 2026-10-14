import api from '../app/api/api';

// Invoices & estimates in the vendor's own name (backend: api/routes/vendor_billing.py). The server does every total, so the app, the PDF and
// the customer's link can never disagree.
export interface BillLine { label: string; amount: number; kind?: 'FARE' | 'CHARGE'; included?: boolean; note?: string | null }
export interface BillTotals {
  gross: number; discount: number; subtotal: number; taxable_value: number; gst_amount: number; cgst: number; sgst: number; igst: number;
  total_amount: number; amount_due: number; paid_amount: number; balance_due: number; payable_now: number; advance_requested: number;
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
}
export interface BusinessProfile {
  id: string; name: string; legal_name?: string | null; tagline?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null;
  address?: string | null; state?: string | null; state_code?: string | null; gstin?: string | null; pan?: string | null; gst_rate: number;
  gst_applies_to: 'KM_FARE' | 'ALL'; invoice_prefix: string; estimate_prefix: string; bank_account_name?: string | null; bank_name?: string | null;
  bank_account_number?: string | null; bank_ifsc?: string | null; upi_id?: string | null; terms_invoice?: string | null; terms_estimate?: string | null;
  footer_note?: string | null; signatory?: string | null; primary_color?: string | null; estimate_valid_days: number; advance_percent: number; gst_registered: boolean;
}
export interface BillDoc {
  id: string; doc_type: 'INVOICE' | 'ESTIMATE'; number: string; status: string; payment_status: string; date?: string | null; booking_ref?: string | null;
  customer: { name?: string; phone?: string; email?: string; gstin?: string; company?: string; address?: string; state?: string };
  trip: Record<string, any>; lines: BillLine[];
  gst: { mode: 'NONE' | 'EXTRA' | 'INCLUDED'; rate: number; collection: 'COLLECT' | 'SHOW_ONLY'; applies_to: string; interstate: boolean };
  discount: number; discount_label?: string | null; advance_requested: number; totals: BillTotals; payments: any[]; valid_until?: string | null;
  notes?: string | null; terms?: string; brand: Partial<BusinessProfile>; converted_to_id?: string | null; cancel_reason?: string | null; history: any[];
}
export interface BillRow {
  id: string; doc_type: string; number: string; status: string; payment_status: string; customer_name?: string; customer_phone?: string;
  booking_ref?: string; total_amount: number; balance_due: number; paid_amount: number; created_at?: string; valid_until?: string | null;
}
export interface BillOptions {
  enabled?: boolean; standard_charges: { label: string; kind: string }[]; gst_modes: { key: string; label: string }[]; gst_registered: boolean; gst_rate: number;
  gst_collections: { key: string; label: string }[]; payment_modes: string[];
}

const B = '/users/vendor/billing';

export const vendorBilling = {
  profile: (): Promise<BusinessProfile> => api.get(`${B}/profile`).then((r) => r.data),
  saveProfile: (p: Partial<BusinessProfile>): Promise<BusinessProfile> => api.put(`${B}/profile`, p).then((r) => r.data),
  options: (): Promise<BillOptions> => api.get(`${B}/options`).then((r) => r.data),
  summary: (): Promise<{ invoices: number; estimates: number; drafts: number; billed: number; to_collect: number; collected: number }> => api.get(`${B}/summary`).then((r) => r.data),
  prefill: (ref: string): Promise<any> => api.get(`${B}/prefill`, { params: { ref } }).then((r) => r.data),
  calc: (body: any): Promise<BillTotals> => api.post(`${B}/calc`, body).then((r) => r.data),
  list: (q: { doc_type?: string; status?: string; search?: string } = {}): Promise<BillRow[]> => api.get(`${B}/documents`, { params: q }).then((r) => r.data),
  get: (id: string): Promise<BillDoc> => api.get(`${B}/documents/${id}`).then((r) => r.data),
  create: (b: any): Promise<BillDoc> => api.post(`${B}/documents`, b).then((r) => r.data),
  update: (id: string, b: any): Promise<BillDoc> => api.put(`${B}/documents/${id}`, b).then((r) => r.data),
  issue: (id: string): Promise<BillDoc> => api.post(`${B}/documents/${id}/issue`).then((r) => r.data),
  cancel: (id: string, reason: string): Promise<BillDoc> => api.post(`${B}/documents/${id}/cancel`, { reason }).then((r) => r.data),
  convert: (id: string): Promise<BillDoc> => api.post(`${B}/documents/${id}/convert`).then((r) => r.data),
  addPayment: (id: string, b: { amount: number; mode: string; ref?: string; note?: string }): Promise<BillDoc> => api.post(`${B}/documents/${id}/payments`, b).then((r) => r.data),
  removePayment: (id: string, pid: string): Promise<BillDoc> => api.delete(`${B}/documents/${id}/payments/${pid}`).then((r) => r.data),
  share: (id: string): Promise<{ public_url: string; pdf_url: string; message: string; phone?: string | null; whatsapp_url?: string | null }> =>
    api.get(`${B}/documents/${id}/share`).then((r) => r.data),
};
