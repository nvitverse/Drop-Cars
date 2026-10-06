import React, { useState, useEffect, useMemo } from 'react';
import { getBookingStatusLabel, getBookingStatusColor } from '@/utils/bookingStatus';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Car,
  Clock,
  MapPin,
  Wallet,
  Users,
  Plus,
  Bell,
  MessageCircle,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import api from '../api/api';
import { router } from 'expo-router';

interface VendorData {
  id: string;
  full_name: string;
  primary_number: string;
  account_status: string;
  branch_name: string;
}

interface Order {
  id: number;
  source: string;
  source_order_id: number;
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: {
    [key: string]: string;
  };
  start_date_time: string;
  customer_name: string;
  customer_number: string;
  trip_status: string;
  pick_near_city: string;
  trip_distance: number | null;
  trip_time: string;
  estimated_price: number;
  vendor_price: number;
  platform_fees_percent: number;
  created_at: string;
  order_accept_status: boolean;
  Driver_assigned: boolean;
  Car_assigned: boolean;
}

// Matches GET /users/vacant-cities's real response shape (one row per
// fleet owner, cities is an array since an owner can mark several cities
// vacant at once). No full phone number is exposed here by design - see
// that route's own comment (notify-only, not a way to contact directly).
interface VacantUpdate {
  vehicle_owner_id: string;
  masked_phone: string;
  cities: string[];
  driver_name: string | null;
  car_number: string | null;
  avg_driver_rating: number | null;
  updated_at: string;
}

export default function VendorDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vendorData, setVendorData] = useState<VendorData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vacantUpdates, setVacantUpdates] = useState<VacantUpdate[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletFetchFailed, setWalletFetchFailed] = useState(false);
  const [profileFetchFailed, setProfileFetchFailed] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Unread badge for the Chats quick-action tile - booking chats with the
  // driver who accepted your posted trips. Side-effect-free fetch (doesn't
  // mark anything read).
  useEffect(() => {
    let cancelled = false;
    const refreshUnread = async () => {
      try {
        const res = await api.get('/booking-chat/threads');
        const total = Array.isArray(res.data) ? res.data.reduce((sum: number, t: any) => sum + (t.unread || 0), 0) : 0;
        if (!cancelled) setUnreadChats(total);
      } catch {}
    };
    refreshUnread();
    const interval = setInterval(refreshUnread, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchVendorProfile(),
        fetchOrders(),
        fetchVacantUpdates(),
        fetchWalletBalance(),
      ]);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchVendorProfile(),
      fetchOrders(),
      fetchVacantUpdates(),
      fetchWalletBalance(),
    ]);
    setRefreshing(false);
  };

  const fetchVendorProfile = async () => {
    try {
      const response = await api.get('/users/vendor-details/me');
      setVendorData(response.data);
      setProfileFetchFailed(false);
    } catch (err) {
      console.error('Error fetching vendor profile:', err);
      setProfileFetchFailed(true);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders/pending/vendor');
      const data: Order[] = response.data || [];
      const sorted = data.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(sorted);
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  const fetchVacantUpdates = async () => {
    try {
      const response = await api.get('/users/vacant-cities');
      const data: VacantUpdate[] = response.data || [];
      const now = new Date().getTime();
      const fresh = data.filter((item) => {
        if (!item.updated_at) return true;
        const updated = new Date(item.updated_at).getTime();
        return now - updated <= 24 * 60 * 60 * 1000;
      });
      // Keep the full fresh list - the dashboard tile's count needs the
      // real total, not just the preview slice. Only the "recent 4" render
      // below trims for display.
      setVacantUpdates(fresh);
    } catch (err) {
      console.error('Error fetching vacant updates:', err);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      const response = await api.get('/wallet/balance');
      if (response.data && typeof response.data.current_balance === 'number') {
        setWalletBalance(response.data.current_balance);
      }
      setWalletFetchFailed(false);
    } catch (err) {
      // Keep balance as-is, but surface that the fetch failed so a real
      // backend failure isn't mistaken for a healthy zero balance.
      console.error('Error fetching wallet balance:', err);
      setWalletFetchFailed(true);
    }
  };

  // Metrics
  const activeRunningCount = useMemo(() => {
    return orders.filter(
      (o) =>
        o.order_accept_status &&
        o.Car_assigned &&
        o.Driver_assigned &&
        o.trip_status?.toUpperCase() !== 'COMPLETED' &&
        o.trip_status?.toUpperCase() !== 'CANCELLED'
    ).length;
  }, [orders]);

  // Priority-sorted Upcoming Bookings (earliest start_date_time / pickup date & time first)
  const upcomingOrders = useMemo(() => {
    const available = orders.filter(
      (o) => o.trip_status?.toUpperCase() !== 'COMPLETED' && o.trip_status?.toUpperCase() !== 'CANCELLED'
    );
    return [...available].sort((a, b) => {
      const timeA = a.start_date_time ? new Date(a.start_date_time).getTime() : new Date(a.created_at).getTime();
      const timeB = b.start_date_time ? new Date(b.start_date_time).getTime() : new Date(b.created_at).getTime();
      return timeA - timeB;
    });
  }, [orders]);

  const formatStartDateTime = (startStr: string, createdStr: string) => {
    const d = startStr ? new Date(startStr) : (createdStr ? new Date(createdStr) : null);
    if (!d || isNaN(d.getTime())) return 'Upcoming Duty';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${timeString}`;
    if (isTomorrow) return `Tomorrow at ${timeString}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeString}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading Vendor Dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1D4ED8" />

      {/* Header */}
      <LinearGradient
        colors={['#1D4ED8', '#1E40AF']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.profileSection}
            onPress={() => router.push('/(menu)/profile')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarGradient}>
              <Text style={styles.avatarText}>
                {vendorData?.full_name?.trim()?.charAt(0)?.toUpperCase() || 'M'}
              </Text>
            </View>
            <View style={styles.profileTextCol}>
              <View style={styles.partnerBadge}>
                <ShieldCheck size={13} color="#86EFAC" />
                <Text style={styles.partnerBadgeText}>Verified Vendor</Text>
              </View>
              <Text style={styles.vendorName} numberOfLines={1}>
                {vendorData?.full_name || 'Mukil Travels'}
              </Text>
              {profileFetchFailed && (
                <Text style={styles.fetchErrorText}>⚠ Profile load failed</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Compact Wallet Pill in header */}
          <TouchableOpacity
            style={styles.headerWalletPill}
            onPress={() => router.push('/(menu)/wallet')}
            activeOpacity={0.8}
          >
            <Wallet size={13} color="#FFFFFF" />
            <Text style={styles.headerWalletAmount}>
              ₹{walletBalance.toLocaleString('en-IN')}
            </Text>
            {walletFetchFailed && (
              <Text style={styles.fetchErrorText}>⚠</Text>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* Operations Grid */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionHeaderTitle}>Dashboard Operations</Text>
          <View style={styles.quickActionsGrid}>
            {/* Running Rides */}
            <TouchableOpacity
              style={styles.quickActionTile}
              onPress={() => router.push('/(tabs)/bookings')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickActionIconBg, { backgroundColor: '#F0FDF4' }]}>
                <Zap size={20} color="#059669" />
                {activeRunningCount > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#059669' }]}>
                    <Text style={styles.countBadgeText}>{activeRunningCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>Running Rides</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>{activeRunningCount} active</Text>
            </TouchableOpacity>

            {/* Vacant Drivers */}
            <TouchableOpacity
              style={styles.quickActionTile}
              onPress={() => router.push('/(menu)/vacant-cities')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickActionIconBg, { backgroundColor: '#F5F3FF' }]}>
                <Users size={20} color="#6366F1" />
                {vacantUpdates.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#6366F1' }]}>
                    <Text style={styles.countBadgeText}>{vacantUpdates.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>Vacant Drivers</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>{vacantUpdates.length} near hubs</Text>
            </TouchableOpacity>

            {/* Chats - talk to the driver who accepted a booking you posted (pickup location, customer number, tariff...) */}
            <TouchableOpacity
              style={styles.quickActionTile}
              onPress={() => router.push('/chats' as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.quickActionIconBg, { backgroundColor: '#ECFDF5' }]}>
                <MessageCircle size={20} color="#059669" />
                {unreadChats > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: '#EF4444' }]}>
                    <Text style={styles.countBadgeText}>{unreadChats > 99 ? '99+' : unreadChats}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickActionLabel} numberOfLines={1} adjustsFontSizeToFit>Chats</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>Drivers on your trips</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Priority Upcoming Bookings Feed */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionHeaderTitle}>Upcoming Bookings</Text>
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 1 }}>
                Prioritized by pickup time & date
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/upcoming-bookings')} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>View All ({upcomingOrders.length}) →</Text>
            </TouchableOpacity>
          </View>

          {upcomingOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Car size={28} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No upcoming bookings scheduled</Text>
              <TouchableOpacity
                style={styles.emptyPostBtn}
                onPress={() => router.push('/(tabs)/create-order')}
              >
                <Plus size={14} color="#FFFFFF" />
                <Text style={styles.emptyPostBtnText}>Post Booking</Text>
              </TouchableOpacity>
            </View>
          ) : (
            upcomingOrders.slice(0, 5).map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.orderItemCard}
                onPress={() => router.push(`/order-details?orderId=${order.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.orderItemHeader}>
                  <View style={styles.orderItemBadge}>
                    <Text style={styles.orderIdText}>Booking #{order.id}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Clock size={12} color="#2563EB" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>
                        {formatStartDateTime(order.start_date_time, order.created_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.orderPriceText}>₹{order.vendor_price}</Text>
                </View>

                <View style={styles.routeContainer}>
                  <View style={styles.routePointRow}>
                    <View style={[styles.dotCircle, { backgroundColor: '#2563EB' }]} />
                    <Text style={styles.routeCityText} numberOfLines={1}>
                      {order.pickup_drop_location?.['0'] || 'Pickup Location'}
                    </Text>
                  </View>
                  {order.pickup_drop_location?.['1'] && (
                    <View style={styles.routePointRow}>
                      <View style={[styles.dotCircle, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.routeCityText} numberOfLines={1}>
                        {order.pickup_drop_location['1']}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.orderFooterRow}>
                  <View style={styles.carTypeTag}>
                    <Car size={14} color="#64748B" />
                    <Text style={styles.carTypeTagText}>{order.car_type || 'Sedan'}</Text>
                  </View>
                  {(() => {
                    const stage = getBookingStatusLabel(order as any);
                    const stageColor = getBookingStatusColor(stage);
                    return (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: `${stageColor}1A` }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: stageColor }} numberOfLines={1}>{stage}</Text>
                      </View>
                    );
                  })()}
                  <View style={styles.customerNameTag}>
                    <Text style={styles.customerNameTagText}>👤 {order.customer_name}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: Platform.OS === 'ios' ? 100 : 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 44 : ANDROID_STATUS_BAR + 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  profileTextCol: {
    flex: 1,
  },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  partnerBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#86EFAC',
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 1,
  },
  headerWalletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  headerWalletAmount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fetchErrorText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  sectionHeaderTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickActionsContainer: {
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickActionTile: {
    flex: 1,
    minHeight: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  quickActionIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#D97706',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    width: '100%',
    marginTop: 2,
  },
  quickActionSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
    marginTop: 1,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 6,
  },
  emptyPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  emptyPostBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  orderItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  orderItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderIdText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  orderTimeAgo: {
    fontSize: 11.5,
    color: '#64748B',
  },
  orderPriceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  routeContainer: {
    gap: 3,
    marginVertical: 3,
  },
  routePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routeCityText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  orderFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  carTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carTypeTagText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
  },
  customerNameTag: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customerNameTagText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
  },
  vacantItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  vacantLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  vacantPinCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vacantDriverName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  fleetIdBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  fleetIdBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  vacantDetailsText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
});