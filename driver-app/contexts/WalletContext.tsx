import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  getWalletBalance, 
  getWalletLedger, 
  addToWallet, 
  deductFromWallet,
  processWalletTopup,
  handleRazorpayPaymentSuccess,
  handleRazorpayPaymentFailure,
  completePaymentFlow,
  WalletBalance,
  WalletTransaction 
} from '@/services/payment/paymentService';
import { useAuth } from './AuthContext';
import { validateTokenBeforeApiCall } from '@/utils/tokenValidator';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  payment_id?: string;
  order_id?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  metadata?: Record<string, any>;
}

interface WalletContextType {
  balance: number;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  addMoney: (amount: number, description?: string, metadata?: Record<string, any>) => Promise<void>;
  deductMoney: (amount: number, description: string, metadata?: Record<string, any>) => Promise<void>;
  processWalletTopup: (amount: number, userData: { name: string; email: string; contact: string }, purpose?: string) => Promise<any>;
  handlePaymentSuccess: (razorpayResponse: any) => Promise<void>;
  handlePaymentFailure: (error: any) => void;
  syncWithBackend: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is a Fleet Owner (not a driver)
  const isVehicleOwner = user && !user.driver_status;

  // Load initial data
  useEffect(() => {
    if (isVehicleOwner) {
      syncWithBackend();
    } else {
      console.log('ℹ️ Skipping wallet sync - user is not a Fleet Owner');
    }
  }, [isVehicleOwner]);

  const syncWithBackend = async () => {
    // Only sync if user is a Fleet Owner
    if (!isVehicleOwner) {
      console.log('ℹ️ Skipping wallet sync - user is not a Fleet Owner');
      return;
    }

    // Validate token before making API call
    const isTokenValid = await validateTokenBeforeApiCall('owner');
    if (!isTokenValid) {
      console.log('❌ Token validation failed, skipping wallet sync');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Fetch balance and transactions in parallel
      const [balanceData, transactionsData] = await Promise.all([
        getWalletBalance(),
        getWalletLedger()
      ]);

      setBalance(balanceData.balance);
      setTransactions(transactionsData);
      
      console.log('✅ Wallet synced with backend:', {
        balance: balanceData.balance,
        transactions: transactionsData.length
      });
    } catch (error: any) {
      console.error('❌ Failed to sync wallet with backend:', error);
      setError(error.message);
      // Used to zero out balance/transactions here on ANY failure,
      // including a transient network blip - a funded wallet could
      // briefly look completely empty. Keep the last-known-good values
      // and only surface the error; refreshBalance/refreshTransactions
      // below already follow this same keep-last-good-value pattern.
    } finally {
      setLoading(false);
    }
  };

  const refreshBalance = async () => {
    try {
      const balanceData = await getWalletBalance();
      setBalance(balanceData.balance);
      console.log('✅ Balance refreshed:', balanceData.balance);
    } catch (error: any) {
      console.error('❌ Failed to refresh balance:', error);
      setError(error.message);
    }
  };

  const refreshTransactions = async () => {
    try {
      const transactionsData = await getWalletLedger();
      setTransactions(transactionsData);
      console.log('✅ Transactions refreshed:', transactionsData.length);
    } catch (error: any) {
      console.error('❌ Failed to refresh transactions:', error);
      setError(error.message);
    }
  };

  const addMoney = async (amount: number, description: string = 'Wallet Top-up', metadata?: Record<string, any>) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call backend API to add money
      const response = await addToWallet(amount, description, metadata);
      
      if (response.success) {
        // Update local state
        const newTransaction: Transaction = {
          id: response.payment_id || Date.now().toString(),
          type: 'credit',
          amount,
          description,
          date: new Date().toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          payment_id: response.payment_id,
          order_id: response.order_id,
          status: 'completed',
          metadata
        };

        setBalance(prev => prev + amount);
        setTransactions(prev => [newTransaction, ...prev]);
        
        console.log('✅ Money added successfully:', { amount, newBalance: balance + amount });
      } else {
        throw new Error(response.message || 'Failed to add money');
      }
    } catch (error: any) {
      console.error('❌ Failed to add money:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deductMoney = async (amount: number, description: string, metadata?: Record<string, any>) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call backend API to deduct money
      const response = await deductFromWallet(amount, description, metadata);
      
      if (response.success) {
        // Update local state
        const newTransaction: Transaction = {
          id: response.payment_id || Date.now().toString(),
          type: 'debit',
          amount,
          description,
          date: new Date().toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          payment_id: response.payment_id,
          order_id: response.order_id,
          status: 'completed',
          metadata
        };

        setBalance(prev => prev - amount);
        setTransactions(prev => [newTransaction, ...prev]);
        
        console.log('✅ Money deducted successfully:', { amount, newBalance: balance - amount });
      } else {
        throw new Error(response.message || 'Failed to deduct money');
      }
    } catch (error: any) {
      console.error('❌ Failed to deduct money:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const processWalletTopupWithRazorpay = async (amount: number, userData: { name: string; email: string; contact: string }, purpose?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Create Razorpay order
      const orderResponse = await processWalletTopup(amount, userData, purpose);
      
      if (orderResponse.success) {
        console.log('✅ Razorpay order created for wallet top-up:', orderResponse.razorpay_order_id);
        return orderResponse;
      } else {
        throw new Error('Failed to create Razorpay order');
      }
    } catch (error: any) {
      console.error('❌ Failed to process wallet top-up:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (razorpayResponse: any) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🎉 Processing payment success with complete flow...');
      
      // Use the complete payment flow that includes wallet refresh
      const result = await completePaymentFlow(
        razorpayResponse.razorpay_order_id,
        razorpayResponse.razorpay_payment_id,
        razorpayResponse.razorpay_signature
      );
      
      if (result.payment.success) {
        // Update local state with fresh wallet data
        setBalance(result.wallet.balance);
        
        // Refresh transactions as well
        await refreshTransactions();
        
        console.log('✅ Payment successful and wallet updated:', {
          newBalance: result.wallet.balance,
          paymentId: result.payment.payment_id
        });
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error: any) {
      console.error('❌ Failed to handle payment success:', error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentFailure = (error: any) => {
    const failureResponse = handleRazorpayPaymentFailure(error);
    setError(failureResponse.message);
    console.error('❌ Payment failed:', failureResponse.message);
  };

  return (
    <WalletContext.Provider value={{ 
      balance, 
      transactions, 
      loading, 
      error,
      refreshBalance,
      refreshTransactions,
      addMoney, 
      deductMoney,
      processWalletTopup: processWalletTopupWithRazorpay,
      handlePaymentSuccess,
      handlePaymentFailure,
      syncWithBackend
    }}>
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