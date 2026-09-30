import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
import { setForegroundInterval } from '@/utils/foregroundInterval';
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Briefcase, MapPin, Calendar, IndianRupee, Plus, ChevronRight, Eye, Car, Send, Compass, Star, Wallet, Users, User, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosDriver from '@/app/api/axiosDriver';
import { useEnsureDriverSession } from '@/hooks/useEnsureDriverSession';
import BookingDetailModal from '@/components/BookingDetailModal';
import RidesBookingsSwitcher from '@/components/RidesBookingsSwitcher';
import CancelReasonModal from '@/components/CancelReasonModal';
import { fareBreakdown } from '@/utils/fareBreakdown';

interface BookingItem {
  id: number;
  order_id: number;
  assignment_status: string;
  customer_name: string;
  customer_number?: string;
  pickup_drop_location: Record<string, string>;
  start_date_time: string;
  end_date_time?: string;
  trip_type: string;
  car_type?: string;
  estimated_price?: number;
  fare_type?: string;
  charge_items?: any[] | null;
  extra_amount?: number | null;
  vendor_name?: string | null;
  commission_waived?: boolean;
  cancelled_by?: string | null;
  cancel_note?: string | null;
  assigned_driver_name?: string | null;
  assigned_driver_phone?: string | null;
  assigned_car_name?: string | null;
  assigned_car_number?: string | null;
  // true for a booking this owner POSTED via Create Booking (came from
  // /driver/posted-bookings, not from an assignment) - cancelled through the
  // poster-cancel endpoint (free) instead of the assigned-driver cancel (Rs 500).
  posted?: boolean;
  accepted?: boolean;
}

// A posted booking has no assignment until another driver accepts it, so
// its "status" is derived from the order's own trip_status + whether/how far
// someone has taken it - mapped onto the same status words the rest of this
// screen's tabs/badges already understand.
const mapPostedBooking = (p: any): BookingItem => {
  const trip = String(p.trip_status || '').toUpperCase();
  const asg = String(p.assignment_status || '').toUpperCase();
  let status = 'PENDING'; // posted, nobody has accepted it yet
  if (trip === 'CANCELLED') status = 'CANCELLED';
  else if (trip === 'COMPLETED' || asg === 'COMPLETED') status = 'COMPLETED';
  else if (asg === 'DRIVING') status = 'DRIVING';
  else if (p.accepted) status = asg === 'ASSIGNED' ? 'ASSIGNED' : 'ACCEPTED';
  return {
    id: p.order_id,
    order_id: p.order_id,
    assignment_status: status,
    customer_name: p.customer_name,
    customer_number: p.customer_number,
    pickup_drop_location: p.pickup_drop_location || {},
    start_date_time: p.start_date_time,
    trip_type: p.trip_type,
    car_type: p.car_type,
    estimated_price: p.estimated_price,
    // (no vendor_name on purpose: BookingDetailModal falls back to it as the
    // "driver name" when nobody's assigned, which would show the label as a driver)
    cancelled_by: p.cancelled_by,
    cancel_note: p.cancel_note,
    fare_type: p.fare_type,
    charge_items: p.charge_items,
    extra_amount: p.extra_amount,
    assigned_driver_name: p.assigned_driver_name,
    assigned_driver_phone: p.assigned_driver_phone,
    assigned_car_name: p.assigned_car_name,
    assigned_car_number: p.assigned_car_number,
    // Everything else the poster's lifecycle view needs (OTPs, live
    // location, trip record, final amount) rides along untouched.
    start_trip_otp: p.start_trip_otp,
    end_trip_otp: p.end_trip_otp,
    last_lat: p.last_lat,
    last_lng: p.last_lng,
    last_location_at: p.last_location_at,
    start_km: p.start_km,
    end_km: p.end_km,
    total_km: p.total_km,
    final_amount: p.final_amount,
    trip_status: p.trip_status,
    posted: true,
    accepted: !!p.accepted,
  } as BookingItem;
};

type MainTab = 'ACTIVE' | 'EXECUTED' | 'ALL';
type ActiveSubTab = 'UPCOMING' | 'RUNNING';
type ExecutedSubTab = 'COMPLETED' | 'CANCELLED' | 'DRIVER_CANCELLED';

export default function MyBookingsScreen() {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [mainTab, setMainTab] = useState<MainTab>('ACTIVE');
  const [activeSubTab, setActiveSubTab] = useState<ActiveSubTab>('UPCOMING');
  const [executedSubTab, setExecutedSubTab] = useState<ExecutedSubTab>('COMPLETED');

  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [cancellingItem, setCancellingItem] = useState<BookingItem | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);

  const handleConfirmCancel = async () => {
    if (!cancellingItem) return;
    if (!cancelReason.trim()) {
      Alert.alert('Reason Required', 'Please select or type a cancellation reason.');
      return;
    }
    setSubmittingCancel(true);
    try {
      const orderId = cancellingItem.order_id || cancellingItem.id;
      await axiosDriver.post(`/api/assignments/driver/cancel-order/${orderId}`, {
        reason: cancelReason.trim(),
      });
      Alert.alert(
        'Booking Cancelled',
        `Booking #${orderId} has been cancelled. A mandatory ₹500 cancellation penalty fee has been debited from your fleet wallet.`
      );
      setCancellingItem(null);
      setCancelReason('');
      fetchBookings();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Could not cancel booking.';
      Alert.alert('Cancellation Failed', typeof detail === 'string' ? detail : 'Could not cancel booking.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const [postedCancelItem, setPostedCancelItem] = useState<BookingItem | null>(null);
  const [submittingPostedCancel, setSubmittingPostedCancel] = useState(false);

  const handleCancelPosted = (item: BookingItem) => setPostedCancelItem(item);

  const confirmCancelPosted = async (reason: string) => {
    if (!postedCancelItem) return;
    const orderId = postedCancelItem.order_id || postedCancelItem.id;
    setSubmittingPostedCancel(true);
    try {
      await axiosDriver.post(`/api/assignments/driver/posted-bookings/${orderId}/cancel`, { reason });
      setPostedCancelItem(null);
      Alert.alert('Booking Cancelled', `Booking #${orderId} has been cancelled.`);
      fetchBookings();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Could not cancel booking.';
      Alert.alert('Cancellation Failed', typeof detail === 'string' ? detail : 'Could not cancel booking.');
    } finally {
      setSubmittingPostedCancel(false);
    }
  };

  // Safety timer to prevent infinite loading spinner loop under any session delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      const [activeRes, completedRes, postedRes] = await Promise.all([
        axiosDriver.get('/api/assignments/driver/assigned-orders'),
        axiosDriver.get('/api/assignments/driver/assigned/completed-trips').catch(() => ({ data: [] })),
        axiosDriver.get('/api/assignments/driver/posted-bookings').catch(() => ({ data: [] })),
      ]);
      const active: BookingItem[] = Array.isArray(activeRes.data) ? activeRes.data : [];
      const completed: BookingItem[] = Array.isArray(completedRes.data) ? completedRes.data : [];
      // Self-sourced only (older bookings the owner self-assigned)
      const selfSourced = [...active, ...completed].filter((b) => !b.vendor_name || b.vendor_name.includes('Self-Sourced'));
      // Bookings the owner posted - these have no assignment of their own, so
      // they only exist in this dedicated list. If the same order also shows
      // up as a self-assigned trip, the posted entry (which knows who accepted
      // it) wins.
      const posted: BookingItem[] = (Array.isArray(postedRes.data) ? postedRes.data : []).map(mapPostedBooking);
      const postedIds = new Set(posted.map((p) => Number(p.order_id)));
      setBookings([...posted, ...selfSourced.filter((b) => !postedIds.has(Number(b.order_id || b.id)))]);
    } catch (e) {
      console.error('Failed to load my bookings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const isUpcoming = (b: BookingItem) => {
    const st = (b.assignment_status || '').toUpperCase();
    return st === 'ASSIGNED' || st === 'ACCEPTED' || st === 'PENDING' || st === 'NOT_ACCEPTED' || st === 'UNASSIGNED';
  };

  const isRunning = (b: BookingItem) => {
    const st = (b.assignment_status || '').toUpperCase();
    return st === 'DRIVING' || st === 'STARTED' || st === 'RUNNING';
  };

  const isCompleted = (b: BookingItem) => {
    const st = (b.assignment_status || '').toUpperCase();
    return st === 'COMPLETED';
  };

  const isCancelled = (b: BookingItem) => {
    const st = String(b.assignment_status || '').toUpperCase();
    const cancelledBy = String(b.cancelled_by || '').toUpperCase();
    return (st === 'CANCELLED' || st === 'REMOVED' || st === 'AUTO_CANCELLED') && !cancelledBy.includes('DRIVER');
  };

  const isDriverCancelled = (b: BookingItem) => {
    const st = (b.assignment_status || '').toUpperCase();
    const cancelledBy = (b.cancelled_by || '').toUpperCase();
    return st === 'DRIVER_CANCELLED' || st === 'CANCELLED_BY_DRIVER' || cancelledBy.includes('DRIVER');
  };

  const isActive = (b: BookingItem) => isUpcoming(b) || isRunning(b);
  const isExecuted = (b: BookingItem) => isCompleted(b) || isCancelled(b) || isDriverCancelled(b);

  const activeCount = bookings.filter(isActive).length;
  const upcomingCount = bookings.filter(isUpcoming).length;
  const runningCount = bookings.filter(isRunning).length;

  const executedCount = bookings.filter(isExecuted).length;
  const completedCount = bookings.filter(isCompleted).length;
  const cancelledCount = bookings.filter(isCancelled).length;
  const driverCancelledCount = bookings.filter(isDriverCancelled).length;

  const allCount = bookings.length;

  const filteredBookings = bookings.filter((b) => {
    if (mainTab === 'ACTIVE') {
      if (activeSubTab === 'UPCOMING') return isUpcoming(b);
      if (activeSubTab === 'RUNNING') return isRunning(b);
      return isActive(b);
    }
    if (mainTab === 'EXECUTED') {
      if (executedSubTab === 'COMPLETED') return isCompleted(b);
      if (executedSubTab === 'CANCELLED') return isCancelled(b);
      if (executedSubTab === 'DRIVER_CANCELLED') return isDriverCancelled(b);
      return isExecuted(b);
    }
    return true; // ALL
  });

  const { ready: sessionReady, sessionError } = useEnsureDriverSession();

  useEffect(() => {
    if (sessionError) {
      setLoading(false);
    }
  }, [sessionError]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionReady) {
        setLoading(false);
        return undefined;
      }
      fetchBookings();
      // Live status: a posted booking moves on without this screen doing
      // anything (someone accepts it, a driver is assigned, the trip starts),
      // so re-check while the screen is in front. Push notifications cover
      // the app being in the background.
      const stop = setForegroundInterval(fetchBookings, 20000);
      return stop;
    }, [fetchBookings, sessionReady])
  );

  const handleOpenDetail = (item: BookingItem) => {
    setSelectedBooking(item);
    setShowDetailModal(true);
  };

  const getStatusBadgeConfig = (status: string, cancelledBy?: string | null) => {
    const st = (status || '').toUpperCase();
    const cBy = (cancelledBy || '').toUpperCase();

    if (st === 'DRIVER_CANCELLED' || st === 'CANCELLED_BY_DRIVER' || cBy.includes('DRIVER')) {
      return { label: t('myBookings.driverCancelledLabel'), color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (st === 'CANCELLED' || st === 'REMOVED' || st === 'AUTO_CANCELLED') {
      return { label: t('myBookings.cancelledLabel'), color: '#DC2626', bg: 'rgba(220, 38, 38, 0.15)' };
    }
    if (st === 'COMPLETED') {
      return { label: t('myBookings.completedLabel'), color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
    }
    if (st === 'DRIVING' || st === 'STARTED' || st === 'RUNNING') {
      return { label: t('myBookings.runningLabel'), color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
    }
    if (st === 'ASSIGNED') {
      return { label: t('myBookings.driverAssignedLabel'), color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
    if (st === 'ACCEPTED') {
      return { label: t('myBookings.acceptedLabel'), color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)' };
    }
    if (st === 'PENDING' || st === 'NOT_ACCEPTED' || st === 'UNASSIGNED') {
      return { label: t('myBookings.notAcceptedLabel'), color: '#D97706', bg: 'rgba(217, 119, 6, 0.15)' };
    }
    return { label: st || t('myBookings.unknownLabel'), color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' };
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const dt = new Date(dateStr);
      const d = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const t = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${d} at ${t}`;
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: BookingItem }) => {
    const pickup = Object.values(item.pickup_drop_location || {})[0] || 'Unknown';
    const drop = Object.values(item.pickup_drop_location || {})[1] || 'Unknown';
    const badgeCfg = getStatusBadgeConfig(item.assignment_status, item.cancelled_by);
    const formattedDateTime = formatDateTime(item.start_date_time);
    const UserIcon = User || Users;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleOpenDetail(item)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {/* Header Row: Booking ID & Trip/Car Tag */}
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.orderIdText, { color: colors.text }]}>
            {t('myBookings.bookingIdPrefix', { id: item.order_id || item.id })}
          </Text>
          <Text style={[styles.tripTypeTag, { color: colors.primary }]}>
            {item.trip_type} {item.car_type ? `• ${item.car_type.replace(/_/g, ' ')}` : ''}
          </Text>
        </View>

        {/* Badges Row */}
        <View style={styles.badgeGroup}>
          <View style={[styles.statusBadge, { backgroundColor: badgeCfg.bg }]}>
            <Text style={[styles.statusText, { color: badgeCfg.color }]}>{badgeCfg.label}</Text>
          </View>
          <View style={styles.selfBadge}>
            <Text style={styles.selfBadgeText}>{item.posted ? 'Posted by you' : t('myBookings.driverPartnerBadge')}</Text>
          </View>
          {item.commission_waived && (
            <View style={[styles.selfBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.selfBadgeText, { color: '#10B981' }]}>{t('myBookings.withoutCcBadge')}</Text>
            </View>
          )}
        </View>

        {/* Booking type + fare breakdown */}
        {(() => {
          const fb = fareBreakdown(item);
          return (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter-Bold' }}>{fb.typeLabel}</Text>
              {!!fb.line && <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2, lineHeight: 16 }}>{fb.line}</Text>}
            </View>
          );
        })()}

        {/* Route Box */}
        <View style={[styles.routeBox, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F9FAFB', borderColor: colors.border }]}>
          <View style={styles.routeRow}>
            <MapPin size={14} color="#10B981" />
            <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
              <Text style={{ fontFamily: 'Inter-Bold', color: '#10B981' }}>{t('myBookings.fromLabel')}</Text>
              {pickup}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <MapPin size={14} color="#EF4444" />
            <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
              <Text style={{ fontFamily: 'Inter-Bold', color: '#EF4444' }}>{t('myBookings.toLabel')}</Text>
              {drop}
            </Text>
          </View>
        </View>

        {/* Key Info Grid */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailGridItem}>
            <Calendar size={13} color={colors.primary} />
            <Text style={[styles.detailGridText, { color: colors.text }]}>{formattedDateTime}</Text>
          </View>

          <View style={styles.detailGridItem}>
            <IndianRupee size={13} color="#10B981" />
            <Text style={[styles.detailGridText, { color: '#10B981', fontFamily: 'Inter-Bold' }]}>
              ₹{item.estimated_price ?? '-'}
            </Text>
          </View>

          {!!item.customer_name && (
            <View style={styles.detailGridItem}>
              <UserIcon size={13} color={colors.textSecondary} />
              <Text style={[styles.detailGridText, { color: colors.text }]} numberOfLines={1}>
                {item.customer_name} {item.customer_number ? `(${item.customer_number})` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Driver/Car Assignment Summary */}
        {!!item.assigned_driver_name && (
          <View style={[styles.assignmentBox, { backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF' }]}>
            <Car size={13} color={colors.primary} />
            <Text style={[styles.assignmentBoxText, { color: colors.primary }]} numberOfLines={1}>
              {t('myBookings.assignedLabel', { driver: item.assigned_driver_name, car: item.assigned_car_number ? `(${item.assigned_car_number})` : '' })}
            </Text>
          </View>
        )}

        {/* A booking YOU posted: free cancel (no assigned-driver penalty applies to the poster) */}
        {item.posted && isUpcoming(item) && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={(e) => {
                e.stopPropagation();
                handleCancelPosted(item);
              }}
            >
              <Text style={{ color: '#DC2626', fontFamily: 'Inter-Bold', fontSize: 11.5 }}>🚫 Cancel Booking</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Booking Action for Upcoming Trips (self-assigned, Rs 500 fee) */}
        {!item.posted && isUpcoming(item) && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={(e) => {
                e.stopPropagation();
                setCancellingItem(item);
              }}
            >
              <Text style={{ color: '#DC2626', fontFamily: 'Inter-Bold', fontSize: 11.5 }}>🚫 Cancel Booking (₹500 Fee)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Row */}
        <View style={styles.actionRow}>
          <Eye size={14} color={colors.textSecondary} />
          <Text style={[styles.detailBtnText, { color: colors.textSecondary }]}>{t('myBookings.tapForDetails')}</Text>
          <ChevronRight size={14} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <RidesBookingsSwitcher active="bookings" />
      {/* Page Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingVertical: 10 }]}>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(79, 70, 229, 0.15)' }]}>
            <Briefcase color={colors.primary} size={20} />
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text, flexShrink: 1 }]}>{t('myBookings.pageTitle')}</Text>
        </View>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary }}
          onPress={() => router.push('/(tabs)/create-booking' as any)}
          activeOpacity={0.8}
        >
          <Send size={14} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>{t('myBookings.createBooking')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Edge-to-edge Main Tab Bar: Active | Executed | All ── */}
      <View
        style={{
          flexDirection: 'row',
          width: '100%',
          backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {([
          { key: 'ACTIVE', label: t('myBookings.activeTab', { count: activeCount }), activeColor: '#6366F1' },
          { key: 'EXECUTED', label: t('myBookings.executedTab', { count: executedCount }), activeColor: '#8B5CF6' },
          { key: 'ALL', label: t('myBookings.allTab', { count: allCount }), activeColor: colors.primary },
        ] as { key: MainTab; label: string; activeColor: string }[]).map(({ key, label, activeColor }) => {
          const isActive = mainTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setMainTab(key)}
              style={{ flex: 1, alignItems: 'center' }}
              activeOpacity={0.75}
            >
              <View style={{ paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? activeColor : colors.textSecondary,
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
              <View
                style={{
                  height: 3,
                  width: '100%',
                  backgroundColor: isActive ? activeColor : 'transparent',
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Active sub-tabs: Upcoming | Running ── */}
      {mainTab === 'ACTIVE' && (
        <View
          style={{
            flexDirection: 'row',
            width: '100%',
            backgroundColor: isDarkMode ? '#0A0F1A' : '#F8FAFC',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {([
            { key: 'UPCOMING', label: t('myBookings.upcomingTab', { count: upcomingCount }), activeColor: '#6366F1' },
            { key: 'RUNNING', label: t('myBookings.runningTab', { count: runningCount }), activeColor: '#10B981' },
          ] as { key: ActiveSubTab; label: string; activeColor: string }[]).map(({ key, label, activeColor }) => {
            const isActive = activeSubTab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setActiveSubTab(key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  backgroundColor: isActive
                    ? (isDarkMode ? activeColor + '20' : activeColor + '12')
                    : 'transparent',
                  borderBottomWidth: 2.5,
                  borderBottomColor: isActive ? activeColor : 'transparent',
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? activeColor : colors.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Executed sub-tabs: Completed | Cancelled | Driver Cancelled ── */}
      {mainTab === 'EXECUTED' && (
        <View
          style={{
            flexDirection: 'row',
            width: '100%',
            backgroundColor: isDarkMode ? '#0A0F1A' : '#F8FAFC',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {([
            { key: 'COMPLETED', label: t('myBookings.completedTab', { count: completedCount }), activeColor: '#10B981' },
            { key: 'CANCELLED', label: t('myBookings.cancelledTab', { count: cancelledCount }), activeColor: '#EF4444' },
            { key: 'DRIVER_CANCELLED', label: t('myBookings.driverCancelledTab', { count: driverCancelledCount }), activeColor: '#F59E0B' },
          ] as { key: ExecutedSubTab; label: string; activeColor: string }[]).map(({ key, label, activeColor }) => {
            const isActive = executedSubTab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setExecutedSubTab(key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  backgroundColor: isActive
                    ? (isDarkMode ? activeColor + '20' : activeColor + '12')
                    : 'transparent',
                  borderBottomWidth: 2.5,
                  borderBottomColor: isActive ? activeColor : 'transparent',
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? activeColor : colors.textSecondary,
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('myBookings.loadingBookings')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 12, gap: 10 }}
          refreshControl={
            <FreshRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconBadge, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '20' }]}>
                <Briefcase size={28} color={colors.primary} strokeWidth={1.75} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('myBookings.noBookingsFound')}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {mainTab === 'ACTIVE'
                  ? activeSubTab === 'UPCOMING'
                    ? t('myBookings.noUpcomingBookings')
                    : t('myBookings.noRunningTrips')
                  : mainTab === 'EXECUTED'
                  ? executedSubTab === 'COMPLETED'
                    ? t('myBookings.noCompletedBookings')
                    : executedSubTab === 'CANCELLED'
                    ? t('myBookings.noCreatorCancelledBookings')
                    : t('myBookings.noDriverCancelledBookings')
                  : t('myBookings.bookingsWillShowHere')}
              </Text>
              <TouchableOpacity
                style={[styles.newBtnLarge, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/(tabs)/create-booking' as any)}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.newBtnLargeText}>{t('myBookings.createBooking')}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Booking detail - was tracked in state (showDetailModal/selectedBooking)
          and set on card tap, but never actually rendered, so "Tap for
          details" on My Trips did nothing. */}
      <BookingDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        booking={selectedBooking}
        viewerRole="driver"
        onRefresh={fetchBookings}
      />

      {/* Driver Cancellation Modal */}
      <Modal
        visible={!!cancellingItem}
        transparent
        animationType="slide"
        onRequestClose={() => setCancellingItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, padding: 18, borderRadius: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <X color="#EF4444" size={20} />
                <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>Cancel Confirmed Booking</Text>
              </View>
              <TouchableOpacity onPress={() => setCancellingItem(null)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            {cancellingItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ₹500 Penalty Warning Card */}
                <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 6, padding: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#DC2626' }}>
                    ⚠️ MANDATORY CANCELLATION PENALTY FEE
                  </Text>
                  <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 4, lineHeight: 16 }}>
                    Cancelling confirmed trip <Text style={{ fontFamily: 'Inter-Bold' }}>#{cancellingItem.order_id || cancellingItem.id}</Text> will incur a mandatory <Text style={{ fontFamily: 'Inter-Bold', color: '#DC2626' }}>₹500 Penalty Fee</Text> automatically debited from your fleet wallet.
                  </Text>
                </View>

                <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 6 }}>
                  Select or Enter Reason for Cancellation:
                </Text>
                {['Vehicle Breakdown / Emergency', 'Driver Unavailable', 'Location / Route Distance Issue', 'Customer Request'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={{
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: cancelReason === r ? colors.primary : colors.border,
                      backgroundColor: cancelReason === r ? 'rgba(79, 70, 229, 0.1)' : colors.background,
                      marginBottom: 6,
                    }}
                    onPress={() => setCancelReason(r)}
                  >
                    <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: cancelReason === r ? colors.primary : colors.text }}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    padding: 10,
                    color: colors.text,
                    fontSize: 12.5,
                    height: 60,
                    textAlignVertical: 'top',
                    marginTop: 6,
                    marginBottom: 16,
                  }}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder="Or type custom cancellation reason..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}
                    onPress={() => setCancellingItem(null)}
                    disabled={submittingCancel}
                  >
                    <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13 }}>Keep Trip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1.5, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                    onPress={handleConfirmCancel}
                    disabled={submittingCancel}
                  >
                    {submittingCancel ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>Confirm Cancel (₹500 Fee)</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      <CancelReasonModal
        visible={!!postedCancelItem}
        message={postedCancelItem?.accepted
          ? `A driver has already accepted booking #${postedCancelItem?.order_id || postedCancelItem?.id}. Cancelling removes it from them and refunds their held amount. There is no fee for you.`
          : `Booking #${postedCancelItem?.order_id || postedCancelItem?.id} will be removed and no driver will see it anymore. There is no fee.`}
        confirmLabel="Cancel Booking"
        submitting={submittingPostedCancel}
        onClose={() => !submittingPostedCancel && setPostedCancelItem(null)}
        onConfirm={confirmCancelPosted}
      />
      <RefreshFab onRefresh={() => { setRefreshing(true); fetchBookings(); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Inter-Bold' },
  subtitle: { fontSize: 12, marginTop: 2 },
  newBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dutyNoticeBanner: {
    marginHorizontal: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dutyNoticeTitle: { fontSize: 13.5, fontFamily: 'Inter-Bold' },
  dutyNoticeSub: { fontSize: 11.5, fontFamily: 'Inter-Regular', marginTop: 2, lineHeight: 15 },
  dutyNoticeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dutyNoticeBtnText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold' },
  filterContainer: {
    paddingHorizontal: 10,
    paddingTop: 3,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 5.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentedTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  subTabText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  card: { borderRadius: 8, borderWidth: 1, padding: 14, gap: 8 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: 8,
  },
  orderIdText: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  tripTypeTag: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: 'Inter-Bold' },
  selfBadge: { backgroundColor: '#6366F115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  selfBadgeText: { fontSize: 10.5, fontFamily: 'Inter-Bold', color: '#6366F1' },
  tripType: { fontSize: 12, fontFamily: 'Inter-Medium' },
  routeBox: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    gap: 6,
    marginVertical: 2,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeText: { fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 2,
  },
  detailGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailGridText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
  },
  assignmentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 2,
  },
  assignmentBoxText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#00000010' },
  detailBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  detailBtnText: { fontSize: 12.5, fontFamily: 'Inter-Bold' },
  dutyLinkBtn: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 6 },
  dutyLinkBtnText: { fontSize: 12, fontFamily: 'Inter-Bold' },
  loadingWrap: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 40, gap: 6 },
  emptyIconBadge: { width: 68, height: 68, borderRadius: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },
  newBtnLarge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 6, marginTop: 14 },
  newBtnLargeText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '92%',
    maxHeight: '85%',
  },
});
