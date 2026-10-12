import { HelpEntry } from './types';

export const CUSTOMER_HELP_CATALOG: Record<string, HelpEntry> = {
  DC_NO_DRIVER_YET: {
    code: 'DC_NO_DRIVER_YET',
    title: 'Finding Your Driver',
    what: 'We are matching your ride request with nearby verified drivers.',
    why: 'During peak hours or for long outstation routes, top-rated drivers in your route zone are contacted sequentially.',
    steps: [
      'Please keep the app open — most rides are confirmed within 2 to 4 minutes.',
      'You will receive an instant push notification and SMS once a driver accepts.',
      'If you are in an urgent hurry, tap "Raise Fare" to offer a driver priority bonus.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_DRIVER_DELAYED: {
    code: 'DC_DRIVER_DELAYED',
    title: 'Driver Arrival Update',
    what: 'Your driver is en route but might be navigating traffic.',
    why: 'City traffic conditions or highway diversions can occasionally cause slight arrival delays.',
    steps: [
      'Check the live GPS map to see your driver’s real-time position.',
      'Tap the Call Driver button to check estimated arrival time.',
      'Your booking remains active and guaranteed.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_CUSTOMER_OTP_INFO: {
    code: 'DC_CUSTOMER_OTP_INFO',
    title: 'Start Trip OTP',
    what: 'Your 4-digit secret OTP ensures your assigned cab is verified.',
    why: 'Share this 4-digit code with the driver only after you board the vehicle and inspect the opening odometer.',
    steps: [
      'Your OTP is clearly shown on the active booking screen.',
      'Only share it in person with the driver when seated inside.',
      'Never share OTP over the phone before the cab reaches you.',
    ],
    severity: 'info',
    contact: false,
  },

  DC_PAYMENT_PENDING: {
    code: 'DC_PAYMENT_PENDING',
    title: 'Payment Status & Verification',
    what: 'Your payment is being confirmed with the bank gateway.',
    why: 'UPI and banking servers occasionally take up to 60 seconds to return transaction confirmation.',
    steps: [
      'Do not make a second payment — your money is safe.',
      'If amount was debited, your booking or wallet will update automatically.',
      'In rare failed transactions, banks auto-refund to original account in 24-48 hours.',
    ],
    severity: 'warning',
    contact: true,
  },

  DC_FARE_DIFFERENCE: {
    code: 'DC_FARE_DIFFERENCE',
    title: 'Fare & Inclusions Breakdown',
    what: 'Understand your trip fare, tolls, and taxes clearly.',
    why: 'Drop Cars follows 100% transparent pricing without hidden surge fees.',
    steps: [
      'Base KM package includes driver allowance and vehicle fuel for the committed km.',
      'Tolls, interstate permits, and airport parking are paid at actuals unless marked included.',
      'Closing odometer km above package is billed at the clear per-km rate shown on your estimate.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_REFUND_STATUS: {
    code: 'DC_REFUND_STATUS',
    title: 'Refund & Wallet Credit',
    what: 'Details on your cancelled ride or excess payment refund.',
    why: 'Refunds are processed automatically to your Drop Cars wallet or original payment source.',
    steps: [
      'Wallet credits are instant and available for your next booking immediately.',
      'Bank / UPI refunds take 2 to 4 business days depending on your bank.',
      'Check your Wallet transaction history for the refund reference ID.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_CANCEL_FEE: {
    code: 'DC_CANCEL_FEE',
    title: 'Cancellation Policy',
    what: 'Cancellation terms and zero-fee conditions.',
    why: 'To compensate drivers who have already travelled towards your pickup location.',
    steps: [
      'Free cancellation applies if cancelled within 5 minutes of booking.',
      'If driver has already arrived at pickup, a small standard compensation fee applies.',
      'Tap support if your trip had exceptional circumstances.',
    ],
    severity: 'info',
    contact: true,
  },

  DC_CUSTOMER_SUPPORT: {
    code: 'DC_CUSTOMER_SUPPORT',
    title: '24x7 Customer Support',
    what: 'Connect directly with our operations and dispatch desk.',
    why: 'We are here to assist with booking modifications, lost items, and outstation inquiries.',
    steps: [
      'Tap "Call Support" for immediate telephonic assistance.',
      'Tap "WhatsApp" to chat with customer care agents.',
    ],
    severity: 'info',
    contact: true,
  },
};

export function getCustomerHelpEntry(codeOrDetail?: string | null): HelpEntry {
  if (!codeOrDetail) return CUSTOMER_HELP_CATALOG.DC_CUSTOMER_SUPPORT;
  if (CUSTOMER_HELP_CATALOG[codeOrDetail]) return CUSTOMER_HELP_CATALOG[codeOrDetail];

  const s = String(codeOrDetail).toLowerCase();
  if (s.includes('wait') || s.includes('driver') || s.includes('finding')) return CUSTOMER_HELP_CATALOG.DC_NO_DRIVER_YET;
  if (s.includes('delay') || s.includes('late')) return CUSTOMER_HELP_CATALOG.DC_DRIVER_DELAYED;
  if (s.includes('otp')) return CUSTOMER_HELP_CATALOG.DC_CUSTOMER_OTP_INFO;
  if (s.includes('pay') || s.includes('upi') || s.includes('failed')) return CUSTOMER_HELP_CATALOG.DC_PAYMENT_PENDING;
  if (s.includes('fare') || s.includes('toll') || s.includes('tax')) return CUSTOMER_HELP_CATALOG.DC_FARE_DIFFERENCE;
  if (s.includes('refund')) return CUSTOMER_HELP_CATALOG.DC_REFUND_STATUS;
  if (s.includes('cancel')) return CUSTOMER_HELP_CATALOG.DC_CANCEL_FEE;

  return CUSTOMER_HELP_CATALOG.DC_CUSTOMER_SUPPORT;
}
