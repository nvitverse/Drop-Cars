import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, CheckCircle2 } from 'lucide-react-native';
import { referralClaimsApi, ReferralClaim } from '@/services/referralClaimsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

const TABS: Array<{ key: 'pending' | 'claimed'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'claimed', label: 'Claimed' },
];

export default function ReferralClaimsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [tab, setTab] = useState<'pending' | 'claimed'>('pending');
  const [claims, setClaims] = useState<ReferralClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const load = useCallback(async (status: 'pending' | 'claimed') => {
    try {
      const data = await referralClaimsApi.list(status);
      setClaims(data.claims);
    } catch (error: any) {
      console.error('Failed to load referral claims:', error);
      Alert.alert('Error', error?.message || 'Failed to load claims');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(tab);
  }, [tab, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(tab);
  };

  const handleMarkClaimed = (claim: ReferralClaim) => {
    Alert.alert('Mark as Claimed?', `Confirm reward payout of ₹${claim.amount} for ${claim.customer_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Claimed',
        onPress: async () => {
          setActioningId(claim.id);
          try {
            await referralClaimsApi.markClaimed(claim.id);
            showToast(`Claim #${claim.id} marked as claimed.`, 'success');
            load(tab);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to mark as claimed');
          } finally {
            setActioningId(null);
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Referral Redemptions</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                { backgroundColor: active ? (isDark ? '#1E3A8A' : colors.primaryTint) : (isDark ? '#334155' : '#F3F4F6') },
              ]}
              onPress={() => setTab(t.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? (isDark ? '#93C5FD' : colors.primary) : themeColors.textSecondary, fontWeight: active ? '700' : '600' },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={claims}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Gift size={48} color={themeColors.textMuted} />
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>No {tab} claims.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.customerName, { color: themeColors.text }]}>{item.customer_name}</Text>
              <Text style={styles.amount}>₹{item.amount.toLocaleString('en-IN')}</Text>
            </View>
            {item.customer_phone ? <Text style={[styles.meta, { color: themeColors.textSecondary }]}>{item.customer_phone}</Text> : null}
            <View style={[styles.codeRow, { backgroundColor: themeColors.background }]}>
              <Text style={[styles.code, { color: themeColors.text }]}>{item.redeem_code}</Text>
            </View>
            <Text style={[styles.meta, { color: themeColors.textMuted }]}>
              {new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
            {tab === 'pending' && (
              <TouchableOpacity
                style={styles.claimBtn}
                onPress={() => handleMarkClaimed(item)}
                disabled={actioningId === item.id}
              >
                {actioningId === item.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="white" />
                    <Text style={styles.claimBtnText}>Mark as Claimed</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  tabText: { fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13 },
  card: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  customerName: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 17, fontWeight: '800', color: '#059669' },
  meta: { fontSize: 12.5, marginTop: 2 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  code: { fontSize: 14, fontWeight: '800', fontFamily: 'monospace' as any, letterSpacing: 0.5 },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 11,
    marginTop: 12,
  },
  claimBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
});
