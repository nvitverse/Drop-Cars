import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/app/api/axiosInstance';
import {
  Wallet,
  ArrowLeft,
  PlusCircle,
  Gift,
  History,
  Tag,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  Zap,
} from 'lucide-react-native';

// Same guarded pattern as book/standard.tsx / my-trips.tsx - native module
// isn't available on Expo web.
let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  try {
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch (e) {
    RazorpayCheckout = null;
  }
}

export default function DedicatedWalletScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user } = useAuth();

  // Real balance from CustomerDetails.wallet_balance via
  // GET /api/subscriptions/customer/status - this used to be local
  // setState only ("Add ₹500" just incremented a number in memory with no
  // backend call at all), so every rupee shown here was fake and nothing
  // was ever actually charged.
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [addingSuccess, setAddingSuccess] = useState(false);
  const [topupInFlight, setTopupInFlight] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/subscriptions/customer/status');
      setBalance(res.data?.wallet_balance ?? 0);
    } catch (e) {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchBalance(); }, [fetchBalance]));

  const topUp = async (amount: number) => {
    if (isNaN(amount) || amount <= 0) {
      if (Platform.OS === 'web') alert('Please enter a valid amount');
      else Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }
    if (!RazorpayCheckout) {
      Alert.alert('Payment unavailable', 'Online top-up isn\'t available on this device/platform yet.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTopupInFlight(true);
    try {
      const orderRes = await axiosInstance.post('/api/subscriptions/wallet/topup', { amount });
      const { rp_order_id, amount: rpAmount } = orderRes.data;

      const razorpayResult = await new Promise<any>((resolve, reject) => {
        RazorpayCheckout.open({
          description: 'Drop Wallet top-up',
          currency: 'INR',
          key: 'rzp_live_RuMG3DMZFdeT3Y',
          amount: rpAmount,
          name: 'Drop Cars',
          order_id: rp_order_id,
          prefill: {
            email: `${user?.phone || 'customer'}@dropcars.in`,
            contact: user?.phone || '9999999999',
            name: user?.name || 'Drop Cars Customer',
          },
          theme: { color: '#0EA5E9' },
        }).then(resolve).catch(reject);
      });

      // Amount credited is whatever Razorpay confirms was paid on this
      // order (looked up server-side), not sent from here - the backend
      // no longer accepts a client-supplied amount for this call.
      const verifyRes = await axiosInstance.post('/api/subscriptions/wallet/topup/verify', {
        rp_order_id: razorpayResult.razorpay_order_id || rp_order_id,
        rp_payment_id: razorpayResult.razorpay_payment_id,
        rp_signature: razorpayResult.razorpay_signature,
      });
      setBalance(verifyRes.data.new_balance);
      setCustomAmount('');
      setAddingSuccess(true);
      setTimeout(() => setAddingSuccess(false), 1500);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.description || 'Top-up was not completed.';
      Alert.alert('Top-up not completed', String(msg));
    } finally {
      setTopupInFlight(false);
    }
  };

  const handleAddPreset = (amount: number) => topUp(amount);
  const handleAddCustom = () => topUp(parseFloat(customAmount));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* HEADER */}
      <LinearGradient
        colors={palette.headerGradient}
        style={{ paddingTop: topPadding + 4, paddingBottom: 14, paddingHorizontal: 16, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.back()}
          >
            <ArrowLeft color="#FFFFFF" size={20} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }}>Drop Wallet & Rewards</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>Cashbacks, Vouchers & Instant Pay</Text>
          </View>

          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* BALANCE DISPLAY CARD */}
        <LinearGradient
          colors={['#1E293B', '#0F172A']}
          style={{
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(251, 191, 36, 0.35)',
            gap: 12,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(251, 191, 36, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet color="#FBBF24" size={18} />
              </View>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '800' }}>TOTAL WALLET BALANCE</Text>
            </View>

            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#10B981' }}>
              <Text style={{ color: '#10B981', fontSize: 10.5, fontWeight: '800' }}>ACTIVE & READY</Text>
            </View>
          </View>

          {balanceLoading ? (
            <ActivityIndicator color="#FBBF24" size="small" style={{ alignSelf: 'flex-start', marginVertical: 6 }} />
          ) : balance === null ? (
            <Text style={{ color: '#F87171', fontSize: 14, fontWeight: '700' }}>Couldn't load balance</Text>
          ) : (
            <Text style={{ color: '#FBBF24', fontSize: 32, fontWeight: '900' }}>₹{balance.toLocaleString('en-IN')}</Text>
          )}

          {addingSuccess && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.15)', padding: 8, borderRadius: 10 }}>
              <CheckCircle2 color="#10B981" size={16} />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>Wallet topped up successfully!</Text>
            </View>
          )}
        </LinearGradient>

        {/* QUICK TOP-UP SECTION */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Add Money to Drop Wallet</Text>

          {/* PRESET CHIPS */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[100, 500, 1000, 2000].map((amt) => (
              <TouchableOpacity
                key={amt}
                style={{
                  flex: 1,
                  backgroundColor: palette.cardBg,
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => handleAddPreset(amt)}
                disabled={topupInFlight}
              >
                <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '900' }}>+₹{amt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* CUSTOM INPUT ROW */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: palette.cardBg,
                color: palette.textPrimary,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: palette.border,
                fontSize: 13,
                fontWeight: '700',
              }}
              placeholder="Or enter custom amount (e.g. 750)"
              placeholderTextColor={palette.placeholder}
              keyboardType="number-pad"
              value={customAmount}
              onChangeText={setCustomAmount}
            />

            <TouchableOpacity
              style={{
                backgroundColor: palette.accent,
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 4,
              }}
              onPress={handleAddCustom}
              disabled={topupInFlight}
            >
              {topupInFlight ? <ActivityIndicator color="#FFFFFF" size="small" /> : <PlusCircle color="#FFFFFF" size={16} />}
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' }}>{topupInFlight ? 'Processing…' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ACTIVE PROMO VOUCHERS & OFFERS */}
        <View style={{ gap: 10 }}>
          <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Active Reward Vouchers</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F59E0B', gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Tag color="#D97706" size={14} />
                <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '900' }}>DROP50</Text>
              </View>
              <Text style={{ color: palette.textPrimary, fontSize: 12, fontWeight: '800' }}>50% OFF Outstation Cabs</Text>
              <Text style={{ color: palette.textMuted, fontSize: 10 }}>Save up to ₹400 on intercity rides</Text>
            </View>

            <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#E0F2FE', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#0EA5E9', gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Zap color="#0EA5E9" size={14} />
                <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '900' }}>DROPBID150</Text>
              </View>
              <Text style={{ color: palette.textPrimary, fontSize: 12, fontWeight: '800' }}>Flat ₹150 Cashback</Text>
              <Text style={{ color: palette.textMuted, fontSize: 10 }}>On your next DropBid instant bid</Text>
            </View>
          </View>
        </View>

        {/* TRANSACTION LEDGER - a per-transaction log isn't tracked by the
            backend yet (wallet_balance is a single running total), so this
            honestly says so instead of showing invented transaction rows. */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 8, alignItems: 'center' }}>
          <History color={palette.textMuted} size={26} />
          <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '800' }}>Transaction history coming soon</Text>
          <Text style={{ color: palette.textMuted, fontSize: 11, textAlign: 'center' }}>
            Your top-ups are added to the balance above right away. A detailed log of each transaction isn't available yet.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
