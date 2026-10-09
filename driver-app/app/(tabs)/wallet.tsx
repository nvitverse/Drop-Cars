 import React, { useState, useEffect } from 'react';
import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle, Copy, X, CreditCard, Wallet, TrendingUp, Award, ShieldCheck, Info, Crown } from 'lucide-react-native';
import EmptyState from '@/components/EmptyState';
import Clipboard from '@react-native-clipboard/clipboard';
import { getRazorpayOptions } from '@/services/payment/paymentService';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';
import WithdrawModal from '@/components/wallet/WithdrawModal';
import SecurityHoldInfoModal from '@/components/wallet/SecurityHoldInfoModal';
import LedgerDetailSheet from '@/components/wallet/LedgerDetailSheet';

let RazorpayCheckout: any = null;
try {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    RazorpayCheckout = require('react-native-razorpay').default;
    console.log('✅ Razorpay SDK loaded successfully for', Platform.OS);
  } else {
    console.warn('⚠️ Razorpay SDK only supports Android and iOS, current platform:', Platform.OS);
  }
} catch (error) {
  console.warn('⚠️ Razorpay SDK not available:', error);
  RazorpayCheckout = null;
}

export default function WalletScreen() {
  const router = useRouter();
  const { amount: addAmountParam, plan: subscribePlanParam } = useLocalSearchParams<{ amount?: string; plan?: string }>();
  const { 
    balance, 
    transactions, 
    loading, 
    error, 
    refreshBalance, 
    refreshTransactions,
    processWalletTopup: processTopup,
    handlePaymentSuccess,
    handlePaymentFailure,
    syncWithBackend 
  } = useWallet();
  const { colors, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [showSecurityHoldInfo, setShowSecurityHoldInfo] = useState(false);

  // Ledger filter segment - "All" vs "Redeems & Payouts" (payout/settlement
  // family of reference_types). Purely client-side filter over the already
  // fetched ledger entries.
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'PAYOUTS'>('ALL');
  const [ledgerDetailId, setLedgerDetailId] = useState<string | null>(null);
  const PAYOUT_REFERENCE_TYPES = ['PAYOUT_PAID', 'ADVANCE_SETTLEMENT'];

  // Date-range filter for the transaction list - purely client-side over the
  // already-fetched ledger, same pattern as Executed Rides' date toggle.
  const [txDateRange, setTxDateRange] = useState<'10' | '30' | 'ALL'>('ALL');
  const txCutoff = txDateRange === 'ALL' ? null : Date.now() - Number(txDateRange) * 24 * 60 * 60 * 1000;

  const filteredTransactions = (transactions || [])
    .filter((t: any) => (ledgerFilter === 'ALL' ? true : PAYOUT_REFERENCE_TYPES.includes(t.reference_type)))
    .filter((t: any) => {
      if (!txCutoff) return true;
      const ts = new Date(t.created_at || t.date).getTime();
      return !isNaN(ts) && ts >= txCutoff;
    });

  // QR modal state
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Razorpay amount input modal state
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [razorpayAmount, setRazorpayAmount] = useState('');
  const [processingRazorpay, setProcessingRazorpay] = useState(false);
  // Shown INSIDE the modal instead of Alert.alert(), which on web renders
  // behind a custom <Modal> and looks like "nothing happened" until the
  // modal is closed and the alert is revealed underneath.
  const [amountModalError, setAmountModalError] = useState<string | null>(null);

  // Razorpay's fee (2% + 18% GST on the fee) - fetched once, then computed
  // locally as the driver types so the payable amount is never a surprise.
  const [razorpayFeeRates, setRazorpayFeeRates] = useState<{ fee_percent: number; gst_percent: number } | null>(null);
  useEffect(() => {
    axiosInstance.get('/api/wallet/razorpay/fee-preview', { params: { amount: 100 } })
      .then(res => setRazorpayFeeRates({ fee_percent: res.data.fee_percent, gst_percent: res.data.gst_percent }))
      .catch(() => {});
  }, []);
  // Payout requests - self-serve cash-out, settled manually by admin outside
  // the app (bank transfer/UPI), then marked Paid here.
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const fetchPayoutRequests = () => {
    axiosInstance.get('/api/wallet/payout-requests')
      .then(res => setPayoutRequests(res.data || []))
      .catch(() => {});
  };
  // Earnings-Over-Time Analytics State (Subscriber-Gated Perk)
  const [earningsSummary, setEarningsSummary] = useState<any>(null);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  const fetchEarningsSummary = async () => {
    setLoadingEarnings(true);
    try {
      const res = await axiosInstance.get('/api/wallet/earnings-summary');
      setEarningsSummary(res.data);
    } catch (e) {
      // Endpoint error or unauthenticated
    } finally {
      setLoadingEarnings(false);
    }
  };

  const [billingStatus, setBillingStatus] = useState<any>(null);

  const fetchBillingStatus = () => {
    axiosInstance.get('/api/users/vehicle-owner/billing-status')
      .then(res => setBillingStatus(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchEarningsSummary();
    fetchBillingStatus();
  }, []);

  const handleRequestPayoutSubmit = async (amount: number, paymentMethod: string, details: string) => {
    setRequestingPayout(true);
    try {
      await axiosInstance.post('/api/wallet/payout-request', {
        amount,
        payment_method: paymentMethod,
        details,
      });
      setShowPayoutModal(false);
      setPayoutAmount('');
      fetchPayoutRequests();
      Alert.alert(
        'Payout Requested',
        'உங்கள் கோரிக்கை நிர்வாகிக்கு அனுப்பப்பட்டது. சரிபார்க்கப்பட்ட பின் பணம் உங்கள் கணக்கிற்கு அனுப்பப்படும்.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit the payout request.');
    } finally {
      setRequestingPayout(false);
    }
  };

  const razorpayFeeBreakdown = (() => {
    const base = parseFloat(razorpayAmount);
    if (!razorpayFeeRates || !base || isNaN(base) || base <= 0) return null;
    const fee = Math.round((base * razorpayFeeRates.fee_percent / 100) * 100) / 100;
    const gst = Math.round((fee * razorpayFeeRates.gst_percent / 100) * 100) / 100;
    return { base, fee, gst, payable: Math.round((base + fee + gst) * 100) / 100 };
  })();

  // When navigated from "Add ₹X to accept booking", pre-fill amount and open add-money modal
  useEffect(() => {
    if (addAmountParam != null && addAmountParam !== '') {
      const value = addAmountParam.trim();
      if (value && !isNaN(Number(value))) {
        setRazorpayAmount(value);
        setShowAmountModal(true);
      }
    }
  }, [addAmountParam]);

  const handleUPICopy = () => {
    const upiId = '7200217986-1@okbizaxis';
    try {
      Clipboard.setString(upiId);
      Alert.alert(t('wallet.copiedTitle'), t('wallet.copiedBody'));
    } catch (error) {
      console.error('Failed to copy:', error);
      Alert.alert('Error', 'Failed to copy UPI ID');
    }
  };

  const handleShowQR = () => {
    setShowQRModal(true);
  };

  const handleRazorpayPayment = async () => {
    setAmountModalError(null);
    const amount = parseFloat(razorpayAmount);

    if (!razorpayAmount || isNaN(amount) || amount <= 0) {
      setAmountModalError(t('wallet.invalidAmountBody') || 'Please enter a valid amount');
      return;
    }

    if (amount < 1) {
      setAmountModalError('Minimum amount is ₹1');
      return;
    }

    if (!RazorpayCheckout) {
      // Stays inline (not Alert.alert) and keeps the modal open, so the
      // driver actually sees why and can switch to UPI/QR instead.
      setAmountModalError(
        Platform.OS === 'web'
          ? 'Card/UPI payment via this page isn\'t supported in the web app yet. Please use the UPI ID or QR code below instead, or add money from the mobile app.'
          : 'Online payment is not available right now. Please use the UPI ID or QR code instead.'
      );
      return;
    }

    try {
      setProcessingRazorpay(true);
      setShowAmountModal(false);

      // Get user data for Razorpay
      const userData = {
        name: user?.fullName || 'User',
        email: (user as any)?.email || `${user?.primaryMobile || 'user'}@dropcars.in`,
        contact: user?.primaryMobile || '9999999999'
      };

      console.log('💰 Starting Razorpay payment for amount:', amount);
      
      // Create Razorpay order
      const orderResponse = await processTopup(
        amount, userData,
        subscribePlanParam === 'MONTHLY' || subscribePlanParam === 'YEARLY' ? `subscription_${subscribePlanParam.toLowerCase()}` : undefined
      );
      
      if (!orderResponse.success || !orderResponse.razorpay_order_id) {
        throw new Error('Failed to create Razorpay order');
      }

      // Get Razorpay options
      const options = getRazorpayOptions(
        orderResponse.razorpay_order_id,
        amount * 100, // Convert to paise
        'Wallet Top-up',
        userData
      );

      console.log('🔧 Opening Razorpay checkout with options:', options);

      // Open Razorpay checkout
      RazorpayCheckout.open(options)
        .then(async (data: any) => {
          console.log('✅ Razorpay payment success:', data);
          
          // Handle payment success
          await handlePaymentSuccess({
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_order_id: data.razorpay_order_id,
            razorpay_signature: data.razorpay_signature
          });

          // Refresh wallet data
          await refreshBalance();
          await refreshTransactions();

          setRazorpayAmount('');
          if (subscribePlanParam === 'MONTHLY' || subscribePlanParam === 'YEARLY') {
            // The top-up was for a subscription: go back and buy the plan right away (the Subscription screen does it).
            router.replace({ pathname: '/subscription', params: { autoPlan: subscribePlanParam } } as any);
            return;
          }
          Alert.alert('Success', `₹${amount} added to your wallet successfully!`);
        })
        .catch(async (error: any) => {
          console.error('❌ Razorpay payment error:', error);
          
          // Handle payment failure
          handlePaymentFailure(error);
          
          if (error.error?.code === 'BAD_REQUEST_ERROR') {
            Alert.alert('Payment Failed', error.error?.description || 'Invalid payment details');
          } else if (error.error?.code === 'NETWORK_ERROR') {
            Alert.alert('Network Error', 'Please check your internet connection and try again');
          } else if (error.error?.code !== 'PAYMENT_CANCELLED') {
            Alert.alert('Payment Failed', error.error?.description || 'Payment could not be processed');
          }
        });
    } catch (error: any) {
      console.error('❌ Error processing Razorpay payment:', error);
      Alert.alert('Error', error.message || 'Failed to process payment. Please try again.');
    } finally {
      setProcessingRazorpay(false);
    }
  };

  // Refresh wallet data
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshBalance(), refreshTransactions()]);
    } catch (error: any) {
      console.error('❌ Refresh failed:', error);
      
      // Handle authentication errors
      if (error.message?.includes('No authentication token found') || 
          error.message?.includes('Authentication failed') || 
          error.message?.includes('401')) {
        console.log('🔐 Authentication error detected, redirecting to login');
        Alert.alert(
          t('wallet.sessionExpiredTitle'),
          t('wallet.sessionExpiredBody'),
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login')
            }
          ]
        );
      }
    } finally {
      setRefreshing(false);
    }
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    balanceCard: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      padding: 24,
      marginTop: 20,
      alignItems: 'center',
    },
    balanceLabel: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: '#E5E7EB',
      marginBottom: 8,
    },
    balanceAmount: {
      fontSize: 32,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
    },
    lowBalanceWarning: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 6,
      padding: 12,
      marginTop: 16,
    },
    warningText: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: '#FFFFFF',
      textAlign: 'center',
    },
    errorBanner: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 6,
      padding: 12,
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    errorText: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.error,
      marginLeft: 8,
    },
    networkInfoBanner: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    networkInfoText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: '#FFFFFF',
      flex: 1,
      marginLeft: 12,
      lineHeight: 20,
    },
    contactNumber: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: '#FEF3C7',
      fontWeight: 'bold',
    },
    addMoneySection: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginTop: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      marginBottom: 16,
    },
    amountInput: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      marginLeft: 12,
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.text,
    },
    quickAmounts: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    quickAmountButton: {
      backgroundColor: colors.background,
      borderRadius: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      minWidth: '48%',
    },
    quickAmountText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      textAlign: 'center',
    },
    addMoneyButton: {
      backgroundColor: colors.success,
      borderRadius: 6,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addMoneyButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      marginLeft: 8,
    },
    upiLinkContainer: {
      marginTop: 8,
      alignItems: 'center',
    },
    upiLinkText: {
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    loadingButton: {
      opacity: 0.7,
    },
    transactionsSection: {
      marginTop: 24,
      marginBottom: 20,
    },
    transactionCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    transactionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      marginRight: 12,
    },
    transactionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    transactionInfo: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    transactionTitle: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    transactionDate: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginTop: 2,
    },
    transactionTime: {
      fontSize: 11,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginTop: 1,
    },
    transactionStatus: {
      fontSize: 10,
      fontFamily: 'Inter-Medium',
      marginTop: 2,
    },
    transactionAmountContainer: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    transactionAmount: {
      fontSize: 15,
      fontFamily: 'Inter-Bold',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyStateText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 12,
    },
  });

  // Helper function to format date and time
  const formatTransactionDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      
      // Format date (e.g., "Dec 15, 2024")
      const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      // Format time with AM/PM (e.g., "2:30 PM")
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      return { date: formattedDate, time: formattedTime };
    } catch (error) {
      console.warn('Failed to format date:', dateString, error);
      return { date: 'Invalid Date', time: 'Invalid Time' };
    }
  };

  const TransactionCard = ({ transaction }: { transaction: any }) => {
    const isCredit = transaction.entry_type === 'CREDIT';
    const isDebit = transaction.entry_type === 'DEBIT';
    
    const { date, time } = formatTransactionDateTime(transaction.created_at || transaction.date);
    
    return (
      <TouchableOpacity
        style={dynamicStyles.transactionCard}
        activeOpacity={0.75}
        onPress={() => transaction.id && setLedgerDetailId(String(transaction.id))}
      >
        <View style={dynamicStyles.transactionLeft}>
          <View style={[
            dynamicStyles.transactionIcon,
            { backgroundColor: isCredit ? '#D1FAE5' : '#FEE2E2' }
          ]}>
            {isCredit ? (
              <ArrowUpRight color={colors.success} size={16} />
            ) : (
              <ArrowDownLeft color={colors.error} size={16} />
            )}                                 
          </View>
          <View style={dynamicStyles.transactionInfo}>
            <Text style={dynamicStyles.transactionTitle}>{transaction.notes || transaction.description}</Text>
            <Text style={dynamicStyles.transactionDate}>{date}</Text>
            <Text style={dynamicStyles.transactionTime}>{time}</Text>
            <Text style={[
              dynamicStyles.transactionStatus,
              { 
                color: isCredit ? colors.success : colors.error
              }
            ]}>
              {transaction.entry_type}
            </Text>
          </View>
        </View>
        <View style={[
          dynamicStyles.transactionAmountContainer,
          { backgroundColor: isCredit ? '#D1FAE5' : '#FEE2E2' }
        ]}>
          <Text style={[
            dynamicStyles.transactionAmount,
            { color: isCredit ? colors.success : colors.error }
          ]}>
            {isCredit ? '+' : '-'}₹{transaction.amount}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>{t('wallet.title')}</Text>
      </View>

      <ScrollView 
        style={dynamicStyles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={dynamicStyles.balanceCard}>
          <Text style={dynamicStyles.balanceLabel}>{t('wallet.availableBalance')}</Text>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <Text style={dynamicStyles.balanceAmount}>₹{Math.round(Number(balance) || 0)}</Text>
          )}

          {/* Security Hold Metric Pill with (i) Info Button */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.18)',
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 10,
            marginTop: 10,
            gap: 6,
          }}>
            <ShieldCheck size={14} color="#FFFFFF" />
            <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'Inter-Medium' }}>
              Hold: min ₹500 / ride
            </Text>
            <TouchableOpacity
              onPress={() => setShowSecurityHoldInfo(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                backgroundColor: 'rgba(255,255,255,0.3)',
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 2,
              }}
            >
              <Info size={11} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {balance < 1000 && (
            <View style={dynamicStyles.lowBalanceWarning}>
              <Text style={dynamicStyles.warningText}>
                {t('wallet.lowBalanceWarning')}
              </Text>
            </View>
          )}
        </View>

        {/* Membership Section (Section D) */}
        <View style={{
          backgroundColor: colors.surface,
          borderRadius: 8,
          padding: 14,
          marginTop: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Crown size={18} color={billingStatus?.tier === 'PREFERRED' ? '#10B981' : '#F59E0B'} />
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>
                {t('Your membership')}
              </Text>
            </View>
            <View style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: billingStatus?.tier === 'PREFERRED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            }}>
              <Text style={{
                fontSize: 11,
                fontFamily: 'Inter-Bold',
                color: billingStatus?.tier === 'PREFERRED' ? '#10B981' : '#D97706',
              }}>
                {billingStatus?.tier === 'PREFERRED'
                  ? (billingStatus.days_remaining != null && billingStatus.days_remaining >= 0
                      ? `Trusted Partner · ${billingStatus.days_remaining}d left`
                      : 'Trusted Partner')
                  : 'Standard Partner'}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 10, lineHeight: 17 }}>
            {t('Trusted Partners get first chance at bookings')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Info size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Regular', color: colors.textSecondary, flex: 1 }}>
                {t('Wallet money is used for bookings and plans. Unused money stays yours.')}
              </Text>
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 6,
              }}
              onPress={() => router.push('/subscription')}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                {billingStatus?.tier === 'PREFERRED' ? t('Manage Plan') : t('See plans')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Subscriber-Gated Earnings-Over-Time View (Section 3) */}
        {earningsSummary && (
          <View style={{
            backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            marginTop: 16,
            borderWidth: 1,
            borderColor: colors.border,
            elevation: 3,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
          }}>
            {earningsSummary.is_subscriber ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TrendingUp color={colors.primary} size={18} />
                    <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>
                      Driver Earnings-Over-Time
                    </Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                      {earningsSummary.subscription_tier} PERK
                    </Text>
                  </View>
                </View>

                {/* Stat Grid */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-SemiBold', color: colors.textSecondary }}>THIS WEEK</Text>
                    <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.primary, marginTop: 2 }}>
                      ₹{earningsSummary.this_week_earnings?.toLocaleString('en-IN') || 0}
                    </Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-Medium', color: '#10B981', marginTop: 2 }}>
                      {earningsSummary.percentage_change} vs last week
                    </Text>
                  </View>

                  <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-SemiBold', color: colors.textSecondary }}>LAST WEEK</Text>
                    <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginTop: 2 }}>
                      ₹{earningsSummary.last_week_earnings?.toLocaleString('en-IN') || 0}
                    </Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 2 }}>
                      {earningsSummary.last_week_trip_count || 0} trips completed
                    </Text>
                  </View>
                </View>

                {/* Best Day Badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, marginBottom: 14 }}>
                  <Award color="#F59E0B" size={14} />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                    Best Day: <Text style={{ fontFamily: 'Inter-Bold', color: '#F59E0B' }}>{earningsSummary.best_day}</Text>
                  </Text>
                </View>

                {/* 7-Day Visual Daily Breakdown */}
                <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>
                  THIS WEEK DAILY BREAKDOWN
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80, paddingTop: 10 }}>
                  {earningsSummary.daily_breakdown?.map((dayItem: any, idx: number) => {
                    const maxVal = Math.max(...earningsSummary.daily_breakdown.map((d: any) => d.earnings), 1);
                    const barHeight = Math.max(12, Math.round((dayItem.earnings / maxVal) * 55));
                    return (
                      <View key={idx} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 8, color: colors.textSecondary, marginBottom: 2 }}>
                          {dayItem.earnings > 0 ? `₹${Math.round(dayItem.earnings / 1000)}k` : '-'}
                        </Text>
                        <View style={{ width: 14, height: barHeight, backgroundColor: dayItem.earnings > 0 ? colors.primary : colors.border, borderRadius: 4 }} />
                        <Text style={{ fontSize: 10, fontFamily: 'Inter-SemiBold', color: colors.text, marginTop: 4 }}>
                          {dayItem.day}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ShieldCheck color={colors.primary} size={28} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text, textAlign: 'center' }}>
                  Unlock Driver Earnings Analytics
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 12 }}>
                  Subscribed drivers get full weekly earnings breakdown, best day tracking, and trip growth insights.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}
                  onPress={() => router.push('/subscription' as any)}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold' }}>Upgrade to Unlock Analytics</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {error && (
          <View style={dynamicStyles.errorBanner}>
            <AlertCircle color={colors.error} size={16} />
            <Text style={dynamicStyles.errorText}>{error}</Text>
          </View>
        )}

        {/* Add Money primary button + small UPI link */}
        <View style={{ marginTop: 24 }}>
          {/* Main Add Money button (Razorpay) */}
          <TouchableOpacity 
            style={[dynamicStyles.addMoneyButton, { paddingHorizontal: 24, backgroundColor: colors.success }]}
            onPress={() => setShowAmountModal(true)}
            disabled={processingRazorpay}
          >
            <Text style={dynamicStyles.addMoneyButtonText}>{t('wallet.addMoney')}</Text>
            <CreditCard color="#FFFFFF" size={20} style={{ marginLeft: 10 }} />
          </TouchableOpacity>

          {/* Small "Add money via UPI" text link, like "Forgot password" */}
          <View style={dynamicStyles.upiLinkContainer}>
            <TouchableOpacity onPress={handleShowQR} disabled={processingRazorpay}>
              <Text style={dynamicStyles.upiLinkText}>{t('wallet.addMoneyViaUpi')}</Text>
            </TouchableOpacity>
          </View>

          {/* Request Payout - cash out wallet balance, settled manually by admin */}
          <TouchableOpacity
            style={[dynamicStyles.addMoneyButton, { marginTop: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
            onPress={() => {
              // Pre-fill with the actual max redeemable amount instead of
              // making the driver guess a number and hit the "you can
              // redeem up to X" error - MIN_RETAINED_BALANCE mirrors
              // backend/app/crud/payout_requests.py's floor.
              const MIN_RETAINED_BALANCE = 500;
              const maxRedeemable = Math.max(0, Math.floor((balance ?? 0) - MIN_RETAINED_BALANCE));
              setPayoutAmount(maxRedeemable > 0 ? String(maxRedeemable) : '');
              setShowPayoutModal(true);
            }}
          >
            <Text style={[dynamicStyles.addMoneyButtonText, { color: colors.text }]}>{t('wallet.requestPayout')}</Text>
            <ArrowUpRight color={colors.text} size={20} style={{ marginLeft: 10 }} />
          </TouchableOpacity>
        </View>

        {/* Payout request status list */}
        {payoutRequests.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={dynamicStyles.sectionTitle}>{t('wallet.payoutRequests')}</Text>
            {payoutRequests.map((req) => {
              const statusColor = req.status === 'PAID' ? colors.success : req.status === 'REJECTED' ? colors.error : '#D97706';
              return (
                <View key={req.id} style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: colors.surface, borderRadius: 6, padding: 12, marginTop: 8,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <View>
                    <Text style={{ fontFamily: 'Inter-SemiBold', color: colors.text, fontSize: 15 }}>₹{req.amount}</Text>
                    <Text style={{ fontFamily: 'Inter-Regular', color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {new Date(req.requested_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: statusColor + '22' }}>
                    <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 12, color: statusColor }}>{req.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Modular Dual-Mode Withdraw Modal */}
        <WithdrawModal
          visible={showPayoutModal}
          walletBalance={Number(balance) || 0}
          minRetainedBalance={500}
          loading={requestingPayout}
          onClose={() => setShowPayoutModal(false)}
          onSubmit={handleRequestPayoutSubmit}
        />

        {/* QR Code Modal */}
        <Modal
          visible={showQRModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowQRModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 24, width: '90%', maxWidth: 400, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: colors.text }}>{t('wallet.scanQrTitle')}</Text>
                <TouchableOpacity 
                  onPress={() => setShowQRModal(false)}
                  style={{ padding: 4 }}
                >
                  <X color={colors.textSecondary} size={24} />
                </TouchableOpacity>
              </View>
              
              <View style={{ width: 280, height: 280, backgroundColor: '#FFFFFF', borderRadius: 6, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
                <Image 
                  source={require('../../assets/images/Qrcodepay.jpeg')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                  onError={(error) => {
                    console.error('QR Code image load error:', error);
                  }}
                />
              </View>
              
              <View style={{ width: '100%', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 8 }}>{t('wallet.upiIdLabel')}</Text>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
                  onPress={handleUPICopy}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.primary, textAlign: 'center' }}>7200217986-1@okbizaxis</Text>
                  <Copy color={colors.primary} size={18} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Regular', color: colors.textSecondary }}>Drop Cars</Text>
              </View>
              
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 14, paddingHorizontal: 24, width: '100%' }}
                onPress={handleUPICopy}
              >
                <Copy color="#FFFFFF" size={18} />
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-SemiBold', marginLeft: 8 }}>{t('wallet.copyUpiId')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Razorpay Amount Input Modal */}
        <Modal
          visible={showAmountModal}
          transparent
          animationType="slide"
          onRequestClose={() => { setShowAmountModal(false); setAmountModalError(null); }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 24, width: '90%', maxWidth: 400 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: colors.text }}>{t('wallet.addMoney')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowAmountModal(false);
                    setRazorpayAmount('');
                    setAmountModalError(null);
                  }}
                  style={{ padding: 4 }}
                  disabled={processingRazorpay}
                >
                  <X color={colors.textSecondary} size={24} />
                </TouchableOpacity>
              </View>

              {amountModalError && (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F59E0B' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: '#92400E', marginBottom: 10, lineHeight: 18 }}>
                    {amountModalError}
                  </Text>

                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#D97706',
                      borderRadius: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                    }}
                    onPress={() => {
                      setShowAmountModal(false);
                      setAmountModalError(null);
                      setShowQRModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Copy color="#FFFFFF" size={16} />
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold', marginLeft: 8 }}>
                      View QR Code & UPI ID
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 12 }}>
                {t('wallet.enterAmountToAdd')}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>₹</Text>
                <TextInput
                  style={{ flex: 1, marginLeft: 10, fontSize: 18, fontFamily: 'Inter-SemiBold', color: colors.text }}
                  value={razorpayAmount}
                  onChangeText={(text) => {
                    // Allow only numbers and one decimal point
                    const cleaned = text.replace(/[^0-9.]/g, '');
                    // Ensure only one decimal point
                    const parts = cleaned.split('.');
                    if (parts.length > 2) return;
                    setRazorpayAmount(cleaned);
                  }}
                  placeholder={t('wallet.enterAmount')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  maxLength={10}
                  editable={!processingRazorpay}
                />
              </View>

              {razorpayFeeBreakdown && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 6, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 4 }}>
                    {t('wallet.willBeAddedToWallet', { amount: razorpayFeeBreakdown.base.toFixed(0) })}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginBottom: 6 }}>
                    {t('wallet.feeAndGst', { fee: razorpayFeeBreakdown.fee.toFixed(2), gst: razorpayFeeBreakdown.gst.toFixed(2) })}
                  </Text>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>
                    {t('wallet.payableNow', { amount: razorpayFeeBreakdown.payable.toFixed(2) })}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                {[100, 500, 1000, 2000].map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}
                    onPress={() => setRazorpayAmount(amt.toString())}
                    disabled={processingRazorpay}
                  >
                    <Text style={{ textAlign: 'center', fontSize: 14, fontFamily: 'Inter-SemiBold', color: colors.text }}>₹{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: colors.success, 
                  borderRadius: 6, 
                  paddingVertical: 14, 
                  marginTop: 20,
                  opacity: processingRazorpay ? 0.7 : 1
                }}
                onPress={handleRazorpayPayment}
                disabled={processingRazorpay}
              >
                {processingRazorpay ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-SemiBold', marginLeft: 8 }}>{t('wallet.processing')}</Text>
                  </>
                ) : (
                  <>
                    <CreditCard color="#FFFFFF" size={18} />
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-SemiBold', marginLeft: 8 }}>{t('wallet.proceedToPay')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={dynamicStyles.transactionsSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={dynamicStyles.sectionTitle}>{t('wallet.transactionHistory')}</Text>
          </View>

          {/* Filter segment: All transactions vs Redeems & Payouts only */}
          <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
            <TouchableOpacity
              onPress={() => setLedgerFilter('ALL')}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: ledgerFilter === 'ALL' ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: ledgerFilter === 'ALL' ? colors.primary : colors.border,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontFamily: 'Inter-SemiBold',
                color: ledgerFilter === 'ALL' ? '#FFFFFF' : colors.text,
              }}>
                {t('wallet.filterAll')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLedgerFilter('PAYOUTS')}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: ledgerFilter === 'PAYOUTS' ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: ledgerFilter === 'PAYOUTS' ? colors.primary : colors.border,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontFamily: 'Inter-SemiBold',
                color: ledgerFilter === 'PAYOUTS' ? '#FFFFFF' : colors.text,
              }}>
                {t('wallet.filterPayouts')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Date range: 10 days / 30 days / All time */}
          <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
            {([
              { key: '10', label: '10 Days' },
              { key: '30', label: '30 Days' },
              { key: 'ALL', label: 'All Time' },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setTxDateRange(opt.key)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 6,
                  alignItems: 'center',
                  backgroundColor: txDateRange === opt.key ? colors.primary + '20' : 'transparent',
                  borderWidth: 1,
                  borderColor: txDateRange === opt.key ? colors.primary : colors.border,
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'Inter-SemiBold',
                  color: txDateRange === opt.key ? colors.primary : colors.textSecondary,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={dynamicStyles.emptyState}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={dynamicStyles.emptyStateText}>{t('wallet.loadingTransactions')}</Text>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={ledgerFilter === 'PAYOUTS' ? t('wallet.noPayoutsYet') : t('wallet.noTransactionsYet')}
            />
          ) : (
            filteredTransactions.map((transaction: any) => (
              <TransactionCard key={transaction.id} transaction={transaction} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Security Hold & Cancellation Rules Info Modal */}
      <SecurityHoldInfoModal
        visible={showSecurityHoldInfo}
        onClose={() => setShowSecurityHoldInfo(false)}
      />
      <LedgerDetailSheet entryId={ledgerDetailId} onClose={() => setLedgerDetailId(null)} />
      <RefreshFab onRefresh={handleRefresh} />
    </SafeAreaView>
  );
}
