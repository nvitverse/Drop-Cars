import React, { useState, useEffect, useRef } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosInstance from '@/app/api/axiosInstance';
import {
  ShieldCheck,
  Zap,
  TrendingUp,
  CheckCircle2,
  Crown,
  ArrowLeft,
  Wallet,
  Sparkles,
  Award,
  ArrowRight,
  Plus,
  ChevronRight,
  Check,
} from 'lucide-react-native';

const DRIVER_PERKS = [
  { 
    titleKey: 'perk1Title', 
    descKey: 'perk1Desc', 
    icon: Zap, 
    defaultTitle: 'Priority Trip Dispatch', 
    defaultDesc: 'See and accept VIP outstation & one-way bookings before standard release' 
  },
  { 
    titleKey: 'perk2Title', 
    descKey: 'perk2Desc', 
    icon: Award, 
    defaultTitle: 'Verified Trusted Partner Badge', 
    defaultDesc: 'Gold Trusted Badge displayed on your profile & customer booking screens' 
  },
  { 
    titleKey: 'perk3Title', 
    descKey: 'perk3Desc', 
    icon: TrendingUp, 
    defaultTitle: '0% Extra Commission', 
    defaultDesc: 'Retain maximum earnings on every high-value passenger trip' 
  },
  { 
    titleKey: 'perk4Title', 
    descKey: 'perk4Desc', 
    icon: Crown, 
    defaultTitle: 'VIP Empty-Return Matching', 
    defaultDesc: 'Top priority for vacant return rides with live automated passenger match' 
  },
];

export default function DriverSubscriptionScreen() {
  const router = useRouter();
  const { focusBookingId, flow, autoPlan } = useLocalSearchParams<{ focusBookingId?: string; flow?: string; autoPlan?: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = insets.top || 20;
  const { colors, isDarkMode: isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();

  const palette = {
    background: colors.background,
    surface: colors.surface,
    border: colors.border,
    textPrimary: colors.text,
    textMuted: colors.textSecondary,
    headerGradient: ['#0F172A', '#1E293B'] as const,
  };

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tier, setTier] = useState<'FREE' | 'MONTHLY' | 'YEARLY'>('FREE');
  const [walletBalance, setWalletBalance] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Pricing configuration
  const [pricing, setPricing] = useState<{ MONTHLY: number; YEARLY: number; yearly_offer_active: boolean; yearly_offer_until: string }>({
    MONTHLY: 199,
    YEARLY: 1000,
    yearly_offer_active: true,
    yearly_offer_until: '2026-12-12',
  });

  const driverId = user?.id || user?.primaryMobile || 'driver_demo_user';

  const fetchStatus = async () => {
    setInitialLoading(true);
    try {
      const axiosDriverModule = (await import('@/app/api/axiosDriver')).default;
      const res = await axiosDriverModule.get('/api/subscriptions/driver/status', {
        params: { user_id: driverId },
      }).catch(async () => {
        // Fallback for Vehicle Owner / Fleet Partner session
        const ownerRes = await axiosInstance.get('/api/users/vehicle-owner/billing-status').catch(() => null);
        if (ownerRes?.data) {
          return {
            data: {
              tier: ownerRes.data.tier === 'PREFERRED' ? (ownerRes.data.subscription_type === 'YEARLY' ? 'YEARLY' : 'MONTHLY') : 'FREE',
              wallet_balance: ownerRes.data.wallet_balance ?? 0,
              expires_at: ownerRes.data.due_date || null,
              pricing: { MONTHLY: 199, YEARLY: 1000, yearly_offer_active: true, yearly_offer_until: '2026-12-12' }
            }
          };
        }
        return { data: null };
      });

      if (res?.data) {
        setTier(res.data.tier || 'FREE');
        setWalletBalance(res.data.wallet_balance ?? 0);
        setExpiresAt(res.data.expires_at || null);
        if (res.data.pricing) setPricing(res.data.pricing);
      }
    } catch (e: any) {
      console.log('Error loading subscription status:', e);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [user]);

  const currentPlanPrice = selectedPlan === 'MONTHLY' ? pricing.MONTHLY : pricing.YEARLY;
  const shortfall = Math.max(0, currentPlanPrice - walletBalance);

  // Coming back from "Add money" with the plan the driver chose: buy it now. Before, the money landed in the wallet and the
  // driver had to find this screen and tap Subscribe again - many thought the payment had failed ("paid 199, no subscription").
  const autoBuyDone = useRef(false);
  useEffect(() => {
    if (autoBuyDone.current || initialLoading || (autoPlan !== 'MONTHLY' && autoPlan !== 'YEARLY')) return;
    if (selectedPlan !== autoPlan) { setSelectedPlan(autoPlan); return; }
    autoBuyDone.current = true;
    if (tier === autoPlan || shortfall > 0) return;        // already subscribed, or the payment did not cover it: leave the screen as is
    handleSubscribe();
  }, [autoPlan, initialLoading, selectedPlan, tier, shortfall]);

  const handleSubscribe = async () => {
    if (shortfall > 0) {
      // Direct driver to add exact shortfall to wallet
      router.push({
        pathname: '/(tabs)/wallet',
        params: { amount: String(shortfall), plan: selectedPlan },
      } as any);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const axiosDriverModule = (await import('@/app/api/axiosDriver')).default;
      let res;
      try {
        res = await axiosDriverModule.post('/api/subscriptions/driver/subscribe', {
          user_id: driverId,
          plan_type: selectedPlan,
        });
      } catch (driverErr: any) {
        const isRoleMismatch = driverErr?.response?.data?.detail === 'Not a driver session';
        if (isRoleMismatch) {
          const endpoint = selectedPlan === 'YEARLY' 
            ? '/api/users/vehicle-owner/subscription/upgrade-yearly' 
            : '/api/users/vehicle-owner/subscription/start-monthly';
          res = await axiosInstance.put(endpoint);
          setTier(selectedPlan);
          await fetchStatus();
          setShowSuccessModal(true);
          return;
        }
        throw driverErr;
      }

      if (res.data && res.data.success) {
        setTier(res.data.tier);
        setExpiresAt(res.data.expires_at);
        setWalletBalance(res.data.remaining_wallet_balance);
        setShowSuccessModal(true);
      }
    } catch (e: any) {
      const errorDetail = e?.response?.data?.detail || t('Could not activate plan. Please try again.');
      if (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('insufficient')) {
        Alert.alert(
          t('Insufficient Wallet Balance'),
          t('Add ₹{0} to your wallet to buy this plan', { 0: shortfall }),
          [
            { text: t('Add Money'), onPress: () => router.push({ pathname: '/(tabs)/wallet', params: { amount: String(shortfall), plan: selectedPlan } } as any) },
            { text: t('Cancel'), style: 'cancel' },
          ]
        );
      } else {
        Alert.alert(t('Subscription Error'), String(errorDetail));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSuccess = () => {
    setShowSuccessModal(false);
    if (focusBookingId) {
      router.replace({
        pathname: '/(tabs)',
        params: { focusBookingId: String(focusBookingId) },
      } as any);
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const handleContinueAsStandard = () => {
    if (focusBookingId) {
      router.replace({
        pathname: '/(tabs)',
        params: { focusBookingId: String(focusBookingId) },
      } as any);
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const handleBackPress = () => {
    if (flow === 'onboarding') {
      handleContinueAsStandard();
    } else {
      safeBack(router);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* LUXURY HERO BANNER */}
      <LinearGradient
        colors={isDark ? ['#090D16', '#1E1B4B', '#312E81'] : ['#0F172A', '#1E293B', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroGradient, { paddingTop: topPadding + 4 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBackPress} activeOpacity={0.7}>
            <ArrowLeft color="#FFFFFF" size={18} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadgePill}>
              <Crown color="#F59E0B" size={13} />
              <Text style={styles.headerBadgeText}>
                {tier !== 'FREE' ? t('TRUSTED PARTNER ACTIVE') : t('PARTNER REGISTRATION')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.skipTopBtn}
            onPress={handleContinueAsStandard}
            activeOpacity={0.7}
          >
            <Text style={styles.skipTopText}>{t('Skip')}</Text>
          </TouchableOpacity>
        </View>

        {/* HERO CONTENT */}
        <View style={styles.heroCenter}>
          <View style={styles.trustedBadgeGlow}>
            <LinearGradient
              colors={['#F59E0B', '#D97706', '#B45309']}
              style={styles.trustedIconBox}
            >
              <ShieldCheck color="#FFFFFF" size={32} />
            </LinearGradient>
          </View>

          <Text style={styles.heroMainTitle}>
            {t('Trusted Partner Membership')}
          </Text>
          <Text style={styles.heroSubtitle}>
            {t('Get first priority on bookings, verified badge & maximize your daily earnings')}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollInner} 
        showsVerticalScrollIndicator={false}
      >
        {/* CURRENT TIER STATUS CARD */}
        <View style={[styles.statusCard, { backgroundColor: palette.surface, borderColor: tier !== 'FREE' ? '#10B981' : palette.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.iconWrap, { backgroundColor: tier !== 'FREE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' }]}>
                {tier !== 'FREE' ? (
                  <ShieldCheck color="#10B981" size={24} />
                ) : (
                  <Crown color="#F59E0B" size={24} />
                )}
              </View>
              <View>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontFamily: 'Inter-Bold' }}>
                  {tier !== 'FREE' ? t('Trusted Partner Account') : t('Standard Partner Account')}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: 12, fontFamily: 'Inter-Medium', marginTop: 2 }}>
                  {tier !== 'FREE' ? t('Priority VIP dispatch enabled') : t('Standard broadcast queue')}
                </Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: tier !== 'FREE' ? '#10B981' : '#64748B' }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter-Bold' }}>
                {tier !== 'FREE' ? t('Active') : t('Standard')}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Wallet color="#0EA5E9" size={16} />
              <Text style={{ color: palette.textMuted, fontSize: 12.5, fontFamily: 'Inter-Medium' }}>
                {t('Your wallet balance:')}
              </Text>
            </View>
            <Text style={{ color: '#10B981', fontSize: 15, fontFamily: 'Inter-Bold' }}>
              ₹{walletBalance}
            </Text>
          </View>
        </View>

        {/* COMPARISON BENEFIT PILLS */}
        <View style={[styles.comparisonCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.comparisonTitle, { color: palette.textPrimary }]}>
            {t('Why become a Trusted Partner?')}
          </Text>

          <View style={styles.comparisonTable}>
            <View style={[styles.tableHeader, { borderBottomColor: palette.border }]}>
              <Text style={[styles.colFeature, { color: palette.textMuted }]}>{t('Benefits')}</Text>
              <Text style={[styles.colStandard, { color: palette.textMuted }]}>{t('Standard')}</Text>
              <Text style={[styles.colTrusted, { color: '#F59E0B' }]}>{t('Trusted ★')}</Text>
            </View>

            <View style={[styles.tableRow, { borderBottomColor: palette.border }]}>
              <Text style={[styles.colFeature, { color: palette.textPrimary }]}>{t('Booking Broadcast')}</Text>
              <Text style={[styles.colStandard, { color: palette.textMuted }]}>{t('Standard')}</Text>
              <View style={styles.colTrustedWrap}>
                <Sparkles size={13} color="#10B981" />
                <Text style={styles.colTrustedHighlight}>{t('Instant / 1st')}</Text>
              </View>
            </View>

            <View style={[styles.tableRow, { borderBottomColor: palette.border }]}>
              <Text style={[styles.colFeature, { color: palette.textPrimary }]}>{t('Verified Gold Badge')}</Text>
              <Text style={[styles.colStandard, { color: '#94A3B8' }]}>✕</Text>
              <View style={styles.colTrustedWrap}>
                <Check size={14} color="#10B981" />
                <Text style={styles.colTrustedHighlight}>{t('Yes')}</Text>
              </View>
            </View>

            <View style={[styles.tableRow, { borderBottomColor: palette.border }]}>
              <Text style={[styles.colFeature, { color: palette.textPrimary }]}>{t('Return Passenger Match')}</Text>
              <Text style={[styles.colStandard, { color: palette.textMuted }]}>{t('Normal')}</Text>
              <View style={styles.colTrustedWrap}>
                <Check size={14} color="#10B981" />
                <Text style={styles.colTrustedHighlight}>{t('Priority VIP')}</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.colFeature, { color: palette.textPrimary }]}>{t('Commission Surcharge')}</Text>
              <Text style={[styles.colStandard, { color: palette.textMuted }]}>{t('Standard')}</Text>
              <View style={styles.colTrustedWrap}>
                <Text style={styles.colTrustedHighlight}>{t('0% Extra')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* PLAN SELECTION */}
        <Text style={[styles.sectionTitle, { color: palette.textPrimary, marginTop: 10 }]}>
          {t('Select Registration Plan')}
        </Text>
        
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
          {/* Monthly Plan */}
          <TouchableOpacity
            onPress={() => setSelectedPlan('MONTHLY')}
            activeOpacity={0.85}
            style={[
              styles.planBox,
              {
                backgroundColor: palette.surface,
                borderColor: selectedPlan === 'MONTHLY' ? colors.primary : palette.border,
                borderWidth: selectedPlan === 'MONTHLY' ? 2 : 1,
              },
            ]}
          >
            <View style={styles.planHeaderRow}>
              <Text style={{ color: palette.textMuted, fontSize: 12, fontFamily: 'Inter-Bold' }}>
                {t('Monthly Plan')}
              </Text>
              {selectedPlan === 'MONTHLY' && (
                <CheckCircle2 color={colors.primary} size={16} />
              )}
            </View>
            <Text style={{ color: palette.textPrimary, fontSize: 24, fontFamily: 'Inter-Bold', marginVertical: 6 }}>
              ₹{pricing.MONTHLY}
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: palette.textMuted }}> /30 days</Text>
            </Text>
            <Text style={{ color: '#10B981', fontSize: 11, fontFamily: 'Inter-SemiBold' }}>
              {t('Priority dispatch & badge')}
            </Text>
          </TouchableOpacity>

          {/* Yearly Plan */}
          <TouchableOpacity
            onPress={() => setSelectedPlan('YEARLY')}
            activeOpacity={0.85}
            style={[
              styles.planBox,
              {
                backgroundColor: palette.surface,
                borderColor: selectedPlan === 'YEARLY' ? '#F59E0B' : palette.border,
                borderWidth: selectedPlan === 'YEARLY' ? 2 : 1,
              },
            ]}
          >
            <View style={styles.saveBadge}>
              <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter-Bold' }}>
                {pricing.yearly_offer_active ? t('LAUNCH OFFER') : t('SAVE 58%')}
              </Text>
            </View>
            <View style={styles.planHeaderRow}>
              <Text style={{ color: palette.textMuted, fontSize: 12, fontFamily: 'Inter-Bold' }}>
                {t('Annual VIP')}
              </Text>
              {selectedPlan === 'YEARLY' && (
                <CheckCircle2 color="#F59E0B" size={16} />
              )}
            </View>
            <Text style={{ color: palette.textPrimary, fontSize: 24, fontFamily: 'Inter-Bold', marginVertical: 6 }}>
              ₹{pricing.YEARLY.toLocaleString('en-IN')}
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: palette.textMuted }}> /365 days</Text>
            </Text>
            <Text style={{ color: '#F59E0B', fontSize: 11, fontFamily: 'Inter-SemiBold' }}>
              {pricing.yearly_offer_active ? t('Best value • Full 1 Year') : t('Maximum savings')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* PAYMENT SUMMARY & ACTION */}
        <View style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.summaryTitle, { color: palette.textPrimary }]}>
            {t('Payment & Activation')}
          </Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
              {selectedPlan === 'MONTHLY' ? t('Monthly Registration Fee') : t('Annual VIP Registration Fee')}
            </Text>
            <Text style={[styles.summaryValue, { color: palette.textPrimary }]}>
              ₹{currentPlanPrice}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
              {t('Your Wallet Balance')}
            </Text>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>
              ₹{walletBalance}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {shortfall > 0 ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: '#DC2626', fontFamily: 'Inter-Bold' }]}>
                  {t('Amount to Add to Wallet')}
                </Text>
                <Text style={[styles.summaryValue, { color: '#DC2626', fontSize: 16 }]}>
                  ₹{shortfall}
                </Text>
              </View>
              <Text style={[styles.summaryNote, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                {t('Add ₹{0} to your wallet to activate Trusted Partner status immediately', { 0: shortfall })}
              </Text>
            </>
          ) : (
            <View style={styles.sufficientBox}>
              <CheckCircle2 size={16} color="#10B981" />
              <Text style={{ color: '#10B981', fontSize: 12.5, fontFamily: 'Inter-SemiBold', flex: 1 }}>
                {t('Wallet balance is sufficient for instant activation')}
              </Text>
            </View>
          )}

          {/* MAIN UPGRADE BUTTON */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: shortfall > 0 ? '#D97706' : colors.primary },
            ]}
            onPress={handleSubscribe}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : shortfall > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>
                  {t('Add ₹{0} & Activate Trusted Partner', { 0: shortfall })}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>
                  {t('Activate Trusted Partner (₹{0})', { 0: currentPlanPrice })}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* TRUSTED PARTNER PERKS GRID */}
        <Text style={[styles.sectionTitle, { color: palette.textPrimary, marginTop: 8 }]}>
          {t('Membership Benefits')}
        </Text>
        <View style={[styles.perksCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {DRIVER_PERKS.map((perk) => {
            const IconComp = perk.icon;
            return (
              <View key={perk.titleKey} style={styles.perkItem}>
                <View style={[styles.perkIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                  <IconComp color="#F59E0B" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: 13.5, fontFamily: 'Inter-Bold' }}>
                    {t(perk.defaultTitle)}
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 11.5, fontFamily: 'Inter-Medium', marginTop: 2, lineHeight: 16 }}>
                    {t(perk.defaultDesc)}
                  </Text>
                </View>
                <CheckCircle2 color="#10B981" size={18} />
              </View>
            );
          })}
        </View>

        {/* SKIP OPTION: CONTINUE AS STANDARD PARTNER */}
        <View style={styles.skipSection}>
          <TouchableOpacity
            style={[styles.skipButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}
            onPress={handleContinueAsStandard}
            activeOpacity={0.7}
          >
            <Text style={[styles.skipButtonText, { color: palette.textMuted }]}>
              {t('Continue as Standard Partner')}
            </Text>
            <ChevronRight size={16} color={palette.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.skipSubText, { color: palette.textMuted }]}>
            {t('You can upgrade to Trusted Partner anytime from Settings or Wallet')}
          </Text>
        </View>
      </ScrollView>

      {/* SUCCESS MODAL */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleFinishSuccess}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.successCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.successIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <ShieldCheck size={40} color="#10B981" />
            </View>

            <Text style={[styles.successTitle, { color: palette.textPrimary }]}>
              {t('You are now a Trusted Partner! 🎉')}
            </Text>
            <Text style={[styles.successMessage, { color: palette.textMuted }]}>
              {t('Your verified gold badge is active. You will now receive priority outstation and city bookings!')}
            </Text>

            <TouchableOpacity
              style={[styles.successBtn, { backgroundColor: colors.primary }]}
              onPress={handleFinishSuccess}
            >
              <Text style={styles.successBtnText}>
                {focusBookingId ? t('Return to Booking') : t('Go to Bookings Dashboard')}
              </Text>
              <ArrowRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroGradient: { 
    paddingHorizontal: 16, 
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  headerTitleWrap: { alignItems: 'center' },
  headerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  headerBadgeText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  skipTopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  skipTopText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  heroCenter: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  trustedBadgeGlow: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  trustedIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  heroMainTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  scroll: { flex: 1 },
  scrollInner: { padding: 16, paddingBottom: 40 },
  statusCard: { 
    borderRadius: 14, 
    padding: 16, 
    borderWidth: 1, 
    marginBottom: 16,
    marginTop: -8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  divider: { height: 1, marginVertical: 12 },
  comparisonCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 18,
  },
  comparisonTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    marginBottom: 12,
  },
  comparisonTable: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  colFeature: {
    flex: 2,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  colStandard: {
    flex: 1.2,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  colTrusted: {
    flex: 1.4,
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    textAlign: 'right',
  },
  colTrustedWrap: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  colTrustedHighlight: {
    color: '#10B981',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter-Bold', marginBottom: 12 },
  planBox: { 
    flex: 1, 
    borderRadius: 12, 
    padding: 14, 
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveBadge: { 
    position: 'absolute', 
    top: -10, 
    right: 8, 
    backgroundColor: '#F59E0B', 
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 6,
    zIndex: 1,
  },
  summaryCard: { 
    borderRadius: 14, 
    padding: 16, 
    borderWidth: 1, 
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 13, fontFamily: 'Inter-Medium' },
  summaryValue: { fontSize: 14, fontFamily: 'Inter-Bold' },
  summaryNote: { fontSize: 12, fontFamily: 'Inter-Medium', marginBottom: 12 },
  sufficientBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  submitBtn: { 
    borderRadius: 10, 
    paddingVertical: 14, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 14.5, fontFamily: 'Inter-Bold' },
  perksCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 12, marginBottom: 20 },
  perkItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  perkIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  skipSection: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    width: '100%',
    maxWidth: 280,
  },
  skipButtonText: {
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
  },
  skipSubText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: '100%',
  },
  successBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
});
