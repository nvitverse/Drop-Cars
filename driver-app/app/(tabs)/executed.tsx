import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { MapPin, IndianRupee, RefreshCw, ChevronDown, ChevronUp, Star } from 'lucide-react-native';
import { getCompletedOrdersForVehicleOwner, FutureRideView } from '@/services/vehicle/vehicleOwnerService';
import { getBookingStatusLabel, BookingStatusFields } from '@/utils/bookingStatus';
import { formatBookingId } from '@/utils/format';
import { useLanguage } from '@/contexts/LanguageContext';
import BookingDetailModal from '@/components/BookingDetailModal';

interface RideData {
  id: string;
  order_id: string | number;
  status: string;
  assignment_status: string;
  trip_status: string;
  assignment_id?: string;
  pickup_notes?: string | null;
  vendor_name?: string;
  vendor_phone?: string;
  assigned_driver_name?: string | null;
  assigned_driver_phone?: string | null;
  assigned_car_name?: string | null;
  assigned_car_number?: string | null;
  vendor_price?: number | null;
  closed_vendor_price?: number | null;
  closed_driver_price?: number | null;
  commision_amount?: number | null;
  pickup_city?: string;
  drop_city?: string;
  customer_name?: string;
  customer_number?: string;
  car_type?: string;
  trip_distance?: number;
  trip_time?: string;
  trip_type?: string;
  estimated_price?: number;
  total_amount?: number | null;
  waiting_time?: number | null;
  waiting_charge?: number | null;
  night_charges?: number | null;
  start_date_time?: string;
  created_at?: string;
  assigned_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  // Fare transparency: display-only, doesn't change any charge calculation.
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[] | null;
}

type ExecutedSegment = 'completed' | 'cancelled' | 'unallocated';
type DateRangeMode = 'last30' | 'all';

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

// Computes the { startDate, endDate } ISO strings for the "last 30 days"
// window, anchored on "now". Returns undefined for both when mode is 'all'
// so the fetch omits the query params entirely (old backend behavior).
const getDateRangeForMode = (mode: DateRangeMode): { startDate?: string; endDate?: string } => {
  if (mode === 'all') return {};
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - DAYS_30_MS);
  return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
};

// The vehicle-owner "non-pending" feed encodes the cancellation reason
// directly in assignment_status (CANCELLED / AUTO_CANCELLED /
// CANCELLED_BY_VENDOR) rather than the separate assignment_status +
// cancelled_by pair getBookingStatusLabel expects elsewhere in the app. This
// adapts one shape to the other so the shared label function can be reused
// without changing its own logic.
const toStatusFields = (order: RideData): BookingStatusFields => {
  const raw = (order.assignment_status || '').toUpperCase();
  const rawTrip = (order.trip_status || '').toUpperCase();
  // assignment_cancel_reason (per-assignment) takes priority over
  // cancelled_by (the order's own final fate) - the order stays PENDING and
  // never gets a cancelled_by when it was reposted to other fleet owners
  // instead of fully cancelled, so cancelled_by alone can't tell "this
  // owner's window timed out" apart from a generic cancel. See
  // OrderAssignment.cancel_reason on the backend.
  const rawCancelReason = ((order as any).assignment_cancel_reason || (order as any).cancelled_by || '').toUpperCase();
  const isCancelVariant = raw.includes('CANCEL') || rawTrip.includes('CANCEL') || rawCancelReason.includes('CANCEL');
  return {
    trip_status: order.trip_status,
    assignment_status: isCancelVariant ? (raw === 'AUTO_CANCELLED' ? 'AUTO_CANCELLED' : 'CANCELLED') : order.assignment_status,
    order_accept_status: true,
    cancelled_by:
      raw === 'AUTO_CANCELLED' || rawCancelReason === 'AUTO_CANCELLED' ? 'AUTO_CANCELLED'
      : raw === 'CANCELLED_BY_VENDOR' || rawCancelReason === 'CANCELLED_BY_VENDOR' ? 'CANCELLED_BY_VENDOR'
      : (order as any).assignment_cancel_reason || (order as any).cancelled_by || (isCancelVariant ? 'CANCELLED' : null),
  };
};

export default function ExecutedRidesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<ExecutedSegment>('completed');
  const [completedRides, setCompletedRides] = useState<RideData[]>([]);
  const [cancelledRides, setCancelledRides] = useState<RideData[]>([]);
  const [unallocatedRides, setUnallocatedRides] = useState<RideData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<RideData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('last30');
  const { user } = useAuth();
  const { t } = useLanguage();

  // Fetch executed (completed/cancelled/unallocated) rides data - reuses the
  // same /vehicle-owner/non-pending fetch the old "My Rides" screen used.
  // Defaults to the last 30 days; "All time" toggle drops the date filter.
  const fetchExecutedData = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRangeForMode(dateRangeMode);
      console.log('📋 Fetching executed rides for Fleet Owner...', { dateRangeMode, startDate, endDate });

      const orders = await getCompletedOrdersForVehicleOwner({ startDate, endDate });
      console.log('✅ Executed orders fetched:', orders.length);

      const completed: RideData[] = [];
      const cancelled: RideData[] = [];
      const unallocated: RideData[] = [];

      orders.forEach(order => {
        const rawAssign = String(order.assignment_status || '').toUpperCase();
        const rawTrip = String(order.trip_status || '').toUpperCase();
        const rideData: RideData = {
          ...order,
          order_id: order.order_id || (order as any).source_order_id || order.id,
          status: rawAssign.toLowerCase() || 'completed',
          assignment_status: order.assignment_status || 'COMPLETED',
          trip_status: order.trip_status || 'COMPLETED',
        };

        const label = getBookingStatusLabel(toStatusFields(rideData));

        const hasAssignedStaff = !!(order.assigned_driver_name || order.assigned_car_name);

        if (label === 'Auto Cancelled' || label === 'Removed' || (rawAssign.includes('CANCEL') && !hasAssignedStaff) || rawAssign === 'AUTO_CANCELLED') {
          unallocated.push(rideData);
        } else if (label === 'Cancelled' || rawAssign.includes('CANCEL') || rawTrip.includes('CANCEL')) {
          cancelled.push(rideData);
        } else {
          completed.push(rideData);
        }
      });

      setCompletedRides(completed);
      setCancelledRides(cancelled);
      setUnallocatedRides(unallocated);

      console.log('📊 Executed rides categorized:', {
        completed: completed.length,
        cancelled: cancelled.length,
        unallocated: unallocated.length,
      });
    } catch (error: any) {
      console.error('❌ Failed to fetch executed rides data:', error);

      const errorMessage = error.message || '';
      const errorDetail = error.response?.data?.detail || '';

      if (errorMessage.includes('CAR_TYPE_ENUM') ||
          errorDetail.includes('is not among the defined enum values') ||
          (errorDetail.includes('SEDAN') && errorDetail.includes('enum'))) {
        Alert.alert(
          t('executed.dataSyncIssueTitle'),
          t('executed.dataSyncIssueBody'),
          [{ text: t('executed.ok') }]
        );
      } else {
        Alert.alert(t('executed.errorTitle'), error.message || t('executed.fetchFailedGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }, [dateRangeMode]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchExecutedData();
    setRefreshing(false);
  };

  const toggleDateRangeMode = () => {
    setDateRangeMode(prev => (prev === 'last30' ? 'all' : 'last30'));
  };

  useEffect(() => {
    if (user) {
      fetchExecutedData();
    }
  }, [user, fetchExecutedData]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        fetchExecutedData();
      }
    }, [user?.id, fetchExecutedData])
  );

  const getCurrentRides = (): RideData[] => {
    let rides: RideData[] = [];
    switch (segment) {
      case 'completed': rides = completedRides; break;
      case 'cancelled': rides = cancelledRides; break;
      case 'unallocated': rides = unallocatedRides; break;
      default: rides = [];
    }

    if (search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      rides = rides.filter(ride => {
        return [
          ride.order_id,
          ride.id,
          ride.customer_name,
          ride.customer_number,
          ride.pickup_city,
          ride.drop_city,
          ride.car_type,
          ride.trip_type,
          ride.assigned_driver_name,
          ride.assigned_car_name,
          ride.assigned_car_number,
        ].some(field =>
          field && String(field).toLowerCase().includes(searchTerm)
        );
      });
    }

    return rides;
  };

  const getSegmentTitle = () => {
    switch (segment) {
      case 'completed': return t('executed.segmentCompleted');
      case 'cancelled': return t('executed.segmentCancelled');
      case 'unallocated': return t('executed.segmentUnallocated');
      default: return t('executed.segmentDefault');
    }
  };

  const formatCarType = (carType: string | null | undefined): string => {
    if (!carType) return '';

    const type = String(carType).trim();

    const plusPattern = /^(.+?)_(\d+)_PLUS_(\d+)$/i;
    const plusMatch = type.match(plusPattern);

    if (plusMatch) {
      const base = plusMatch[1].replace(/_/g, ' ');
      const first = plusMatch[2];
      const second = plusMatch[3];
      return `${base} (${first}+${second})`;
    }

    if (type.includes('NEW_SEDAN_2022_MODEL')) {
      return 'Prime Sedan';
    }

    return type.replace(/_/g, ' ');
  };

  const renderRideCard = (ride: RideData) => {
    const isExpanded = expandedOrderId === (ride.order_id || ride.id).toString();
    const hasPickupNotes = ride.pickup_notes && ride.pickup_notes !== 'NILL' && ride.pickup_notes !== 'null';
    const isAllInclusive = ride.fare_type === 'ALL_INCLUSIVE';
    const extraCharges = (ride.charge_items || []).filter((c) => !c.included).map((c) => c.label);
    const fareTypeSummary = isAllInclusive
      ? (extraCharges.length > 0 ? `All Inclusive · ${extraCharges.join(', ')} extra` : 'All Inclusive')
      : null;

    const parseDateTime = (dateStr?: string) => {
      if (!dateStr) return { date: '', time: '' };
      try {
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return { date: formattedDate, time: formattedTime };
      } catch {
        return { date: '', time: '' };
      }
    };

    const { date: pickupDate, time: pickupTime } = parseDateTime(ride.start_date_time);

    const formatRoundedDuration = (raw: string): string => {
      if (!raw) return '';
      try {
        const segments = String(raw).split('+');
        let totalMinutes = 0;
        segments.forEach((seg) => {
          const s = seg.toLowerCase();
          const hMatch = s.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
          const mMatch = s.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
          const h = hMatch ? Number(hMatch[1]) : 0;
          const m = mMatch ? Number(mMatch[1]) : 0;
          totalMinutes += h * 60 + m;
        });
        const roundedHours = Math.round(totalMinutes / 60);
        return roundedHours > 0 ? `${roundedHours} hrs` : '0 hrs';
      } catch {
        return raw;
      }
    };

    const fareData = (ride as any);
    const pricePerKm = fareData.cost_per_km || fareData.price_per_km || 0;
    const driverAllowance = fareData.driver_allowance || 0;
    const permitCharge = fareData.permit_charges || fareData.permit_charge || 0;
    const hillsCharge = fareData.hill_charges || fareData.hills_charge || 0;
    const tollCharge = fareData.toll_charges || fareData.toll_charge || 0;
    const waitingChargeAmount = fareData.waiting_charge || fareData.waiting_charges;
    const waitingTimeMinutes = fareData.waiting_time ?? null;
    const nightCharges = fareData.night_charges ?? fareData.night_charge ?? null;

    return (
      <TouchableOpacity
        key={`${ride.id}-${ride.order_id}-${ride.assignment_id || ride.id}`}
        activeOpacity={0.8}
        onPress={() => {
          setSelectedBookingForDetail(ride);
          setShowDetailModal(true);
        }}
        style={[styles.rideCard, { backgroundColor: colors.surface }]}
      >
        <View style={styles.rideHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.orderIdBold, { color: colors.text }]}>
              {t('rides.bookingIdPrefix', { id: formatBookingId(ride.order_id || ride.id) })}
            </Text>
            {ride.trip_type && (
              <Text style={styles.tripTypeBold}>{ride.trip_type}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {segment === 'unallocated' ? (
              <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-SemiBold', color: '#6B7280' }}>Unallocated</Text>
              </View>
            ) : segment === 'cancelled' ? (
              <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-SemiBold', color: '#DC2626' }}>Cancelled</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-SemiBold', color: '#059669' }}>Completed</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.routeInfo}>
          <View style={styles.locationRow}>
            <MapPin color="#10B981" size={16} />
            <Text style={[styles.routeTextBold, { color: '#10B981' }]}>
              From: {ride.pickup_city || t('rides.pickupLocation')}
            </Text>
          </View>
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
          <View style={styles.locationRow}>
            <MapPin color="#EF4444" size={16} />
            <Text style={[styles.routeTextBold, { color: '#EF4444' }]}>
              To: {ride.drop_city || t('rides.dropLocation')}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flex: 1 }}>
            {pickupDate ? (
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                📅 {pickupDate} {pickupTime}
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 3 }}>
              🚗 {formatCarType(ride.car_type || '')} {ride.trip_distance ? `• ${ride.trip_distance} km` : ''}
            </Text>

            {(ride.assigned_driver_name || ride.assigned_car_name) ? (
              <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.primary, marginTop: 4 }}>
                👤 {ride.assigned_driver_name || 'Driver'} {ride.assigned_car_name ? `• ${ride.assigned_car_name}` : ''}
              </Text>
            ) : (
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: '#9CA3AF', marginTop: 4 }}>
                👤 Unassigned
              </Text>
            )}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Total Amount</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: '#047857' }}>
              ₹{ride.total_amount || ride.estimated_price || 0}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.primary, marginTop: 4 }}>
              View Details →
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {t('executed.noRidesTitle', { segment: getSegmentTitle().toLowerCase() })}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {segment === 'completed' && t('executed.noCompletedSubtitle')}
        {segment === 'cancelled' && t('executed.noCancelledSubtitle')}
        {segment === 'unallocated' && t('executed.noUnallocatedSubtitle')}
      </Text>
    </View>
  );

  const renderSegmentButton = (key: ExecutedSegment, label: string, count: number) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.tabButton,
        { backgroundColor: segment === key ? colors.primary : colors.surface },
      ]}
      onPress={() => setSegment(key)}
    >
      <Text style={[
        styles.tabButtonText,
        { color: segment === key ? '#FFFFFF' : colors.textSecondary },
      ]}>
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('executed.headerTitle')}</Text>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing}>
          <RefreshCw size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {renderSegmentButton('completed', t('executed.segmentCompleted'), completedRides.length)}
        {renderSegmentButton('cancelled', t('executed.segmentCancelled'), cancelledRides.length)}
        {renderSegmentButton('unallocated', t('executed.segmentUnallocated'), unallocatedRides.length)}
      </View>

      <View style={styles.dateRangeContainer}>
        <Text style={[styles.dateRangeLabel, { color: colors.textSecondary }]}>
          {dateRangeMode === 'last30' ? t('executed.showingLast30Days') : t('executed.showingAllTime')}
        </Text>
        <TouchableOpacity
          style={[styles.dateRangeToggle, { borderColor: colors.primary }]}
          onPress={toggleDateRangeMode}
          disabled={loading}
        >
          <Text style={[styles.dateRangeToggleText, { color: colors.primary }]}>
            {dateRangeMode === 'last30' ? t('executed.showAllTime') : t('executed.showLast30Days')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: colors.border
          }]}
          placeholder={t('rides.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('rides.loading')}
            </Text>
          </View>
        ) : getCurrentRides().length > 0 ? (
          <View style={styles.ridesList}>
            {getCurrentRides().map(renderRideCard)}
          </View>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      <BookingDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        booking={selectedBookingForDetail}
        onRefresh={handleRefresh}
      />
      <RefreshFab onRefresh={handleRefresh} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    flex: 1,
    marginRight: 12,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tabButton: {
      flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
      borderRadius: 6,
    alignItems: 'center',
  },
  tabButtonText: {
      fontSize: 14,
    fontWeight: '600',
    },
  dateRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  dateRangeLabel: {
    fontSize: 13,
    flexShrink: 1,
    marginRight: 8,
    fontFamily: 'Inter-SemiBold',
  },
  dateRangeToggle: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateRangeToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchInput: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
  },
  scrollView: {
      flex: 1,
      paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
  },
  ridesList: {
    paddingBottom: 20,
    },
    rideCard: {
    borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    },
    rideHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
  orderIdBold: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  tripTypeBold: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    color: '#EF4444',
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  compactRouteText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  compactDateText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  compactFareText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    color: '#065F46',
    marginLeft: 4,
  },
  fareTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  fareTypeBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#2563EB',
  },
  routeInfo: {
    marginTop: 12,
      marginBottom: 10,
    },
  routeLine: {
    width: 1,
    height: 12,
    marginLeft: 8,
    marginVertical: 2,
    },
  locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
    marginBottom: 8,
  },
  routeTextBold: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    flex: 1,
    marginLeft: 8,
    },
    detailsContainerBold: {
      marginBottom: 8,
    },
    detailRowBold: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    detailLabelBold: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      minWidth: 120,
    },
    detailValueBold: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      flex: 1,
    },
  fareContainer: {
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#065F46',
    marginBottom: 4,
  },
  totalFare: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#065F46',
  },
  emptyState: {
      justifyContent: 'center',
      alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
      marginBottom: 6,
    },
  emptySubtitle: {
      fontSize: 13,
      textAlign: 'center',
    lineHeight: 18,
    },
  expandedDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  expandedSection: {
    marginBottom: 20,
  },
  expandedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  expandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  expandedLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  expandedValue: {
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  });
