import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import axiosInstance from '@/app/api/axiosInstance';
import {
  Crown,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  Wallet,
  Clock,
  HelpCircle,
} from 'lucide-react-native';

const PERKS = [
  { id: '1', title: '1-Tap Instant Book', desc: 'Skip price negotiations and book immediately at estimated fare', icon: Zap },
  { id: '2', title: 'Dynamic In-Place Counter Offer', desc: 'Raise or lower your bid offer dynamically while matching', icon: Sparkles },
  { id: '3', title: 'Transparent Match Reason Badge', desc: 'See why a driver was picked (Fastest Arrival / Top Rated)', icon: Crown },
  { id: '4', title: 'Verified Carpooler Status', desc: 'Automatic verified trust badge on all carpool listings', icon: ShieldCheck },
  { id: '5', title: 'Premium Fast-Track Support', desc: 'Direct priority resolution path for all booking queries', icon: HelpCircle },
];

export default function CustomerSubscriptionScreen() {
  const router = useRouter();
  const { topPadding, isDark } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tier, setTier] = useState<'FREE' | 'MONTHLY' | 'YEARLY'>('FREE');
  const [walletBalance, setWalletBalance] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const userId = user?.id || user?.phone || 'customer_demo_user';

  const fetchStatus = async () => {
    setInitialLoading(true);
    try {
      const res = await axiosInstance.get('/api/subscriptions/customer/status', {
        params: { user_id: userId },
      });
      if (res.data) {
        setTier(res.data.tier || 'FREE');
        setWalletBalance(res.data.wallet_balance ?? 0);
        setExpiresAt(res.data.expires_at || null);
      }
    } catch (e: any) {
      console.log('Error loading customer subscription status:', e);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [user]);

  const handleSubscribe = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const res = await axiosInstance.post('/api/subscriptions/customer/subscribe', {
        user_id: userId,
        plan_type: selectedPlan,
      });

      if (res.data && res.data.success) {
        setTier(res.data.tier);
        setExpiresAt(res.data.expires_at);
        setWalletBalance(res.data.remaining_wallet_balance);

        Alert.alert(
          '🎉 Welcome to Drop Cars Premium!',
          res.data.message || `Your ${selectedPlan} subscription is active!`
        );
      }
    } catch (e: any) {
      const errorDetail = e?.response?.data?.detail || 'Subscription activation failed. Please try again.';
      if (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('insufficient')) {
        Alert.alert(
          'Insufficient Wallet Balance',
          errorDetail,
          [
            { text: 'Add Money', onPress: () => router.push('/(customer)/wallet') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Subscription Error', String(errorDetail));
      }
    } finally {
      setLoading(false);
    }
  };

  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* HEADER */}
      <LinearGradient colors={palette.headerGradient} style={[styles.headerGradient, { paddingTop: topPadding + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft color="#FFFFFF" size={18} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Drop Cars Premium Pass</Text>
            <Text style={styles.headerSub}>Unlock 1-Tap Booking & Priority Perks</Text>
          </View>
          <View style={{ width: 30 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {/* CURRENT TIER BANNER */}
        <View style={[styles.tierCard, { backgroundColor: palette.surface, borderColor: tier !== 'FREE' ? '#F59E0B' : palette.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.crownBadge, { backgroundColor: tier !== 'FREE' ? 'rgba(245,158,11,0.2)' : 'rgba(14,165,233,0.15)' }]}>
                <Crown color={tier !== 'FREE' ? '#F59E0B' : '#0EA5E9'} size={24} />
              </View>
              <View>
                <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                  {tier === 'FREE' ? 'Free Tier User' : `Drop Cars Premium ${tier}`}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                  {tier === 'FREE' ? 'Standard bidding & carpooling' : `Expires in ${daysRemaining} days`}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: tier !== 'FREE' ? '#10B981' : '#64748B' }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>
                {tier !== 'FREE' ? 'ACTIVE' : 'FREE'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Wallet color="#0EA5E9" size={15} />
              <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '600' }}>Wallet Balance:</Text>
              <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '900' }}>₹{walletBalance}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(customer)/wallet')}>
              <Text style={{ color: '#0EA5E9', fontSize: 12, fontWeight: '800' }}>+ Add Money</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PLAN SELECTION */}
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Choose Subscription Plan</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          {/* MONTHLY PLAN */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelectedPlan('MONTHLY')}
            style={[
              styles.planBox,
              {
                backgroundColor: palette.surface,
                borderColor: selectedPlan === 'MONTHLY' ? '#0EA5E9' : palette.border,
                borderWidth: selectedPlan === 'MONTHLY' ? 2 : 1,
              },
            ]}
          >
            <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '700' }}>MONTHLY PASS</Text>
            <Text style={{ color: palette.textPrimary, fontSize: 22, fontWeight: '900', marginVertical: 4 }}>
              ₹199<Text style={{ fontSize: 12, fontWeight: '600' }}>/mo</Text>
            </Text>
            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>Save time every trip</Text>
          </TouchableOpacity>

          {/* YEARLY PLAN */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setSelectedPlan('YEARLY')}
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
              <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>SAVE 16%</Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '700' }}>ANNUAL PREMIUM</Text>
            <Text style={{ color: palette.textPrimary, fontSize: 22, fontWeight: '900', marginVertical: 4 }}>
              ₹1,999<Text style={{ fontSize: 12, fontWeight: '600' }}>/yr</Text>
            </Text>
            <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>Best value for frequent riders</Text>
          </TouchableOpacity>
        </View>

        {/* SUBSCRIBE BUTTON */}
        <TouchableOpacity
          style={[styles.subscribeBtn, { opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.subscribeBtnText}>
              {tier === selectedPlan ? 'Extend Subscription' : `Activate ${selectedPlan} Premium • ₹${selectedPlan === 'MONTHLY' ? 199 : 1999}`}
            </Text>
          )}
        </TouchableOpacity>

        {/* PERKS LIST */}
        <Text style={[styles.sectionTitle, { color: palette.textPrimary, marginTop: 24 }]}>Premium Member Benefits</Text>
        <View style={[styles.perksContainer, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {PERKS.map((perk, idx) => {
            const IconComp = perk.icon;
            return (
              <View key={perk.id} style={styles.perkRow}>
                <View style={[styles.perkIconWrap, { backgroundColor: 'rgba(14,165,233,0.12)' }]}>
                  <IconComp color="#0EA5E9" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: '800' }}>{perk.title}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 }}>{perk.desc}</Text>
                </View>
                <CheckCircle2 color="#10B981" size={18} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  scroll: { flex: 1 },
  scrollInner: { padding: 16, paddingBottom: 40 },
  tierCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  crownBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12 },
  planBox: { flex: 1, borderRadius: 16, padding: 16, position: 'relative' },
  saveBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  subscribeBtn: { backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  subscribeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  perksContainer: { borderRadius: 16, padding: 12, borderWidth: 1, gap: 12 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  perkIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
});
