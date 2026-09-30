import FreshRefreshControl from '@/components/FreshRefreshControl';
import { setForegroundInterval } from '@/utils/foregroundInterval';
import React, { useState, useEffect } from 'react';
import { formatAssignmentRemaining } from '@/utils/assignDeadline';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { fareBreakdown } from '@/utils/fareBreakdown';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapPin, Clock, IndianRupee, User, Phone, Car, RefreshCw, UserPlus, X, CheckCircle, FileText, ChevronDown, ChevronUp, ExternalLink, Send, ShieldAlert } from 'lucide-react-native';
import { RefreshControl } from 'react-native';
import axiosInstance from '@/app/api/axiosInstance';
import axiosDriver from '@/app/api/axiosDriver';
import CallButton from '@/components/CallButton';
import { fetchAvailableDrivers, assignCarDriverToOrder, AvailableDriver, AvailableCar } from '@/services/orders/assignmentService';
import { getCompletedOrdersForVehicleOwner } from '@/services/vehicle/vehicleOwnerService';
import { getBookingStatusLabel, isEffectivelyRunning, BookingStatusFields } from '@/utils/bookingStatus';
import { formatBookingId } from '@/utils/format';
import { useDutyDriverSuggestion } from '@/hooks/useDutyDriverSuggestion';
import DutyDriverSuggestionBanner from '@/components/DutyDriverSuggestionBanner';
import BookingDetailModal from '@/components/BookingDetailModal';
import RidesBookingsSwitcher from '@/components/RidesBookingsSwitcher';

// Same shape as the vehicle-owner "pending" feed used previously by the
// Accepted-Rides screen - this endpoint returns everything this fleet owner
// has accepted that isn't completed/cancelled yet (unassigned, assigned, or
// already driving), which is exactly what the 3 Active segments need.
interface ActiveRide {
  id: number;
  source: string;
  source_order_id: number;
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: {
    "0": string;
    "1": string;
  };
  location_links?: Record<string, string>;
  start_date_time: string;
  customer_name: string;
  customer_number: string;
  trip_status: string;
  pick_near_city: string | string[];
  trip_distance: number;
  trip_time: string;
  estimated_price: number;
  vendor_price: number;
  advance_received?: number;
  platform_fees_percent: number;
  closed_vendor_price: number | null;
  closed_driver_price: number | null;
  commision_amount: number | null;
  created_at: string;
  assignment_id: number;
  assignment_status: string;
  assigned_at: string | null;
  expires_at: string;
  max_time_to_assign_order?: string;
  cancelled_at: string | null;
  completed_at: string | null;
  assignment_created_at: string;
  vendor_name: string;
  vendor_phone: string;
  assigned_driver_name: string | null;
  assigned_driver_phone: string | null;
  assigned_car_name: string | null;
  assigned_car_number: string | null;
  pickup_notes?: string;
  // Fare transparency: display-only, doesn't change any charge calculation.
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[] | null;
}

type ActiveSegment = 'accepted' | 'assigned' | 'running';

// Adapts the vehicle-owner order shape into the fields getBookingStatusLabel
// expects. Anything returned by the /vehicle-owner/pending feed has, by
// definition, already been accepted by this fleet owner, so order_accept_status
// is forced true here rather than relying on a field the owner-side API
// doesn't send.
const toStatusFields = (order: ActiveRide): BookingStatusFields => ({
  trip_status: order.trip_status,
  assignment_status: order.assignment_status,
  order_accept_status: true,
  Driver_assigned: !!order.assigned_driver_name,
  Car_assigned: !!order.assigned_car_name,
});

export default function ActiveRidesScreen() {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; subTab?: string }>();
  const { user } = useAuth();
  const { } = useNotifications();
  const { t } = useLanguage();
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // global tick to refresh countdowns
  const [tick, setTick] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [segment, setSegment] = useState<ActiveSegment>('accepted');

  // Assignment modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<AvailableDriver | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [availableCars, setAvailableCars] = useState<AvailableCar[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  type MainTab = 'upcoming' | 'running' | 'executed';
  type UpcomingSubTab = 'unassigned' | 'assigned';
  type ExecutedSubTab = 'completed' | 'cancelled' | 'unallocated';
  type UnallocatedSubTab = 'auto_cancelled' | 'removed' | 'ditched';

  const [mainTab, setMainTab] = useState<MainTab>('upcoming');
  const [upcomingSubTab, setUpcomingSubTab] = useState<UpcomingSubTab>('unassigned');
  const [executedSubTab, setExecutedSubTab] = useState<ExecutedSubTab>('completed');
  const [unallocatedSubTab, setUnallocatedSubTab] = useState<UnallocatedSubTab>('auto_cancelled');
  const [executedRides, setExecutedRides] = useState<any[]>([]);

  useEffect(() => {
    if (params.tab === 'upcoming' || params.tab === 'running' || params.tab === 'executed') {
      setMainTab(params.tab as MainTab);
    }
    if (params.subTab === 'assigned' || params.subTab === 'unassigned') {
      setUpcomingSubTab(params.subTab as UpcomingSubTab);
    }
  }, [params.tab, params.subTab]);

  const { suggestion: dutyDriverSuggestion, checkAfterAssignment, dismiss: dismissDutyDriverSuggestion } = useDutyDriverSuggestion();

  const fetchActiveRides = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const [pendingRes, executedOrders, driverAssignedRes, requestsRes, postedRes] = await Promise.all([
        axiosInstance.get('/api/orders/vehicle-owner/pending').catch(() => ({ data: [] })),
        getCompletedOrdersForVehicleOwner({}).catch(() => []),
        axiosDriver.get('/api/assignments/driver/assigned-orders').catch(() => ({ data: [] })),
        // bookings this fleet asked to fulfil with a different car (admin hasn't approved) -> Un Allocated
        axiosInstance.get('/api/orders/vehicle-owner/substitution-requests').catch(() => ({ data: [] })),
        axiosDriver.get('/api/assignments/driver/posted-bookings').catch(() => ({ data: [] })),
      ]);
      const requestRows = (Array.isArray(requestsRes.data) ? requestsRes.data : []).map((r: any) => ({
        ...r,
        assignment_status: 'REQUESTED',
        unallocated_kind: 'REQUESTED',
        cancel_note: r.admin_notes || null,
      }));

      const ridesArray = Array.isArray(pendingRes.data) ? [...pendingRes.data] : [];
      const driverAssignedArray = Array.isArray(driverAssignedRes.data) ? driverAssignedRes.data : [];
      const postedArray = Array.isArray(postedRes.data)
        ? postedRes.data
        : Array.isArray((postedRes.data as any)?.posted_bookings)
        ? (postedRes.data as any).posted_bookings
        : Array.isArray((postedRes.data as any)?.data)
        ? (postedRes.data as any).data
        : [];

      for (const dOrd of driverAssignedArray) {
        const exists = ridesArray.some(
          (r: any) => r.id === dOrd.id || r.source_order_id === dOrd.source_order_id || r.id === dOrd.order_id
        );
        if (!exists) {
          ridesArray.push({
            id: dOrd.id || dOrd.order_id,
            source: dOrd.source || 'NEW_ORDERS',
            source_order_id: dOrd.source_order_id || dOrd.order_id || dOrd.id,
            vendor_id: dOrd.vendor_id || '',
            trip_type: dOrd.trip_type || 'Oneway',
            car_type: dOrd.car_type || 'Sedan',
            pickup_drop_location: dOrd.pickup_drop_location || { "0": dOrd.pickup_location || '', "1": dOrd.drop_location || '' },
            start_date_time: dOrd.start_date_time || new Date().toISOString(),
            customer_name: dOrd.customer_name || 'Customer',
            customer_number: dOrd.customer_number || '',
            trip_status: dOrd.trip_status || 'PENDING',
            pick_near_city: dOrd.pick_near_city || 'ALL',
            trip_distance: dOrd.trip_distance || 0,
            trip_time: dOrd.trip_time || '0h',
            estimated_price: dOrd.estimated_price || dOrd.total_booking_amount || 0,
            vendor_price: dOrd.vendor_price || dOrd.total_booking_amount || 0,
            platform_fees_percent: 10,
            closed_vendor_price: null,
            closed_driver_price: null,
            commision_amount: null,
            created_at: dOrd.created_at || new Date().toISOString(),
            assignment_id: dOrd.assignment_id || dOrd.id,
            assignment_status: dOrd.assignment_status || 'ASSIGNED',
            assigned_at: dOrd.assigned_at || new Date().toISOString(),
            expires_at: dOrd.expires_at || '',
            cancelled_at: null,
            completed_at: null,
            assignment_created_at: dOrd.created_at || new Date().toISOString(),
            vendor_name: dOrd.vendor_name || 'Drop Cars',
            vendor_phone: dOrd.vendor_phone || '',
            assigned_driver_name: dOrd.assigned_driver_name || dOrd.driver_name || null,
            assigned_driver_phone: dOrd.assigned_driver_phone || dOrd.driver_phone || null,
            assigned_car_name: dOrd.assigned_car_name || dOrd.car_name || null,
            assigned_car_number: dOrd.assigned_car_number || dOrd.car_number || null,
          });
        }
      }

      for (const pOrd of postedArray) {
        const pId = Number(pOrd.order_id || pOrd.id);
        const exists = ridesArray.some(
          (r: any) => Number(r.id) === pId || Number(r.source_order_id) === pId || Number(r.order_id) === pId
        );
        if (!exists && String(pOrd.trip_status || '').toUpperCase() !== 'CANCELLED' && String(pOrd.trip_status || '').toUpperCase() !== 'COMPLETED') {
          ridesArray.push({
            id: pId,
            source: 'POSTED_BY_ME',
            source_order_id: pId,
            vendor_id: '',
            trip_type: pOrd.trip_type || 'Oneway',
            car_type: pOrd.car_type || 'Sedan',
            pickup_drop_location: pOrd.pickup_drop_location || { "0": '', "1": '' },
            start_date_time: pOrd.start_date_time || new Date().toISOString(),
            customer_name: pOrd.customer_name || 'Customer',
            customer_number: pOrd.customer_number || '',
            trip_status: pOrd.trip_status || 'PENDING',
            pick_near_city: 'ALL',
            trip_distance: pOrd.planned_km || pOrd.trip_distance || 0,
            trip_time: '0h',
            estimated_price: pOrd.estimated_price || pOrd.total_booking_amount || 0,
            vendor_price: pOrd.estimated_price || pOrd.total_booking_amount || 0,
            platform_fees_percent: 10,
            closed_vendor_price: null,
            closed_driver_price: null,
            commision_amount: null,
            created_at: pOrd.created_at || new Date().toISOString(),
            assignment_id: pId,
            assignment_status: pOrd.assignment_status || 'PENDING',
            assigned_at: pOrd.assigned_at || null,
            expires_at: '',
            cancelled_at: null,
            completed_at: null,
            assignment_created_at: pOrd.created_at || new Date().toISOString(),
            vendor_name: 'Posted by You',
            vendor_phone: '',
            assigned_driver_name: pOrd.assigned_driver_name || null,
            assigned_driver_phone: pOrd.assigned_driver_phone || null,
            assigned_car_name: pOrd.assigned_car_name || null,
            assigned_car_number: pOrd.assigned_car_number || null,
          });
        }
      }

      setActiveRides(ridesArray);
      setExecutedRides([...(executedOrders || []), ...requestRows]);

      // Smart subtab selection: if there are no unassigned upcoming rides but there are assigned ones,
      // and the user didn't explicitly request a subTab via route params, default to 'assigned'.
      if (!params.subTab) {
        const hasUnassigned = ridesArray.some((r) => !isEffectivelyRunning(r) && (!r.assigned_driver_name || !r.assigned_car_name));
        const hasAssigned = ridesArray.some((r) => !isEffectivelyRunning(r) && (!!r.assigned_driver_name && !!r.assigned_car_name));
        if (!hasUnassigned && hasAssigned) {
          setUpcomingSubTab('assigned');
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch Rides:', error);
      setError(error.message || 'Failed to fetch Rides');
    } finally {
      setLoading(false);
    }
  };

  const [search, setSearch] = useState('');
  const normalized = (s: string) => String(s || '').toLowerCase();
  const getDisplayCity = (v: string | string[]) => Array.isArray(v) ? v.join(', ') : v;

  const matchesSearch = (r: any) => {
    const q = normalized(search);
    if (!q) return true;

    const pickupLocation = r.pickup_drop_location?.["0"] || r.pickup_city || '';
    const dropLocation = r.pickup_drop_location?.["1"] || r.drop_city || '';
    const pickNearCitySafe = getDisplayCity(r.pick_near_city);

    return [
      r.id,
      r.order_id,
      r.source_order_id,
      r.customer_name,
      r.customer_number,
      r.trip_type,
      r.car_type,
      pickNearCitySafe,
      r.start_date_time,
      r.trip_time,
      r.source,
      pickupLocation,
      dropLocation,
    ].some((v: any) => normalized(v).includes(q));
  };

  const runningRides = activeRides.filter((r) => isEffectivelyRunning(r) && matchesSearch(r));
  const upcomingUnassignedRides = activeRides.filter(
    (r) => !isEffectivelyRunning(r) && (!r.assigned_driver_name || !r.assigned_car_name) && matchesSearch(r)
  );
  const upcomingAssignedRides = activeRides.filter(
    (r) => !isEffectivelyRunning(r) && (!!r.assigned_driver_name && !!r.assigned_car_name) && matchesSearch(r)
  );
  const totalUpcomingCount = upcomingUnassignedRides.length + upcomingAssignedRides.length;

  useEffect(() => {
    if (mainTab === 'upcoming' && upcomingUnassignedRides.length === 0 && upcomingAssignedRides.length > 0 && !params.subTab) {
      setUpcomingSubTab('assigned');
    }
  }, [mainTab, upcomingUnassignedRides.length, upcomingAssignedRides.length, params.subTab]);

  const completedRides = executedRides.filter((r) => {
    const raw = (r.assignment_status || r.trip_status || '').toUpperCase();
    return raw === 'COMPLETED';
  }).filter(matchesSearch);

  // Un Allocated = penalised endings (auto-cancelled for no driver/car, ditched by the driver, removed by
  // admin with penalty) + bookings this fleet asked to fulfil with a different car. The backend tags them
  // with unallocated_kind. Everything else that was cancelled (vendor / customer / admin / poster) is Cancelled.
  const isUnallocatedRide = (r: any) => !!r.unallocated_kind || String(r.cancelled_by || '').toUpperCase() === 'AUTO_CANCELLED';

  const cancelledRides = executedRides.filter((r) => {
    const raw = (r.assignment_status || r.trip_status || '').toUpperCase();
    return (raw === 'CANCELLED' || String(r.trip_status || '').toUpperCase() === 'CANCELLED') && !isUnallocatedRide(r);
  }).filter(matchesSearch);

  const unallocatedRides = executedRides.filter(isUnallocatedRide).filter(matchesSearch);

  const totalExecutedCount = completedRides.length + cancelledRides.length + unallocatedRides.length;

  let segmentedRides: any[] = [];
  if (mainTab === 'upcoming') {
    segmentedRides = upcomingSubTab === 'unassigned' ? upcomingUnassignedRides : upcomingAssignedRides;
  } else if (mainTab === 'running') {
    segmentedRides = runningRides;
  } else {
    if (executedSubTab === 'completed') {
      segmentedRides = completedRides;
    } else if (executedSubTab === 'cancelled') {
      segmentedRides = cancelledRides;
    } else {
      segmentedRides = unallocatedRides;
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActiveRides();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchActiveRides();
    const stop = setForegroundInterval(() => {
      fetchActiveRides(true);
    }, 8000);
    return stop;
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchActiveRides();
    }, [])
  );

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAvailableAssignments = async () => {
    try {
      setAssignmentsLoading(true);
      const driversResponse = await fetchAvailableDrivers();
      let carsResponse: AvailableCar[] = [];
      try {
        const carsApi = await axiosInstance.get('/api/assignments/available-cars');
        if (carsApi?.data && Array.isArray(carsApi.data)) {
          carsResponse = carsApi.data as AvailableCar[];
        }
      } catch (carsErr) {
        carsResponse = [];
      }
      setAvailableDrivers(driversResponse || []);
      setAvailableCars(carsResponse || []);
    } catch (error: any) {
      console.error('❌ Failed to fetch assignments:', error);
      Alert.alert('Error', 'Failed to fetch available drivers and cars');
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const handleAssignDriver = (ride: ActiveRide) => {
    setSelectedRide(ride);
    setSelectedDriver(null);
    fetchAvailableAssignments();
    setShowAssignModal(true);
  };

  const handleDriverSelect = (driver: AvailableDriver) => {
    setSelectedDriver(driver);
    setShowAssignModal(false);
    setShowVehicleModal(true);
  };

  const handleCarAssign = async (car: AvailableCar) => {
    if (!selectedRide || !selectedDriver) return;

    try {
      setAssignmentsLoading(true);
      await assignCarDriverToOrder(selectedRide.id, selectedDriver.id, car.id);

      setActiveRides(prev => prev.map(ride =>
        ride.id === selectedRide.id
          ? {
              ...ride,
              assignment_status: 'ASSIGNED',
              assigned_driver_name: selectedDriver.full_name,
              assigned_driver_phone: selectedDriver.primary_number,
              assigned_car_name: car.car_name,
              assigned_car_number: car.car_number
            }
          : ride
      ));

      Alert.alert('Success', 'Driver and car assigned successfully!');
      setShowVehicleModal(false);
      checkAfterAssignment(selectedDriver);
      setSelectedRide(null);
      setSelectedDriver(null);
      await fetchActiveRides();
    } catch (error: any) {
      if (error?.response?.status === 500) {
        setActiveRides(prev => prev.map(ride =>
          ride.id === selectedRide.id
            ? {
                ...ride,
                assignment_status: 'ASSIGNED',
                assigned_driver_name: selectedDriver.full_name,
                assigned_driver_phone: selectedDriver.primary_number,
                assigned_car_name: car.car_name,
                assigned_car_number: car.car_number
              }
            : ride
        ));
        Alert.alert('Success', 'Driver and car assigned successfully!');
        setShowVehicleModal(false);
        checkAfterAssignment(selectedDriver);
        setSelectedRide(null);
        setSelectedDriver(null);
        await fetchActiveRides();
        return;
      }
      if (error?.response?.data?.detail === "Updated") {
        Alert.alert(
          'Duty Driver Assignment',
          'This booking has been updated and assigned to a duty driver. Please check the updated status.',
          [{ text: 'OK', onPress: () => { fetchActiveRides(); } }]
        );
      } else {
        Alert.alert('Error', error.message || 'Failed to assign driver and car');
      }
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const getPickupDrop = (pickupDropLocation: any) => {
    if (!pickupDropLocation) return { pickup: 'Unknown', drop: '' };
    if (typeof pickupDropLocation === 'object') {
      const has0 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '0');
      const has1 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '1');
      if (has0 && has1) return { pickup: String(pickupDropLocation['0'] || 'Unknown'), drop: String(pickupDropLocation['1'] || '') };
      if (has0) return { pickup: String(pickupDropLocation['0'] || 'Unknown'), drop: '' };
      if (pickupDropLocation.pickup || pickupDropLocation.drop) return { pickup: String(pickupDropLocation.pickup || 'Unknown'), drop: String(pickupDropLocation.drop || '') };
    }
    return { pickup: 'Unknown', drop: '' };
  };

  const formatCarType = (carType: string | null | undefined): string => {
    if (!carType) return '';
    const type = String(carType).trim();
    const plusPattern = /^(.+?)_(\d+)_PLUS_(\d+)$/i;
    const plusMatch = type.match(plusPattern);
    if (plusMatch) {
      const base = plusMatch[1].replace(/_/g, ' ');
      return `${base} (${plusMatch[2]}+${plusMatch[3]})`;
    }
    return type.replace(/_/g, ' ');
  };

  const getAssignmentRemaining = (ride: ActiveRide): string => formatAssignmentRemaining(ride as any, "Assignment window expired");

  const renderRideCard = (ride: any) => {
    const { pickup, drop } = getPickupDrop(ride.pickup_drop_location);
    const isHourly = String(ride.trip_type || '').toLowerCase().includes('hour');
    const isAllInclusive = ride.fare_type === 'ALL_INCLUSIVE';
    const extraCharges = (ride.charge_items || []).filter((c: any) => !c.included).map((c: any) => c.label);
    const fareTypeSummary = isAllInclusive ? (extraCharges.length > 0 ? `All Inclusive · ${extraCharges.join(', ')} extra` : 'All Inclusive') : null;
    const remaining = getAssignmentRemaining(ride);

    const parseDateTime = (dateStr: string) => {
      if (!dateStr) return { date: '', time: '' };
      try {
        const date = new Date(dateStr);
        return { 
          date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
        };
      } catch { return { date: '', time: '' }; }
    };
    const { date: pickupDate, time: pickupTime } = parseDateTime(ride.start_date_time);

    const formatRoundedDuration = (raw: string): string => {
      if (!raw) return '';
      try {
        const segments = String(raw).split('+');
        let totalMinutes = 0;
        segments.forEach((seg) => {
          const hMatch = seg.toLowerCase().match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
          const mMatch = seg.toLowerCase().match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
          totalMinutes += (hMatch ? Number(hMatch[1]) : 0) * 60 + (mMatch ? Number(mMatch[1]) : 0);
        });
        const roundedHours = Math.round(totalMinutes / 60);
        return roundedHours > 0 ? `${roundedHours} hrs` : '0 hrs';
      } catch { return raw; }
    };

    const fareData = (ride as any);
    const advanceReceived = Number(fareData.advance_received) || 0;
    const totalFareAmount = Number(ride.vendor_price || ride.estimated_price || 0);
    const balanceToCollect = totalFareAmount - advanceReceived;

    return (
      <TouchableOpacity
        key={ride.id}
        activeOpacity={0.92}
        onPress={() => {
          setSelectedBookingForDetail(ride);
          setShowDetailModal(true);
        }}
        style={[styles.rideCard, { backgroundColor: colors.surface }]}
      >
        <View style={styles.rideHeader}>
          <Text style={[styles.orderIdBold, { color: colors.text }]}>Booking ID: {formatBookingId((ride as any).order_id || ride.id)}</Text>
          {ride.trip_type && <Text style={styles.tripTypeBold}>{ride.trip_type}</Text>}
        </View>

        {/* Why it ended: penalty bucket badge (Un Allocated) or who cancelled (Cancelled), plus the reason given */}
        {mainTab === 'executed' && executedSubTab !== 'completed' && (() => {
          const kind = String(ride.unallocated_kind || '').toUpperCase();
          const cancelledBy = String(ride.cancelled_by || '').toUpperCase();
          const reqStatus = String(ride.request_status || '').toUpperCase();

          let label = 'Cancelled';
          let color = '#DC2626';
          let bg = isDarkMode ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2';
          if (kind === 'AUTO_CANCELLED') {
            label = '⚠️ Auto-cancelled (no driver & car in time) • penalty';
            color = '#D97706';
            bg = isDarkMode ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7';
          } else if (kind === 'DITCHED') {
            label = '❌ Ditched by you • penalty';
            color = '#8B5CF6';
            bg = isDarkMode ? 'rgba(139, 92, 246, 0.18)' : '#EDE9FE';
          } else if (kind === 'REMOVED') {
            label = '🚫 Removed by admin • penalty';
            color = '#EF4444';
          } else if (kind === 'REQUESTED') {
            label = reqStatus === 'REJECTED' ? '📨 Car request rejected' : '📨 Car request sent - waiting for admin';
            color = '#2563EB';
            bg = isDarkMode ? 'rgba(37, 99, 235, 0.18)' : '#DBEAFE';
          } else if (cancelledBy.includes('ADMIN')) {
            label = '🚫 Cancelled by Drop Cars admin';
          } else if (cancelledBy.includes('CUSTOMER')) {
            label = '🚫 Cancelled by the customer';
          } else if (cancelledBy.includes('VENDOR')) {
            label = '🚫 Cancelled by the booking owner';
          } else if (cancelledBy.includes('DRIVING')) {
            label = '🚫 Cancelled while the trip was running';
          }
          const note = String(ride.cancel_note || '').trim();

          return (
            <View style={{ marginBottom: 8, marginTop: 4 }}>
              <View style={{
                alignSelf: 'flex-start',
                backgroundColor: bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: color + '40',
              }}>
                <Text style={{ color, fontFamily: 'Inter-Bold', fontSize: 12 }}>{label}</Text>
              </View>
              {!!note && (
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
                  Reason: <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold' }}>{note}</Text>
                </Text>
              )}
            </View>
          );
        })()}

        {/* Booking type + how the fare is made up - on every booking */}
        {(() => {
          const fb = fareBreakdown(ride);
          return (
            <View style={{ marginBottom: 8 }}>
              <View style={[styles.fareTypeBadge]}>
                <IndianRupee size={13} color="#2563EB" />
                <Text style={styles.fareTypeBadgeText}>{fb.typeLabel}</Text>
              </View>
              {!!fb.line && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{fb.line}</Text>
              )}
            </View>
          );
        })()}

        {mainTab === 'upcoming' && remaining !== '' && !ride.assigned_driver_name && !ride.assigned_car_name && (
          <View style={styles.assignmentTimer}>
            <Text style={styles.timerText}>{remaining === 'Assignment window expired' ? 'Assignment window expired' : `Assign driver & car in ${remaining}`}</Text>
          </View>
        )}

        <View style={styles.routeContainer}>
          <View style={styles.routeRow}>
            <MapPin color="#10B981" size={18} />
            <Text style={[styles.routeTextBold, { color: '#10B981' }]}>From: {pickup}</Text>
          </View>
          {!isHourly && !!drop && (
            <>
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
              <View style={styles.routeRow}>
                <MapPin color="#EF4444" size={18} />
                <Text style={[styles.routeTextBold, { color: '#EF4444' }]}>To: {drop}</Text>
              </View>
            </>
          )}
        </View>

        <View style={[styles.detailsContainerBold, { backgroundColor: colors.background }]}>
          <View style={styles.detailRowBold}>
            <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>Pickup Date & Time:</Text>
            <Text style={[styles.detailValueBold, { color: colors.text }]}>{pickupDate && pickupTime ? `${pickupDate} at ${pickupTime}` : (ride.start_date_time || 'N/A')}</Text>
          </View>
          {ride.car_type && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>Car Type:</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{formatCarType(ride.car_type)}</Text>
            </View>
          )}
          {ride.trip_distance && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>Distance:</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{ride.trip_distance} km</Text>
            </View>
          )}
          {ride.trip_time && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>Duration:</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{formatRoundedDuration(ride.trip_time)}</Text>
            </View>
          )}
        </View>

        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>Total Amount</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IndianRupee color="#065F46" size={20} />
            <Text style={styles.totalFare}>{totalFareAmount}</Text>
          </View>
        </View>

        {advanceReceived > 0 && (
          <View style={styles.advanceContainer}>
            <Text style={styles.advanceText}>Advance Received: ₹{advanceReceived} · Collect on trip: ₹{balanceToCollect}</Text>
          </View>
        )}

        {expandedOrderId === ride.id && (
          <View style={[styles.expandedDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.expandedTitle, { color: colors.text }]}>Fare Breakdown</Text>
            <Text style={[styles.expandedSubHeader, { color: colors.primary }]}>{t('booking.driverTariff')}</Text>
            <View style={styles.expandedSection}>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Price per km:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{fareData.cost_per_km || 0}</Text>
              </View>
            </View>
          </View>
        )}

        {mainTab === 'running' ? (
          <View style={[styles.assignmentInfo, { backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.3)', borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#EF4444' }}>🔒 Trip Running • Driver & Cab Locked</Text>
            </View>
            <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{ride.assigned_driver_name || 'Duty Driver'} {ride.assigned_driver_phone ? `• ${ride.assigned_driver_phone}` : ''}</Text>
            {ride.assigned_car_name && (
              <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{ride.assigned_car_name} • {ride.assigned_car_number}</Text>
            )}
          </View>
        ) : mainTab === 'executed' ? (
          ride.assigned_driver_name ? (
            <View style={[styles.assignmentInfo, { backgroundColor: colors.background }]}>
              <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{ride.assigned_driver_name} • {ride.assigned_car_name || 'Car'}</Text>
            </View>
          ) : null
        ) : ride.assigned_driver_name ? (
          <View style={[styles.assignmentInfo, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.assignmentTitle, { color: colors.text }]}>Assigned Driver</Text>
              <TouchableOpacity onPress={() => handleAssignDriver(ride)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + '15' }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 12 }}>Change / Re-assign</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{ride.assigned_driver_name} • {ride.assigned_driver_phone}</Text>
            {ride.assigned_car_name && <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{ride.assigned_car_name} • {ride.assigned_car_number}</Text>}
          </View>
        ) : (
          <TouchableOpacity style={[styles.assignButton, { backgroundColor: colors.primary }]} onPress={() => handleAssignDriver(ride)} disabled={assignmentsLoading}>
            {assignmentsLoading ? <ActivityIndicator color="#FFFFFF" /> : <UserPlus color="#FFFFFF" size={20} />}
            <Text style={styles.assignButtonText}>Assign Driver & Car</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const activeLabel = mainTab === 'upcoming' ? (upcomingSubTab === 'unassigned' ? 'Unassigned Upcoming' : 'Assigned Upcoming') : (mainTab === 'running' ? 'Running' : (executedSubTab === 'unallocated' ? 'Un Allocated' : `${executedSubTab} Executed`));

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Car size={40} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No {activeLabel} rides</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>You don't have any {activeLabel.toLowerCase()} rides at the moment.</Text>
      <TouchableOpacity style={styles.refreshButton} onPress={() => fetchActiveRides()}><RefreshCw size={16} color="#FFFFFF" /><Text style={styles.refreshButtonText}>Refresh</Text></TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyTitle, { color: colors.error }]}>Error Loading Rides</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{error}</Text>
      <TouchableOpacity style={styles.refreshButton} onPress={() => fetchActiveRides()}><RefreshCw size={20} color="#FFFFFF" /><Text style={styles.refreshButtonText}>Try Again</Text></TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <RidesBookingsSwitcher active="rides" />
      {/* ── Edge-to-edge Main Tab Bar ── */}
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
          { key: 'upcoming', label: 'Upcoming', count: totalUpcomingCount, activeColor: '#6366F1' },
          { key: 'running', label: 'Running', count: runningRides.length, activeColor: '#10B981' },
          { key: 'executed', label: 'Executed', count: totalExecutedCount, activeColor: '#8B5CF6' },
        ] as { key: string; label: string; count: number; activeColor: string }[]).map((tab) => {
          const isActive = mainTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setMainTab(tab.key as any)}
              style={{ flex: 1, alignItems: 'center' }}
              activeOpacity={0.75}
            >
              <View style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? tab.activeColor : colors.textSecondary,
                  }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                <View
                  style={{
                    marginTop: 2,
                    backgroundColor: isActive ? tab.activeColor + '22' : 'transparent',
                    borderRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    minWidth: 22,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: 'Inter-Bold',
                      color: isActive ? tab.activeColor : colors.textSecondary,
                    }}
                  >
                    {tab.count}
                  </Text>
                </View>
              </View>
              {/* Active underline */}
              <View
                style={{
                  height: 3,
                  width: '100%',
                  backgroundColor: isActive ? tab.activeColor : 'transparent',
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Upcoming Sub-tabs: Unassigned | Assigned ── */}
      {mainTab === 'upcoming' && (
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
            { key: 'unassigned', label: 'Unassigned', count: upcomingUnassignedRides.length, activeColor: '#EF4444' },
            { key: 'assigned', label: 'Assigned', count: upcomingAssignedRides.length, activeColor: '#3B82F6' },
          ] as { key: string; label: string; count: number; activeColor: string }[]).map((sub) => {
            const isActive = upcomingSubTab === sub.key;
            return (
              <TouchableOpacity
                key={sub.key}
                onPress={() => setUpcomingSubTab(sub.key as any)}
                style={[
                  {
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    paddingVertical: 8,
                    backgroundColor: isActive
                      ? (isDarkMode ? sub.activeColor + '20' : sub.activeColor + '12')
                      : 'transparent',
                    borderBottomWidth: 2.5,
                    borderBottomColor: isActive ? sub.activeColor : 'transparent',
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? sub.activeColor : colors.textSecondary,
                  }}
                >
                  {sub.label}
                </Text>
                <View
                  style={{
                    backgroundColor: isActive ? sub.activeColor : (isDarkMode ? '#334155' : '#E2E8F0'),
                    borderRadius: 6,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    minWidth: 20,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: isActive ? '#FFFFFF' : colors.textSecondary }}>
                    {sub.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Executed Sub-tabs: Completed | Cancelled | Un Allocated ── */}
      {mainTab === 'executed' && (
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
            { key: 'completed', label: 'Completed', count: completedRides.length, activeColor: '#10B981' },
            { key: 'cancelled', label: 'Cancelled', count: cancelledRides.length, activeColor: '#EF4444' },
            { key: 'unallocated', label: 'Unalloc.', count: unallocatedRides.length, activeColor: '#F59E0B' },
          ] as { key: string; label: string; count: number; activeColor: string }[]).map((sub) => {
            const isActive = executedSubTab === sub.key;
            return (
              <TouchableOpacity
                key={sub.key}
                onPress={() => setExecutedSubTab(sub.key as any)}
                style={[
                  {
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    paddingVertical: 8,
                    backgroundColor: isActive
                      ? (isDarkMode ? sub.activeColor + '20' : sub.activeColor + '12')
                      : 'transparent',
                    borderBottomWidth: 2.5,
                    borderBottomColor: isActive ? sub.activeColor : 'transparent',
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                    color: isActive ? sub.activeColor : colors.textSecondary,
                  }}
                >
                  {sub.label}
                </Text>
                <View
                  style={{
                    backgroundColor: isActive ? sub.activeColor : (isDarkMode ? '#334155' : '#E2E8F0'),
                    borderRadius: 6,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    minWidth: 20,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: isActive ? '#FFFFFF' : colors.textSecondary }}>
                    {sub.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <DutyDriverSuggestionBanner suggestion={dutyDriverSuggestion} onDismiss={dismissDutyDriverSuggestion} />

      <ScrollView style={styles.scrollView} refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        {loading && activeRides.length === 0 && executedRides.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          renderErrorState()
        ) : (
          <View style={styles.ridesContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: colors.surface,
              }}>
                <TextInput
                  placeholder="Search by ID, customer, city, or location..."
                  placeholderTextColor={colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  style={{ flex: 1, color: colors.text }}
                />
              </View>
            </View>

            {segmentedRides.length > 0 ? segmentedRides.map(renderRideCard) : renderEmptyState()}
          </View>
        )}
      </ScrollView>

      {/* Driver Assignment Modal */}
      <Modal
        visible={showAssignModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select Driver
              </Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {assignmentsLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.modalLoadingText, { color: colors.textSecondary }]}>
                    Loading drivers...
                  </Text>
                </View>
              ) : availableDrivers.length > 0 ? (
                availableDrivers.map((driver) => (
                  <TouchableOpacity
                    key={driver.id}
                    style={[styles.driverCard, { backgroundColor: colors.background }]}
                    onPress={() => handleDriverSelect(driver)}
                  >
                    <View style={styles.driverInfo}>
                      <Text style={[styles.driverName, { color: colors.text }]}>
                        {driver.full_name}
                      </Text>
                      <Text style={[styles.driverDetails, { color: colors.textSecondary }]}>
                        {driver.primary_number}
                      </Text>
                      <Text style={[styles.driverStatus, { color: '#10B981' }]}>
                        {driver.driver_status}
                      </Text>
                    </View>
                    <CheckCircle color={colors.primary} size={24} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.modalEmpty}>
                  <Text style={[styles.modalEmptyText, { color: colors.textSecondary }]}>
                    No available drivers found wait Until The Verfication process Complete for the driver
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Car Assignment Modal */}
      <Modal
        visible={showVehicleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVehicleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select Car
              </Text>
              <TouchableOpacity onPress={() => setShowVehicleModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {selectedDriver && (
              <View style={[styles.selectedDriverInfo, { backgroundColor: colors.background }]}>
                <Text style={[styles.selectedDriverText, { color: colors.text }]}>
                  Selected Driver: {selectedDriver.full_name}
                </Text>
              </View>
            )}

            <ScrollView style={styles.modalScrollView}>
              {assignmentsLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.modalLoadingText, { color: colors.textSecondary }]}>
                    Assigning...
                  </Text>
                </View>
              ) : availableCars.length > 0 ? (
                availableCars.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[styles.carCard, { backgroundColor: colors.background }]}
                    onPress={() => handleCarAssign(car)}
                    disabled={assignmentsLoading}
                  >
                    <View style={styles.carInfo}>
                      <Text style={[styles.carName, { color: colors.text }]}>
                        {car.car_name} ({formatCarType(car.car_type)})
                      </Text>
                      <Text style={[styles.carDetails, { color: colors.textSecondary }]}>
                        {car.car_number}
                      </Text>
                      {!!(car as any)?.car_status && (
                        <Text style={[styles.carDetails, { color: colors.textSecondary }]}>
                          Status: {(car as any).car_status}
                        </Text>
                      )}
                    </View>
                    <CheckCircle color={colors.primary} size={24} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.modalEmpty}>
                  <Text style={[styles.modalEmptyText, { color: colors.textSecondary }]}>
                    No available cars found
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BookingDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        booking={selectedBookingForDetail}
        onRefresh={fetchActiveRides}
      />
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
      borderBottomWidth: 1,
    },
  title: {
      fontSize: 24,
      flex: 1,
      marginRight: 12,
      fontFamily: 'Inter-Bold',
  },
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  scrollView: {
      flex: 1,
      paddingHorizontal: 20,
    paddingTop: 16,
  },
  ridesContainer: {
    gap: 10,
    paddingBottom: 16,
    },
    rideCard: {
    borderRadius: 12,
      padding: 12,
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
      marginBottom: 12,
    },
  orderIdBold: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
    },
    tripTypeBold: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: '#EF4444',
    },
    fareTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 8,
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
    routeContainer: {
      marginBottom: 10,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    marginBottom: 4,
  },
  routeLine: {
    width: 1,
    height: 12,
    marginLeft: 8,
    marginVertical: 2,
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
    kmLimitNote: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: '#B45309',
      marginTop: -2,
      marginBottom: 6,
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
  advanceContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  advanceText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#92400E',
    textAlign: 'center',
  },
  assignmentInfo: {
    marginTop: 12,
    padding: 12,
    borderRadius: 6,
  },
  assignmentTitle: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  assignmentText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 14,
    paddingHorizontal: 40,
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
      fontFamily: 'Inter-Medium',
    marginTop: 16,
    },
    assignButton: {
    marginTop: 12,
    borderRadius: 6,
      paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    },
    assignButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
    },
    assignmentTimer: {
      marginTop: 8,
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
    },
    timerText: {
      fontSize: 13,
      fontFamily: 'Inter-SemiBold',
      color: '#B91C1C',
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    },
    modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
  },
  modalScrollView: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalLoading: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalLoadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginTop: 12,
  },
  modalEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalEmptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    },
    driverCard: {
      flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    },
    driverInfo: {
      flex: 1,
    },
    driverName: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
    },
  driverDetails: {
    fontSize: 14,
      fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  driverStatus: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  selectedDriverInfo: {
    marginHorizontal: 20,
    padding: 12,
      borderRadius: 6,
    marginBottom: 16,
    },
  selectedDriverText: {
    fontSize: 14,
      fontFamily: 'Inter-SemiBold',
    },
  carCard: {
    flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
      marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  carInfo: {
      flex: 1,
  },
  carName: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  carDetails: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 8,
    gap: 8,
  },
  seeMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  expandedDetails: {
    marginTop: 8,
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  expandedTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 16,
  },
  expandedSection: {
    marginBottom: 16,
  },
  expandedSubHeader: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 6,
  },
  expandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandedLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },
  expandedValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    textAlign: 'right',
  },
  });
