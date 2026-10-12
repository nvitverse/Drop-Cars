import { HelpEntry } from './types';

export const VENDOR_HELP_CATALOG: Record<string, HelpEntry> = {
  DC_ORDER_UNACCEPTED: {
    code: 'DC_ORDER_UNACCEPTED',
    title: 'Trip Dispatching in Progress',
    what: 'Your posted customer booking has not been accepted by a driver yet.',
    why: 'The booking is actively broadcast to nearby vehicle owners and duty drivers in the departure city.',
    steps: [
      'Orders are broadcast within a 50 km radius of the pickup location.',
      'If the pickup time is urgent, consider adjusting the driver payout rate.',
      'Our central dispatch team also monitors unaccepted rides actively.',
    ],
    severity: 'warning',
    contact: true,
  },

  DC_VENDOR_CREDIT_COMMISSION: {
    code: 'DC_VENDOR_CREDIT_COMMISSION',
    title: 'Commission & Credit Rules',
    what: 'How platform commission and vendor margin are settled.',
    why: 'Transparent accounting ensures vendor profits are credited directly upon trip completion.',
    steps: [
      'Vendor commission is credited immediately once the customer OTP and final odometer are verified.',
      'Check the Accounts tab for line-by-line settlement breakdowns.',
      'Invoices are generated with full GST breakdowns.',
    ],
    severity: 'info',
    contact: false,
  },

  DC_VENDOR_PAYOUT: {
    code: 'DC_VENDOR_PAYOUT',
    title: 'Vendor Settlement & Payout',
    what: 'Timeline and verification for vendor wallet withdrawals.',
    why: 'Payouts are cleared via NEFT / IMPS / UPI daily.',
    steps: [
      'Withdrawals requested before 2 PM are settled same-day.',
      'Ensure bank account IFSC and beneficiary name match your vendor registration.',
      'For large batch payouts, contact our accounts manager directly.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_VENDOR_DOC_REJECTED: {
    code: 'DC_VENDOR_DOC_REJECTED',
    title: 'Fleet Document Verification',
    what: 'A vehicle or commercial permit document requires attention.',
    why: 'Commercial taxi compliance requires valid Taxi Badge, Tourist Permit, and Insurance.',
    steps: [
      'Open Fleet Management > Documents to view the flagged item.',
      'Upload a clear scan showing the validity date and vehicle registration number.',
      'Review usually completes within 1 hour.',
    ],
    severity: 'warning',
    contact: true,
  },

  DC_FIRST_REFUSAL: {
    code: 'DC_FIRST_REFUSAL',
    title: 'Priority First-Refusal Window',
    what: 'Exclusive booking notification window for partner fleets.',
    why: 'High-rated vendor fleets receive a 60-second priority window to accept matching bookings before public broadcast.',
    steps: [
      'Accept within the countdown timer to lock the ride for your fleet.',
      'Assign an active car and driver before pickup time.',
    ],
    severity: 'info',
    contact: false,
  },
};

export function getVendorHelpEntry(codeOrDetail?: string | null): HelpEntry {
  if (!codeOrDetail) return VENDOR_HELP_CATALOG.DC_ORDER_UNACCEPTED;
  if (VENDOR_HELP_CATALOG[codeOrDetail]) return VENDOR_HELP_CATALOG[codeOrDetail];

  const s = String(codeOrDetail).toLowerCase();
  if (s.includes('order') || s.includes('unaccepted') || s.includes('driver')) return VENDOR_HELP_CATALOG.DC_ORDER_UNACCEPTED;
  if (s.includes('commission') || s.includes('credit')) return VENDOR_HELP_CATALOG.DC_VENDOR_CREDIT_COMMISSION;
  if (s.includes('payout') || s.includes('settlement')) return VENDOR_HELP_CATALOG.DC_VENDOR_PAYOUT;
  if (s.includes('document') || s.includes('permit') || s.includes('rejected')) return VENDOR_HELP_CATALOG.DC_VENDOR_DOC_REJECTED;

  return VENDOR_HELP_CATALOG.DC_ORDER_UNACCEPTED;
}
