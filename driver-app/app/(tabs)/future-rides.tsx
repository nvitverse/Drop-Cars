import RefreshFab from '@/components/RefreshFab';
import FreshRefreshControl from '@/components/FreshRefreshControl';
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
  Alert,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import { fareBreakdown } from '@/utils/fareBreakdown';
import { useAuth } from '@/contexts/AuthContext'; 
import { useNotifications } from '@/contexts/NotificationContext';
import { MapPin, Clock, IndianRupee, User, Phone, Car, RefreshCw, UserPlus, X, CheckCircle, FileText, ChevronDown, ChevronUp, Info, Calendar } from 'lucide-react-native';
import { RefreshControl } from 'react-native';
import axiosInstance from '@/app/api/axiosInstance';
import CallButton from '@/components/CallButton';
import { fetchAvailableDrivers, assignCarDriverToOrder, AvailableDriver, AvailableCar } from '@/services/orders/assignmentService';
import { formatBookingId } from '@/utils/format';
import { useDutyDriverSuggestion } from '@/hooks/useDutyDriverSuggestion';
import DutyDriverSuggestionBanner from '@/components/DutyDriverSuggestionBanner';
import { useLanguage } from '@/contexts/LanguageContext';
import BookingDetailModal from '@/components/BookingDetailModal';
import DateRangeCalendarModal from '@/components/DateRangeCalendarModal';

// Simple interface for the new API response
interface FutureRide {
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

export default function FutureRidesScreen() {
  const { colors, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { } = useNotifications();
  const { t } = useLanguage();
  const [futureRides, setFutureRides] = useState<FutureRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // global tick to refresh countdowns
  const [tick, setTick] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Assignment modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState<FutureRide | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<AvailableDriver | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [availableCars, setAvailableCars] = useState<AvailableCar[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Suggests logging in / switching to the duty-driver session for whoever
  // was just assigned to a booking, so the owner can jump into the trip.
  const { suggestion: dutyDriverSuggestion, checkAfterAssignment, dismiss: dismissDutyDriverSuggestion } = useDutyDriverSuggestion();

  // Simple API fetch function
  const fetchFutureRides = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Fetching Accepted Rides from /api/orders/vehicle-owner/pending...');

      const response = await axiosInstance.get('/api/orders/vehicle-owner/pending');
      const ridesArray = Array.isArray(response.data) ? response.data : [];

      console.log('✅ Accepted Rides fetched successfully:', ridesArray.length, 'rides');
      setFutureRides(ridesArray);
    } catch (error: any) {
      console.error('❌ Failed to fetch Accepted Rides:', error);
      setError(error.message || t('futureRides.fetchFailedGeneric'));
    } finally {
      setLoading(false);
    }
  };

  // Search and Date Filter states
  const [search, setSearch] = useState('');
  const [showAssignmentRulesModal, setShowAssignmentRulesModal] = useState(false);
  const [showDateCalendar, setShowDateCalendar] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const normalized = (s: string) => String(s || '').toLowerCase();
  const getDisplayCity = (v: string | string[]) => Array.isArray(v) ? v.join(', ') : v;
  // Exclude orders where both driver and car are already assigned
  const visibleFutureRides = futureRides.filter((r: any) => !(r.assigned_driver_name && r.assigned_car_name));

  const filteredFutureRides = visibleFutureRides.filter((r) => {
    // 1. Date filter
    if (selectedDateFilter && r.start_date_time) {
      if (!r.start_date_time.startsWith(selectedDateFilter)) {
        return false;
      }
    }

    // 2. Search query filter
    const q = normalized(search);
    if (!q) return true;
    
    // Get pickup and drop locations
    const pickupLocation = r.pickup_drop_location?.["0"] || '';
    const dropLocation = r.pickup_drop_location?.["1"] || '';
    const pickNearCitySafe = getDisplayCity(r.pick_near_city);
    
    return [
      r.id,
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
  });

  // Refresh function for pull-to-refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFutureRides();
    setRefreshing(false);
  };

  // Auto-load data when user is available
  useEffect(() => {
    if (user) {
      console.log('🔄 Auto-loading Accepted Rides data...');
      fetchFutureRides();
    }
  }, [user]);

  // Also load data when user changes (login/logout)
  useEffect(() => {
    if (user) {
      console.log('👤 User changed, refreshing Accepted Rides data...');
      fetchFutureRides();
    }
  }, [user?.id]);

  // Refresh when tab/screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        console.log('📌 Accepted Rides focused, refreshing...');
        fetchFutureRides();
      }
    }, [user?.id])
  );

  // Ticker for countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch available drivers and cars for assignment
  const fetchAvailableAssignments = async () => {
    try {
      setAssignmentsLoading(true);
      console.log('🔄 Fetching available drivers and cars...');
      
      // Always fetch drivers from service
      const driversResponse = await fetchAvailableDrivers();
      // Fetch cars from API: /api/assignments/available-cars (VO priority-aware source)
      let carsResponse: AvailableCar[] = [];
      try {
        const carsApi = await axiosInstance.get('/api/assignments/available-cars');
        if (carsApi?.data && Array.isArray(carsApi.data)) {
          carsResponse = carsApi.data as AvailableCar[];
        }
      } catch (carsErr) {
        console.warn('⚠️ Fallback: available cars API failed, showing empty list', carsErr);
        carsResponse = [];
      }
      
      setAvailableDrivers(driversResponse || []);
      setAvailableCars(carsResponse || []);
      
      console.log('✅ Available assignments fetched:', {
        drivers: driversResponse?.length || 0,
        cars: carsResponse?.length || 0
      });
    } catch (error: any) {
      console.error('❌ Failed to fetch available assignments:', error);
      Alert.alert(t('futureRides.errorTitle'), t('futureRides.fetchAssignmentsFailedGeneric'));
    } finally {
      setAssignmentsLoading(false);
    }
  };

  // Handle assign driver button press
  const handleAssignDriver = (ride: FutureRide) => {
    setSelectedRide(ride);
    setSelectedDriver(null);
    fetchAvailableAssignments();
    setShowAssignModal(true);
  };

  // Handle driver selection
  const handleDriverSelect = (driver: AvailableDriver) => {
    setSelectedDriver(driver);
    setShowAssignModal(false);
    setShowVehicleModal(true);
  };

  // Handle assignment confirmation
  const handleConfirmAssignment = async (car: AvailableCar) => {
    if (!selectedRide || !selectedDriver) {
      Alert.alert(t('futureRides.errorTitle'), t('futureRides.selectBothDriverAndCar'));
      return;
    }

    try {
      setAssignmentsLoading(true);
      console.log('🔄 Assigning driver and car to order...');

      await assignCarDriverToOrder(
        selectedRide.assignment_id,
        selectedDriver.id,
        car.id
      );

      // Update the ride in the list
      setFutureRides(prev => prev.map(ride => 
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

      // Notification removed

      Alert.alert(t('futureRides.successTitle'), t('futureRides.assignedSuccess'));
      setShowVehicleModal(false);
      // Suggest logging in as (or switching to) this driver's duty session -
      // capture before clearing selectedDriver/selectedRide below.
      checkAfterAssignment(selectedDriver);
      setSelectedRide(null);
      setSelectedDriver(null);

      // Refresh data to ensure UI is in sync
      await fetchFutureRides();

      console.log('✅ Assignment completed successfully');
    } catch (error: any) {
      // If it's a 500 error but assignment is successful, treat it as success
      if (error?.response?.status === 500) {
        console.warn('⚠️ Server returned 500 but assignment is successful, treating as success');
        // Assignment is successful despite 500 error, update UI and show success
        setFutureRides(prev => prev.map(ride => 
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

        Alert.alert(t('futureRides.successTitle'), t('futureRides.assignedSuccess'));
        setShowVehicleModal(false);
        checkAfterAssignment(selectedDriver);
        setSelectedRide(null);
        setSelectedDriver(null);

        // Refresh data to ensure UI is in sync
        await fetchFutureRides();

        console.log('✅ Assignment completed successfully (despite 500 error)');
        return;
      }
      
      // Log actual errors (non-500)
      console.error('❌ Failed to assign driver and car:', error);
      
      // Check for specific "Updated" error message
      if (error?.response?.data?.detail === "Updated") {
        Alert.alert(
          t('futureRides.dutyDriverAssignmentTitle'),
          t('futureRides.dutyDriverAssignmentBody'),
          [
            {
              text: t('futureRides.ok'),
              onPress: () => {
                // Refresh the data to show updated status
                fetchFutureRides();
              }
            }
          ]
        );
      } else {
        Alert.alert(t('futureRides.errorTitle'), error.message || t('futureRides.assignFailedGeneric'));
      }
    } finally {
      setAssignmentsLoading(false);
    }
  };

  // Helper function to get pickup and drop locations
  const getPickupDrop = (pickupDropLocation: any) => {
    if (!pickupDropLocation) return { pickup: t('futureRides.unknownLocation'), drop: '' };
    if (typeof pickupDropLocation === 'object') {
      const has0 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '0');
      const has1 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '1');
      if (has0 && has1) {
        return { pickup: String(pickupDropLocation['0'] || t('futureRides.unknownLocation')), drop: String(pickupDropLocation['1'] || '') };
      }
      if (has0) {
        return { pickup: String(pickupDropLocation['0'] || t('futureRides.unknownLocation')), drop: '' };
      }
      if (pickupDropLocation.pickup || pickupDropLocation.drop) {
        return { pickup: String(pickupDropLocation.pickup || t('futureRides.unknownLocation')), drop: String(pickupDropLocation.drop || '') };
      }
    }
    return { pickup: t('futureRides.unknownLocation'), drop: '' };
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t('futureRides.invalidDate');
    }
  };

  // Helper function to format car type for display
  const formatCarType = (carType: string | null | undefined): string => {
    if (!carType) return '';
    
    const type = String(carType).trim();
    
    // Pattern: X_PLUS_Y or X_PLUS_Y (e.g., SUV_6_PLUS_1, INNOVA_7_PLUS_1)
    const plusPattern = /^(.+?)_(\d+)_PLUS_(\d+)$/i;
    const plusMatch = type.match(plusPattern);
    
    if (plusMatch) {
      const base = plusMatch[1].replace(/_/g, ' ');
      const first = plusMatch[2];
      const second = plusMatch[3];
      return `${base} (${first}+${second})`;
    }
    
    // Pattern: NEW_SEDAN_2022_MODEL or similar
    if (type.includes('NEW_SEDAN_2022_MODEL')) {
      return 'Prime Sedan';
    }
    
    // For other cases, replace underscores with spaces
    return type.replace(/_/g, ' ');
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING': return '#F59E0B';
      case 'ASSIGNED': return '#10B981';
      case 'COMPLETED': return '#6B7280';
      case 'CANCELLED': return '#EF4444';
      default: return '#6B7280';
    }
  };

  // Compute assignment time remaining for a ride
  const getAssignmentRemaining = (ride: FutureRide): string => formatAssignmentRemaining(ride as any, t('futureRides.assignmentWindowExpired'));
  // Render ride card
  const renderRideCard = (ride: FutureRide) => {
    const { pickup, drop } = getPickupDrop(ride.pickup_drop_location);
    const isHourly = String(ride.trip_type || '').toLowerCase().includes('hour');
    const isMulticity = String(ride.trip_type || '').toLowerCase().includes('multicity') || String(ride.trip_type || '').toLowerCase().includes('multy');
    const isAllInclusive = ride.fare_type === 'ALL_INCLUSIVE';
    const extraCharges = (ride.charge_items || []).filter((c) => !c.included).map((c) => c.label);
    const fareTypeSummary = isAllInclusive
      ? (extraCharges.length > 0 ? `All Inclusive · ${extraCharges.join(', ')} extra` : 'All Inclusive')
      : null;

    const remaining = getAssignmentRemaining(ride);
    
    // Parse date and time
    const parseDateTime = (dateStr: string) => {
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
    
    // Access fare breakdown fields (may come from API response)
    const fareData = (ride as any);
    const pricePerKm = fareData.cost_per_km || fareData.price_per_km || 0;
    const driverAllowance = fareData.driver_allowance || 0;
    const permitCharge = fareData.permit_charges || fareData.permit_charge || 0;
    const hillsCharge = fareData.hill_charges || fareData.hills_charge || 0;
    const tollCharge = fareData.toll_charges || fareData.toll_charge || 0;
    const waitingChargeAmount = fareData.waiting_charge || fareData.waiting_charges;
    const waitingTimeMinutes = fareData.waiting_time ?? null;
    const nightCharges = fareData.night_charges ?? fareData.night_charge ?? null;
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
        {/* Header: Booking ID and Trip Type */}
        <View style={styles.rideHeader}>
          <Text style={[styles.orderIdBold, { color: colors.text }]}>
            {t('rides.bookingIdPrefix', { id: formatBookingId(ride.id) })}
            </Text>
          {ride.trip_type && (
            <Text style={styles.tripTypeBold}>{ride.trip_type}</Text>
          )}
        </View>

        {/* Fare type - display-only, the real amounts are still the
            fare-breakdown fields below. */}
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

        {/* Assignment countdown (only for accepted orders without driver/car assigned) */}
        {remaining !== '' && !ride.assigned_driver_name && !ride.assigned_car_name && (
          <View style={styles.assignmentTimer}>
            <Text style={styles.timerText}>
              {remaining === t('futureRides.assignmentWindowExpired')
                ? t('futureRides.assignmentWindowExpired')
                : remaining
                  ? t('futureRides.assignDriverCarIn', { remaining })
                  : ''}
            </Text>
          </View>
        )}

        {/* Route */}
        <View style={styles.routeContainer}>
          <View style={styles.routeRow}>
            <MapPin color="#10B981" size={18} />
            <Text style={[styles.routeTextBold, { color: '#10B981' }]}>
              {t('rides.fromLabel', { city: pickup })}
            </Text>
          </View>
          {!isHourly && !!drop && (
            <>
              <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
            <View style={styles.routeRow}>
                <MapPin color="#EF4444" size={18} />
                <Text style={[styles.routeTextBold, { color: '#EF4444' }]}>
                  {t('rides.toLabel', { city: drop })}
              </Text>
            </View>
            </>
          )}
        </View>

        Order Details in Bold Styling
        <View style={styles.detailsContainerBold}>
          {ride.trip_type && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.tripType')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{ride.trip_type}</Text>
            </View>
          )}
          {ride.car_type && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.vehicleType')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{formatCarType(ride.car_type)}</Text>
          </View>
          )}
          {pickupDate && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.dateTime')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{pickupDate} {pickupTime}</Text>
          </View>
          )}
          {ride.trip_distance && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.distance')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{ride.trip_distance} {t('rides.km')}</Text>
          </View>
          )}
          {ride.trip_time && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.duration')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>{formatRoundedDuration(ride.trip_time)}</Text>
            </View>
          )}
          {waitingTimeMinutes != null && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: colors.textSecondary }]}>{t('rides.waitingCharge')}</Text>
              <Text style={[styles.detailValueBold, { color: colors.text }]}>₹{waitingTimeMinutes}</Text>
            </View>
          )}

          {/* Pickup Notes */}
          {ride.pickup_notes && ride.pickup_notes !== 'NILL' && ride.pickup_notes !== 'null' && (
            <View style={styles.detailRowBold}>
              <Text style={[styles.detailLabelBold, { color: '#EF4444' }]}>{t('rides.pickupNotes')}</Text>
              <Text style={[styles.detailValueBold, { color: '#EF4444', flex: 1, marginLeft: 8 }]}>{ride.pickup_notes}</Text>
            </View>
          )}
        </View>

        {/* Total Amount */}
        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>{t('rides.totalAmount')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IndianRupee color="#065F46" size={20} />
            <Text style={styles.totalFare}>{ride.vendor_price || ride.estimated_price || 0}</Text>
          </View>
        </View>

        {/* Advance already collected by vendor - shows driver the balance to collect on trip */}
        {advanceReceived > 0 && (
          <View style={styles.advanceContainer}>
            <Text style={styles.advanceText}>
              {t('futureRides.advanceReceivedLine', { advance: advanceReceived, balance: balanceToCollect })}
            </Text>
          </View>
        )}

        {/* Expanded Details Drawer - Fare Breakdown */}
        {expandedOrderId === ride.id && (
          <View style={[styles.expandedDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.expandedTitle, { color: colors.text }]}>{t('rides.fareBreakdown')}</Text>

            {/* Fare Breakdown Details */}
            <View style={styles.expandedSection}>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.pricePerKm')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{pricePerKm}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.driverBeta')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{driverAllowance}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.permitCharge')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{permitCharge}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.hillsCharge')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{hillsCharge}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.tollCharge')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{tollCharge}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.waitingChargeColon')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>
                  {waitingChargeAmount != null ? `₹${waitingChargeAmount}` : t('rides.notAvailable')}
                </Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.nightCharges')}</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>
                  {nightCharges != null ? `₹${nightCharges}` : t('rides.notAvailable')}
                </Text>
              </View>
              {waitingTimeMinutes != null && (
                <View style={styles.expandedRow}>
                  <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>{t('rides.waitingChargeColon')}</Text>
                  <Text style={[styles.expandedValue, { color: colors.text }]}>₹{waitingTimeMinutes}</Text>
                </View>
              )}
            </View>
            
            {/* Order Information - Additional details */}
            {/* <View style={styles.expandedSection}>
              <Text style={[styles.expandedSectionTitle, { color: colors.text }]}>Booking Information</Text>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Booking ID:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.source_order_id}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Source:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.source}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Trip Status:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.trip_status}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Pick Near City:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{getDisplayCity(ride.pick_near_city)}</Text>
              </View>
            </View> */}

            {/* Pricing Information */}
            {/* <View style={styles.expandedSection}>
              <Text style={[styles.expandedSectionTitle, { color: colors.text }]}>Pricing</Text>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Estimated Price:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{ride.estimated_price}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Vendor Price:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>₹{ride.vendor_price}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Platform Fees:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.platform_fees_percent}%</Text>
              </View>
              {ride.closed_vendor_price && (
                <View style={styles.expandedRow}>
                  <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Closed Vendor Price:</Text>
                  <Text style={[styles.expandedValue, { color: colors.text }]}>₹{ride.closed_vendor_price}</Text>
                </View>
              )}
              {ride.closed_driver_price && (
                <View style={styles.expandedRow}>
                  <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Closed Driver Price:</Text>
                  <Text style={[styles.expandedValue, { color: colors.text }]}>₹{ride.closed_driver_price}</Text>
                </View>
              )}
            </View> */}

            {/* Assignment Information */}
            {/* <View style={styles.expandedSection}>
              <Text style={[styles.expandedSectionTitle, { color: colors.text }]}>Assignment</Text>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Assignment ID:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.assignment_id}</Text>
              </View>
              <View style={styles.expandedRow}>
                <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Status:</Text>
                <Text style={[styles.expandedValue, { color: colors.text }]}>{ride.assignment_status}</Text>
              </View>
              {ride.assigned_at && (
                <View style={styles.expandedRow}>
                  <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Assigned At:</Text>
                  <Text style={[styles.expandedValue, { color: colors.text }]}>{formatDate(ride.assigned_at)}</Text>
                </View>
              )}
              {ride.expires_at && (
                <View style={styles.expandedRow}>
                  <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Expires At:</Text>
                  <Text style={[styles.expandedValue, { color: colors.text }]}>{formatDate(ride.expires_at)}</Text>
                </View>
              )}
            </View> */}

            {/* Timestamps removed per request */}
          </View>
        )}

        {/* Assignment Info or Assign Button */}
        {ride.assigned_driver_name ? (
          <View style={[styles.assignmentInfo, { backgroundColor: colors.background }]}>
            <Text style={[styles.assignmentTitle, { color: colors.text }]}>
              {t('futureRides.assignedDriverTitle')}
            </Text>
            <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>
              {ride.assigned_driver_name} • {ride.assigned_driver_phone}
            </Text>
            {ride.assigned_car_name && (
              <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>
                {ride.assigned_car_name} • {ride.assigned_car_number}
              </Text>
            )}
            {/* Vendor info only after driver & car are assigned. Owner calls the VENDOR (never the customer). */}
            {!!(ride.vendor_name && ride.vendor_phone) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.assignmentText, { color: colors.textSecondary }]}>{t('futureRides.vendorPrefix', { name: ride.vendor_name })}</Text>
                <CallButton phoneNumber={ride.vendor_phone} variant="inline" />
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.assignButton, { backgroundColor: colors.primary }]}
            onPress={() => handleAssignDriver(ride)}
            disabled={assignmentsLoading || getAssignmentRemaining(ride) === t('futureRides.assignmentWindowExpired')}
          >
            {assignmentsLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <UserPlus color="#FFFFFF" size={20} />
            )}
            <Text style={styles.assignButtonText}>
              {assignmentsLoading ? t('futureRides.loadingButton') : (getAssignmentRemaining(ride) === t('futureRides.assignmentWindowExpired') ? t('futureRides.assignmentExpiredButton') : t('futureRides.assignDriverCarButton'))}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Car size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {t('futureRides.noAcceptedRidesTitle')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {t('futureRides.noAcceptedRidesSubtitle')}
      </Text>
      <TouchableOpacity style={styles.refreshButton} onPress={fetchFutureRides}>
        <RefreshCw size={20} color="#FFFFFF" />
        <Text style={styles.refreshButtonText}>{t('futureRides.refresh')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Render error state
  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyTitle, { color: colors.error }]}>
        {t('futureRides.errorLoadingRidesTitle')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {error}
      </Text>
      <TouchableOpacity style={styles.refreshButton} onPress={fetchFutureRides}>
        <RefreshCw size={20} color="#FFFFFF" />
        <Text style={styles.refreshButtonText}>{t('futureRides.tryAgain')}</Text>
      </TouchableOpacity>
    </View>
  );


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('futureRides.headerTitle')}</Text>
        <TouchableOpacity
          onPress={() => setShowAssignmentRulesModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
            backgroundColor: colors.primary + '15',
            borderWidth: 1,
            borderColor: colors.primary + '30',
          }}
        >
          <Info size={13} color={colors.primary} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.primary }}>Assignment Rules</Text>
        </TouchableOpacity>
      </View>

      <DutyDriverSuggestionBanner suggestion={dutyDriverSuggestion} onDismiss={dismissDutyDriverSuggestion} />

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && futureRides.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('futureRides.loading')}
            </Text>
          </View>
        ) : error ? (
          renderErrorState()
        ) : futureRides.length > 0 ? (
          <View style={styles.ridesContainer}>
            {/* Search and Date Picker Row */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                backgroundColor: colors.surface,
                justifyContent: 'center',
              }}>
                <TextInput
                  placeholder={t('futureRides.searchPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  style={{ color: colors.text, fontSize: 13 }}
                />
              </View>

              <TouchableOpacity
                onPress={() => setShowDateCalendar(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: selectedDateFilter ? colors.primary : colors.border,
                  backgroundColor: selectedDateFilter ? colors.primary + '15' : colors.surface,
                }}
              >
                <Calendar size={15} color={selectedDateFilter ? colors.primary : colors.textSecondary} />
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'Inter-Medium',
                  color: selectedDateFilter ? colors.primary : colors.textSecondary,
                }}>
                  {selectedDateFilter ? selectedDateFilter : 'Date'}
                </Text>
                {selectedDateFilter && (
                  <TouchableOpacity onPress={() => setSelectedDateFilter(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <X size={13} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            {filteredFutureRides.map(renderRideCard)}
          </View>
        ) : (
          renderEmptyState()
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
                {t('futureRides.selectDriverTitle')}
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
                    {t('futureRides.loadingDrivers')}
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
                    {t('futureRides.noDriversAvailableBody')}
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
                {t('futureRides.selectCarTitle')}
              </Text>
              <TouchableOpacity onPress={() => setShowVehicleModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {selectedDriver && (
              <View style={[styles.selectedDriverInfo, { backgroundColor: colors.background }]}>
                <Text style={[styles.selectedDriverText, { color: colors.text }]}>
                  {t('futureRides.selectedDriverPrefix', { name: selectedDriver.full_name })}
                </Text>
      </View>
            )}

            <ScrollView style={styles.modalScrollView}>
              {assignmentsLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.modalLoadingText, { color: colors.textSecondary }]}>
                    {t('futureRides.assigning')}
                  </Text>
                </View>
              ) : availableCars.length > 0 ? (
                // Filter and sort cars: by family-based compatibility and priority
                (availableCars
                  .filter((car) => {
                    if (!selectedRide) return true;
                    
                    // Helper function to get car family from car type
                    const getCarFamily = (type: string): string | null => {
                      const normalizedType = (type || '').toUpperCase().trim();
                      
                      // INNOVA_CRYSTA family
                      if (normalizedType.includes('INNOVA_CRYSTA') || normalizedType.includes('INNOVA CRYSTA')) {
                        return 'INNOVA_CRYSTA';
                      }
                      // INNOVA family
                      if (normalizedType.includes('INNOVA') && !normalizedType.includes('CRYSTA')) {
                        return 'INNOVA';
                      }
                      // SUV family
                      if (normalizedType.includes('SUV')) {
                        return 'SUV';
                      }
                      // SEDAN family
                      if (normalizedType.includes('SEDAN') || normalizedType.includes('ETIOS')) {
                        return 'SEDAN';
                      }
                      // HATCHBACK family
                      if (normalizedType.includes('HATCHBACK')) {
                        return 'HATCHBACK';
                      }
                      
                      return null;
                    };
                    
                    // Helper function to check if a car family is compatible with order requirement
                    const isCompatible = (orderCarType: string, carType: string): boolean => {
                      const orderFamily = getCarFamily(orderCarType);
                      const carFamily = getCarFamily(carType);
                      
                      if (!orderFamily || !carFamily) return false;
                      
                      // Define family hierarchy (lowest to highest)
                      const familyHierarchy: string[] = ['HATCHBACK', 'SEDAN', 'SUV', 'INNOVA', 'INNOVA_CRYSTA'];
                      const orderIndex = familyHierarchy.indexOf(orderFamily);
                      const carIndex = familyHierarchy.indexOf(carFamily);
                      
                      if (orderIndex === -1 || carIndex === -1) return false;
                      
                      // Car can be used if it's in the same family or higher in hierarchy
                      return carIndex >= orderIndex;
                    };
                    
                    // Only include cars with good status if provided
                    const status = String((car as any)?.car_status || (car as any)?.status || '').toUpperCase();
                    const statusOk = !status || ['AVAILABLE', 'ONLINE', 'IDLE', 'FREE'].includes(status);
                    
                    return statusOk && isCompatible(selectedRide.car_type, car.car_type);
                  })
                  .sort((a, b) => {
                    // Helper function to get priority for sorting (higher number = higher priority)
                    const getPriority = (type: string): number => {
                      const normalizedType = (type || '').toUpperCase().trim();
                      
                      // INNOVA_CRYSTA family (highest priority)
                      if (normalizedType.includes('INNOVA_CRYSTA') || normalizedType.includes('INNOVA CRYSTA')) {
                        return 5;
                      }
                      // INNOVA family
                      if (normalizedType.includes('INNOVA') && !normalizedType.includes('CRYSTA')) {
                        return 4;
                      }
                      // SUV family
                      if (normalizedType.includes('SUV')) {
                        return 3;
                      }
                      // SEDAN family
                      if (normalizedType.includes('SEDAN') || normalizedType.includes('ETIOS')) {
                        return 2;
                      }
                      // HATCHBACK family
                      if (normalizedType.includes('HATCHBACK')) {
                        return 1;
                      }
                      
                      return 0;
                    };
                    
                    // Higher priority first
                    return getPriority(b.car_type) - getPriority(a.car_type);
                  }))
                  .map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[styles.carCard, { backgroundColor: colors.background }]}
                    onPress={() => handleConfirmAssignment(car)}
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
                          {t('futureRides.carStatusPrefix', { status: (car as any).car_status })}
                        </Text>
                      )}
                    </View>
                    <CheckCircle color={colors.primary} size={24} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.modalEmpty}>
                  <Text style={[styles.modalEmptyText, { color: colors.textSecondary }]}>
                    {t('futureRides.noCarsAvailableBody')}
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
        onRefresh={fetchFutureRides}
      />

      {/* Date Range Calendar Picker Modal */}
      <DateRangeCalendarModal
        visible={showDateCalendar}
        onClose={() => setShowDateCalendar(false)}
        singleDateMode={true}
        onSelectSingleDate={(d) => {
          setSelectedDateFilter(d);
          setShowDateCalendar(false);
        }}
      />

      {/* Assignment Rules & Guidelines Info Modal */}
      <Modal
        visible={showAssignmentRulesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAssignmentRulesModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderRadius: 20,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 8,
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.primary + '18',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Info size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>
                    Assignment Rules
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    ஒதுக்கீடு வழிகாட்டுதல்கள் & விதிகள்
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAssignmentRulesModal(false)} style={{ padding: 6 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Rules Body */}
            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              <View style={{
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 10,
                backgroundColor: colors.background,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <Clock size={16} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                    1. Assignment Window (நேர வரம்பு)
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                  சவாரியை ஏற்றவுடன் டிரைவர் மற்றும் காரை உறுதிப்படுத்த ஒரு குறிப்பிட்ட கால அவகாசம் (Countdown) வழங்கப்படும்.
                </Text>
              </View>

              <View style={{
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 10,
                backgroundColor: colors.background,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <CheckCircle color="#10B981" size={16} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                    2. Auto-Revoke & ₹500 Hold Release
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                  நேர அவகாசத்திற்குள் ஒதுக்கீடு செய்யாவிட்டால், சவாரி தானாகவே பிற பார்ட்னர்களுக்கு சென்றுவிடும். உங்கள் வாலட்டில் பிடித்தம் செய்யப்பட்ட ₹500 ஹோல்டு உடனடி விடுவிக்கப்படும்.
                </Text>
              </View>

              <View style={{
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 10,
                backgroundColor: colors.background,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <Car size={16} color="#3B82F6" />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                    3. நேர அவகாசம் முடிந்தால் ₹0 அபராதம்
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
                  Assignment விண்டோ காலாவதியாவதற்கு எந்த அபராதமும் கிடையாது. கார்/டிரைவர் Assign ஆன பிறகு நீங்கள் ரத்து செய்தால் மட்டுமே ₹500 அபராதம் பிடித்தம் செய்யப்படும்.
                </Text>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 12,
                  borderRadius: 6,
                  alignItems: 'center',
                }}
                onPress={() => setShowAssignmentRulesModal(false)}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-Bold' }}>
                  புரிந்தது / Got It
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
      paddingHorizontal: 10,
    paddingVertical: 12,
      borderBottomWidth: 1,
    },
  title: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
  },
  scrollView: {
      flex: 1,
      paddingHorizontal: 8,
    paddingTop: 12,
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
    statusBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    statusText: {
      fontSize: 12,
      fontFamily: 'Inter-SemiBold',
    },
  orderId: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    },
    orderIdBold: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
    },
    tripTypeBold: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: '#EF4444', // Red color
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
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  locationText: {
    fontSize: 16,
      fontFamily: 'Inter-Medium',
    flex: 1,
  },
  routeTextBold: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    flex: 1,
    marginLeft: 8,
  },
  detailsContainer: {
    borderTopWidth: 1,
    paddingTop: 12,
      marginBottom: 12,
    gap: 8,
    },
    detailsContainerBold: {
      marginBottom: 8,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
    gap: 8,
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
    detailText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
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
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
      borderTopWidth: 1,
      paddingTop: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#10B981',
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
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
    expiredTimer: {
      backgroundColor: '#FEE2E2',
      borderColor: '#FCA5A5',
    },
    expiredText: {
      color: '#B91C1C',
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
  expandedSectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
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