import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Linking,
  Alert,
  Image,
  Switch,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  Car,
  User,
  Phone,
  IndianRupee,
  ShieldCheck,
  CheckCircle,
  FileText,
  Star,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react-native';
import CallButton from './CallButton';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { formatBookingId, formatCarType, formatKmLimitAndHours } from '@/utils/format';
import { fareBreakdown } from '@/utils/fareBreakdown';
import axiosInstance from '@/app/api/axiosInstance';
import axiosDriver from '@/app/api/axiosDriver';
import {
  fetchAvailableDrivers,
  assignCarDriverToOrder,
  cancelAssignment,
  AvailableDriver,
  AvailableCar,
} from '@/services/orders/assignmentService';

interface BookingDetailModalProps {
  visible: boolean;
  onClose: () => void;
  booking: any; // Can be RideData, FutureRideView, PendingOrderView, etc.
  onRefresh?: () => void;
  // 'owner' (default) is the fleet-owner's own order book - full vendor-style
  // management (re-fetch the vendor detail endpoint, assign/reassign cab &
  // driver). 'driver' is a trusted driver viewing a booking THEY posted for
  // another driver to run (My Trips > Post Booking) - they have no fleet
  // owner session and the backend's assign-car-driver endpoint is itself
  // owner-only (checks assignment.vehicle_owner_id against the caller's own
  // vehicle_owner_id - a plain driver can never pass that), so this mode
  // skips the owner-only detail re-fetch (the booking prop already carries
  // everything from /driver/assigned-orders) and shows assignment as
  // read-only instead of offering an Assign/Change button that would only
  // ever fail for them. Added 2026-09-05 - driver posting shouldn't inherit
  // the full vendor management surface, just enough to understand the trip.
  viewerRole?: 'owner' | 'driver';
}

export default function BookingDetailModal({
  visible,
  onClose,
  booking,
  onRefresh,
  viewerRole = 'owner',
}: BookingDetailModalProps) {
  const { colors } = useTheme();
  const [detailData, setDetailData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Driver / Car assignment picker state
  const [showAssignFlow, setShowAssignFlow] = useState(false);
  const [assignStep, setAssignStep] = useState<'driver' | 'car'>('driver');
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([]);
  const [availableCars, setAvailableCars] = useState<AvailableCar[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<AvailableDriver | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [custVisibleOverride, setCustVisibleOverride] = useState<boolean | null>(null);
  const [custSwitchBusy, setCustSwitchBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [advanceInput, setAdvanceInput] = useState<string | null>(null);
  const [advanceSaving, setAdvanceSaving] = useState(false);

  const orderId = booking?.order_id || booking?.id;

  // Fetch complete details when modal opens
  useEffect(() => {
    if (visible && orderId) {
      fetchFullOrderDetails();
    } else {
      setDetailData(null);
      setShowAssignFlow(false);
    }
  }, [visible, orderId]);

  const fetchFullOrderDetails = async () => {
    if (!orderId) return;
    // A driver-poster has no fleet owner session, so this owner-only detail
    // endpoint would only ever 401 for them - skip it and use the booking
    // object /driver/assigned-orders already returned (it carries the same
    // fare/customer/assignment fields this modal needs).
    if (viewerRole === 'driver') {
      setDetailData(booking);
      return;
    }
    setLoading(true);
    try {
      // /orders/vendor/{id} is a VENDOR-only route (Depends(get_current_vendor)
      // on the backend) - a fleet owner's own token will ALWAYS 401 against
      // it (there's no owner-scoped single-order-detail endpoint to call
      // instead), 100% of the time, for every owner viewing any booking's
      // detail. That's an expected, by-design miss here, not a real session
      // problem - marked silentAuthCheck so the shared axios interceptor
      // doesn't treat this route mismatch as the owner's OWN session
      // expiring (it isn't - the code already falls back to the booking
      // prop right below). Found 2026-09-05 live-reproducing "click any
      // trip card -> Session Expired" on the owner side.
      const res = await axiosInstance.get(`/api/orders/vendor/${orderId}`, { silentAuthCheck: true } as any);
      if (res.data) {
        setDetailData(res.data);
      } else {
        setDetailData(booking);
      }
    } catch {
      // If vendor detail endpoint isn't available for this user type, use booking object directly
      setDetailData(booking);
    } finally {
      setLoading(false);
    }
  };

  const activeData = detailData || booking || {};

  // Normalize fields across API responses
  const pickupCity =
    activeData.pickup_city ||
    activeData.pickup_location ||
    activeData.pickup ||
    (activeData.pickup_drop_location ? Object.values(activeData.pickup_drop_location)[0] : '') ||
    'Pickup Location';

  const dropCity =
    activeData.drop_city ||
    activeData.drop_location ||
    activeData.drop ||
    (activeData.pickup_drop_location ? Object.values(activeData.pickup_drop_location)[1] : '') ||
    'Drop Location';

  const tripType = activeData.trip_type || 'Oneway';
  const carType = activeData.car_type || 'Sedan';
  const distance = activeData.trip_distance || activeData.distance || 0;
  const duration = activeData.trip_time || '';
  const startDateTime = activeData.start_date_time || activeData.created_at || '';
  const totalAmount = activeData.total_amount || activeData.vendor_price || activeData.estimated_price || 0;

  // Assignment details
  const driverName =
    activeData.driver?.full_name ||
    activeData.assigned_driver_name ||
    activeData.driver_name ||
    activeData.driver_full_name ||
    activeData.assignment?.driver_name ||
    activeData.vendor_name ||
    activeData.user?.full_name ||
    '';
  const driverPhone =
    activeData.driver?.primary_number ||
    activeData.assigned_driver_phone ||
    activeData.driver_phone ||
    activeData.driver_primary_number ||
    activeData.assignment?.driver_phone ||
    activeData.vendor_phone ||
    activeData.user?.primary_number ||
    '';
  const carName =
    activeData.car?.car_name ||
    activeData.assigned_car_name ||
    activeData.car_name ||
    activeData.vehicle_name ||
    activeData.assignment?.car_name ||
    (carType ? `${formatCarType(carType)}` : '');
  const carNumber =
    activeData.car?.car_number ||
    activeData.assigned_car_number ||
    activeData.car_number ||
    activeData.vehicle_number ||
    activeData.assignment?.car_number ||
    '';

  const isAssigned = Boolean(
    activeData.driver_id ||
      activeData.car_id ||
      driverName ||
      carName ||
      activeData.assignment_status === 'ASSIGNED' ||
      activeData.assignment_status === 'DRIVING' ||
      activeData.assignment_status === 'COMPLETED'
  );

  const assignmentStatus = (activeData.assignment_status || activeData.status || '').toUpperCase();
  const tripStatus = (activeData.trip_status || '').toUpperCase();

  // --- Bookings THIS user posted (My Trips): same lifecycle a vendor sees ---
  const isPosted = !!activeData.posted;
  const postedCancelled = isPosted && (tripStatus === 'CANCELLED' || assignmentStatus === 'CANCELLED');
  const postedStage =
    assignmentStatus === 'COMPLETED' || tripStatus === 'COMPLETED' ? 4
    : assignmentStatus === 'DRIVING' ? 3
    : assignmentStatus === 'ASSIGNED' ? 2
    : assignmentStatus === 'ACCEPTED' ? 1
    : 0;
  const postedSteps = [
    'Booking posted',
    'Accepted by a driver',
    'Driver & car assigned',
    'Trip started',
    'Trip completed',
  ].map((label, idx) => ({ label, done: idx < postedStage || postedStage === 4, current: idx === postedStage && postedStage < 4 }));
  const cancelledByUpper = String(activeData.cancelled_by || '').toUpperCase();
  const postedCancelReason =
    cancelledByUpper.includes('ADMIN') ? ' by Drop Cars admin'
    : cancelledByUpper.includes('CUSTOMER') ? ' by the customer'
    : cancelledByUpper.includes('AUTO') ? ' automatically - no driver was assigned in time'
    : cancelledByUpper ? ' by you' : '';
  const liveLat = activeData.last_lat;
  const liveLng = activeData.last_lng;
  const liveAgeMin = activeData.last_location_at
    ? Math.max(0, Math.round((Date.now() - new Date(activeData.last_location_at).getTime()) / 60000))
    : null;

  let statusLabel = 'Pending';
  let statusBg = '#FEF3C7';
  let statusColor = '#D97706';

  if (tripStatus === 'COMPLETED' || assignmentStatus === 'COMPLETED') {
    statusLabel = 'Completed';
    statusBg = '#D1FAE5';
    statusColor = '#059669';
  } else if (assignmentStatus === 'DRIVING' || tripStatus === 'STARTED') {
    statusLabel = 'Running';
    statusBg = '#DBEAFE';
    statusColor = '#2563EB';
  } else if (assignmentStatus === 'CANCELLED' || tripStatus === 'CANCELLED') {
    statusLabel = 'Cancelled';
    statusBg = '#FEE2E2';
    statusColor = '#DC2626';
  } else if (isAssigned) {
    statusLabel = 'Assigned';
    statusBg = '#E0E7FF';
    statusColor = '#4F46E5';
  } else {
    statusLabel = 'Unassigned';
    statusBg = '#F3F4F6';
    statusColor = '#6B7280';
  }

  // Financial itemized breakdown values
  const costPerKm = activeData.cost_per_km || activeData.per_km_price || activeData.price_per_km || 0;
  const driverAllowance = activeData.driver_allowance || 0;
  const permitCharges = activeData.permit_charges || activeData.permit_charge || 0;
  const hillCharges = activeData.hill_charges || activeData.hills_charge || 0;
  const tollCharges = activeData.toll_charges || activeData.toll_charge || 0;
  const waitingCharge = activeData.waiting_charge || activeData.waiting_charges || 0;
  const nightCharges = activeData.night_charges || activeData.night_charge || 0;
  const advanceAmount = activeData.advance_amount || activeData.advance_received || 0;
  const vendorPrice = activeData.vendor_price || activeData.closed_vendor_price || totalAmount;
  const driverPrice = activeData.driver_price || activeData.closed_driver_price || 0;

  // End record / Odometer info
  const endRecord = activeData.end_record || (activeData.start_odometer_photo || activeData.end_odometer_photo
    ? { img_url: activeData.start_odometer_photo, close_speedometer_image: activeData.end_odometer_photo, cash_collection: activeData.cash_collection }
    : null);
  const startKm = endRecord?.start_km || activeData.start_km || null;
  const endKm = endRecord?.end_km || activeData.end_km || null;
  const speedometerImg = endRecord?.img_url || endRecord?.close_speedometer_image || activeData.speedometer_img || null;
  const startOdoPhoto: string | null = endRecord?.img_url || activeData.speedometer_img || null;
  const endOdoPhoto: string | null = endRecord?.close_speedometer_image || null;

  // Start assign flow
  const handleStartAssign = async () => {
    setAssignLoading(true);
    setAssignStep('driver');
    setSelectedDriver(null);
    try {
      const drivers = await fetchAvailableDrivers();
      let cars: AvailableCar[] = [];
      try {
        const carsApi = await axiosInstance.get('/api/assignments/available-cars', { noCache: true } as any);
        cars = carsApi?.data || [];
      } catch {
        cars = [];
      }
      setAvailableDrivers(drivers || []);
      setAvailableCars(cars || []);
      setShowAssignFlow(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not fetch drivers or cabs for assignment.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleSelectDriver = (driver: AvailableDriver) => {
    setSelectedDriver(driver);
    setAssignStep('car');
  };

  const handleConfirmAssignment = async (car: AvailableCar) => {
    if (!selectedDriver) return;
    setAssignLoading(true);
    try {
      const targetAssignmentId = activeData.assignment_id || activeData.id || orderId;
      await assignCarDriverToOrder(targetAssignmentId, selectedDriver.id, car.id);
      Alert.alert('Success', `Driver ${selectedDriver.full_name} and Vehicle ${car.car_name} assigned successfully.`);
      setShowAssignFlow(false);
      fetchFullOrderDetails();
      if (onRefresh) onRefresh();
    } catch (e: any) {
      Alert.alert('Assignment Error', e.response?.data?.detail || e.message || 'Failed to assign cab and driver.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCancelBooking = () => {
    const targetAssignmentId = activeData.assignment_id || activeData.id;
    if (!targetAssignmentId) {
      Alert.alert('Cannot Cancel', 'No active assignment found for this booking.');
      return;
    }
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking? If the trip has already started, a cancellation penalty will apply.',
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const result = await cancelAssignment(targetAssignmentId);
              Alert.alert('Booking Cancelled', result?.message || 'The booking has been cancelled.');
              fetchFullOrderDetails();
              if (onRefresh) onRefresh();
              onClose();
            } catch (e: any) {
              Alert.alert('Cancellation Failed', e.response?.data?.detail || e.message || 'Could not cancel this booking. Please try again.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border, paddingRight: 8 }]}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <View style={[styles.headerTitleRow, { alignItems: 'center', flexWrap: 'wrap', gap: 6 }]}>
                <Text style={[styles.bookingIdText, { color: colors.text }]}>
                  {formatBookingId(orderId)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
              <Text style={[styles.tripTypeTag, { color: colors.textSecondary, marginTop: 4 }]}>
                {tripType} • {formatCarType(carType)}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter-Bold', marginTop: 3 }}>{fareBreakdown(activeData).typeLabel}</Text>
              {!!fareBreakdown(activeData).line && (
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 1 }}>{fareBreakdown(activeData).line}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { alignSelf: 'flex-start', padding: 4 }]} activeOpacity={0.7}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading complete booking details...
              </Text>
            </View>
          ) : showAssignFlow ? (
            /* Integrated Assignment Flow UI */
            <View style={{ flex: 1, padding: 16 }}>
              <View style={styles.assignHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
                  {assignStep === 'driver' ? 'Select Driver' : `Select Vehicle for ${selectedDriver?.full_name}`}
                </Text>
                <TouchableOpacity onPress={() => setShowAssignFlow(false)}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, marginTop: 10 }}>
                {assignLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
                ) : assignStep === 'driver' ? (
                  availableDrivers.length > 0 ? (
                    availableDrivers.map((driver) => (
                      <TouchableOpacity
                        key={driver.id}
                        style={[styles.pickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => handleSelectDriver(driver)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerTitle, { color: colors.text }]}>{driver.full_name}</Text>
                          <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{driver.primary_number}</Text>
                        </View>
                        <ChevronRight size={20} color={colors.primary} />
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No available drivers found. Add a driver first in My Drivers.
                    </Text>
                  )
                ) : availableCars.length > 0 ? (
                  availableCars.map((car) => (
                    <TouchableOpacity
                      key={car.id}
                      style={[styles.pickerCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => handleConfirmAssignment(car)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerTitle, { color: colors.text }]}>{car.car_name}</Text>
                        <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{car.car_number} • {car.car_type}</Text>
                      </View>
                      <CheckCircle size={20} color="#10B981" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No available vehicles found. Add a car first in My Cabs.
                  </Text>
                )}
              </ScrollView>
            </View>
          ) : (
            /* Main Comprehensive Detail Content */
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Chat with the other side of this booking (opens once a driver has accepted it) */}
              {((isPosted && !!activeData.accepted) || !isPosted) && statusLabel !== 'Cancelled' && statusLabel !== 'Completed' && (
                <TouchableOpacity
                  style={[styles.sectionBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/chat/[orderId]', params: { orderId: String(activeData.order_id || activeData.id) } } as any);
                  }}
                >
                  <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 14 }}>💬 Chat about this booking</Text>
                </TouchableOpacity>
              )}

              {/* Why this booking was cancelled / removed - whoever cancelled gave a reason */}
              {(statusLabel === 'Cancelled' || !!activeData.unallocated_kind || !!activeData.request_status) && (
                <View style={[styles.sectionBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                  <Text style={[styles.sectionTitle, { color: '#B91C1C' }]}>
                    {activeData.request_status ? 'Car request' : activeData.unallocated_kind ? 'Removed with penalty' : 'Cancelled'}
                  </Text>
                  <Text style={{ color: '#991B1B', fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 19 }}>
                    {activeData.request_status
                      ? (activeData.request_status === 'REJECTED' ? 'Admin rejected your request to use a different car.' : 'Waiting for Drop Cars admin to review your request to use a different car.')
                      : activeData.unallocated_kind === 'AUTO_CANCELLED' ? 'Auto-cancelled: no driver & car were assigned in time.'
                      : activeData.unallocated_kind === 'DITCHED' ? 'You cancelled this accepted booking.'
                      : activeData.unallocated_kind === 'REMOVED' ? 'Drop Cars admin removed this booking from you.'
                      : cancelledByUpper.includes('ADMIN') ? 'Cancelled by Drop Cars admin.'
                      : cancelledByUpper.includes('CUSTOMER') ? 'Cancelled by the customer.'
                      : cancelledByUpper.includes('VENDOR') ? (isPosted ? 'Cancelled by you.' : 'Cancelled by the booking owner.')
                      : 'This booking was cancelled.'}
                  </Text>
                  {!!(activeData.cancel_note || activeData.admin_notes) && (
                    <Text style={{ color: '#7F1D1D', fontFamily: 'Inter-Medium', fontSize: 13, marginTop: 6, lineHeight: 19 }}>
                      Reason: {activeData.cancel_note || activeData.admin_notes}
                    </Text>
                  )}
                </View>
              )}

              {/* Live status of a booking you posted */}
              {isPosted && (
                <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Live Status</Text>
                  {postedCancelled ? (
                    <Text style={{ color: '#DC2626', fontFamily: 'Inter-Bold', fontSize: 13 }}>
                      🚫 Cancelled{postedCancelReason}
                    </Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {postedSteps.map((s) => (
                        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 14 }}>{s.done ? '✅' : s.current ? '🟡' : '⚪'}</Text>
                          <Text
                            style={{
                              color: s.done || s.current ? colors.text : colors.textSecondary,
                              fontFamily: s.current ? 'Inter-Bold' : 'Inter-Medium',
                              fontSize: 13,
                            }}
                          >
                            {s.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {!postedCancelled && !!liveLat && !!liveLng && postedStage >= 2 && postedStage < 4 && (
                    <TouchableOpacity
                      style={[styles.callBtn, { alignSelf: 'flex-start', marginTop: 10 }]}
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${liveLat},${liveLng}`)}
                    >
                      <Text style={styles.callBtnText}>
                        📍 Live location{liveAgeMin != null ? ` (updated ${liveAgeMin < 1 ? 'just now' : `${liveAgeMin} min ago`})` : ''} - open in Maps
                      </Text>
                    </TouchableOpacity>
                  )}
                  {postedStage === 4 && (activeData.final_amount != null || activeData.total_km != null) && (
                    <View style={{ marginTop: 10, gap: 2 }}>
                      {activeData.final_amount != null && (
                        <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>Final amount: ₹{activeData.final_amount}</Text>
                      )}
                      {activeData.total_km != null && (
                        <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>Total distance: {activeData.total_km} km</Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Manual "Show customer number to the driver" switch - for bookings you posted (the number
                  also opens up automatically before pickup) */}
              {isPosted && !postedCancelled && postedStage < 4 && (
                <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>Show customer number to driver</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                        Hidden until a few hours before pickup. Turn on to show it to the driver now.
                      </Text>
                    </View>
                    <Switch
                      value={custVisibleOverride ?? !!activeData.customer_number_visible}
                      disabled={custSwitchBusy}
                      onValueChange={async (next) => {
                        setCustSwitchBusy(true);
                        try {
                          await axiosDriver.post(`/api/assignments/driver/posted-bookings/${activeData.order_id || activeData.id}/customer-number`, { show: next });
                          setCustVisibleOverride(next);
                        } catch (e: any) {
                          const d = e?.response?.data?.detail;
                          Alert.alert('Could not change', typeof d === 'string' ? d : 'Please try again.');
                        } finally {
                          setCustSwitchBusy(false);
                        }
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Manual "Notify drivers" alarm for a booking you posted - the one automatic push at posting
                  time is easy to miss. It can be pressed any time. */}
              {isPosted && !postedCancelled && postedStage < 4 && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 13, marginBottom: 12, opacity: notifyBusy ? 0.7 : 1 }}
                  disabled={notifyBusy}
                  activeOpacity={0.85}
                  onPress={async () => {
                    setNotifyBusy(true);
                    try {
                      const res = await axiosDriver.post(`/api/assignments/driver/posted-bookings/${activeData.order_id || activeData.id}/notify`, {});
                      const count = res?.data?.detail?.count;
                      Alert.alert('Drivers alerted', count ? `Alert sent to ${count} driver${count === 1 ? '' : 's'}.` : 'The alert was sent again.');
                    } catch (e: any) {
                      const d = e?.response?.data?.detail;
                      Alert.alert('Could not notify', typeof d === 'string' ? d : 'Please try again.');
                    } finally {
                      setNotifyBusy(false);
                    }
                  }}
                >
                  {notifyBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14.5 }}>{notifyBusy ? 'Alerting drivers...' : '🔔 Notify drivers again'}</Text>
                </TouchableOpacity>
              )}

              {/* After accepting: exactly what to collect from the customer (never shown before accept for all-inclusive) */}
              {!isPosted && activeData.collect_from_customer != null && statusLabel !== 'Cancelled' && statusLabel !== 'Completed' && (
                <View style={[styles.sectionBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10B981' }]}>
                  <Text style={[styles.sectionTitle, { color: '#065F46' }]}>Collect from the customer</Text>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter-Bold', color: '#059669' }}>₹{activeData.collect_from_customer}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                    Customer pays ₹{activeData.customer_total}
                    {Number(activeData.advance_received) > 0 ? ` - ₹${activeData.advance_received} advance already paid to the booking owner` : ''}.
                    Items marked "not included" (toll, state tax, parking...) are collected on top and entered when you close the trip.
                  </Text>
                </View>
              )}

              {/* Advance received - the poster can change it until a driver accepts; after that only Drop Cars admin can */}
              {isPosted && !postedCancelled && postedStage < 4 && (
                <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Advance received</Text>
                  {activeData.accepted ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                      ₹{Number(activeData.advance_received || 0)} - a driver has accepted this booking, so only Drop Cars admin can change the advance now.
                    </Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Inter-Bold' }}>₹</Text>
                        <TextInput
                          value={advanceInput ?? String(Number(activeData.advance_received || 0))}
                          onChangeText={(v) => setAdvanceInput(v.replace(/[^0-9]/g, ''))}
                          keyboardType="numeric"
                          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface }}
                        />
                        <TouchableOpacity
                          disabled={advanceSaving || advanceInput === null}
                          style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, opacity: advanceSaving || advanceInput === null ? 0.5 : 1 }}
                          onPress={async () => {
                            setAdvanceSaving(true);
                            try {
                              await axiosDriver.put(`/api/assignments/orders/${activeData.order_id || activeData.id}/advance-received`, { advance_received: parseInt(advanceInput || '0', 10) || 0 });
                              Alert.alert('Saved', 'Advance updated.');
                              onRefresh?.();
                            } catch (e: any) {
                              const d = e?.response?.data?.detail;
                              Alert.alert('Could not update', typeof d === 'string' ? d : 'Please try again.');
                            } finally {
                              setAdvanceSaving(false);
                            }
                          }}
                        >
                          {advanceSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>Save</Text>}
                        </TouchableOpacity>
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                        Your wallet holds this amount (not charged) and returns it when the trip completes or you cancel.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Route Card */}
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.routeItem}>
                  <MapPin size={18} color="#10B981" />
                  <View style={styles.routeInfo}>
                    <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>Pickup Location</Text>
                    <Text style={[styles.routeValue, { color: colors.text }]}>{pickupCity}</Text>
                  </View>
                </View>
                <View style={styles.routeDivider} />
                <View style={styles.routeItem}>
                  <MapPin size={18} color="#EF4444" />
                  <View style={styles.routeInfo}>
                    <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>Drop Location</Text>
                    <Text style={[styles.routeValue, { color: colors.text }]}>{dropCity}</Text>
                  </View>
                </View>

                {!!startDateTime && (
                  <View style={styles.timeDistanceRow}>
                    <View style={styles.timeItem}>
                      <Calendar size={14} color={colors.primary} />
                      <Text style={[styles.timeText, { color: colors.text }]}>{startDateTime}</Text>
                    </View>
                    {!!distance && (
                      <View style={styles.timeItem}>
                        <Clock size={14} color={colors.primary} />
                        <Text style={[styles.timeText, { color: colors.text }]}>
                          {distance} km {duration ? `• ${duration}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {(() => {
                  const n = String(activeData.pickup_notes || '').trim();
                  if (!n || n.toUpperCase() === 'NILL' || n.toLowerCase() === 'null') return null;
                  return (
                    <View style={styles.notesBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <AlertTriangle size={14} color="#EF4444" />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#EF4444', textTransform: 'uppercase' }}>
                          Pickup Notes / Driver Instructions:
                        </Text>
                      </View>
                      <Text style={styles.notesText}>{n}</Text>
                    </View>
                  );
                })()}
              </View>

              {/* Customer Information & Timed Phone Unveiling */}
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Details</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <User size={16} color={colors.primary} />
                    <Text style={{ flexShrink: 1, fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>
                      {activeData.customer_name || 'Valued Customer'}
                    </Text>
                  </View>
                </View>

                {!!activeData.customer_number_notice && (
                  <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 6 }}>
                    {activeData.customer_number_notice}
                  </Text>
                )}

                {/* This modal is only ever shown to the fleet owner viewing
                    their own order book, or a trusted driver viewing a
                    booking they posted themselves (see viewerRole doc
                    above) - neither needs the customer number masked from
                    them, and the backend endpoints feeding this modal
                    (/orders/vehicle-owner/pending, /non-pending) already
                    send the real number unmasked regardless. This used to
                    render a client-side-only fake lock/countdown here that
                    didn't match the backend's real reveal-hours rule and
                    didn't actually hide anything (the raw number was
                    already in activeData) - false security theatre.
                    The real masking (phone_reveal_hours_before_pickup) is
                    enforced server-side for the one place it actually
                    matters: a driver's own /assigned-orders list. */}
                {!!(activeData.customer_mobile || activeData.customer_number) && (
                  <View style={{ marginTop: 6 }}>
                    <CallButton
                      phoneNumber={activeData.customer_mobile || activeData.customer_number}
                      recipientName={activeData.customer_name || 'Customer'}
                      label="Call Customer"
                    />
                  </View>
                )}
              </View>

              {/* Total Amount Banner */}
              <View style={styles.amountBanner}>
                <Text style={styles.amountBannerLabel}>Total Booking Amount</Text>
                <Text style={styles.amountBannerValue}>₹ {totalAmount}</Text>
              </View>

              {/* Driver & Vehicle Information */}
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Assigned Cab & Driver</Text>
                {isAssigned ? (
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <User size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Driver</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{driverName || 'Assigned Driver'}</Text>
                        {!!driverPhone && (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`tel:${driverPhone}`)}
                            style={styles.callBtn}
                          >
                            <Phone size={12} color="#2563EB" />
                            <Text style={styles.callBtnText}>{driverPhone}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <View style={styles.infoItem}>
                      <Car size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Vehicle</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{carName || 'Assigned Vehicle'}</Text>
                        {!!carNumber && (
                          <Text style={[styles.infoSub, { color: colors.textSecondary }]}>{carNumber}</Text>
                        )}
                      </View>
                    </View>

                    {/* Start/End OTPs if available */}
                    {/* Only the one who POSTED the booking sees the codes (to read them to the customer). The driver / accepting owner
                        must ask the customer for them - showing them here let a trip start without the customer. */}
                    {isPosted && !!activeData.start_trip_otp && (
                      <View style={styles.otpRow}>
                        <Text style={[styles.otpLabel, { color: colors.textSecondary }]}>Start OTP:</Text>
                        <Text style={[styles.otpValue, { color: colors.primary }]}>
                          {activeData.start_trip_otp}
                        </Text>
                      </View>
                    )}
                    {isPosted && !!activeData.end_trip_otp && (
                      <View style={styles.otpRow}>
                        <Text style={[styles.otpLabel, { color: colors.textSecondary }]}>End OTP:</Text>
                        <Text style={[styles.otpValue, { color: colors.primary }]}>{activeData.end_trip_otp}</Text>
                      </View>
                    )}
                    {isPosted && !!(activeData.start_trip_otp || activeData.end_trip_otp) && (
                      <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
                        Share these codes with your customer - the driver will ask the customer for them to start and to end the trip.
                      </Text>
                    )}

                    {/* Odometer Readings & Speedometer Photos */}
                    {(startKm != null || endKm != null) && (
                      <View style={styles.odoBox}>
                        {startKm != null && (
                          <Text style={[styles.odoText, { color: colors.text }]}>Start KM: {startKm}</Text>
                        )}
                        {endKm != null && (
                          <Text style={[styles.odoText, { color: colors.text }]}>End KM: {endKm}</Text>
                        )}
                      </View>
                    )}

                    {[
                      { label: 'Start odometer photo', uri: startOdoPhoto },
                      { label: 'End odometer photo', uri: endOdoPhoto },
                    ].filter((p) => !!p.uri && (p.label.startsWith('Start') || p.uri !== startOdoPhoto)).map((p) => (
                      <TouchableOpacity
                        key={p.label}
                        style={styles.imgPreviewBox}
                        onPress={() => Linking.openURL(p.uri as string)}
                      >
                        <Image source={{ uri: p.uri as string }} style={styles.speedometerThumbnail} />
                        <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter-SemiBold' }}>
                          {p.label} →
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {endRecord?.cash_collection != null && (
                      <Text style={[styles.odoText, { color: colors.text, marginTop: 6 }]}>Cash collected: ₹{endRecord.cash_collection}</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.unassignedBox}>
                    <Text style={[styles.unassignedText, { color: colors.textSecondary }]}>
                      {isPosted
                        ? (activeData.accepted ? 'A driver has accepted this booking - waiting for them to assign a cab & driver.' : 'Waiting for a driver to accept this booking.')
                        : viewerRole === 'driver'
                          ? 'Waiting for your fleet owner to assign a cab & driver.'
                          : 'No driver & vehicle assigned yet.'}
                    </Text>
                    {viewerRole === 'owner' && (
                      <TouchableOpacity style={styles.assignBtn} onPress={handleStartAssign}>
                        <Text style={styles.assignBtnText}>+ Assign Cab & Driver</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {viewerRole === 'owner' && isAssigned && statusLabel !== 'Completed' && statusLabel !== 'Cancelled' && (
                  <TouchableOpacity style={styles.reassignBtn} onPress={handleStartAssign}>
                    <Text style={styles.reassignBtnText}>Change Driver & Cab</Text>
                  </TouchableOpacity>
                )}

                {viewerRole === 'owner' && statusLabel !== 'Completed' && statusLabel !== 'Cancelled' && (
                  <TouchableOpacity
                    style={[styles.reassignBtn, { borderColor: '#EF4444', marginTop: 10 }]}
                    onPress={handleCancelBooking}
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Text style={[styles.reassignBtnText, { color: '#EF4444' }]}>Cancel Booking</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* COMPLETED trip: the FINAL numbers from what the duty driver recorded at trip end (actual km, final amount,
                  cash collected) - not the estimate the booking was posted with */}
              {statusLabel === 'Completed' && (() => {
                const planned = Number(activeData.planned_km ?? activeData.trip_distance ?? distance ?? 0);
                const actualKm = endRecord?.total_km ?? activeData.total_km ?? (startKm != null && endKm != null ? Number(endKm) - Number(startKm) : null);
                const finalTotal = activeData.final_amount ?? activeData.closed_vendor_price ?? null;
                const cashCollected = endRecord?.cash_collection ?? activeData.cash_collection ?? null;
                const extras: any[] = Array.isArray(endRecord?.extra_charges_collected) ? endRecord.extra_charges_collected : [];
                const driverEarned = activeData.final_driver_earnings;
                const posterShare = isPosted ? activeData.poster_share : activeData.final_poster_share;
                const platformFee = isPosted ? activeData.platform_fee : activeData.final_platform_fee;
                const Row = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.breakdownValue, { color: color || colors.text, fontFamily: bold ? 'Inter-Bold' : undefined }]}>{value}</Text>
                  </View>
                );
                return (
                  <View style={[styles.sectionBox, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: '#10B981' }]}>
                    <Text style={[styles.sectionTitle, { color: '#065F46' }]}>Completed Trip - Final Summary</Text>
                    <View style={styles.breakdownTable}>
                      <Row label="Distance planned" value={`${planned || '-'} km`} />
                      <Row label="Distance actually driven" value={actualKm != null ? `${actualKm} km${planned && actualKm != null && Number(actualKm) !== planned ? (Number(actualKm) > planned ? ` (+${Number(actualKm) - planned} km)` : ` (${Number(actualKm) - planned} km)`) : ''}` : '-'} bold />
                      {startKm != null && endKm != null && <Row label="Odometer start → end" value={`${startKm} → ${endKm}`} />}
                      {finalTotal != null && <Row label="Final trip amount (customer)" value={`₹ ${finalTotal}`} bold color="#059669" />}
                      {Number(advanceAmount) > 0 && <Row label="Advance received" value={`₹ ${advanceAmount}`} />}
                      <Row label="Cash collected from customer" value={cashCollected != null ? `₹ ${cashCollected}` : 'Not recorded'} bold color="#1D4ED8" />
                      {extras.map((c, i) => (
                        <Row key={`ex-${i}`} label={`Collected extra: ${c.label}`} value={`₹ ${c.amount}`} />
                      ))}
                      {posterShare != null && Number(posterShare) > 0 && <Row label={isPosted ? 'Your share (poster)' : 'Booking owner share / commission'} value={`₹ ${posterShare}`} />}
                      {platformFee != null && Number(platformFee) > 0 && <Row label="Platform fee" value={`₹ ${platformFee}`} />}
                      {!isPosted && driverEarned != null && <Row label="You earned" value={`₹ ${driverEarned}`} bold color="#059669" />}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 6, lineHeight: 17 }}>
                      Worked out from the kilometres and amounts recorded when the trip was closed.
                    </Text>
                  </View>
                );
              })()}

              {/* Complete A to Z Financial & Price Breakdown */}
              <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{statusLabel === 'Completed' ? 'Fare as posted (estimate)' : 'Fare Breakdown & Pricing'}</Text>

                <View style={styles.breakdownTable}>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Total Booking Amount</Text>
                    <Text style={[styles.breakdownValue, { color: '#10B981', fontFamily: 'Inter-Bold', fontSize: 15 }]}>
                      ₹ {totalAmount}
                    </Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Vendor Net Price</Text>
                    <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {vendorPrice}</Text>
                  </View>

                  {!!driverPrice && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Driver Share</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {driverPrice}</Text>
                    </View>
                  )}

                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Advance Received</Text>
                    <Text style={[styles.breakdownValue, { color: advanceAmount > 0 ? '#059669' : colors.textSecondary }]}>
                      ₹ {advanceAmount} {advanceAmount > 0 ? '(Received)' : '(Pending)'}
                    </Text>
                  </View>

                  {statusLabel !== 'Completed' && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Balance Due on Trip</Text>
                    <Text style={[styles.breakdownValue, { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
                      ₹ {Math.max(0, (totalAmount || vendorPrice) - advanceAmount)}
                    </Text>
                  </View>
                  )}

                  {/* Bold Cash to Collect Banner for Driver - only while the trip is still to be done */}
                  {statusLabel !== 'Completed' && (() => {
                    const extraAmt = activeData.extra_amount || 0;
                    const tot = totalAmount || vendorPrice || 0;
                    const cashToCollect = Math.max(0, (tot + extraAmt) - advanceAmount);
                    return (
                      <View style={{
                        backgroundColor: '#EFF6FF',
                        borderColor: '#2563EB',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        padding: 12,
                        marginVertical: 10,
                        alignItems: 'center',
                      }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          💵 Cash to Collect from Customer
                        </Text>
                        <Text style={{ fontSize: 22, fontFamily: 'Inter-Black', color: '#1E40AF', marginTop: 2 }}>
                          ₹ {cashToCollect}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#3B82F6', marginTop: 1 }}>
                          (Total: ₹{tot} + Extra: ₹{extraAmt} - Advance: ₹{advanceAmount})
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>KM & Hours Package</Text>
                    <Text style={[styles.breakdownValue, { color: colors.text }]}>
                      {formatKmLimitAndHours(distance, tripType).combined}
                    </Text>
                  </View>

                  {!!costPerKm && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Base Rate per km</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {costPerKm} / km</Text>
                    </View>
                  )}

                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Driver Bata (For Driver)</Text>
                    <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {driverAllowance || 400}</Text>
                  </View>

                  {!!activeData.extra_driver_allowance && Number(activeData.extra_driver_allowance) > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Extra Driver Allowance (Vendor)</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {activeData.extra_driver_allowance}</Text>
                    </View>
                  )}

                  {!!permitCharges && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Permit Charges</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {permitCharges}</Text>
                    </View>
                  )}

                  {!!hillCharges && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Hill Charges</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {hillCharges}</Text>
                    </View>
                  )}

                  {!!tollCharges && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Toll & Parking</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {tollCharges}</Text>
                    </View>
                  )}

                  {!!nightCharges && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Night Charges</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {nightCharges}</Text>
                    </View>
                  )}

                  {!!waitingCharge && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Waiting Charge</Text>
                      <Text style={[styles.breakdownValue, { color: colors.text }]}>₹ {waitingCharge}</Text>
                    </View>
                  )}
                </View>

                {/* Dedicated Driver-Facing Inclusions & Exclusions Breakdown */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.text, letterSpacing: 0.5, marginBottom: 8 }}>
                    TRIP INCLUSIONS & EXCLUSIONS
                  </Text>

                  {/* Included */}
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#059669', marginBottom: 4 }}>
                      ✅ INCLUDED IN FARE:
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                      • {distance ? `${distance} KM Limit Included` : 'Standard Distance Limit'}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                      • Driver Allowance / Bata {Number(driverAllowance) > 0 ? `(₹${driverAllowance})` : 'Included'}
                    </Text>
                    {(activeData.fare_type === 'ALL_INCLUSIVE' || (!activeData.toll_charge_update && Number(tollCharges) > 0)) && (
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Toll Charges Included {Number(tollCharges) > 0 ? `(₹${tollCharges})` : ''}
                      </Text>
                    )}
                    {(activeData.fare_type === 'ALL_INCLUSIVE' || Number(permitCharges) > 0) && (
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • State Permit Charges Included {Number(permitCharges) > 0 ? `(₹${permitCharges})` : ''}
                      </Text>
                    )}
                    {(activeData.fare_type === 'ALL_INCLUSIVE' || Number(hillCharges) > 0) && (
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Hill Charges Included {Number(hillCharges) > 0 ? `(₹${hillCharges})` : ''}
                      </Text>
                    )}
                    {(activeData.fare_type === 'ALL_INCLUSIVE' || Number(nightCharges) > 0) && (
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Night Allowance Included {Number(nightCharges) > 0 ? `(₹${nightCharges})` : ''}
                      </Text>
                    )}
                    {Number(waitingCharge) > 0 && (
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Waiting Hours Included ({waitingCharge} hrs)
                      </Text>
                    )}
                    {Boolean((activeData as any).gst_included || Number((activeData as any).gst_amount) > 0) && (
                      <Text style={{ fontSize: 11.5, color: '#059669', fontFamily: 'Inter-Bold', marginBottom: 3 }}>
                        • GST Included on KM Fare (Tax Paid by Company)
                      </Text>
                    )}
                  </View>

                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />

                  {/* Excluded */}
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#D97706', marginBottom: 4 }}>
                      ⚠️ EXCLUDED / PAYABLE EXTRA:
                    </Text>
                    {Boolean((activeData as any).gst_included || Number((activeData as any).gst_amount) > 0) && (
                      <Text style={{ fontSize: 11.5, color: '#059669', fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • GST: Already paid by company — do NOT collect GST from customer
                      </Text>
                    )}
                    <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                      • Extra KM Rate: {Number(costPerKm) > 0 ? `₹${costPerKm}/KM` : 'As per tariff'}{distance ? ` for distance driven beyond ${distance} KM` : ''}
                    </Text>
                    {activeData.fare_type !== 'ALL_INCLUSIVE' && (activeData.toll_charge_update || !Number(tollCharges)) && (
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Toll Charges: Pay at Toll Gate / Booth
                      </Text>
                    )}
                    {activeData.fare_type !== 'ALL_INCLUSIVE' && !Number(permitCharges) && (
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • State Permit Charges: Pay at Checkpost
                      </Text>
                    )}
                    {activeData.fare_type !== 'ALL_INCLUSIVE' && (
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Parking Charges
                      </Text>
                    )}
                    <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
                      • Extra Stop / Waiting Charges: Beyond scheduled trip route
                    </Text>
                  </View>
                </View>
              </View>

              {/* Customer Rating & Feedback */}
              {(activeData.rating || activeData.customer_feedback) && (
                <View style={[styles.sectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Feedback</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Star size={18} color="#EAB308" fill="#EAB308" />
                    <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>
                      {activeData.rating || '5.0'} / 5.0
                    </Text>
                  </View>
                  {!!activeData.customer_feedback && (
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Regular', color: colors.textSecondary, fontStyle: 'italic' }}>
                      "{activeData.customer_feedback}"
                    </Text>
                  )}
                </View>
              )}

              {/* Need Help Support Contact Button */}
              <View style={{ marginTop: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1.5,
                    borderColor: '#FCA5A5',
                    paddingVertical: 12,
                    borderRadius: 6,
                  }}
                  onPress={() => {
                    Alert.alert(
                      'Need Help?',
                      'Need assistance with this booking? You can contact Drop Cars Support Helpline directly.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Call Helpline (7200217986)', onPress: () => Linking.openURL('tel:7200217986') },
                      ]
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <HelpCircle size={18} color="#DC2626" />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: '#DC2626' }}>
                    Need Help / Contact Support
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    height: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  bookingIdText: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  tripTypeTag: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  sectionBox: {
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    marginBottom: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeDivider: {
    width: 2,
    height: 16,
    backgroundColor: '#D1D5DB',
    marginLeft: 8,
    marginVertical: 4,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  routeValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    marginTop: 1,
  },
  timeDistanceRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    rowGap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(156, 163, 175, 0.2)',
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  timeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 6,
    marginTop: 12,
  },
  notesText: {
    fontSize: 12,
    color: '#DC2626',
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  amountBanner: {
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  amountBannerLabel: {
    fontSize: 12,
    color: '#065F46',
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
  },
  amountBannerValue: {
    fontSize: 26,
    color: '#047857',
    fontFamily: 'Inter-Bold',
    marginTop: 2,
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  infoSub: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  callBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#2563EB',
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 8,
    borderRadius: 6,
  },
  otpLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  otpValue: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  odoBox: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  odoText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  imgPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  speedometerThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  unassignedBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  unassignedText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 10,
  },
  assignBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  assignBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  reassignBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  reassignBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  breakdownTable: {
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 10,
  },
  breakdownLabel: {
    fontSize: 13,
    flexShrink: 1,
    fontFamily: 'Inter-Regular',
  },
  breakdownValue: {
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: 'Inter-SemiBold',
  },
  assignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  pickerTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  pickerSub: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
