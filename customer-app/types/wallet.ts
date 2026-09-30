export interface Wallet {
  id: string;
  userId: string;
  balance: number;               // Total main cash balance for backward compatibility
  mainCashBalance: number;       // Main Cash / Refund Wallet (100% withdrawable & usable)
  promoRewardBalance: number;    // Promo / Reward Wallet (referrals & marketing promos, max 10% discount cap)
  promoExpiryTimestamp?: string; // Expire timestamp for promo credits (e.g. 60 days)
  minBalance: number;
  isActive: boolean;
  isPremiumMember?: boolean;      // Drop Cars Premium subscription status
  premiumExpiryTimestamp?: string;
  referralCode?: string;
  totalReferralsCount?: number;
}

export type WalletType = 'MAIN_CASH' | 'PROMO_REWARD';

export interface Transaction {
  id: string;
  walletId: string;
  walletType: WalletType;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt: string;
}

export interface RideSettlement {
  baseFare: number;
  gstAmount: number;
  platformFee: number;            // ₹15 platform fee (₹0 for Premium)
  personalStopFee: number;         // ₹150/hr personal stop timer fee (billed strictly to primary rider)
  seatShareDiscount: number;       // Discount applied if co-riders match in Drop Saver mode
  promoWalletUsed: number;         // Capped at 10% or ₹50 max
  mainWalletUsed: number;          // Applied against remaining payable
  netPayableToDriver: number;
}