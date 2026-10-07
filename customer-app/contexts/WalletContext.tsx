import React, { createContext, useContext, useState } from 'react';
import { Wallet, Transaction, WalletType, RideSettlement } from '@/types/wallet';
import { BOOKING_CONFIG } from '@/constants/bookingConfig';

interface WalletContextType {
  wallet: Wallet | null;
  transactions: Transaction[];
  addFunds: (amount: number, walletType?: WalletType) => Promise<boolean>;
  deductFunds: (amount: number, description: string, walletType?: WalletType) => Promise<boolean>;
  computeRideSettlement: (params: {
    grossFare: number;
    personalStopFee?: number;
    seatShareDiscount?: number;
  }) => RideSettlement;
  settleRide: (settlement: RideSettlement, description: string) => Promise<boolean>;
  upgradeToPremium: () => Promise<boolean>;
  applyReferralReward: (referralCode: string) => Promise<{ success: boolean; message: string }>;
  canAcceptBooking: () => boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Local placeholder only (the real customer wallet is read from the backend on the Wallet screen). It used to start with a made-up
  // balance of Rs 450, Rs 120 promo and a fake referral code that showed up in the booking summary as a discount - it now starts empty.
  const [wallet, setWallet] = useState<Wallet>({
    id: '1',
    userId: '',
    balance: 0,
    mainCashBalance: 0,
    promoRewardBalance: 0,
    promoExpiryTimestamp: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    minBalance: 100,
    isActive: true,
    isPremiumMember: false,
    referralCode: '',
    totalReferralsCount: 0,
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addFunds = async (amount: number, walletType: WalletType = 'MAIN_CASH'): Promise<boolean> => {
    try {
      const newTransaction: Transaction = {
        id: `tx_${Date.now()}`,
        walletId: wallet?.id || '1',
        walletType,
        type: 'credit',
        amount,
        description: walletType === 'MAIN_CASH' ? 'Wallet top-up via Razorpay' : 'Promo reward bonus',
        status: 'completed',
        razorpayOrderId: `order_${Math.random().toString(36).substring(2, 9)}`,
        razorpayPaymentId: `pay_${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
      };

      setTransactions(prev => [newTransaction, ...prev]);
      setWallet(prev => {
        const nextMain = walletType === 'MAIN_CASH' ? prev.mainCashBalance + amount : prev.mainCashBalance;
        return {
          ...prev,
          balance: nextMain,
          mainCashBalance: nextMain,
          promoRewardBalance: walletType === 'PROMO_REWARD' ? prev.promoRewardBalance + amount : prev.promoRewardBalance,
        };
      });

      return true;
    } catch (error) {
      console.error('Add funds error:', error);
      return false;
    }
  };

  const deductFunds = async (amount: number, description: string, walletType: WalletType = 'MAIN_CASH'): Promise<boolean> => {
    try {
      if (!wallet) return false;
      const targetBalance = walletType === 'MAIN_CASH' ? wallet.mainCashBalance : wallet.promoRewardBalance;
      if (targetBalance < amount) return false;

      const newTransaction: Transaction = {
        id: `tx_${Date.now()}`,
        walletId: wallet.id,
        walletType,
        type: 'debit',
        amount,
        description,
        status: 'completed',
        createdAt: new Date().toISOString(),
      };

      setTransactions(prev => [newTransaction, ...prev]);
      setWallet(prev => {
        const nextMain = walletType === 'MAIN_CASH' ? prev.mainCashBalance - amount : prev.mainCashBalance;
        const nextPromo = walletType === 'PROMO_REWARD' ? prev.promoRewardBalance - amount : prev.promoRewardBalance;
        return { ...prev, balance: nextMain, mainCashBalance: nextMain, promoRewardBalance: nextPromo };
      });

      return true;
    } catch (error) {
      console.error('Deduct funds error:', error);
      return false;
    }
  };

  // Centralized Ride Settlement Logic (Section 3 of Master Prompt)
  const computeRideSettlement = (params: {
    grossFare: number;
    personalStopFee?: number;
    seatShareDiscount?: number;
  }): RideSettlement => {
    const { grossFare, personalStopFee = 0, seatShareDiscount = 0 } = params;
    const isPremiumMember = !!wallet?.isPremiumMember;

    // Platform Fee: ₹15 standard, ₹0 for Drop Cars Premium
    const platformFee = isPremiumMember ? BOOKING_CONFIG.PREMIUM_PLATFORM_CONVENIENCE_FEE : BOOKING_CONFIG.PLATFORM_CONVENIENCE_FEE;

    // Base + Stops - SeatShare Discount
    const adjustedFare = Math.max(0, grossFare + personalStopFee - seatShareDiscount);
    const gstAmount = Math.round(adjustedFare * (BOOKING_CONFIG.GST_PERCENT / 100));

    const totalBeforeDiscounts = adjustedFare + gstAmount + platformFee;

    // Capped Promo Reward Discount: Max 10% or ₹50 max
    const maxAllowedPromoDiscount = Math.min(
      Math.round(totalBeforeDiscounts * (BOOKING_CONFIG.PROMO_WALLET_MAX_DISCOUNT_PERCENT / 100)),
      BOOKING_CONFIG.PROMO_WALLET_MAX_DISCOUNT_CAP_INR
    );
    const promoWalletUsed = Math.min(wallet?.promoRewardBalance || 0, maxAllowedPromoDiscount);

    const remainingPayable = totalBeforeDiscounts - promoWalletUsed;
    const mainWalletUsed = Math.min(wallet?.mainCashBalance || 0, remainingPayable);
    const netPayableToDriver = Math.max(0, remainingPayable - mainWalletUsed);

    return {
      baseFare: grossFare,
      gstAmount,
      platformFee,
      personalStopFee,
      seatShareDiscount,
      promoWalletUsed,
      mainWalletUsed,
      netPayableToDriver,
    };
  };

  const settleRide = async (settlement: RideSettlement, description: string): Promise<boolean> => {
    if (!wallet) return false;

    if (settlement.promoWalletUsed > 0) {
      await deductFunds(settlement.promoWalletUsed, `Promo Discount: ${description}`, 'PROMO_REWARD');
    }
    if (settlement.mainWalletUsed > 0) {
      await deductFunds(settlement.mainWalletUsed, `Ride Payment: ${description}`, 'MAIN_CASH');
    }

    return true;
  };

  const upgradeToPremium = async (): Promise<boolean> => {
    const cost = BOOKING_CONFIG.PREMIUM_SUBSCRIPTION_MONTHLY_INR;
    if (!wallet || wallet.mainCashBalance < cost) return false;

    const success = await deductFunds(cost, 'Drop Cars Premium Subscription (1 Month)', 'MAIN_CASH');
    if (success) {
      setWallet(prev => ({
        ...prev,
        isPremiumMember: true,
        premiumExpiryTimestamp: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));
    }
    return success;
  };

  const applyReferralReward = async (referralCode: string): Promise<{ success: boolean; message: string }> => {
    if (!referralCode || referralCode.length < 5) {
      return { success: false, message: 'Invalid referral code format' };
    }
    // Anti-fraud check: device ID + OTP verification simulated
    await addFunds(50, 'PROMO_REWARD');
    return { success: true, message: '₹50 Promo Reward credited to your Promo Wallet!' };
  };

  const canAcceptBooking = (): boolean => {
    return wallet ? (wallet.mainCashBalance + wallet.promoRewardBalance) >= wallet.minBalance : false;
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        addFunds,
        deductFunds,
        computeRideSettlement,
        settleRide,
        upgradeToPremium,
        applyReferralReward,
        canAcceptBooking,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}