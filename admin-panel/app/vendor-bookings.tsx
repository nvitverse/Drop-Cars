import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Search, MapPin, Calendar, Car, User, Phone, ChevronRight } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import StatusBadge from '@/components/StatusBadge';

// Every booking one vendor has posted, with stats and full per-booking
// details - opened from the vendor's page. Uses the same GET /admin/orders
// endpoint filtered by vendor_id.

type Bucket = 'all' | 'active' | 'completed' | 'cancelled';
const PAGE = 50;

const bucketOf = (status?: string): Exclude<Bucket, 'all'> => {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s.includes('CANCEL') || s === 'EXPIRED' || s === 'NO DRIVER ASSIGNED') return 'cancelled';
  return 'active';
};

const routeOf = (loc: any): string => {
  if (!loc) return '';
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => loc[k]).filter(Boolean).join(' → ');
};

const money = (n?: number | null) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export default function VendorBookingsScreen() {
  const router = useRouter();
  const { vendorId, vendorName } = useLocalSearchParams<{ vendorId: string; vendorName?: string }>();
  const { isDark, themeColors } = useTheme();

  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bucket, setBucket] = useState<Bucket>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (reset = true) => {
    if (!vendorId) return;
    try {
      if (!reset) setLoadingMore(true);
      const skip = reset ? 0 : orders.length;
      const data = await apiService.getOrders(skip, PAGE, 'newest', String(vendorId));
      setOrders((prev) => (reset ? data.orders : [...prev, ...data.orders]));
      setTotal(data.total_count);
    } catch {
      // keep what's on screen
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [vendorId, orders.length]);

  useEffect(() => { load(true); }, [vendorId]);

  const stats = useMemo(() => {
    const s = { active: 0, completed: 0, cancelled: 0, value: 0 };
    for (const o of orders) {
      const b = bucketOf(o.trip_status);
      s[b] += 1;
      if (b === 'completed') s.value += o.closed_vendor_price ?? o.vendor_price ?? 0;
    }
    return s;
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (bucket !== 'all' && bucketOf(o.trip_status) !== bucket) return false;
      if (!q) return true;
      return [String(o.id), o.customer_name, o.customer_number, routeOf(o.pickup_drop_location), o.assigned_driver?.full_name, o.assigned_car?.car_number]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [orders, bucket, search]);

  const card = { backgroundColor: themeColors.surface, borderColor: themeColors.border };

  const Chip = ({ value, label, count }: { value: Bucket; label: string; count: number }) => {
    const on = bucket === value;
    return (
      <TouchableOpacity
        onPress={() => setBucket(value)}
        style={[styles.chip, { borderColor: on ? themeColors.primary : themeColors.border, backgroundColor: on ? themeColors.primary : 'transparent' }]}
      >
        <Text style={[styles.chipText, { color: on ? '#FFF' : themeColors.text }]}>{label} · {count}</Text>
      </TouchableOpacity>
    );
  };

  const header = (
    <View style={{ gap: 10, marginBottom: 10 }}>
      <View style={styles.statGrid}>
        <View style={[styles.stat, card]}><Text style={[styles.statValue, { color: themeColors.text }]}>{total}</Text><Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Total posted</Text></View>
        <View style={[styles.stat, card]}><Text style={[styles.statValue, { color: '#059669' }]}>{stats.completed}</Text><Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Completed</Text></View>
        <View style={[styles.stat, card]}><Text style={[styles.statValue, { color: '#2563EB' }]}>{stats.active}</Text><Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Active</Text></View>
        <View style={[styles.stat, card]}><Text style={[styles.statValue, { color: '#DC2626' }]}>{stats.cancelled}</Text><Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Cancelled</Text></View>
      </View>
      <View style={[styles.valueCard, card]}>
        <Text style={{ color: themeColors.textSecondary, fontSize: 12, fontWeight: '600' }}>Completed booking value{orders.length < total ? ' (loaded so far)' : ''}</Text>
        <Text style={{ color: themeColors.text, fontSize: 20, fontWeight: '800' }}>{money(stats.value)}</Text>
      </View>
      <View style={styles.chipRow}>
        <Chip value="all" label="All" count={orders.length} />
        <Chip value="active" label="Active" count={stats.active} />
        <Chip value="completed" label="Completed" count={stats.completed} />
        <Chip value="cancelled" label="Cancelled" count={stats.cancelled} />
      </View>
      <View style={[styles.searchRow, card]}>
        <Search size={16} color={themeColors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Booking #, customer, route, driver, car"
          placeholderTextColor={themeColors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.headerBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>{vendorName || 'Vendor'} · Bookings</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Everything this vendor has posted</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={themeColors.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          onEndReached={() => { if (!loadingMore && orders.length < total) load(false); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<View style={[styles.empty, card]}><Text style={{ color: themeColors.textSecondary }}>No bookings match.</Text></View>}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} color={themeColors.primary} /> : null}
          renderItem={({ item: o }) => (
            <TouchableOpacity activeOpacity={0.75} onPress={() => router.push(`/trip-detail?orderId=${o.id}` as any)} style={[styles.card, card]}>
              <View style={styles.cardTop}>
                <Text style={[styles.bookingId, { color: themeColors.text }]}>#{o.id}</Text>
                <StatusBadge status={o.trip_status || 'N/A'} type="order" />
              </View>
              <View style={styles.line}>
                <MapPin size={14} color={themeColors.textSecondary} />
                <Text style={[styles.lineText, { color: themeColors.text }]} numberOfLines={2}>{routeOf(o.pickup_drop_location) || '—'}</Text>
              </View>
              <View style={styles.line}>
                <Calendar size={14} color={themeColors.textSecondary} />
                <Text style={[styles.lineText, { color: themeColors.textSecondary }]}>
                  {o.start_date_time ? new Date(o.start_date_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  {o.trip_type ? ` · ${String(o.trip_type).replace(/_/g, ' ')}` : ''}
                  {o.trip_distance ? ` · ${o.trip_distance} km` : ''}
                </Text>
              </View>
              <View style={styles.line}>
                <Car size={14} color={themeColors.textSecondary} />
                <Text style={[styles.lineText, { color: themeColors.textSecondary }]}>
                  {String(o.car_type || '').replace(/_/g, ' ')}
                  {o.assigned_car?.car_number ? ` · ${o.assigned_car.car_number}` : ''}
                </Text>
              </View>
              <View style={styles.line}>
                <User size={14} color={themeColors.textSecondary} />
                <Text style={[styles.lineText, { color: themeColors.textSecondary }]}>
                  {o.customer_name || 'Customer'}
                  {o.assigned_driver?.full_name ? ` · Driver: ${o.assigned_driver.full_name}` : ' · No driver yet'}
                </Text>
              </View>
              <View style={[styles.cardBottom, { borderTopColor: themeColors.border }]}>
                <View>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>Customer fare</Text>
                  <Text style={{ color: themeColors.text, fontSize: 15, fontWeight: '800' }}>{money(o.closed_vendor_price ?? o.vendor_price ?? o.estimated_price)}</Text>
                </View>
                {o.customer_number ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.customer_number}`)} style={[styles.callBtn, { borderColor: themeColors.border }]}>
                    <Phone size={14} color="#059669" />
                    <Text style={{ color: '#059669', fontWeight: '700', fontSize: 12 }}>Customer</Text>
                  </TouchableOpacity>
                ) : null}
                <ChevronRight size={18} color={themeColors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  statGrid: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  valueCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 9 },
  empty: { borderWidth: 1, borderRadius: 10, padding: 20, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingId: { fontSize: 15, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineText: { flex: 1, fontSize: 12.5 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 'auto' },
});
