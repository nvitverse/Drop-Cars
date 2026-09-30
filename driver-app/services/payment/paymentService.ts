import axiosInstance from '@/app/api/axiosInstance';
import { getAuthHeaders } from '@/services/auth/authService';

// Payment interfaces
export interface PaymentRequest {
  amount: number;
  currency: string;
  description: string;
  user_id: string;
  payment_type: 'wallet_topup' | 'trip_payment' | 'commission' | 'payout';
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  success: boolean;
  message: string;
  payment_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  wallet_updated?: boolean;
  new_balance?: number;
}

export interface WalletTransaction {
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

export interface WalletBalance {
  balance: number;
  currency: string;
  last_updated: string;
}

// Razorpay configuration
const RAZORPAY_CONFIG = {
  key_id: 'rzp_live_RuMG3DMZFdeT3Y', // Live key - safe to use in frontend
  currency: 'INR',
  company_name: 'Drop Cars',
  company_logo: 'https://i.imgur.com/3g7nmJC.png',
};

// Mock data removed - using real API data only

// Check if backend is available (no longer calls /api/health)
const isBackendAvailable = async (): Promise<boolean> => {
  return true;
};

/**
 * Create a Razorpay order on the backend
 */
export const createRazorpayOrder = async (amount: number, currency: string = 'INR', notes: Record<string, any> = {}): Promise<PaymentResponse> => {
  try {
    console.log('💰 Creating Razorpay order:', { amount, currency, notes });
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Mock response for development
      const mockOrderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('🔧 Using mock Razorpay order:', mockOrderId);
      
      return {
        success: true,
        message: 'Razorpay order created successfully (mock)',
        order_id: mockOrderId,
        razorpay_order_id: mockOrderId,
        amount: amount,
        currency: currency,
        status: 'created'
      };
    }
    
    const authHeaders = await getAuthHeaders();
    const orderPayload = {
      amount: amount, // Send amount in rupees directly
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
      notes: notes
    };
    
    console.log('💰 Creating Razorpay order with payload (rupees):', orderPayload);
    
    const response = await axiosInstance.post('/api/wallet/razorpay/order', orderPayload, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Razorpay order created:', response.data);
      return {
        success: true,
        message: 'Razorpay order created successfully',
        order_id: response.data.rp_order_id,
        razorpay_order_id: response.data.rp_order_id,
        amount: response.data.amount, 
        currency: response.data.currency,
        status: 'created'
      };
    }

    throw new Error('No response data received from Razorpay order creation');
  } catch (error: any) {
    console.error('❌ Failed to create Razorpay order:', error);
    throw error;
  }
};

/**
 * Verify Razorpay payment signature and update wallet
 */
export const verifyRazorpayPayment = async (
  rpOrderId: string,
  rpPaymentId: string,
  rpSignature: string
): Promise<PaymentResponse> => {
  try {
    console.log('🔍 Verifying Razorpay payment:', { rpOrderId, rpPaymentId });
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Mock verification for development
      console.log('🔧 Using mock Razorpay payment verification');
      
      return {
        success: true,
        message: 'Razorpay payment verified successfully (mock)',
        payment_id: rpPaymentId,
        order_id: rpOrderId,
        razorpay_payment_id: rpPaymentId,
        razorpay_order_id: rpOrderId,
        razorpay_signature: rpSignature,
        status: 'captured'
      };
    }
    
    const authHeaders = await getAuthHeaders();
    // Validate Razorpay parameters
    if (!rpOrderId || !rpPaymentId || !rpSignature) {
      throw new Error('Missing required Razorpay parameters for verification');
    }
    
    // Send field names expected by backend (as per provided HTML test)
    const verificationPayload = {
      rp_order_id: rpOrderId,
      rp_payment_id: rpPaymentId,
      rp_signature: rpSignature
    };
    
    console.log('🔍 Sending payment verification with payload:', verificationPayload);
    console.log('🔍 Auth headers:', authHeaders);
    
    const response = await axiosInstance.post('/api/wallet/razorpay/verify', verificationPayload, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Razorpay payment verified successfully:', response.data);
      console.log('💰 Payment verification response:', {
        success: response.data.success,
        message: response.data.message,
        wallet_updated: response.data.wallet_updated,
        new_balance: response.data.new_balance
      });
      return {
        success: true,
        message: 'Razorpay payment verified successfully',
        payment_id: rpPaymentId,
        order_id: rpOrderId,
        razorpay_payment_id: rpPaymentId,
        razorpay_order_id: rpOrderId,
        razorpay_signature: rpSignature,
        status: 'captured',
        wallet_updated: response.data.wallet_updated,
        new_balance: response.data.new_balance
      };
    }

    throw new Error('No response data received from Razorpay payment verification');
  } catch (error: any) {
    console.error('❌ Failed to verify Razorpay payment:', error);
    
    // Log detailed error information
    if (error.response) {
      console.error('❌ Backend error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      });
      try {
        console.warn('🔎 verify 400 detail:', error.response?.data?.detail);
      } catch {}
    } else if (error.request) {
      console.error('❌ No response received:', error.request);
    } else {
      console.error('❌ Request setup error:', error.message);
    }
    
    throw error;
  }
};

/**
 * Get wallet balance from backend
 */
export const getWalletBalance = async (): Promise<WalletBalance> => {
    console.log('💰 Fetching wallet balance...');
    const authHeaders = await getAuthHeaders();
  console.log('🔐 Wallet balance auth header present:', !!authHeaders?.Authorization);
    const response = await axiosInstance.get('/api/wallet/balance', {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Wallet balance fetched:', response.data);
      return {
      // Backend returns balance in rupees
      balance: (response.data.balance ?? response.data.current_balance ?? 0) as number,
        currency: 'INR',
        last_updated: new Date().toISOString()
      };
    }

    throw new Error('No response data received from wallet balance fetch');
};

/**
 * Get wallet ledger from backend
 */
export const getWalletLedger = async (): Promise<WalletTransaction[]> => {
  try {
    console.log('📋 Fetching wallet ledger...');
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Backend unavailable, return empty transactions
      console.log('🔧 Backend unavailable, returning empty transactions');
      return [];
    }
    
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get('/api/wallet/ledger', {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Wallet ledger fetched:', response.data.length, 'entries');
      return response.data;
    }

    return [];
  } catch (error: any) {
    console.error('❌ Failed to fetch wallet ledger:', error);
    
    // Return empty transactions if backend fails
    console.log('🔧 Backend failed, returning empty transactions');
    return [];
  }
};

/**
 * Auto-deduct amount from wallet (for trip payments, commissions, etc.)
 */
export const deductFromWallet = async (
  amount: number,
  description: string,
  metadata?: Record<string, any>
): Promise<PaymentResponse> => {
  try {
    console.log('💸 Deducting from wallet:', { amount, description });
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Backend unavailable, cannot process deduction
      console.log('🔧 Backend unavailable, cannot process wallet deduction');
      
      return {
        success: false,
        message: 'Backend unavailable - cannot process wallet deduction',
        payment_id: undefined,
        amount: 0,
        status: 'failed'
      };
    }
    
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.post('/api/wallet/balance', {
      amount: -(amount), 
      currency: 'INR',
      notes: {
        purpose: 'wallet_deduction',
        description: description,
        ...metadata
      }
    }, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Amount deducted successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from wallet deduction');
  } catch (error: any) {
    console.error('❌ Failed to deduct from wallet:', error);
    
    // Return error response if backend fails
    console.log('🔧 Backend failed, cannot process wallet deduction');
    
    return {
      success: false,
      message: 'Backend failed - cannot process wallet deduction',
      payment_id: undefined,
      amount: 0,
      status: 'failed'
    };
  }
};

/**
 * Add money to wallet (for refunds, bonuses, etc.)
 */
export const addToWallet = async (
  amount: number,
  description: string,
  metadata?: Record<string, any>
): Promise<PaymentResponse> => {
  try {
    console.log('💰 Adding to wallet:', { amount, description });
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Backend unavailable, cannot process addition
      console.log('🔧 Backend unavailable, cannot process wallet addition');
      
      return {
        success: false,
        message: 'Backend unavailable - cannot process wallet addition',
        payment_id: undefined,
        amount: 0,
        status: 'failed'
      };
    }
    
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.post('/api/wallet/balance', {
      amount: amount , 
      currency: 'INR',
      notes: {
        purpose: 'wallet_topup',
        description: description,
        ...metadata
      }
    }, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Amount added successfully:', response.data);
      return response.data;
    }

    throw new Error('No response data received from wallet addition');
  } catch (error: any) {
    console.error('❌ Failed to add to wallet:', error);
    
    // Return error response if backend fails
    console.log('🔧 Backend failed, cannot process wallet addition');
    
    return {
      success: false,
      message: 'Backend failed - cannot process wallet addition',
      payment_id: undefined,
      amount: 0,
      status: 'failed'
    };
  }
};

/**
 * Get Razorpay checkout options
 */
export const getRazorpayOptions = (
  orderId: string,
  amount: number,
  description: string,
  userData: {
    name: string;
    email: string;
    contact: string;
  }
) => {
  const options = {
    description,
    image: RAZORPAY_CONFIG.company_logo,
    currency: RAZORPAY_CONFIG.currency,
    key: RAZORPAY_CONFIG.key_id,
    amount: amount, // Send amount in rupees directly
    name: RAZORPAY_CONFIG.company_name,
    order_id: orderId,
    prefill: {
      email: userData.email,
      contact: userData.contact,
      name: userData.name
    },
    theme: { color: '#3B82F6' },
    retry: { enabled: false },
    method: {
      netbanking: true,
      card: true,
      upi: true,
      wallet: true
    },
    modal: {
      ondismiss: () => {
        console.log('Payment modal dismissed');
      }
    }
  };
  // Razorpay expects amount in rupees
  return options;
};

/**
 * Process wallet top-up with Razorpay
 */
export const processWalletTopup = async (
  amount: number,
  userData: {
    name: string;
    email: string;
    contact: string;
  }
): Promise<PaymentResponse> => {
  try {
    console.log('💰 Processing wallet top-up:', { amount, userData });
    
    // Step 1: Create Razorpay order
    const orderResponse = await createRazorpayOrder(amount, 'INR', { purpose: 'wallet_topup' });
    
    if (!orderResponse.success || !orderResponse.razorpay_order_id) {
      throw new Error('Failed to create Razorpay order');
    }
    
    console.log('✅ Razorpay order created:', orderResponse.razorpay_order_id);
    
    // Step 2: Return order details for Razorpay checkout
    return {
      success: true,
      message: 'Razorpay order created successfully',
      order_id: orderResponse.razorpay_order_id,
      razorpay_order_id: orderResponse.razorpay_order_id,
      amount: amount,
      currency: 'INR',
      status: 'created'
    };
    
  } catch (error: any) {
    console.error('❌ Failed to process wallet top-up:', error);
    throw error;
  }
};

/**
 * Handle Razorpay payment success callback
 */
export const handleRazorpayPaymentSuccess = async (
  razorpayResponse: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }
): Promise<PaymentResponse> => {
  try {
    console.log('🎉 Handling Razorpay payment success:', razorpayResponse);
    // Explicitly print verify payload exactly as backend expects
    console.log('📦 Verify payload after payment:', {
      rp_order_id: razorpayResponse.razorpay_order_id,
      rp_payment_id: razorpayResponse.razorpay_payment_id,
      rp_signature: razorpayResponse.razorpay_signature,
    });
    
    // Verify payment with backend
    const verificationResponse = await verifyRazorpayPayment(
      razorpayResponse.razorpay_order_id,
      razorpayResponse.razorpay_payment_id,
      razorpayResponse.razorpay_signature
    );
    
    if (verificationResponse.success) {
      console.log('✅ Payment verified and wallet updated successfully');
      return verificationResponse;
    } else {
      throw new Error('Payment verification failed');
    }
    
  } catch (error: any) {
    console.error('❌ Failed to handle payment success:', error);
    throw error;
  }
};

/**
 * Handle Razorpay payment failure
 */
export const handleRazorpayPaymentFailure = (error: any) => {
  console.error('❌ Razorpay payment failed:', error);
  
  // You can add additional error handling here
  // For example, show user-friendly error messages
  const errorMessage = error.error?.description || 'Payment failed. Please try again.';
  
  return {
    success: false,
    message: errorMessage,
    status: 'failed'
  };
};

/**
 * Process trip payment with auto-deduction
 */
export const processTripPayment = async (
  tripId: string,
  amount: number,
  tripDetails: {
    pickup: string;
    drop: string;
    distance: number;
    duration: number;
  }
): Promise<PaymentResponse> => {
  try {
    console.log('🚗 Processing trip payment:', { tripId, amount });
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Backend unavailable, cannot process trip payment
      console.log('🔧 Backend unavailable, cannot process trip payment');
      
      return {
        success: false,
        message: 'Backend unavailable - cannot process trip payment',
        payment_id: undefined,
        amount: 0,
        status: 'failed'
      };
    }
    
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.post('/api/payments/trip-payment', {
      trip_id: tripId,
      amount,
      trip_details: tripDetails
    }, {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Trip payment processed:', response.data);
      return response.data;
    }

    throw new Error('No response data received from trip payment');
  } catch (error: any) {
    console.error('❌ Failed to process trip payment:', error);
    
    // Return error response if backend fails
    console.log('🔧 Backend failed, cannot process trip payment');
    
    return {
      success: false,
      message: 'Backend failed - cannot process trip payment',
      payment_id: undefined,
      amount: 0,
      status: 'failed'
    };
  }
};

/**
 * Get payment history
 */
export const getPaymentHistory = async (): Promise<PaymentResponse[]> => {
  try {
    console.log('📋 Fetching payment history...');
    
    // Check if backend is available
    const backendAvailable = await isBackendAvailable();
    
    if (!backendAvailable) {
      // Return mock payment history for development
      console.log('🔧 Using mock payment history');
      return [
        {
          success: true,
          message: 'Mock payment 1',
          payment_id: 'pay_mock_1',
          amount: 500,
          status: 'completed'
        },
        {
          success: true,
          message: 'Mock payment 2',
          payment_id: 'pay_mock_2',
          amount: 1000,
          status: 'completed'
        }
      ];
    }
    
    const authHeaders = await getAuthHeaders();
    const response = await axiosInstance.get('/api/payments/history', {
      headers: authHeaders
    });

    if (response.data) {
      console.log('✅ Payment history fetched:', response.data.length, 'payments');
      return response.data;
    }

    return [];
  } catch (error: any) {
    console.error('❌ Failed to fetch payment history:', error);
    
    // Return empty payment history if backend fails
    console.log('🔧 Backend failed, returning empty payment history');
    return [];
  }
};

/**
 * Refresh wallet balance after payment
 */
export const refreshWalletBalance = async (): Promise<WalletBalance> => {
  try {
    console.log('🔄 Refreshing wallet balance after payment...');
    
    const balance = await getWalletBalance();
    console.log('✅ Wallet balance refreshed:', balance);
    return balance;
  } catch (error: any) {
    console.error('❌ Failed to refresh wallet balance:', error);
    throw error;
  }
};

/**
 * Complete payment flow with wallet refresh
 */
export const completePaymentFlow = async (
  rpOrderId: string,
  rpPaymentId: string,
  rpSignature: string
): Promise<{ payment: PaymentResponse; wallet: WalletBalance }> => {
  try {
    console.log('💳 Starting complete payment flow...');
    
    // Step 1: Verify payment
    const paymentResult = await verifyRazorpayPayment(rpOrderId, rpPaymentId, rpSignature);
    
    if (!paymentResult.success) {
      throw new Error('Payment verification failed');
    }
    
    console.log('✅ Payment verified successfully');
    
    // Step 2: Refresh wallet balance
    const walletBalance = await refreshWalletBalance();
    
    console.log('✅ Complete payment flow finished:', {
      payment: paymentResult,
      wallet: walletBalance
    });
    
    return {
      payment: paymentResult,
      wallet: walletBalance
    };
  } catch (error: any) {
    console.error('❌ Complete payment flow failed:', error);
    throw error;
  }
};
