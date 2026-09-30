// Unified Multi-Gateway Payment Engine for Drop Cars / Mukil Travels
// Supports Razorpay, Direct UPI (0% Fee), and Direct Bank Transfer

export interface PaymentOption {
  id: 'razorpay' | 'direct_upi' | 'bank_transfer';
  name: string;
  subtitle: string;
  icon: string;
  convenienceFeePct: number;
}

export const PAYMENT_METHODS: PaymentOption[] = [
  {
    id: 'razorpay',
    name: 'Razorpay Instant Gateway',
    subtitle: 'Credit/Debit Card, Netbanking, UPI Instant Auto-Approve',
    icon: 'credit-card',
    convenienceFeePct: 2.0,
  },
  {
    id: 'direct_upi',
    name: 'Direct UPI (0% Fee)',
    subtitle: 'GPay / PhonePe / PayTM QR & UPI ID (mukiltravels@upi)',
    icon: 'qr-code',
    convenienceFeePct: 0.0,
  },
  {
    id: 'bank_transfer',
    name: 'Direct Bank Transfer (NEFT/IMPS)',
    subtitle: 'Drop Cars Bank Account (Zero Fee)',
    icon: 'building-bank',
    convenienceFeePct: 0.0,
  },
];

export const BANK_DETAILS = {
  accountName: 'Drop Cars Mobility India',
  accountNumber: '904399043901',
  ifscCode: 'HDFC0001234',
  bankName: 'HDFC Bank',
  branch: 'Chennai Main Branch',
  upiId: 'dropcars@upi',
  companyGst: '33AAACM9876A1Z4',
};

export function calculatePaymentBreakdown(baseAmount: number, methodId: 'razorpay' | 'direct_upi' | 'bank_transfer') {
  const method = PAYMENT_METHODS.find((m) => m.id === methodId);
  const feePct = method ? method.convenienceFeePct : 0;
  const feeAmount = Math.round(baseAmount * (feePct / 100));
  const totalPayable = baseAmount + feeAmount;

  return {
    baseAmount,
    feePct,
    feeAmount,
    totalPayable,
  };
}
