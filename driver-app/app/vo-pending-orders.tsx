import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IndianRupee, TrendingUp } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { getPendingOrders, type PendingOrderView } from '@/services/vehicle/vehicleOwnerService';
import { formatCarType } from '@/utils/format';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { IncreaseFareModal } from '@/components/IncreaseFareModal';

export default function VOPendingOrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PendingOrderView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrderView | null>(null);
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPendingOrders({ limit: 20, page: 1 });
      setOrders(data);
    } catch (e: any) {
      setError(e?.message || t('voPendingOrders.loadFailedGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await getPendingOrders({ limit: 20, page: 1 });
      setOrders(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || t('voPendingOrders.loadFailedGeneric'));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('voPendingOrders.headerTitle')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          keyExtractor={(item) => String(item.order_id)}
          renderItem={({ item }) => {
            const isAllInclusive = item.fare_type === 'ALL_INCLUSIVE';
            const extraCharges = (item.charge_items || []).filter((c) => !c.included).map((c) => c.label);
            const fareTypeSummary = isAllInclusive
              ? (extraCharges.length > 0 ? `All Inclusive · ${extraCharges.join(', ')} extra` : 'All Inclusive')
              : null;
            return (
              <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.route, { color: colors.text }]}>{item.pickup_city} → {item.drop_city}</Text>
                {!!fareTypeSummary && (
                  <View style={[styles.fareTypeBadge, { backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#EFF6FF', borderColor: isDarkMode ? colors.primaryDark : colors.border }]}>
                    <IndianRupee size={13} color={colors.primary} />
                    <Text style={[styles.fareTypeBadgeText, { color: colors.primary }]}>{fareTypeSummary}</Text>
                  </View>
                )}
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('voPendingOrders.typeCarLabel', { tripType: item.trip_type, carType: formatCarType(item.car_type) })}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('voPendingOrders.distanceTimeLabel', { distance: item.trip_distance, time: item.trip_time })}</Text>
                <Text style={[styles.price, { color: colors.text }]}>{t('voPendingOrders.totalLabel', { amount: item.total_amount ?? t('voPendingOrders.notAvailable') })}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('voPendingOrders.perKmLabel', { value: item.per_km_price != null ? `₹${item.per_km_price}` : t('voPendingOrders.notAvailable') })}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('voPendingOrders.statusLabel', { status: item.assignment_status })}</Text>

                <TouchableOpacity
                  style={styles.increaseBtn}
                  onPress={() => {
                    if (isAllInclusive) {
                      setSelectedOrder(item);
                    } else {
                      router.push(`/create-booking?edit=true&orderId=${item.order_id}` as any);
                    }
                  }}
                >
                  <TrendingUp size={14} color="#FFFFFF" />
                  <Text style={styles.increaseBtnText}>Increase Fare</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('voPendingOrders.empty')}</Text>}
        />
      )}

      {selectedOrder && (
        <IncreaseFareModal
          visible={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          orderId={selectedOrder.order_id}
          currentFare={selectedOrder.total_amount || 0}
          onSuccess={() => {
            setSelectedOrder(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  refresh: { fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: {},
  card: { margin: 12, padding: 16, borderRadius: 6, borderWidth: 1 },
  route: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  fareTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
    gap: 4,
    borderWidth: 1,
  },
  fareTypeBadgeText: { fontSize: 11, fontWeight: '600' },
  meta: { marginTop: 2 },
  price: { marginTop: 8, fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 24 },
  increaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
    gap: 6,
  },
  increaseBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});



