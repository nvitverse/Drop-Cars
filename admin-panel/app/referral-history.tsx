import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Users } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

type ReferralRow = {
  id: string;
  type: 'REFERRAL_BONUS' | 'CUSTOMER_REFERRAL_BONUS';
  referrer_reg_id: string | null;
  referrer_phone: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

const PAGE_SIZE = 50;

export default function ReferralHistoryScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<ReferralRow[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (skip: number, append: boolean) => {
    try {
      const res = await apiService.getReferralHistory(skip, PAGE_SIZE);
      setTotal(res.total);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(0, false);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(0, false);
  };

  const onEndReached = () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    load(items.length, true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Referral History ({total})</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <View style={[styles.summaryCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Gift size={20} color="#EA580C" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryTitle, { color: themeColors.text }]}>Total Referral Payouts</Text>
                <Text style={[styles.summarySub, { color: themeColors.textSecondary }]}>
                  {total} referral transactions recorded in the wallet ledger
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Users size={32} color={themeColors.textMuted} />
              <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>No referral bonuses paid out yet.</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color="#EA580C" /> : null}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.rowTop}>
                <View style={[styles.badge, item.type === 'REFERRAL_BONUS' ? (isDark ? { backgroundColor: '#78350F' } : styles.badgeDriver) : (isDark ? { backgroundColor: '#1E3A8A' } : styles.badgeCustomer)]}>
                  <Text style={[styles.badgeText, { color: item.type === 'REFERRAL_BONUS' ? (isDark ? '#FDE68A' : '#78350F') : (isDark ? '#93C5FD' : '#1E40AF') }]}>
                    {item.type === 'REFERRAL_BONUS' ? 'Driver Referral' : 'Customer Referral'}
                  </Text>
                </View>
                <Text style={styles.amount}>₹{item.amount.toLocaleString('en-IN')}</Text>
              </View>
              <Text style={[styles.notes, { color: themeColors.textSecondary }]}>{item.notes || '—'}</Text>
              <Text style={[styles.meta, { color: themeColors.textMuted }]}>
                Paid to {item.referrer_reg_id ? `#${item.referrer_reg_id}` : item.referrer_phone} · {new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}
        />
      )}
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summarySub: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13 },
  row: {
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeDriver: { backgroundColor: '#FFF7ED' },
  badgeCustomer: { backgroundColor: '#EFF6FF' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  amount: { fontSize: 15, fontWeight: '800', color: '#059669' },
  notes: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 11.5, marginTop: 6 },
});
