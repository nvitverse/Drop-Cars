import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTaxiFlow } from '@/contexts/TaxiFlowContext';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import {
  User,
  Phone,
  MessageSquare,
  HelpCircle,
  Clock,
  Wallet,
  Settings,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Headphones,
  Moon,
  Sun,
  Smartphone,
  Star,
  Sparkles,
  Award,
  MapPin,
  Building2,
  CreditCard,
  Zap,
  Car,
  Music,
  FileText,
  CheckCircle2,
} from 'lucide-react-native';

export default function CustomerMenuScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user, logout } = useAuth();
  const { isPremium, togglePremium, interfaceMode, setInterfaceMode } = useTaxiFlow();
  const { themeMode, cycleThemeMode } = useThemePreference();
  const { activeMode } = useServiceMode();

  const isCarpoolMode = activeMode === 'CARPOOL';

  const handleCallSupport = () => {
    const msg = isCarpoolMode
      ? 'Dialing Drop Connect Safety Helpline: 1800-425-3767'
      : 'Dialing 24x7 Customer Support: 1800-425-3767';
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Helpline Support', msg);
  };

  const handleWhatsAppSupport = () => {
    const msg = isCarpoolMode
      ? 'Opening Drop Connect Community Chat Support'
      : 'Opening WhatsApp Support Chat (+91 98765 43210)';
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('WhatsApp Support', msg);
  };

  const themeStyles = getStyles(isDark, palette);

  return (
    <SafeAreaView style={themeStyles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* RICH BRAND HEADER */}
      <LinearGradient
        colors={isCarpoolMode ? ['#0EA5E9', '#0284C7', '#0369A1'] : palette.headerGradient}
        style={[themeStyles.headerGradient, { paddingTop: topPadding }]}
      >
        <Text style={themeStyles.topTitle}>
          {isCarpoolMode ? 'Drop Connect Profile 🤝' : 'Account & Settings 🚕'}
        </Text>
        <Text style={themeStyles.topSubtitle}>
          {isCarpoolMode
            ? 'Manage your Aadhaar verification, vehicle specs, host preferences & ratings'
            : 'Manage your profile, corporate travel, loyalty & 24x7 support'}
        </Text>

        {/* PROFILE CARD */}
        <View style={themeStyles.profileCard}>
          <View style={[themeStyles.avatarBox, isCarpoolMode && { backgroundColor: 'rgba(14, 165, 233, 0.2)' }]}>
            <User color={isCarpoolMode ? '#0EA5E9' : '#FBBF24'} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={themeStyles.profileName}>{user?.name || 'Customer'}</Text>
              <View style={[themeStyles.verifiedPill, isCarpoolMode && { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <ShieldCheck color="#10B981" size={10} />
                <Text style={themeStyles.verifiedPillText}>
                  {isCarpoolMode ? 'Aadhaar Verified Host' : 'Verified Rider'}
                </Text>
              </View>
            </View>
            <Text style={themeStyles.profilePhone}>{user?.phone || ''}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* MENU BODY */}
      <ScrollView style={themeStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {isCarpoolMode ? (
          /* DROP CONNECT HUB SPECIFIC SETTINGS & SECTIONS */
          <>
            {/* HOST & RIDER COMMUNITY STATS CARD */}
            <View style={[themeStyles.loyaltyCard, { borderColor: 'rgba(14, 165, 233, 0.3)' }]}>
              <View style={themeStyles.loyaltyHeader}>
                <View style={[themeStyles.loyaltyIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                  <Star color="#0EA5E9" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.loyaltyTitle}>Community Host Score</Text>
                  <Text style={themeStyles.loyaltyCoins}>No ratings yet</Text>
                </View>
              </View>
              <Text style={themeStyles.loyaltySub}>Your host rating builds up as you complete Drop Connect trips.</Text>
            </View>

            {/* P2P VERIFICATION & VEHICLE SPECS */}
            <Text style={themeStyles.sectionTitle}>Identity & Vehicle Verification</Text>
            <View style={themeStyles.menuGroup}>
              <TouchableOpacity style={themeStyles.menuItem} onPress={() => Alert.alert('ID Verification', 'Govt ID verification for P2P seat sharing isn\'t available yet - check back soon.')}>
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                  <ShieldCheck color={palette.textMuted} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>Aadhaar & Govt ID</Text>
                  <Text style={themeStyles.menuItemSub}>Status: Not verified yet</Text>
                </View>
                <ChevronRight color={palette.textMuted} size={16} />
              </TouchableOpacity>

              <TouchableOpacity style={themeStyles.menuItem} onPress={() => Alert.alert('My Vehicle', 'Registered: Hyundai Creta (SUV) • TN 01 AB 1234')}>
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                  <Car color="#0EA5E9" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>My Vehicle & RC Details</Text>
                  <Text style={themeStyles.menuItemSub}>Hyundai Creta SUV • TN 01 AB 1234 (3 Seats)</Text>
                </View>
                <ChevronRight color={palette.textMuted} size={16} />
              </TouchableOpacity>

              <TouchableOpacity style={themeStyles.menuItem} onPress={() => Alert.alert('Preferences', 'Music: ON | Smoking: OFF | Pets: Allowed')}>
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Music color="#8B5CF6" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>Ride & Chat Preferences</Text>
                  <Text style={themeStyles.menuItemSub}>Loves Music • Chatty • Non-smoking • Pet friendly</Text>
                </View>
                <ChevronRight color={palette.textMuted} size={16} />
              </TouchableOpacity>
            </View>

            {/* EARNINGS & PAYOUT ACCOUNT */}
            <Text style={themeStyles.sectionTitle}>Earnings & Fuel Payouts</Text>
            <View style={themeStyles.menuGroup}>
              <TouchableOpacity style={themeStyles.menuItem} onPress={() => Alert.alert('Payout Account', 'Default UPI: karthik@okaxis • Weekly Auto Payouts')}>
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Wallet color="#D97706" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>Fuel Contribution Payouts</Text>
                  <Text style={themeStyles.menuItemSub}>Bank Account / UPI ID for passenger payouts</Text>
                </View>
                <ChevronRight color={palette.textMuted} size={16} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* TAXI HUB COMMERCIAL CAB SETTINGS */
          <>
            {/* DROP COINS & LOYALTY CARD */}
            <View style={themeStyles.loyaltyCard}>
              <View style={themeStyles.loyaltyHeader}>
                <View style={themeStyles.loyaltyIconBox}>
                  <Award color="#F59E0B" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.loyaltyTitle}>Drop Coins Balance</Text>
                  <Text style={themeStyles.loyaltyCoins}>1,450 Coins</Text>
                </View>
                <View style={themeStyles.loyaltyValueTag}>
                  <Text style={themeStyles.loyaltyValueText}>= ₹145 Saved</Text>
                </View>
              </View>
              <Text style={themeStyles.loyaltySub}>Earn 5% Drop Coins on every outstation taxi booking.</Text>
            </View>

            {/* INTERFACE MODE & THEME TOGGLE */}
            <Text style={themeStyles.sectionTitle}>App Preferences</Text>
            <View style={themeStyles.menuGroup}>
              <TouchableOpacity
                style={themeStyles.menuItem}
                onPress={() => setInterfaceMode(interfaceMode === 'MY' ? 'B2B' : 'MY')}
              >
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                  {interfaceMode === 'B2B' ? <Building2 color="#0EA5E9" size={18} /> : <User color="#0EA5E9" size={18} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>Interface Mode</Text>
                  <Text style={themeStyles.menuItemSub}>
                    Currently: {interfaceMode === 'B2B' ? 'Corporate Account Portal' : 'Personal Rider'}
                  </Text>
                </View>
                <Text style={themeStyles.toggleActionText}>Switch</Text>
              </TouchableOpacity>

              <TouchableOpacity style={themeStyles.menuItem} onPress={cycleThemeMode}>
                <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  {themeMode === 'dark' ? <Moon color="#8B5CF6" size={18} /> : <Sun color="#8B5CF6" size={18} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themeStyles.menuItemTitle}>Theme Preference</Text>
                  <Text style={themeStyles.menuItemSub}>Mode: {themeMode.toUpperCase()}</Text>
                </View>
                <Text style={themeStyles.toggleActionText}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* PREMIUM MEMBERSHIP */}
            <Text style={themeStyles.sectionTitle}>Premium Membership</Text>
            <View style={themeStyles.premiumCard}>
              <View style={themeStyles.premiumIconBox}>
                <Sparkles color={isPremium ? '#F59E0B' : palette.textMuted} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={themeStyles.premiumTitle}>{isPremium ? 'You are a Premium Member' : 'Upgrade to Premium'}</Text>
                <Text style={themeStyles.premiumSub}>
                  {isPremium
                    ? 'Drop Bid bidding unlocked on every request.'
                    : 'Unlock Drop Bid bidding, driver selection & priority matching.'}
                </Text>
              </View>
              <TouchableOpacity style={[themeStyles.premiumToggle, isPremium && themeStyles.premiumToggleActive]} onPress={togglePremium}>
                <Text style={[themeStyles.premiumToggleText, isPremium && themeStyles.premiumToggleTextActive]}>
                  {isPremium ? 'Active' : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* COMMON 24x7 SUPPORT & HELP SECTION */}
        <Text style={themeStyles.sectionTitle}>24x7 Support & Help</Text>
        <View style={themeStyles.menuGroup}>
          <TouchableOpacity style={themeStyles.menuItem} onPress={handleCallSupport}>
            <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Phone color="#D97706" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={themeStyles.menuItemTitle}>
                {isCarpoolMode ? 'Call Community Helpline' : 'Call Customer Care (24x7)'}
              </Text>
              <Text style={themeStyles.menuItemSub}>Toll-Free Helpline: 1800-425-3767</Text>
            </View>
            <ChevronRight color={palette.textMuted} size={16} />
          </TouchableOpacity>

          <TouchableOpacity style={themeStyles.menuItem} onPress={handleWhatsAppSupport}>
            <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <MessageSquare color="#10B981" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={themeStyles.menuItemTitle}>WhatsApp Support</Text>
              <Text style={themeStyles.menuItemSub}>Instant chat with support agent</Text>
            </View>
            <ChevronRight color={palette.textMuted} size={16} />
          </TouchableOpacity>

          <TouchableOpacity style={themeStyles.menuItem} onPress={() => router.push('/(customer)/support' as any)}>
            <View style={[themeStyles.iconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
              <HelpCircle color="#0EA5E9" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={themeStyles.menuItemTitle}>Help Center & FAQs</Text>
              <Text style={themeStyles.menuItemSub}>
                {isCarpoolMode ? 'Community safety guidelines & seat refunds' : 'Cancellation policies, GST invoices & refunds'}
              </Text>
            </View>
            <ChevronRight color={palette.textMuted} size={16} />
          </TouchableOpacity>
        </View>

        {/* LOGOUT */}
        <TouchableOpacity style={themeStyles.logoutBtn} onPress={logout}>
          <LogOut color="#EF4444" size={18} />
          <Text style={themeStyles.logoutBtnText}>Logout Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(isDark: boolean, palette: ReturnType<typeof getPalette>) {
  const displayFont = Platform.OS === 'web' ? "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" : undefined;
  const bodyFont = Platform.OS === 'web' ? "'Plus Jakarta Sans', system-ui, sans-serif" : undefined;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },

    headerGradient: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 18,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      gap: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    topTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', fontFamily: displayFont },
    topSubtitle: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 11.5, fontFamily: bodyFont },

    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.22)',
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    avatarBox: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(251, 191, 36, 0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FBBF24' },
    profileName: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontFamily: displayFont },
    profilePhone: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 11.5, marginTop: 1, fontFamily: bodyFont },
    verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16, 185, 129, 0.25)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    verifiedPillText: { color: '#10B981', fontSize: 9.5, fontWeight: '800', fontFamily: bodyFont },

    scrollContent: { flex: 1, padding: 14 },

    loyaltyCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1.5,
      borderColor: '#F59E0B',
      gap: 8,
      marginBottom: 14,
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    loyaltyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    loyaltyIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center' },
    loyaltyTitle: { fontSize: 11, color: palette.textMuted, fontFamily: bodyFont },
    loyaltyCoins: { fontSize: 16, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    loyaltyValueTag: { backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    loyaltyValueText: { color: '#D97706', fontSize: 10.5, fontWeight: '900', fontFamily: bodyFont },
    loyaltySub: { fontSize: 10.5, color: palette.textMuted, lineHeight: 15, fontFamily: bodyFont },

    sectionTitle: { fontSize: 13.5, fontWeight: '800', color: palette.textPrimary, marginBottom: 8, marginTop: 4, fontFamily: bodyFont },

    menuGroup: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', marginBottom: 14 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: palette.divider },
    iconBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    menuItemTitle: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    menuItemSub: { fontSize: 10.5, color: palette.textMuted, marginTop: 1, fontFamily: bodyFont },
    toggleActionText: { fontSize: 11.5, fontWeight: '800', color: '#0EA5E9', fontFamily: bodyFont },

    premiumCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 14, marginBottom: 14 },
    premiumIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.15)', justifyContent: 'center', alignItems: 'center' },
    premiumTitle: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    premiumSub: { fontSize: 10.5, color: palette.textMuted, marginTop: 1, lineHeight: 15, fontFamily: bodyFont },
    premiumToggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border },
    premiumToggleActive: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: '#F59E0B' },
    premiumToggleText: { fontSize: 11, fontWeight: '800', color: palette.textMuted, fontFamily: bodyFont },
    premiumToggleTextActive: { color: '#D97706' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)', marginBottom: 24 },
    logoutBtnText: { color: '#EF4444', fontSize: 13.5, fontWeight: '800', fontFamily: bodyFont },
  });
}
