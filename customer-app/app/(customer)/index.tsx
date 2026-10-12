import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
  Animated,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette, ThemePalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import { useTaxiFlow, RecentSearch } from '@/contexts/TaxiFlowContext';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import {
  Car,
  Users,
  Sparkles,
  Zap,
  ChevronRight,
  Building2,
  User,
  Sun,
  Moon,
  MonitorSmartphone,
  Receipt,
  FileText,
  ShieldCheck,
  Briefcase,
  Plane,
  Clock,
  Compass,
  CheckCircle2,
  Award,
  MapPin,
  Search,
  DollarSign,
  ArrowRight,
  Star,
  Lock,
  Gift,
  Wallet,
  Mic,
  Send,
  X,
  Tag,
  BadgePercent,
  Calendar,
  Key,
  Copy,
  Fuel,
  Leaf,
  SlidersHorizontal,
  Crown,
} from 'lucide-react-native';
import { StandardTripType } from '@/types/booking';
import axiosInstance from '@/app/api/axiosInstance';

function tripTypeLabel(type: StandardTripType): string {
  switch (type) {
    case 'ONEWAY': return 'One Way';
    case 'ROUNDTRIP': return 'Round Trip';
    case 'LOCAL': return 'Local / Hourly';
    case 'MULTICITY': return 'Multi City';
  }
}

export default function CustomerDashboardScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user } = useAuth();
  const { setActiveMode } = useServiceMode();
  const { recentSearches, updateStandardDraft, interfaceMode, setInterfaceMode, isPremium } = useTaxiFlow();
  const { themeMode, cycleThemeMode } = useThemePreference();
  const isB2B = interfaceMode === 'B2B';

  const [activeService, setActiveService] = useState<'TAXI' | 'CARPOOL'>('TAXI');
  const [selectedTaxiType, setSelectedTaxiType] = useState<'STANDARD' | 'DROPBID'>('STANDARD');
  const [offerCategory, setOfferCategory] = useState<'TRENDING' | 'OUTSTATION' | 'DROPBID' | 'CORPORATE'>('TRENDING');

  // MODE SWITCH TRANSITION OVERLAY STATE (Drop Cars Signature Quantum Shift)
  // MODE SWITCH TRANSITION OVERLAY STATE (Drop Cars Signature Quantum Shift)
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [switchingTarget, setSwitchingTarget] = useState<'Personal' | 'Drop Cars Biz' | 'Drop Cars' | 'Drop Connect'>('Drop Cars Biz');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAIChatModal, setShowAIChatModal] = useState(false);
  const [showBookForOthersModal, setShowBookForOthersModal] = useState(false);
  const [showPDFInvoiceModal, setShowPDFInvoiceModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [showTollModal, setShowTollModal] = useState(false);
  const [showDriverCustomizerModal, setShowDriverCustomizerModal] = useState(false);
  const progressAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.85))[0];

  // Real subscription tier + wallet balance for the home-page status card
  // (same /api/subscriptions/customer/status the subscription screen itself
  // uses, so both surfaces always agree - no separate local mock).
  const [subTier, setSubTier] = useState<'FREE' | 'MONTHLY' | 'YEARLY'>('FREE');
  const [subWalletBalance, setSubWalletBalance] = useState<number | null>(null);
  const subUserId = user?.id || (user as any)?.phone || 'customer_demo_user';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      axiosInstance
        .get('/api/subscriptions/customer/status', { params: { user_id: subUserId } })
        .then((res) => {
          if (cancelled || !res.data) return;
          setSubTier(res.data.tier || 'FREE');
          setSubWalletBalance(res.data.wallet_balance ?? 0);
        })
        .catch((e) => console.log('Error loading subscription status on Home:', e));
      return () => { cancelled = true; };
    }, [subUserId])
  );

  // Sync activeMode with activeService when Dashboard comes into focus
  useFocusEffect(
    useCallback(() => {
      setActiveMode(activeService);
    }, [setActiveMode, activeService])
  );

  const triggerQuantumShift = (
    targetLabel: 'Personal' | 'Drop Cars Biz' | 'Drop Cars' | 'Drop Connect',
    onComplete: () => void
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSwitchingTarget(targetLabel);
    setIsSwitchingMode(true);
    progressAnim.setValue(0);
    scaleAnim.setValue(0.85);

    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
      setTimeout(() => {
        setIsSwitchingMode(false);
      }, 100);
    });
  };

  const handleToggleInterfaceMode = (targetMode: 'MY' | 'B2B') => {
    const targetLabel = targetMode === 'B2B' ? 'Drop Cars Biz' : 'Personal';
    triggerQuantumShift(targetLabel, () => {
      setInterfaceMode(targetMode);
    });
  };

  const handleSelectTaxi = () => {
    triggerQuantumShift('Drop Cars', () => {
      setActiveMode('TAXI');
      router.push('/(customer)/book' as any);
    });
  };

  const handleSelectCarpool = () => {
    triggerQuantumShift('Drop Connect', () => {
      setActiveMode('CARPOOL');
      router.push('/(customer)/carpool' as any);
    });
  };

  const handleQuickLaunch = (type: 'OUTSTATION' | 'AIRPORT' | 'LOCAL' | 'DROPBID') => {
    triggerQuantumShift('Drop Cars', () => {
      setActiveMode('TAXI');
      if (type === 'DROPBID') {
        router.push('/(customer)/book/dropbid' as any);
        return;
      }
      const tripTypeMap: Record<string, StandardTripType> = {
        OUTSTATION: 'ONEWAY',
        AIRPORT: 'ONEWAY',
        LOCAL: 'LOCAL',
      };
      updateStandardDraft({
        tripType: tripTypeMap[type] || 'ONEWAY',
        onewaySubtype: type === 'AIRPORT' ? 'AIRPORT' : 'OUTSTATION',
      });
      router.push('/(customer)/book/standard' as any);
    });
  };

  const handleResumeSearch = (item: RecentSearch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveMode('TAXI');
    if (item.mode === 'DROPBID') {
      router.push('/(customer)/book/dropbid' as any);
      return;
    }
    updateStandardDraft({ pickup: item.pickup, drop: item.drop, tripType: item.tripType });
    router.push('/(customer)/book/standard' as any);
  };

  const themeStyles = getStyles(isDark, palette, isB2B);

  return (
    <SafeAreaView style={themeStyles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* DROP CARS SIGNATURE MODE SWITCH TRANSITION OVERLAY */}
      <Modal visible={isSwitchingMode} transparent animationType="fade">
        <View style={themeStyles.transitionModalOverlay}>
          <LinearGradient
            colors={
              switchingTarget === 'Drop Cars Biz'
                ? ['#0F172A', '#0284C7', '#0F172A']
                : switchingTarget === 'Drop Connect'
                ? ['#064E3B', '#059669', '#070B12']
                : switchingTarget === 'Drop Cars'
                ? ['#0F172A', '#0EA5E9', '#070B12']
                : ['#1E1B4B', '#312E81', '#0F172A']
            }
            style={themeStyles.transitionGlassCard}
          >
            <Animated.View style={[themeStyles.transitionIconCircle, { transform: [{ scale: scaleAnim }] }]}>
              {switchingTarget === 'Drop Cars Biz' ? (
                <Building2 color="#38BDF8" size={34} />
              ) : switchingTarget === 'Drop Connect' ? (
                <Users color="#10B981" size={34} />
              ) : switchingTarget === 'Drop Cars' ? (
                <Car color="#0EA5E9" size={34} />
              ) : (
                <User color="#F59E0B" size={34} />
              )}
            </Animated.View>

            <Text style={themeStyles.transitionTitle}>
              {switchingTarget === 'Drop Cars Biz'
                ? 'Activating Drop Cars Biz'
                : switchingTarget === 'Drop Connect'
                ? 'Switching to Drop Connect'
                : switchingTarget === 'Drop Cars'
                ? 'Activating Drop Cars Mobility'
                : 'Switching to Personal Mode'}
            </Text>
            <Text style={themeStyles.transitionSub}>
              {switchingTarget === 'Drop Cars Biz'
                ? 'Configuring GST Invoices, Corporate Allowance & Direct Billing...'
                : switchingTarget === 'Drop Connect'
                ? 'Loading Verified Peer-to-Peer Carpools & Fuel Share Rides...'
                : switchingTarget === 'Drop Cars'
                ? 'Loading Instant Cab Bidding, Outstation Drivers & DropBid...'
                : 'Loading Instant Bidding, Outstation Cabs & Drop Connect...'}
            </Text>

            <View style={themeStyles.transitionProgressTrack}>
              <Animated.View
                style={[
                  themeStyles.transitionProgressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                    backgroundColor:
                      switchingTarget === 'Drop Cars Biz'
                        ? '#38BDF8'
                        : switchingTarget === 'Drop Connect'
                        ? '#10B981'
                        : switchingTarget === 'Drop Cars'
                        ? '#0EA5E9'
                        : '#F59E0B',
                  },
                ]}
              />
            </View>

            <View style={themeStyles.transitionStatusTag}>
              <Sparkles color="#FFFFFF" size={12} />
              <Text style={themeStyles.transitionStatusTagText}>
                {switchingTarget === 'Drop Cars Biz'
                  ? 'Corporate Workspace'
                  : switchingTarget === 'Drop Connect'
                  ? 'Peer-to-Peer Carpool'
                  : switchingTarget === 'Drop Cars'
                  ? 'Taxi & Cab Bidding'
                  : 'Personal Mobility'}
              </Text>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* ULTRA NEAT FORMAL BRAND HEADER (SINGLE SLEEK ROW WITH ABSOLUTE CENTERED BRAND) */}
      <LinearGradient
        colors={isB2B ? palette.b2bHeaderGradient : palette.headerGradient}
        style={[themeStyles.headerGradient, { paddingTop: topPadding + 2, paddingBottom: 6, paddingHorizontal: 12, position: 'relative' }]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: 26 }}>
          {/* LEFT: FIRST NAME ONLY */}
          <View style={{ zIndex: 2 }}>
            <Text style={themeStyles.welcomeName}>
              {isB2B ? 'Acme Corp' : `Hello, ${(user?.name || 'Rider').split(' ')[0]}`}
            </Text>
          </View>

          {/* ABSOLUTE CENTER: BRAND TITLE BADGE (PERFECTLY CENTERED IN EVERY SITUATION) */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
            pointerEvents="none"
          >
            <View style={themeStyles.brandTitleBox}>
              <Text style={themeStyles.brandTitle}>
                {isB2B ? 'DROP CARS Biz' : 'DROP CARS'}
              </Text>
            </View>
          </View>

          {/* RIGHT: COMPACT ICON-ONLY PERSONAL/BIZ SWITCH (wallet moved into the tier card below) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 2 }}>
            {/* COMPACT ICON-ONLY PERSONAL / BIZ SWITCH */}
            <View style={{
              flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 12, padding: 1.5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'
            }}>
              <TouchableOpacity
                style={{
                  width: 22, height: 22, borderRadius: 9,
                  backgroundColor: !isB2B ? '#F59E0B' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
                onPress={() => isB2B && handleToggleInterfaceMode('MY')}
              >
                <User color={!isB2B ? '#070B12' : 'rgba(255,255,255,0.85)'} size={11} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  width: 22, height: 22, borderRadius: 9,
                  backgroundColor: isB2B ? '#38BDF8' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
                onPress={() => !isB2B && handleToggleInterfaceMode('B2B')}
              >
                <Building2 color={isB2B ? '#070B12' : 'rgba(255,255,255,0.85)'} size={11} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* MAIN DASHBOARD CONTENT */}
      <ScrollView style={themeStyles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={themeStyles.webCenterWrap}>

          {/* TIER + WALLET STATUS CARD - simple, right below the header */}
          {!isB2B && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(customer)/subscription' as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: subTier !== 'FREE' ? '#F59E0B' : palette.border,
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: subTier !== 'FREE' ? 'rgba(245,158,11,0.15)' : 'rgba(14,165,233,0.12)',
                  }}
                >
                  <Crown color={subTier !== 'FREE' ? '#F59E0B' : '#0EA5E9'} size={16} />
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' }} numberOfLines={1}>
                    {subTier === 'FREE' ? 'Free Tier User' : `Drop Cars Premium ${subTier}`}
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 10.5, fontFamily: 'Inter-Medium', marginTop: 1 }} numberOfLines={1}>
                    {subTier === 'FREE' ? 'Standard bidding & carpooling' : 'Priority matching active'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push('/(customer)/wallet' as any)}
                  style={{ alignItems: 'flex-end' }}
                >
                  <Text style={{ color: '#10B981', fontSize: 12.5, fontFamily: 'Inter-Bold' }}>
                    {subWalletBalance !== null ? `₹${subWalletBalance}` : '—'}
                  </Text>
                  <Text style={{ color: '#0EA5E9', fontSize: 9.5, fontFamily: 'Inter-SemiBold' }}>Earn</Text>
                </TouchableOpacity>

                <View
                  style={{
                    backgroundColor: subTier !== 'FREE' ? '#10B981' : '#F59E0B',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter-Bold' }}>
                    {subTier !== 'FREE' ? 'ACTIVE' : 'UPGRADE'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {isB2B ? (
            /* ==================================================== */
            /* BUSINESS / CORPORATE MODE ("Drop Cars Biz" - Screenshot 3) */
            /* ==================================================== */
            <View style={{ gap: 14 }}>
              {/* CORPORATE REWARDS BANNER (Matching Screenshot 3) */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={themeStyles.bizRewardsBanner}
                onPress={handleSelectTaxi}
              >
                <View style={themeStyles.bizRewardsIconBox}>
                  <Gift color="#D97706" size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.bizRewardsTitle}>Complete 1st Booking & Save</Text>
                  <Text style={themeStyles.bizRewardsSub}>
                    Get up to <Text style={{ fontWeight: '900', color: '#D97706' }}>15% OFF</Text> & Unlock rewards worth ₹2,500
                  </Text>
                </View>
                <View style={themeStyles.bizBannerArrowBtn}>
                  <ChevronRight color="#FFFFFF" size={16} />
                </View>
              </TouchableOpacity>

              {/* MAKEMYTRIP STYLE CATEGORIZED BUSINESS SERVICES GRID (Screenshot 3) */}
              <View style={themeStyles.gridCardContainer}>
                {/* HERO ROW: 4 PRIMARY CATEGORY CARDS */}
                <View style={themeStyles.heroCategoryGrid}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('OUTSTATION')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(217, 119, 6, 0.15)' }]}>
                      <Compass color="#D97706" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Outstation</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('AIRPORT')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                      <Plane color="#0EA5E9" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Airport</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('LOCAL')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                      <Clock color="#8B5CF6" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Rental</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={handleSelectCarpool}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Users color="#10B981" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Drop Connect</Text>
                  </TouchableOpacity>
                </View>

                <View style={themeStyles.gridDivider} />

                {/* SUB ROW: 4 CORPORATE TOOL CARDS */}
                <View style={themeStyles.subCategoryGrid}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => setShowBookForOthersModal(true)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <User color="#38BDF8" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Book For Others</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => setShowPDFInvoiceModal(true)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <FileText color="#10B981" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>PDF Invoices</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => router.push('/(customer)/b2b/billing' as any)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <Receipt color="#F59E0B" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>GST Billing</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => router.push('/(customer)/b2b/employees' as any)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <Building2 color="#8B5CF6" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Team Limits</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* CORPORATE TRAVEL APPROVALS & RIDE REQUESTS MANAGER (MMT BIZ WORKFLOW) */}
              <View style={{
                backgroundColor: palette.surface,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: palette.border,
                gap: 12,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Building2 color="#0EA5E9" size={18} />
                    <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Corporate Travel Approvals</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(14, 165, 233, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ color: '#0EA5E9', fontSize: 10, fontWeight: '900' }}>1 Pending Action</Text>
                  </View>
                </View>

                {/* APPROVAL CARD */}
                <View style={{
                  backgroundColor: palette.cardBg,
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: palette.border,
                  gap: 8,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '800' }}>Priya Sharma (Sr. Analyst)</Text>
                    <Text style={{ color: palette.textMuted, fontSize: 10 }}>Cost Center: PRJ-2026-CH</Text>
                  </View>

                  <Text style={{ color: palette.textSecondary, fontSize: 11.5 }}>
                    Outstation Cab: <Text style={{ fontWeight: '800', color: palette.textPrimary }}>Chennai ➔ Bangalore</Text>
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>29 Aug 2026 • Sedan Exec • Est. ₹3,485.00</Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#10B981',
                        paddingVertical: 8,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (Platform.OS === 'web') alert('Ride Approved & Dispatched for Priya Sharma!');
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' }}>✅ Approve Ride</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: palette.cardBg,
                        borderWidth: 1,
                        borderColor: palette.border,
                        paddingVertical: 8,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (Platform.OS === 'web') alert('Ride Request Rejected');
                      }}
                    >
                      <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '800' }}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* MONTHLY CORPORATE EXPENSE & 18% GST INPUT CREDIT LEDGER */}
              <View style={{
                backgroundColor: isDark ? '#1E293B' : '#F0F9FF',
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(14, 165, 233, 0.3)',
                gap: 10,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: '800' }}>MONTHLY CORPORATE SPEND & GST CREDIT</Text>
                  <TouchableOpacity onPress={() => setShowPDFInvoiceModal(true)}>
                    <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '800' }}>Download Tax PDF ›</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text style={{ color: palette.textPrimary, fontSize: 22, fontWeight: '900' }}>₹18,400.00</Text>
                    <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Used from ₹25,000 Monthly Cap</Text>
                  </View>

                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'flex-end' }}>
                    <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '900' }}>+₹3,312.00</Text>
                    <Text style={{ color: '#10B981', fontSize: 9.5, fontWeight: '800' }}>18% GST Credit Saved</Text>
                  </View>
                </View>
              </View>

              {/* CORPORATE TRENDING CAROUSEL */}
              <View style={themeStyles.offersSection}>
                <View style={themeStyles.offersHeaderRow}>
                  <Text style={themeStyles.sectionTitle}>Trending</Text>
                  <TouchableOpacity>
                    <Text style={themeStyles.viewAllText}>View All ›</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={themeStyles.offerCardScroll}>
                  <View style={themeStyles.offerCard}>
                    <View style={themeStyles.offerBadge}>
                      <Text style={themeStyles.offerBadgeText}>CORPORATE DEAL</Text>
                    </View>
                    <Text style={themeStyles.offerCardTitle}>Flat ₹500 OFF on 1st Outstation</Text>
                    <Text style={themeStyles.offerCardSub}>Valid on all executive sedan & SUV bookings</Text>
                  </View>

                  <View style={[themeStyles.offerCard, { backgroundColor: isDark ? '#1E293B' : '#F0F9FF' }]}>
                    <View style={[themeStyles.offerBadge, { backgroundColor: '#0EA5E9' }]}>
                      <Text style={themeStyles.offerBadgeText}>18% GST CLAIM</Text>
                    </View>
                    <Text style={themeStyles.offerCardTitle}>Instant GST Input Credit</Text>
                    <Text style={themeStyles.offerCardSub}>Auto tax invoices delivered to your email</Text>
                  </View>
                </ScrollView>
              </View>

            </View>
          ) : (
            /* ==================================================== */
            /* PERSONAL RIDER MODE (MakeMyTrip Model - Screenshot 1) */
            /* ==================================================== */
            <View style={{ gap: 14 }}>

              {/* MAKEMYTRIP STYLE CATEGORIZED SERVICES GRID - right below the Wallet/tier card */}
              <View style={themeStyles.gridCardContainer}>
                {/* HERO ROW: 4 PRIMARY MOBILITY TILES */}
                <View style={themeStyles.heroCategoryGrid}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('OUTSTATION')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Compass color="#D97706" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Outstation</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('AIRPORT')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                      <Plane color="#0EA5E9" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Airport</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={() => handleQuickLaunch('LOCAL')}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                      <Clock color="#8B5CF6" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Rental</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileHero}
                    onPress={handleSelectCarpool}
                  >
                    <View style={[themeStyles.categoryIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Users color="#10B981" size={22} />
                    </View>
                    <Text style={themeStyles.categoryTileTitle}>Drop Connect</Text>
                  </TouchableOpacity>
                </View>

                <View style={themeStyles.gridDivider} />

                {/* SUB ROW: 4 SECONDARY MOBILITY & MEMBERSHIP TILES */}
                <View style={themeStyles.subCategoryGrid}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => handleQuickLaunch('OUTSTATION')}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <MapPin color="#D97706" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Multi-Stop</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => setShowBookForOthersModal(true)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <User color="#0EA5E9" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Book For Others</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => router.push('/(customer)/menu' as any)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <Sparkles color="#F59E0B" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Premium Pass</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={themeStyles.categoryTileSubRow}
                    onPress={() => router.push('/(customer)/gift-cards' as any)}
                  >
                    <View style={themeStyles.subIconCircle}>
                      <Gift color="#EC4899" size={16} />
                    </View>
                    <Text style={themeStyles.subCategoryTitle}>Gift Cards</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* DROP EV & GREEN MILES (COMING SOON 🚀) */}
              <LinearGradient
                colors={isDark ? ['#064E3B', '#022C22'] : ['#ECFDF5', '#D1FAE5']}
                style={{
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#10B981',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(16, 185, 129, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Leaf color="#10B981" size={20} />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: isDark ? '#FFFFFF' : '#065F46', fontSize: 13, fontWeight: '900' }}>Drop EV & Green Miles</Text>
                    <View style={{ backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 8.5, fontWeight: '900' }}>COMING SOON 🚀</Text>
                    </View>
                  </View>
                  <Text style={{ color: isDark ? '#A7F3D0' : '#047857', fontSize: 10 }}>
                    100% Electric Executive Cabs & Zero Emissions. Earn extra Drop Coins per km!
                  </Text>
                </View>
              </LinearGradient>

              {/* WHERE2GO ROAD TRIP EXPLORER (WEEKEND GETAWAYS) */}
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Compass color="#D97706" size={18} />
                    <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>Where2Go • Weekend Road Trips</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleQuickLaunch('OUTSTATION')}>
                    <Text style={{ color: palette.accent, fontSize: 11.5, fontWeight: '800' }}>Explore All ›</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {[
                    { id: '1', name: 'Chennai ➔ Pondicherry', tag: 'ECR COASTAL DRIVE', dist: '160 km • 3.5 hrs', fare: 'Est. ₹2,450', colors: ['#D97706', '#92400E'] },
                    { id: '2', name: 'Bangalore ➔ Coorg', tag: 'MISTY HILLS', dist: '265 km • 5.5 hrs', fare: 'Est. ₹3,850', colors: ['#0EA5E9', '#0369A1'] },
                    { id: '3', name: 'Coimbatore ➔ Ooty', tag: 'NILGIRI MOUNTAINS', dist: '85 km • 3.0 hrs', fare: 'Est. ₹1,950', colors: ['#8B5CF6', '#6D28D9'] },
                    { id: '4', name: 'Chennai ➔ Mahabalipuram', tag: 'HERITAGE DRIVE', dist: '55 km • 1.2 hrs', fare: 'Est. ₹1,150', colors: ['#10B981', '#047857'] },
                  ].map((trip) => (
                    <TouchableOpacity
                      key={trip.id}
                      activeOpacity={0.85}
                      style={{ width: 210, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}
                      onPress={() => {
                        const [p, d] = trip.name.split(' ➔ ');
                        updateStandardDraft({ pickup: p, drop: d, tripType: 'ONEWAY' });
                        router.push('/(customer)/book/standard' as any);
                      }}
                    >
                      <LinearGradient colors={trip.colors as any} style={{ padding: 12, gap: 6 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>{trip.tag}</Text>
                        </View>
                        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{trip.name}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700' }}>{trip.dist}</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>{trip.fare}</Text>
                          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>Book Cab ➔</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* TRENDING CAROUSEL */}
              <View style={themeStyles.offersSection}>
                <View style={themeStyles.offersHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Tag color="#F59E0B" size={18} />
                    <Text style={themeStyles.sectionTitle}>Trending</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(customer)/menu' as any)}>
                    <Text style={themeStyles.viewAllText}>View All ›</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={themeStyles.offerCardScroll}>
                  {/* OFFER 1: OUTSTATION DISCOUNT */}
                  <LinearGradient
                    colors={isDark ? ['#451A03', '#78350F', '#1E1B4B'] : ['#FEF3C7', '#FDE68A', '#FFFBEB']}
                    style={themeStyles.offerGradientCard}
                  >
                    <View style={themeStyles.offerCardHeader}>
                      <View style={themeStyles.offerBadgeAmber}>
                        <Sparkles color="#FFFFFF" size={10} />
                        <Text style={themeStyles.offerBadgeText}>FLAT 15% OFF</Text>
                      </View>
                      <View style={themeStyles.offerIconCircle}>
                        <Car color="#F59E0B" size={14} />
                      </View>
                    </View>
                    <Text style={themeStyles.offerCardTitle}>Flat 15% OFF on Outstation</Text>
                    <Text style={themeStyles.offerCardSub}>Use code DROPTAXI15 on your first intercity ride</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={themeStyles.copyCodePill}
                      onPress={() => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        if (Platform.OS === 'web') alert('Promo code DROPTAXI15 copied!');
                      }}
                    >
                      <Text style={themeStyles.copyCodeText}>DROPTAXI15</Text>
                      <Text style={themeStyles.copyActionText}>TAP TO COPY</Text>
                    </TouchableOpacity>
                  </LinearGradient>

                  {/* OFFER 2: DROP CONNECT SAVINGS */}
                  <LinearGradient
                    colors={isDark ? ['#0C4A6E', '#0369A1', '#0F172A'] : ['#E0F2FE', '#BAE6FD', '#F0F9FF']}
                    style={themeStyles.offerGradientCard}
                  >
                    <View style={themeStyles.offerCardHeader}>
                      <View style={themeStyles.offerBadgeSky}>
                        <Users color="#FFFFFF" size={10} />
                        <Text style={themeStyles.offerBadgeText}>DROP CONNECT</Text>
                      </View>
                      <View style={themeStyles.offerIconCircle}>
                        <Users color="#0EA5E9" size={14} />
                      </View>
                    </View>
                    <Text style={themeStyles.offerCardTitle}>Save up to 40% Seat Share</Text>
                    <Text style={themeStyles.offerCardSub}>Drop Me (Find Rides) & Drop Share (Offer Seats)</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={themeStyles.copyCodePillSky}
                      onPress={handleSelectCarpool}
                    >
                      <Text style={themeStyles.copyCodeTextSky}>DROPCONNECT</Text>
                      <Text style={themeStyles.copyActionTextSky}>EXPLORE RIDES ➔</Text>
                    </TouchableOpacity>
                  </LinearGradient>

                  {/* OFFER 3: DROPBID INSTANT BID */}
                  <LinearGradient
                    colors={isDark ? ['#064E3B', '#047857', '#0F172A'] : ['#D1FAE5', '#A7F3D0', '#ECFDF5']}
                    style={themeStyles.offerGradientCard}
                  >
                    <View style={themeStyles.offerCardHeader}>
                      <View style={themeStyles.offerBadgeEmerald}>
                        <Zap color="#FFFFFF" size={10} />
                        <Text style={themeStyles.offerBadgeText}>INSTANT BIDDING</Text>
                      </View>
                      <View style={themeStyles.offerIconCircle}>
                        <Zap color="#10B981" size={14} />
                      </View>
                    </View>
                    <Text style={themeStyles.offerCardTitle}>Zero Surge Driver Bidding</Text>
                    <Text style={themeStyles.offerCardSub}>Negotiate direct fares with nearby drivers</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={themeStyles.copyCodePillEmerald}
                      onPress={() => router.push('/(customer)/book/dropbid' as any)}
                    >
                      <Text style={themeStyles.copyCodeTextEmerald}>PREMBID</Text>
                      <Text style={themeStyles.copyActionTextEmerald}>TRY BIDDING ➔</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </ScrollView>
              </View>

              {/* RECENT SEARCHES & QUICK RE-BOOK SUGGESTIONS */}
              <View style={themeStyles.recentBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={themeStyles.sectionTitle}>Recent & Popular Routes</Text>
                </View>

                {recentSearches.length === 0 ? (
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={themeStyles.quickRouteCard}
                      onPress={() => {
                        updateStandardDraft({ pickup: 'Chennai', drop: 'Bangalore', tripType: 'ONEWAY' });
                        router.push('/(customer)/book/standard' as any);
                      }}
                    >
                      <View style={themeStyles.quickRouteIconCircle}>
                        <Compass color="#F59E0B" size={16} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={themeStyles.routeName}>Chennai ➔ Bangalore</Text>
                        <Text style={themeStyles.routeSub}>Popular Intercity Taxi Route • Upfront Fare</Text>
                      </View>
                      <ArrowRight color={palette.textMuted} size={16} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={themeStyles.quickRouteCard}
                      onPress={() => {
                        updateStandardDraft({ pickup: 'Chennai City', drop: 'Chennai Intl Airport', tripType: 'ONEWAY' });
                        router.push('/(customer)/book/standard' as any);
                      }}
                    >
                      <View style={themeStyles.quickRouteIconCircleSky}>
                        <Plane color="#0EA5E9" size={16} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={themeStyles.routeName}>Chennai City ➔ Airport</Text>
                        <Text style={themeStyles.routeSub}>Flight Express Transfer • On-time Guarantee</Text>
                      </View>
                      <ArrowRight color={palette.textMuted} size={16} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  recentSearches.map(item => (
                    <TouchableOpacity key={item.id} style={themeStyles.routeRow} onPress={() => handleResumeSearch(item)}>
                      {item.mode === 'DROPBID' ? <Zap color="#0EA5E9" size={16} /> : <Car color={palette.accent} size={16} />}
                      <View style={{ flex: 1 }}>
                        <Text style={themeStyles.routeName}>{item.pickup} ➔ {item.drop}</Text>
                        <Text style={themeStyles.routeSub}>{item.mode === 'DROPBID' ? 'Drop Bid' : tripTypeLabel(item.tripType)}</Text>
                      </View>
                      <ChevronRight color={palette.textMuted} size={16} />
                    </TouchableOpacity>
                  ))
                )}
              </View>

            </View>
          )}
        </View>
      </ScrollView>

      {/* DROP CARS CORPORATE BOOK FOR OTHERS MODAL */}
      <BookForOthersModal
        visible={showBookForOthersModal}
        onClose={() => setShowBookForOthersModal(false)}
        palette={palette}
      />

      {/* DROP CARS CORPORATE PDF TAX INVOICE MODAL */}
      <PDFInvoiceModal
        visible={showPDFInvoiceModal}
        onClose={() => setShowPDFInvoiceModal(false)}
        palette={palette}
      />

      {/* DROP CARS TAXI LOGIN / ACCOUNT MODAL */}
      <DropCarsAuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        user={user}
        palette={palette}
      />

      {/* DROP CARS TRIP VERIFICATION OTP MODAL */}
      <TripOTPModal
        visible={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        palette={palette}
      />

      {/* DROP CARS TOLL & FASTAG BREAKDOWN MODAL */}
      <TollBreakdownModal
        visible={showTollModal}
        onClose={() => setShowTollModal(false)}
        palette={palette}
      />

      {/* DROP CARS RIDE & DRIVER CUSTOMIZER MODAL */}
      <DriverCustomizerModal
        visible={showDriverCustomizerModal}
        onClose={() => setShowDriverCustomizerModal(false)}
        palette={palette}
      />
    </SafeAreaView>
  );
}

function TollBreakdownModal({
  visible,
  onClose,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  palette: ThemePalette;
}) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(14, 165, 233, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Fuel color="#0EA5E9" size={18} />
              </View>
              <View>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>Toll & FASTag Calculator</Text>
                <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Chennai ➔ Pondicherry Outstation</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* ITEMIZED BREAKDOWN */}
          <View style={{ backgroundColor: palette.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>ECR Highway Toll Plaza (x2)</Text>
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '900' }}>₹120.00</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>Pondicherry Interstate Permit Tax</Text>
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '900' }}>₹150.00</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>Driver Night Allowance</Text>
              <Text style={{ color: '#10B981', fontSize: 12.5, fontWeight: '900' }}>Included (₹0)</Text>
            </View>

            <View style={{ height: 1, backgroundColor: palette.border }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '900' }}>Total Estimated Tolls</Text>
              <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '900' }}>₹270.00</Text>
            </View>
          </View>

          {/* ZERO HIDDEN FEES GUARANTEE BADGE */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: 10, borderRadius: 12 }}>
            <CheckCircle2 color="#10B981" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900' }}>Zero Hidden Costs Guarantee</Text>
              <Text style={{ color: palette.textMuted, fontSize: 10 }}>Driver will never ask for cash at destination. FASTag auto-deducted.</Text>
            </View>
          </View>

          <TouchableOpacity style={{ backgroundColor: palette.accent, paddingVertical: 12, borderRadius: 14, alignItems: 'center' }} onPress={onClose}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Understood</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DriverCustomizerModal({
  visible,
  onClose,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  palette: ThemePalette;
}) {
  const [selectedLang, setSelectedLang] = useState('Tamil');
  const [bootCarrier, setBootCarrier] = useState(true);
  const [petFriendly, setPetFriendly] = useState(false);
  const [childSeat, setChildSeat] = useState(false);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(139, 92, 246, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <SlidersHorizontal color="#8B5CF6" size={18} />
              </View>
              <View>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>Ride & Driver Customizer</Text>
                <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Personalize your cab experience</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* DRIVER LANGUAGE SELECTION */}
          <View style={{ gap: 6 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '800' }}>Preferred Driver Language</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['Tamil', 'English', 'Telugu', 'Malayalam', 'Hindi'].map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={{
                    backgroundColor: selectedLang === lang ? '#8B5CF6' : palette.cardBg,
                    borderWidth: 1,
                    borderColor: selectedLang === lang ? '#8B5CF6' : palette.border,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 10,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLang(lang);
                  }}
                >
                  <Text style={{ color: selectedLang === lang ? '#FFFFFF' : palette.textPrimary, fontSize: 11.5, fontWeight: '800' }}>
                    {lang}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* VEHICLE AMENITIES */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '800' }}>Vehicle Amenities</Text>

            <TouchableOpacity
              style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: palette.cardBg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border,
              }}
              onPress={() => setBootCarrier(!bootCarrier)}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>🧳 Extra Luggage Boot Carrier</Text>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: bootCarrier ? '#8B5CF6' : 'transparent', borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
                {bootCarrier && <CheckCircle2 color="#FFFFFF" size={14} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: palette.cardBg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border,
              }}
              onPress={() => setPetFriendly(!petFriendly)}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>🐶 Pet-Friendly Cab</Text>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: petFriendly ? '#8B5CF6' : 'transparent', borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
                {petFriendly && <CheckCircle2 color="#FFFFFF" size={14} />}
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: '#8B5CF6', paddingVertical: 12, borderRadius: 14, alignItems: 'center' }}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (Platform.OS === 'web') alert(`Ride preferences saved: Driver Language (${selectedLang})`);
              onClose();
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Save Preferences ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TripOTPModal({
  visible,
  onClose,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  palette: ThemePalette;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!visible) return null;

  const handleCopy = (code: string, label: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedField(label);
    if (Platform.OS === 'web') alert(`${label} (${code}) copied!`);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 16,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(245, 158, 11, 0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Key color="#F59E0B" size={18} />
              </View>
              <View>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                  Trip Verification OTPs
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: 10.5 }}>Trip #DC-9921 • Driver: Rajesh Kumar</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* START RIDE OTP CARD */}
          <View style={{
            backgroundColor: palette.cardBg,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1.5,
            borderColor: '#10B981',
            gap: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>START TRIP OTP</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleCopy('4829', 'Start OTP')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
              >
                <Copy color="#10B981" size={12} />
                <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>
                  {copiedField === 'Start OTP' ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: palette.textPrimary, fontSize: 32, fontWeight: '900', letterSpacing: 10 }}>
                4829
              </Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 10, textAlign: 'center' }}>
              Share this 4-digit OTP with your driver upon cab arrival to start trip.
            </Text>
          </View>

          {/* END RIDE OTP CARD */}
          <View style={{
            backgroundColor: palette.cardBg,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1.5,
            borderColor: '#EF4444',
            gap: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>END TRIP OTP</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleCopy('7194', 'End OTP')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
              >
                <Copy color="#EF4444" size={12} />
                <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>
                  {copiedField === 'End OTP' ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: palette.textPrimary, fontSize: 32, fontWeight: '900', letterSpacing: 10 }}>
                7194
              </Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 10, textAlign: 'center' }}>
              Share this OTP with driver at destination to end trip and complete payment.
            </Text>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: palette.accent,
              paddingVertical: 12,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={onClose}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function BookForOthersModal({
  visible,
  onClose,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  palette: ThemePalette;
}) {
  const router = useRouter();
  const { updateStandardDraft } = useTaxiFlow();
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [projectCode, setProjectCode] = useState('PRJ-2026-CORP');

  if (!visible) return null;

  const handleConfirmGuestBooking = () => {
    if (!guestName || !guestPhone) {
      if (Platform.OS === 'web') alert('Please enter Guest Name and Phone Number');
      else Alert.alert('Error', 'Please enter Guest Name and Phone Number');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateStandardDraft({
      passengerName: guestName,
      passengerPhone: guestPhone,
    });
    onClose();
    router.push('/(customer)/book/standard' as any);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <User color="#38BDF8" size={22} />
              <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                Book Ride for Guest / Employee
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* FORM FIELDS */}
          <View style={{ gap: 10 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Guest Rider Name</Text>
              <TextInput
                style={{
                  backgroundColor: palette.cardBg, color: palette.textPrimary,
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, fontSize: 13,
                }}
                placeholder="e.g. Rajesh Kumar (Client)"
                placeholderTextColor={palette.placeholder}
                value={guestName}
                onChangeText={setGuestName}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Guest Phone Number (For Driver SMS & Tracking)</Text>
              <TextInput
                style={{
                  backgroundColor: palette.cardBg, color: palette.textPrimary,
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, fontSize: 13,
                }}
                placeholder="+91 98765 43210"
                placeholderTextColor={palette.placeholder}
                keyboardType="phone-pad"
                value={guestPhone}
                onChangeText={setGuestPhone}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11.5, fontWeight: '700' }}>Project / Cost Center Code</Text>
              <TextInput
                style={{
                  backgroundColor: palette.cardBg, color: palette.textPrimary,
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, fontSize: 13,
                }}
                placeholder="PRJ-2026-CORP"
                placeholderTextColor={palette.placeholder}
                value={projectCode}
                onChangeText={setProjectCode}
              />
            </View>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: '#38BDF8', paddingVertical: 12, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 6,
            }}
            onPress={handleConfirmGuestBooking}
          >
            <Car color="#070B12" size={16} />
            <Text style={{ color: '#070B12', fontSize: 13, fontWeight: '900' }}>Proceed to Guest Route Selection ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PDFInvoiceModal({
  visible,
  onClose,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  palette: ThemePalette;
}) {
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!visible) return null;

  const handleDownloadPDF = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDownloadSuccess(true);
    setTimeout(() => {
      setDownloadSuccess(false);
      const msg = 'PDF Tax Invoice with 18% GST Input Credit downloaded to your device!';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Invoice Generated', msg);
    }, 1200);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FileText color="#38BDF8" size={22} />
              <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                Corporate GST Tax Invoice (PDF)
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* TAX INVOICE PREVIEW CARD */}
          <View style={{
            backgroundColor: palette.cardBg, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', gap: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '900' }}>TAX INVOICE #DC-2026-8891</Text>
              <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>18% GST CLAIM</Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 4 }} />

            <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '800' }}>Billed To: Acme Solutions Pvt Ltd</Text>
            <Text style={{ color: palette.textMuted, fontSize: 11 }}>GSTIN: 33AAAAA0000A1Z5 (Tamil Nadu)</Text>
            <Text style={{ color: palette.textMuted, fontSize: 11 }}>Trip: Chennai ➔ Bangalore Outstation</Text>

            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 10, gap: 4, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.textSecondary, fontSize: 11 }}>Base Ride Fare:</Text>
                <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: '700' }}>₹2,000.00</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.textSecondary, fontSize: 11 }}>CGST (9%):</Text>
                <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: '700' }}>₹180.00</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.textSecondary, fontSize: 11 }}>SGST (9%):</Text>
                <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: '700' }}>₹180.00</Text>
              </View>
              <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 2 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '900' }}>Total Billed Amount:</Text>
                <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '900' }}>₹2,360.00</Text>
              </View>
            </View>
          </View>

          {/* ACTIONS */}
          <TouchableOpacity
            style={{
              backgroundColor: '#0284C7', paddingVertical: 12, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
            }}
            onPress={handleDownloadPDF}
          >
            <Receipt color="#FFFFFF" size={16} />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>
              {downloadSuccess ? 'Downloading PDF...' : 'Download Official PDF Tax Invoice'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DropCarsAuthModal({
  visible,
  onClose,
  user,
  palette,
}: {
  visible: boolean;
  onClose: () => void;
  user: any;
  palette: ThemePalette;
}) {
  const router = useRouter();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: palette.surface,
          borderRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, gap: 14,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Car color="#0EA5E9" size={22} />
              <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                Drop Cars Taxi Account
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* ACTIVE ACCOUNT CARD */}
          <View style={{
            backgroundColor: palette.cardBg, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)', gap: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(14,165,233,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                <User color="#0EA5E9" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>{user?.name || 'Rider Account'}</Text>
                <Text style={{ color: palette.textMuted, fontSize: 11 }}>{user?.phone || '+91 Active Taxi Account'}</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
                <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>Taxi Account</Text>
              </View>
            </View>
          </View>

          {/* FEATURES LIST */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Zap color="#0EA5E9" size={14} />
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>DropBid Instant Local & Intercity Bidding</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck color="#0EA5E9" size={14} />
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>Verified Outstation Taxi Drivers & Fixed Fares</Text>
            </View>
          </View>

          {/* ACTIONS */}
          <TouchableOpacity
            style={{
              backgroundColor: '#0EA5E9', paddingVertical: 12, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
            }}
            onPress={() => {
              onClose();
              router.push('/(auth)/login' as any);
            }}
          >
            <User color="#FFFFFF" size={14} />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Login / Switch Drop Cars Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(isDark: boolean, palette: ThemePalette, isB2B: boolean) {
  // Real, self-hosted Inter files (loaded via useFonts in app/_layout.tsx) -
  // these two names ('Outfit'/'Plus Jakarta Sans') were referenced here but
  // never actually loaded anywhere (no <link>, no useFonts, nothing), so
  // every screen using them was silently falling back to the OS's generic
  // system font the whole time - combined with the fontWeight: '800'/'900'
  // used throughout this file, that's what made text look heavy/blurry
  // instead of crisp (a browser/OS synthesizing fake-bold on a system font).
  // Native previously got no custom font at all (undefined) - now it does.
  const displayFont = 'Inter-ExtraBold';
  const bodyFont = 'Inter-SemiBold';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    scrollContent: { flex: 1 },
    webCenterWrap: Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 580, alignSelf: 'center' as const, padding: 14, paddingBottom: 60, gap: 14 } : { padding: 14, paddingBottom: 60, gap: 14 },

    // DROP CARS SIGNATURE MODE SWITCH TRANSITION OVERLAY
    transitionModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(7, 11, 18, 0.88)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    transitionGlassCard: {
      width: '100%',
      maxWidth: 360,
      padding: 28,
      borderRadius: 24,
      alignItems: 'center',
      gap: 14,
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
    transitionIconCircle: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.3)',
      shadowColor: '#38BDF8',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
    },
    transitionTitle: {
      fontSize: 19,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.4,
      textAlign: 'center',
      fontFamily: displayFont,
    },
    transitionSub: {
      fontSize: 11.5,
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      lineHeight: 16,
      fontFamily: bodyFont,
    },
    transitionProgressTrack: {
      width: '100%',
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      overflow: 'hidden',
      marginTop: 4,
    },
    transitionProgressFill: {
      height: '100%',
      borderRadius: 3,
    },
    transitionStatusTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    transitionStatusTagText: {
      color: '#FFFFFF',
      fontSize: 10.5,
      fontWeight: '800',
      fontFamily: bodyFont,
    },

    // HEADER STYLING
    headerGradient: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 6,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 4,
    },
    headerBarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    brandTitleBox: {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    brandTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 1.2,
      fontFamily: displayFont,
    },
    headerControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modeTogglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 9,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    modeTogglePillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      fontFamily: bodyFont,
    },
    themeToggleBtn: {
      width: 24,
      height: 24,
      borderRadius: 7,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerGreetingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    welcomeName: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
      fontFamily: bodyFont,
    },
    memberBadgeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(251, 191, 36, 0.25)',
      paddingHorizontal: 6,
      height: 20,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#F59E0B',
    },
    memberBadgeHeaderText: {
      color: '#FBBF24',
      fontSize: 9.5,
      fontWeight: '800',
      fontFamily: bodyFont,
    },
    corporateBudgetBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(56, 189, 248, 0.2)',
      paddingHorizontal: 9,
      height: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#38BDF8',
    },
    corporateBudgetText: {
      color: '#38BDF8',
      fontSize: 10.5,
      fontWeight: '800',
      fontFamily: bodyFont,
    },

    // SEARCH CAPSULE BAR (MakeMyTrip Style)
    searchCapsuleBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      gap: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    searchCapsuleText: {
      flex: 1,
      fontSize: 11.5,
      fontWeight: '600',
      color: '#334155',
      fontFamily: bodyFont,
    },
    speakBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isB2B ? '#0284C7' : '#D97706',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    speakBtnText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      fontFamily: bodyFont,
    },

    // BIZ REWARDS BANNER (Screenshot 3)
    bizRewardsBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E293B' : '#FFF7ED',
      padding: 14,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: '#FDBA74',
      gap: 12,
    },
    bizRewardsIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(245, 158, 11, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bizRewardsTitle: {
      fontSize: 13.5,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    bizRewardsSub: {
      fontSize: 11,
      color: palette.textMuted,
      marginTop: 2,
      fontFamily: bodyFont,
    },
    bizBannerArrowBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#D97706',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // MAKEMYTRIP STYLE GRID CARD CONTAINER
    gridCardContainer: {
      backgroundColor: palette.surface,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1.5,
      borderColor: palette.border,
      gap: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    heroCategoryGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    categoryTileHero: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderRadius: 14,
      backgroundColor: palette.surfaceAlt,
      gap: 6,
    },
    categoryIconBox: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    categoryTileTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
      textAlign: 'center',
    },
    categoryTileSub: {
      fontSize: 9.5,
      color: palette.textMuted,
      fontFamily: bodyFont,
      textAlign: 'center',
    },
    gridDivider: {
      height: 1,
      backgroundColor: palette.divider,
    },
    subCategoryGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    categoryTileSubRow: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    subIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: palette.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCategoryTitle: {
      fontSize: 10.5,
      fontWeight: '800',
      color: palette.textSecondary,
      fontFamily: bodyFont,
      textAlign: 'center',
    },

    // MILESTONE REWARDS CARD (Screenshot 3)
    milestoneCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surface,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
    },
    milestoneIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(14, 165, 233, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneTitle: {
      fontSize: 13,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    milestoneSub: {
      fontSize: 10.5,
      color: palette.textMuted,
      marginTop: 2,
      fontFamily: bodyFont,
    },

    // OFFERS CAROUSEL
    offersSection: { gap: 10 },
    offersHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    viewAllText: {
      fontSize: 12,
      fontWeight: '800',
      color: isB2B ? '#0EA5E9' : '#D97706',
      fontFamily: bodyFont,
    },
    offerChipScroll: { flexDirection: 'row' },
    offerChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      marginRight: 8,
    },
    offerChipActive: {
      backgroundColor: isB2B ? '#0EA5E9' : '#D97706',
      borderColor: isB2B ? '#0EA5E9' : '#D97706',
    },
    offerChipText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: palette.textMuted,
      fontFamily: bodyFont,
    },
    offerChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '900',
    },
    offerCardScroll: { flexDirection: 'row' },
    offerCard: {
      width: 240,
      backgroundColor: isDark ? '#1E293B' : '#FEF3C7',
      borderRadius: 16,
      padding: 14,
      marginRight: 10,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    offerBadge: {
      alignSelf: 'flex-start',
      backgroundColor: '#D97706',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
      marginBottom: 2,
    },
    offerGradientCard: {
      width: 260,
      borderRadius: 18,
      padding: 14,
      marginRight: 12,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
      gap: 6,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
    },
    offerCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    offerBadgeAmber: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#D97706',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    offerBadgeSky: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#0EA5E9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    offerBadgeEmerald: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#10B981',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    offerBadgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    offerIconCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    offerCardTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: isDark ? '#FFFFFF' : '#0F172A',
      fontFamily: displayFont,
      marginTop: 2,
    },
    offerCardSub: {
      fontSize: 11,
      color: isDark ? 'rgba(255, 255, 255, 0.75)' : '#475569',
      lineHeight: 15,
      fontFamily: bodyFont,
    },
    copyCodePill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      borderWidth: 1,
      borderColor: '#F59E0B',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginTop: 6,
    },
    copyCodeText: { color: '#F59E0B', fontSize: 11, fontWeight: '900', fontFamily: bodyFont },
    copyActionText: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 8.5, fontWeight: '800', fontFamily: bodyFont },

    copyCodePillSky: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(14, 165, 233, 0.2)',
      borderWidth: 1,
      borderColor: '#0EA5E9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginTop: 6,
    },
    copyCodeTextSky: { color: '#38BDF8', fontSize: 11, fontWeight: '900', fontFamily: bodyFont },
    copyActionTextSky: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 8.5, fontWeight: '800', fontFamily: bodyFont },

    copyCodePillEmerald: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      borderWidth: 1,
      borderColor: '#10B981',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginTop: 6,
    },
    copyCodeTextEmerald: { color: '#34D399', fontSize: 11, fontWeight: '900', fontFamily: bodyFont },
    copyActionTextEmerald: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 8.5, fontWeight: '800', fontFamily: bodyFont },

    quickRouteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.surface,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
    },
    quickRouteIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickRouteIconCircleSky: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: 'rgba(14, 165, 233, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // SEGMENTED SWITCHER (Taxi vs Carpool)
    tabSegmentBar: {
      flexDirection: 'row',
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 3,
      borderWidth: 1,
      borderColor: palette.border,
    },
    tabSegmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 11,
      gap: 6,
    },
    tabSegmentItemActiveTaxi: {
      backgroundColor: '#D97706',
    },
    tabSegmentItemActiveCarpool: {
      backgroundColor: '#0EA5E9',
    },
    tabSegmentText: {
      fontSize: 12,
      fontWeight: '800',
      color: palette.textMuted,
      fontFamily: bodyFont,
    },
    tabSegmentTextActive: {
      color: '#FFFFFF',
    },

    // DUAL TAXI OPTION SELECTOR
    taxiDualSelectorRow: {
      flexDirection: 'row',
      gap: 10,
    },
    taxiOptionCard: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1.5,
      borderColor: palette.border,
      gap: 6,
    },
    taxiOptionCardActiveStandard: {
      borderColor: '#D97706',
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.12)' : 'rgba(245, 158, 11, 0.08)',
    },
    taxiOptionCardActiveDropBid: {
      borderColor: '#0EA5E9',
      backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)',
    },
    optionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    optionIconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: palette.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popularTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    popularTagText: {
      color: '#D97706',
      fontSize: 8.5,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    vipTag: {
      backgroundColor: 'rgba(14, 165, 233, 0.15)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    vipTagText: {
      color: '#0EA5E9',
      fontSize: 8.5,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    lockTag: {
      backgroundColor: palette.surfaceAlt,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    lockTagText: {
      color: palette.textMuted,
      fontSize: 8.5,
      fontWeight: '900',
      fontFamily: bodyFont,
    },
    optionTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    optionTitleActiveStandard: {
      color: '#D97706',
      fontWeight: '900',
    },
    optionTitleActiveDropBid: {
      color: '#0EA5E9',
      fontWeight: '900',
    },
    optionSub: {
      fontSize: 10.5,
      color: palette.textMuted,
      fontFamily: bodyFont,
    },

    // ACTION BANNERS
    standardActionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#D97706',
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    dropBidActionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#0EA5E9',
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    bannerContent: { flex: 1, gap: 2 },
    bannerTitle: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', fontFamily: displayFont },
    bannerTitleDropBid: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', fontFamily: displayFont },
    bannerSub: { fontSize: 10.5, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 14, fontFamily: bodyFont },
    bannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0, 0, 0, 0.22)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    bannerBtnDropBid: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0, 0, 0, 0.22)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    bannerBtnText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', fontFamily: bodyFont },
    bannerBtnTextDropBid: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', fontFamily: bodyFont },

    // RECENT SEARCHES
    recentBox: { gap: 8 },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: palette.border },
    routeName: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    routeSub: { fontSize: 10.5, color: palette.textMuted, marginTop: 1, fontFamily: bodyFont },
    emptyRecentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: palette.border, borderStyle: 'dashed' },
    emptyRecentText: { flex: 1, fontSize: 12, color: palette.textMuted, fontFamily: bodyFont },
  });
}
