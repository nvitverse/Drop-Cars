import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  UserX,
  AlertTriangle,
  X,
  ShieldAlert,
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  User,
  Car,
  Calendar,
  Clock,
  IndianRupee,
  FileText,
  Share2,
  Navigation,
  Info,
  CreditCard,
  Repeat,
  Truck,
  Sparkles,
  Edit3,
  TrendingUp,
  CheckCircle2,
  Copy,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { formatCarType } from '@/utils/format';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { printOrDownloadEstimation, shareQuotationViaWhatsApp } from '@/utils/invoiceGenerator';
import InvoiceCustomizerModal from '@/components/InvoiceCustomizerModal';
import WhatsAppActionModal from '@/components/WhatsAppActionModal';
import MagicDriverAssignModal from '@/components/MagicDriverAssignModal';
import { openWhatsApp } from '@/utils/whatsapp';

export default function TripDetailScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mismatchAttempts, setMismatchAttempts] = useState<any[]>([]);
  const { toast, showToast } = useToast();
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Accordion Sections Toggle State
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    otp: false,
    tripInfo: false,
    tariff: false,
    customer: true,
  });

  // Role & Permissions state
  const [isAuthorizedForCancel, setIsAuthorizedForCancel] = useState(false);
  const [isOwnerRole, setIsOwnerRole] = useState(false);

  // Modals state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyAmount, setPenaltyAmount] = useState('500');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [submittingPenalty, setSubmittingPenalty] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movePlatform, setMovePlatform] = useState('External Drivers Portal');
  const [movingOrder, setMovingOrder] = useState(false);
  const [moveDriverFare, setMoveDriverFare] = useState('');
  const [moveCommissionAmount, setMoveCommissionAmount] = useState('');
  const [moveCommissionPercent, setMoveCommissionPercent] = useState('10');
  const [showMagicModal, setShowMagicModal] = useState(false);

  // Master Admin Controls
  const [showMasterEditModal, setShowMasterEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_number: '',
    pickup_address: '',
    drop_address: '',
    trip_distance: '',
    start_date_time: '',
    car_type: 'SEDAN_4_PLUS_1',
    trip_type: 'oneway',
    total_booking_amount: '',
    estimated_price: '',
  });

  const [showIncreaseFareModal, setShowIncreaseFareModal] = useState(false);
  const [savingFare, setSavingFare] = useState(false);
  const [newFareInput, setNewFareInput] = useState('');

  const [showForceCompleteModal, setShowForceCompleteModal] = useState(false);
  const [submittingForceComplete, setSubmittingForceComplete] = useState(false);
  const [forceClosingKm, setForceClosingKm] = useState('');
  const [forceClosingFare, setForceClosingFare] = useState('');

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    (async () => {
      try {
        const role = (await apiService.getCachedAdminRole() || '').toLowerCase();
        const perms = (await apiService.getCachedAdminPermissions() || []).map((p: string) => p.toLowerCase());
        const authorized =
          ['manager', 'owner', 'founder'].includes(role) ||
          perms.some((p: string) => ['manager', 'owner', 'founder', 'cancel_booking', 'booking_cancellation'].includes(p));
        setIsAuthorizedForCancel(authorized);
        setIsOwnerRole(role === 'owner');
      } catch (e) {
        setIsAuthorizedForCancel(false);
      }
    })();
  }, []);

  const loadOrderDetails = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getOrder(orderId);
      setOrder(data);
      try {
        const mismatchData = await apiService.getOrderVehicleMismatchAttempts(Number(orderId));
        setMismatchAttempts(mismatchData.items || []);
      } catch {
        setMismatchAttempts([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  useEffect(() => {
    if (order && showMoveModal) {
      const tot = Number(order.quoted_total_amount || order.estimated_price || order.total_amount || 0);
      const comm = Math.round(tot * 0.10);
      const net = Math.max(0, tot - comm);
      setMoveDriverFare(String(net));
      setMoveCommissionAmount(String(comm));
      setMoveCommissionPercent('10');
    }
  }, [showMoveModal, order]);

  const handleShareDriverCabWithCustomer = () => {
    if (!order) return;
    const custName = order.customer_name || 'Customer';
    const pLoc = order.pickup_drop_location?.pickup;
    const dLoc = order.pickup_drop_location?.drop;
    const pCity = pLoc?.address || pLoc?.city || order.pickup_location || 'Pickup City';
    const dCity = dLoc?.address || dLoc?.city || order.drop_location || 'Drop City';
    const dateStr = formatDate(order.start_date_time);
    const totFare = Number(order.quoted_total_amount || order.estimated_price || order.total_amount || 0);
    const drvName = order.assigned_driver?.name || order.assigned_driver?.full_name || order.fleet_owner_name || 'Assigned Chauffeur';
    const drvPhone = order.assigned_driver?.phone || order.fleet_owner_phone || '9363012345';
    const carModel = formatCarType(order.car_type || 'SEDAN_4_PLUS_1');
    const carNo = order.assigned_car?.car_number || order.car_number || 'TN Assigned';

    const msg =
      `*Drop Cars - Booking Confirmed!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Dear *${custName}*, your cab and driver have been successfully assigned for your upcoming trip.\n\n` +
      `📌 *Booking ID:* #DC-${order.id || order._id}\n` +
      `📍 *Pickup:* ${pCity}\n` +
      `🏁 *Drop:* ${dCity}\n` +
      `🗓️ *Pickup Schedule:* ${dateStr}\n\n` +
      `🚗 *VEHICLE & DRIVER DETAILS:*\n` +
      `• *Car Model:* ${carModel}\n` +
      `• *Vehicle No:* *${carNo}*\n` +
      `• *Driver Name:* *${drvName}*\n` +
      `• *Driver Contact:* *+91 ${drvPhone.replace(/[^0-9]/g, '').slice(-10)}*\n\n` +
      `💵 *Total Fare:* ₹${totFare.toLocaleString('en-IN')}\n` +
      `*(Toll & Parking excluded unless inclusive)*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📞 *24x7 Customer Support:* +91 93630 12345\n` +
      `🌐 *Website:* https://dropcars.in\n\n` +
      `_Have a safe and pleasant journey with Drop Cars!_`;

    openWhatsApp({
      phone: order.customer_number || '',
      message: msg
    });
  };

  const getMoveBroadcastMessage = () => {
    if (!order) return '';
    const pLoc = order.pickup_drop_location?.pickup;
    const dLoc = order.pickup_drop_location?.drop;
    const pCity = pLoc?.city || pLoc?.address || order.pickup_location || 'Pickup City';
    const dCity = dLoc?.city || dLoc?.address || order.drop_location || 'Drop City';
    const dateStr = formatDate(order.start_date_time);
    const carStr = formatCarType(order.car_type || 'SEDAN_4_PLUS_1');
    const tripTypeStr = order.trip_type || 'One Way';
    const totFare = Number(order.quoted_total_amount || order.estimated_price || order.total_amount || 0);
    const drvFare = Number(moveDriverFare) || (totFare - (Number(moveCommissionAmount) || 0));
    const targetId = order.id || order._id;
    const portalUrl = `https://drivers.dropcars.in/job.php?id=${targetId}&token=dc_${targetId}_job`;

    return (
      `*🚖 DROP CARS - NEW OUTSTATION TRIP AVAILABLE*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Route:* ${pCity} ➔ ${dCity}\n` +
      `🗓️ *Date & Time:* ${dateStr}\n` +
      `🚗 *Car Required:* ${carStr}\n` +
      `🛣️ *Trip Type:* ${tripTypeStr}\n` +
      `💰 *Total Customer Fare:* ₹${totFare.toLocaleString('en-IN')}\n` +
      `💵 *Driver Net Payment:* ₹${drvFare.toLocaleString('en-IN')}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ *To Accept & Get Customer Details Immediately:*\n` +
      `👉 ${portalUrl}\n\n` +
      `_Fastest acceptance gets the trip. 24x7 Support: +91 93630 12345_`
    );
  };

  const [custVisible, setCustVisible] = useState<boolean | null>(null);
  const toggleCustomerNumber = async (next: boolean) => {
    if (!order) return;
    try {
      await apiService.setCustomerNumberVisibility(order.id || order._id, next);
      setCustVisible(next);
      showToast(next ? 'Customer number is now visible to the driver' : 'Customer number hidden from the driver', 'success');
    } catch (e: any) {
      Alert.alert('Could not change', e?.message || 'Please try again.');
    }
  };

  // Owner only: remove a test booking completely (asks first; asks again if it already moved money)
  const handleDeleteBooking = () => {
    if (!order) return;
    const id = order.id || order._id;
    const run = async (confirmMoney: boolean) => {
      try {
        await apiService.deleteBookingPermanently(id, confirmMoney);
        showToast('Booking deleted', 'success');
        router.back();
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (!confirmMoney && (msg.includes('HAS_MONEY') || msg.includes('already moved money'))) {
          Alert.alert('This booking moved money', msg.replace(/^.*message\W+/, '') || 'It has wallet entries. Delete anyway? The wallet history stays.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete anyway', style: 'destructive', onPress: () => run(true) },
          ]);
        } else {
          Alert.alert('Could not delete', msg || 'Please try again.');
        }
      }
    };
    Alert.alert('Delete booking #' + id + '?', 'This removes the booking, its trip record, chat and reviews for good. Use it for test bookings only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(false) },
    ]);
  };

  const handleCancelByCustomer = async () => {
    if (!order) return;
    setSubmittingCancel(true);
    try {
      const targetId = order.id || order._id;
      await apiService.cancelOrderByAdmin(targetId, cancelReason.trim() || 'Cancelled by Customer via Admin');
      showToast('Booking cancelled successfully as CANCELLED_BY_CUSTOMER', 'success');
      setShowCancelModal(false);
      setCancelReason('');
      await loadOrderDetails();
    } catch (e: any) {
      Alert.alert('Cancellation Failed', e?.message || 'Could not cancel booking.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleRemoveDriverWithPenalty = async () => {
    if (!order) return;
    const amount = parseInt(penaltyAmount || '0', 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a positive penalty amount (e.g. ₹500)');
      return;
    }
    if (!penaltyReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a mandatory reason for removing driver with penalty.');
      return;
    }

    setSubmittingPenalty(true);
    try {
      const targetId = order.id || order._id;
      await apiService.unallocateWithPenalty(targetId, amount, penaltyReason.trim());
      showToast(`Driver unallocated! ₹${amount} penalty debited to Fleet Driver wallet.`, 'success');
      setShowPenaltyModal(false);
      setPenaltyReason('');
      await loadOrderDetails();
    } catch (e: any) {
      Alert.alert('Unallocation Failed', e?.message || 'Could not remove driver with penalty.');
    } finally {
      setSubmittingPenalty(false);
    }
  };

  const formatCurrency = (amount: number) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const makePhoneCall = (number: string) => {
    if (!number) return;
    Linking.openURL(`tel:${number.replace(/\D/g, '')}`);
  };

  if (loading) return <LoadingSpinner />;

  if (error || !order) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={[styles.headerGradient, { backgroundColor: '#1D4ED8' }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backCircleBtn}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Details</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>{error || 'Booking not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickupLoc = order.pickup_drop_location?.pickup;
  const dropLoc = order.pickup_drop_location?.drop;
  const currentStatus = (order.order_status || order.trip_status || 'PENDING').toUpperCase();
  const isAssigned = !!(order.assigned_driver || order.assigned_car || (order.assignments && order.assignments.length > 0));
  const isFinalized = currentStatus === 'COMPLETED' || currentStatus.includes('CANCEL');
  const isAutoCancelled = currentStatus === 'AUTO_CANCELLED' || currentStatus === 'AUTO CANCELLED' || currentStatus.includes('AUTO_CANCEL') || (currentStatus.includes('CANCEL') && (order.cancel_reason?.toLowerCase().includes('auto') || order.cancel_reason?.toLowerCase().includes('timeout') || order.cancel_reason?.toLowerCase().includes('no driver') || order.cancelled_by === 'SYSTEM'));
  const isExpired = currentStatus === 'EXPIRED' || currentStatus === 'NO DRIVER ASSIGNED';
  const canRecreate = isAutoCancelled || isExpired;

  const openMasterEditModal = () => {
    if (!order) return;
    const pLoc = order.pickup_drop_location?.pickup;
    const dLoc = order.pickup_drop_location?.drop;
    const pStr = pLoc?.address || `${pLoc?.city || ''} ${pLoc?.state || ''}`.trim() || order.pickup_location || '';
    const dStr = dLoc?.address || `${dLoc?.city || ''} ${dLoc?.state || ''}`.trim() || order.drop_location || '';
    setEditForm({
      customer_name: order.customer_name || '',
      customer_number: order.customer_number || '',
      pickup_address: pStr,
      drop_address: dStr,
      trip_distance: String(order.trip_distance || order.calculated_trip_distance || ''),
      start_date_time: order.start_date_time ? new Date(order.start_date_time).toISOString().slice(0, 16) : '',
      car_type: order.car_type || 'SEDAN_4_PLUS_1',
      trip_type: order.trip_type || 'oneway',
      total_booking_amount: String(order.quoted_total_amount || order.vendor_price || order.total_booking_amount || ''),
      estimated_price: String(order.estimated_price || ''),
    });
    setShowMasterEditModal(true);
  };

  const handleSaveMasterEdit = async () => {
    if (!order) return;
    setSavingEdit(true);
    try {
      const updates: any = {};
      if (editForm.customer_name) updates.customer_name = editForm.customer_name.trim();
      if (editForm.customer_number) updates.customer_number = editForm.customer_number.trim();
      if (editForm.trip_distance) updates.trip_distance = parseInt(editForm.trip_distance, 10);
      if (editForm.car_type) updates.car_type = editForm.car_type;
      if (editForm.trip_type) updates.trip_type = editForm.trip_type;
      if (editForm.total_booking_amount) {
        updates.total_booking_amount = parseInt(editForm.total_booking_amount, 10);
        updates.vendor_price = parseInt(editForm.total_booking_amount, 10);
      }
      if (editForm.estimated_price) updates.estimated_price = parseInt(editForm.estimated_price, 10);
      if (editForm.start_date_time) updates.start_date_time = new Date(editForm.start_date_time).toISOString();

      if (editForm.pickup_address || editForm.drop_address) {
        const pLoc = order.pickup_drop_location?.pickup || {};
        const dLoc = order.pickup_drop_location?.drop || {};
        updates.pickup_drop_location = {
          pickup: { ...pLoc, address: editForm.pickup_address || pLoc.address || editForm.pickup_address },
          drop: { ...dLoc, address: editForm.drop_address || dLoc.address || editForm.drop_address },
        };
      }

      await apiService.masterEditOrder(order.id || order._id, updates);
      showToast('Booking details updated successfully!', 'success');
      setShowMasterEditModal(false);
      await loadOrderDetails();
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message || 'Could not update booking');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickIncreaseFare = async () => {
    if (!order) return;
    const amount = parseInt(newFareInput, 10);
    const curr = Number(order.quoted_total_amount || order.vendor_price || order.estimated_price || 0);
    if (isNaN(amount) || amount <= curr) {
      Alert.alert('Invalid Amount', `New fare must be higher than current fare (₹${curr.toLocaleString('en-IN')})`);
      return;
    }
    setSavingFare(true);
    try {
      await apiService.increaseOrderFare(order.id || order._id, amount);
      showToast(`Fare increased to ₹${amount.toLocaleString('en-IN')} & drivers alerted!`, 'success');
      setShowIncreaseFareModal(false);
      setNewFareInput('');
      await loadOrderDetails();
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not increase fare');
    } finally {
      setSavingFare(false);
    }
  };

  const handleForceCompleteTrip = async () => {
    if (!order) return;
    setSubmittingForceComplete(true);
    try {
      const payload: any = {};
      if (forceClosingKm) payload.end_km = parseInt(forceClosingKm, 10);
      if (forceClosingFare) payload.final_fare = parseInt(forceClosingFare, 10);
      await apiService.forceCompleteOrder(order.id || order._id, payload);
      showToast('Booking manually closed and completed!', 'success');
      setShowForceCompleteModal(false);
      await loadOrderDetails();
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not complete booking');
    } finally {
      setSubmittingForceComplete(false);
    }
  };

  const handleRecreateBooking = () => {
    if (!order) return;
    const pLoc = order.pickup_drop_location?.pickup;
    const dLoc = order.pickup_drop_location?.drop;
    
    let pickupStr = pLoc?.address || `${pLoc?.city || ''} ${pLoc?.state || ''}`.trim() || '';
    let dropStr = dLoc?.address || `${dLoc?.city || ''} ${dLoc?.state || ''}`.trim() || '';

    if (!pickupStr && order.pickup_drop_location && typeof order.pickup_drop_location === 'object') {
      pickupStr = order.pickup_drop_location['0'] || '';
      const keys = Object.keys(order.pickup_drop_location).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      if (keys.length > 1) dropStr = order.pickup_drop_location[keys[keys.length - 1]] || '';
    }

    Alert.alert(
      'Recreate Booking',
      `Recreate Booking #${order.id || order._id} for ${order.customer_name || 'Customer'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Edit & Post New',
          onPress: () => {
            router.push({
              pathname: '/create-booking',
              params: {
                customer_name: order.customer_name || '',
                customer_phone: order.customer_number || '',
                pickup: pickupStr,
                drop: dropStr,
                trip_type: order.trip_type || 'oneway',
                car_type: order.car_type || 'SEDAN_4_PLUS_1',
                pickup_notes: order.pickup_notes || `Recreated from #${order.id || order._id}`,
              },
            });
          },
        },
      ]
    );
  };
  const startOtp = order.start_otp || order.assignments?.[0]?.start_trip_otp || order.start_code || 'Pending Driver';
  const endOtp = order.end_otp || order.assignments?.[0]?.end_trip_otp || order.end_code || 'Pending Close';

  const invoicePayload = {
    invoiceNumber: `${order.id || order._id}`,
    date: formatDate(order.created_at || new Date().toISOString()),
    brandName: 'Drop Cars',
    brandPhone: '7200217986',
    customerName: order.customer_name || 'Valued Customer',
    customerPhone: order.customer_number || '',
    customerEmail: order.customer_email || '',
    pickup: pickupLoc?.address || `${pickupLoc?.city || ''} ${pickupLoc?.state || ''}`.trim() || 'Veraiyur',
    dropLocation: dropLoc?.address || `${dropLoc?.city || ''} ${dropLoc?.state || ''}`.trim() || 'Bengaluru',
    travelDate: formatDate(order.start_date_time),
    vehicleType: formatCarType(order.car_type || 'Sedan 4+1'),
    tripType: order.trip_type || 'Oneway',
    baseFare: order.quoted_total_amount || order.estimated_price || 4100,
    extraCharges: 0,
    tollCharges: 0,
    advancePaid: order.advance_paid_amount || 0,
    includeGst: false,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Royal Blue Hero Header */}
      <View style={styles.headerBannerContainer}>
        <View style={styles.headerGradient}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backCircleBtn}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Booking #{order.id || order._id}</Text>

          <View style={styles.statusCapPill}>
            <Clock size={14} color="#FFFFFF" />
            <Text style={styles.statusCapPillText}>
              {!isAssigned && currentStatus === 'PENDING' ? 'PENDING' : currentStatus}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Card 1: Route Details */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(14, 165, 233, 0.12)' }]}>
              <Navigation size={18} color="#0EA5E9" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Route Details</Text>
            {order.estimated_distance_km != null && (
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceBadgeText}>{order.estimated_distance_km} km</Text>
              </View>
            )}
          </View>

          <View style={[styles.innerContentBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#F1F5F9' }]}>
            <View style={styles.routeRow}>
              <View style={styles.pickupDotContainer}>
                <View style={styles.pickupDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickupLabelText}>PICKUP</Text>
                <Text style={[styles.routeAddressText, { color: themeColors.text }]}>
                  {pickupLoc?.address || `${pickupLoc?.city || ''} ${pickupLoc?.state || ''}`.trim() || 'Veraiyur'}
                </Text>
              </View>
            </View>

            <View style={styles.connectingVerticalLine} />

            <View style={styles.routeRow}>
              <View style={styles.dropDotContainer}>
                <View style={styles.dropDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropLabelText}>DROP</Text>
                <Text style={[styles.routeAddressText, { color: themeColors.text }]}>
                  {dropLoc?.address || `${dropLoc?.city || ''} ${dropLoc?.state || ''}`.trim() || 'Bengaluru'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Card 2: Trip Verification OTP Codes (Fully Unfolded) */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <ShieldCheck size={18} color="#10B981" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Trip Verification OTP Codes</Text>
          </View>

          <View style={styles.otpRowContainer}>
            <View style={styles.otpGridRow}>
              <View style={[styles.otpBox, { backgroundColor: isDark ? '#1E3A8A25' : '#EFF6FF', borderColor: '#93C5FD' }]}>
                <Text style={styles.otpBoxLabel}>START OTP</Text>
                <Text style={styles.otpBoxCode}>{startOtp}</Text>
              </View>

              <View style={[styles.otpBox, { backgroundColor: isDark ? '#064E3B25' : '#ECFDF5', borderColor: '#6EE7B7' }]}>
                <Text style={styles.otpBoxLabelEnd}>END OTP</Text>
                <Text style={styles.otpBoxCodeEnd}>{endOtp}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.otpSmsBtn}
              onPress={() => {
                if (order.customer_number) {
                  const text = `Hi ${order.customer_name || 'Valued Customer'}, your Drop Cars Trip Start OTP is ${startOtp}. Thank you!`;
                  openWhatsApp({ phone: order.customer_number, message: text });
                } else {
                  showToast('Customer mobile number unavailable', 'error');
                }
              }}
            >
              <MessageSquare size={16} color="#25D366" />
              <Text style={styles.otpSmsBtnText}>Send OTP via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 3: Fleet Driver Contact */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
              <User size={18} color="#A855F7" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              {order.assigned_driver ? 'Assigned Duty Driver' : 'Fleet Driver Contact'}
            </Text>
          </View>

          <View style={[styles.innerContentBox, styles.contactBoxRow, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#F1F5F9' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactName, { color: themeColors.text }]}>
                {order.assigned_driver?.name || order.assigned_driver?.full_name || order.fleet_owner_name || 'Not assigned yet'}
              </Text>
              <Text style={[styles.contactSubText, { color: themeColors.textSecondary }]}>
                {order.assigned_car?.car_number ? `Vehicle: ${order.assigned_car.car_number}` : 'Registered Fleet Chauffeur'}
              </Text>
            </View>

            {(order.assigned_driver?.phone || order.fleet_owner_phone) ? (
              <TouchableOpacity
                style={styles.phoneCallPill}
                onPress={() => makePhoneCall(order.assigned_driver?.phone || order.fleet_owner_phone || '')}
              >
                <Phone size={15} color="#FFFFFF" />
                <Text style={styles.phoneCallPillText}>
                  {order.assigned_driver?.phone || order.fleet_owner_phone}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.phoneCallPill, { backgroundColor: '#9CA3AF' }]}>
                <Phone size={15} color="#FFFFFF" />
                <Text style={styles.phoneCallPillText}>No phone on file</Text>
              </View>
            )}
          </View>

          {/* Magic Box Assign / Edit Driver Button */}
          <TouchableOpacity
            style={{
              marginTop: 12,
              backgroundColor: '#9333EA',
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              shadowColor: '#9333EA',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 2,
            }}
            onPress={() => setShowMagicModal(true)}
            activeOpacity={0.85}
          >
            <Sparkles size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>
              ✨ Assign / Edit Driver (Magic Box)
            </Text>
          </TouchableOpacity>

          {/* 1-Tap Share Driver & Cab Details with Customer */}
          {isAssigned && (
            <TouchableOpacity
              style={{
                marginTop: 8,
                backgroundColor: '#25D366',
                paddingVertical: 11,
                paddingHorizontal: 14,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                shadowColor: '#25D366',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
              }}
              onPress={handleShareDriverCabWithCustomer}
              activeOpacity={0.85}
            >
              <Share2 size={16} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>
                Share Driver & Cab Details with Customer
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Card 4: Trip Information (Fully Expanded) */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Info size={18} color="#F59E0B" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Trip Information</Text>
          </View>

          <View style={styles.infoContentGrid}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Trip Type:</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{order.trip_type || 'Oneway'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Car Category:</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatCarType(order.car_type || 'SEDAN_4_PLUS_1')}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Scheduled Date:</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatDate(order.start_date_time)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Booking Created:</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatDate(order.created_at)}</Text>
            </View>
          </View>
        </View>

        {/* Card 5: Tariff Details (Fully Expanded) */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(13, 148, 136, 0.12)' }]}>
              <CreditCard size={18} color="#0D9488" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Tariff Details</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.headerPriceText, { color: '#10B981' }]}>
              {formatCurrency(order.quoted_total_amount || order.estimated_price || 4100)}
            </Text>
          </View>

          <View style={styles.infoContentGrid}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Quoted Total Fare:</Text>
              <Text style={[styles.infoValue, { color: '#10B981', fontWeight: '900', fontSize: 16 }]}>
                {formatCurrency(order.quoted_total_amount || order.estimated_price || 4100)}
              </Text>
            </View>

            {order.advance_paid_amount != null && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Advance Paid:</Text>
                <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatCurrency(order.advance_paid_amount)}</Text>
              </View>
            )}

            <View style={styles.pdfBtnRow}>
              <TouchableOpacity
                style={[styles.pdfActionBtn, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => printOrDownloadEstimation(invoicePayload)}
              >
                <FileText size={15} color="#2563EB" />
                <Text style={[styles.pdfActionBtnText, { color: '#2563EB' }]}>Estimate PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pdfActionBtn, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: '#A7F3D0' }]}
                onPress={() => shareQuotationViaWhatsApp(invoicePayload)}
              >
                <Share2 size={15} color="#10B981" />
                <Text style={[styles.pdfActionBtnText, { color: '#10B981' }]}>Share Quote</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Card 6: Customer Details (Fully Expanded) */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(14, 165, 233, 0.12)' }]}>
              <User size={18} color="#0EA5E9" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Customer Details</Text>
          </View>

          <View style={styles.infoContentGrid}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Customer Name:</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{order.customer_name || 'Kesavan'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Mobile Number:</Text>
              <TouchableOpacity
                style={styles.customerCallPill}
                onPress={() => makePhoneCall(order.customer_number || '9840123117')}
              >
                <Phone size={13} color="#2563EB" />
                <Text style={styles.customerCallPillText}>
                  {order.customer_number || '9840123117'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Card 6b: Drivers Who Tried (vehicle-type mismatch attempts) */}
        {mismatchAttempts.length > 0 && (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
                <AlertTriangle size={18} color="#D97706" />
              </View>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Drivers Who Tried</Text>
            </View>

            <View style={styles.infoContentGrid}>
              {mismatchAttempts.map((attempt, index) => (
                <View
                  key={attempt.id ?? index}
                  style={[styles.innerContentBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#F1F5F9', marginTop: index === 0 ? 0 : 10 }]}
                >
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Owner:</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text }]}>{attempt.owner_name || 'Unknown'}</Text>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 6 }]}>
                    <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Phone:</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text }]}>{attempt.owner_phone || 'N/A'}</Text>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 6 }]}>
                    <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Required Car Type:</Text>
                    <Text style={[styles.infoValue, { color: '#D97706' }]}>{formatCarType(attempt.required_car_type)}</Text>
                  </View>
                  <View style={[styles.infoRow, { marginTop: 6 }]}>
                    <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>Attempted:</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatDate(attempt.attempted_at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Commission split for this booking (percentages are Owner-editable in System Config) */}
        {!!order?.commission_breakdown && (
          <View style={[styles.governanceCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.governanceTitle, { color: themeColors.text }]}>Commission & Split</Text>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 8 }}>
              {order.commission_class === 'STANDARD' ? 'Standard: poster gets 10% of KM fare + extras, platform fee on driver fare'
                : order.commission_class === 'POSTER_ALL_INCLUSIVE' ? 'All-inclusive posted by vendor / driver: poster gets the markup, platform fee on driver fare'
                : 'Website / admin all-inclusive: platform keeps its cut, driver gets the rest'}
              {order.commission_breakdown.final ? '' : ' (estimate - final after the trip)'}
            </Text>
            {[
              ['Customer pays', order.commission_breakdown.customer_total],
              ['Driver gets', order.commission_breakdown.driver_net],
              [order.posted_by_vehicle_owner_id || order.vendor_id ? 'Poster / vendor gets' : 'Platform (as poster) gets', order.commission_breakdown.poster_share],
              ['Platform fee' + (order.commission_breakdown.fee_pct ? ' (' + order.commission_breakdown.fee_pct + '%)' : ''), order.commission_breakdown.platform_fee],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>{label}</Text>
                <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '700' }}>₹{Number(value || 0)}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 11, color: themeColors.textMuted, marginTop: 6 }}>
              Change the percentages in Settings ▸ System Config (Naveen only).
            </Text>
          </View>
        )}

        {isOwnerRole && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#7F1D1D', marginBottom: 12 }]}
            onPress={handleDeleteBooking}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Delete this booking (test data) - Naveen only</Text>
          </TouchableOpacity>
        )}

                {/* Omnichannel Documents & WhatsApp Quick Actions */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(37, 99, 235, 0.12)' }]}>
              <FileText size={18} color="#2563EB" />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Documents & Customer Updates</Text>
          </View>

          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#1E293B' }]}
              onPress={() => setShowInvoiceModal(true)}
              activeOpacity={0.85}
            >
              <FileText size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>View / Customize GST Tax Invoice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
              onPress={() => setShowWhatsAppModal(true)}
              activeOpacity={0.85}
            >
              <MessageSquare size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Share via WhatsApp (Deep Links)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recreate Booking Section for Auto-Cancelled & Expired Trips */}
        {canRecreate && (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: '#10B981', borderWidth: 1.5 }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Repeat size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Recreate Booking</Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 1 }}>
                  This trip was {isAutoCancelled ? 'Auto-Cancelled' : 'Expired'}. You can recreate it as a new live booking.
                </Text>
              </View>
            </View>

            <View style={{ gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                onPress={handleRecreateBooking}
                activeOpacity={0.85}
              >
                <Repeat size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Recreate as New Booking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                onPress={() => setShowMoveModal(true)}
                activeOpacity={0.85}
              >
                <Truck size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Move to External Partner / Savaari</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Card 7: Operational Governance Section */}
        {!isFinalized && (
          <View style={[styles.governanceCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.governanceTitle, { color: themeColors.text }]}>Operational & Governance Controls</Text>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>Show customer number to driver</Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                    Otherwise it opens automatically a few hours before pickup.
                  </Text>
                </View>
                <Switch
                  value={custVisible ?? !!order?.data_visibility_vehicle_owner}
                  onValueChange={toggleCustomerNumber}
                />
              </View>
              {isAuthorizedForCancel ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => setShowCancelModal(true)}
                  activeOpacity={0.85}
                >
                  <AlertTriangle size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Cancel Booking (Customer Request)</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.restrictedBanner, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <ShieldAlert size={16} color="#64748B" />
                  <Text style={[styles.restrictedBannerText, { color: themeColors.textSecondary }]}>
                    Standard cancellation requires Manager, Naveen, or Founder role privileges.
                  </Text>
                </View>
              )}

              {isAssigned && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                  onPress={() => setShowPenaltyModal(true)}
                  activeOpacity={0.85}
                >
                  <UserX size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Remove Driver with Penalty</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal: Customer Cancellation */}
      <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Cancel Booking (Customer Request)</Text>
              <TouchableOpacity onPress={() => setShowCancelModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 12 }}>
              This will update trip status to <Text style={{ fontWeight: '800', color: '#EF4444' }}>CANCELLED_BY_CUSTOMER</Text>, release active assignments, and record an entry in the Admin Activity Log.
            </Text>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Cancellation Reason:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['Change of plan / trip postponed', 'Customer cancelled the trip', 'Booked by mistake / duplicate booking', 'Trip details or fare were wrong', 'Found another vehicle / driver'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setCancelReason(r)}
                  style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: cancelReason === r ? '#EF4444' : themeColors.border, backgroundColor: cancelReason === r ? 'rgba(239,68,68,0.12)' : themeColors.background }}
                >
                  <Text style={{ fontSize: 12, color: cancelReason === r ? '#EF4444' : themeColors.text }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Or type your own reason..."
              placeholderTextColor={themeColors.textMuted}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#EF4444' }, submittingCancel && { opacity: 0.6 }]}
              onPress={handleCancelByCustomer}
              disabled={submittingCancel}
            >
              {submittingCancel ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Confirm Customer Cancellation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Remove Driver with Penalty */}
      <Modal visible={showPenaltyModal} transparent animationType="fade" onRequestClose={() => setShowPenaltyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Remove Driver with Penalty</Text>
              <TouchableOpacity onPress={() => setShowPenaltyModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 12 }}>
              Unallocates the driver, keeps booking alive for dispatch feed, and debits penalty from Fleet Driver wallet.
            </Text>

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Penalty Amount (₹):</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, marginBottom: 10 }]}
              placeholder="500"
              placeholderTextColor={themeColors.textMuted}
              keyboardType="numeric"
              value={penaltyAmount}
              onChangeText={setPenaltyAmount}
            />

            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Mandatory Removal Reason:</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. Driver refused duty / delayed departure"
              placeholderTextColor={themeColors.textMuted}
              value={penaltyReason}
              onChangeText={setPenaltyReason}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#D97706' }, submittingPenalty && { opacity: 0.6 }]}
              onPress={handleRemoveDriverWithPenalty}
              disabled={submittingPenalty}
            >
              {submittingPenalty ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Confirm Unallocation & Debit Penalty</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

            {/* Invoice Customizer Modal */}
      {order && (
        <InvoiceCustomizerModal
          visible={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          initialData={{
            invoiceNumber: String(order.id),
            customerName: order.customer_name,
            customerPhone: order.customer_number,
            pickup: order.pickup_city || order.pickup_address,
            dropLocation: order.drop_city || order.drop_address,
            pickupDate: order.start_date_time ? new Date(order.start_date_time).toLocaleDateString('en-IN') : undefined,
            pickupTime: order.start_date_time ? new Date(order.start_date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined,
            vehicleType: formatCarType(order.car_type),
            tripType: order.trip_type,
            baseFare: Number(order.quoted_total_amount || 0),
            tollCharges: Number(order.toll_charges || 0),
            advancePaid: Number(order.advance_amount || 0),
            driverName: order.driver_name,
            driverPhone: order.driver_number,
            cabName: order.car_name,
            cabNumber: order.car_number,
            reviewToken: order.trip_link_token,
          }}
        />
      )}

      {/* WhatsApp Action Modal */}
      {order && (
        <WhatsAppActionModal
          visible={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          data={{
            bookingId: order.id,
            customerName: order.customer_name,
            customerPhone: order.customer_number,
            pickupLocation: order.pickup_city || order.pickup_address,
            dropLocation: order.drop_city || order.drop_address,
            pickupDate: order.start_date_time ? new Date(order.start_date_time).toLocaleDateString('en-IN') : undefined,
            pickupTime: order.start_date_time ? new Date(order.start_date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined,
            vehicleType: formatCarType(order.car_type),
            tripType: order.trip_type,
            totalFare: Number(order.quoted_total_amount || 0),
            finalFare: Number(order.final_amount || order.quoted_total_amount || 0),
            driverName: order.driver_name,
            driverPhone: order.driver_number,
            carName: order.car_name,
            carNumber: order.car_number,
            reviewToken: order.trip_link_token,
          }}
          initialType={order.trip_status === 'COMPLETED' ? 'trip_completed' : order.driver_name ? 'driver_assigned' : 'booking_confirmed'}
        />
      )}

      {/* Magic Driver Assign Modal */}
      {order && (
        <MagicDriverAssignModal
          visible={showMagicModal}
          onClose={() => setShowMagicModal(false)}
          order={order}
          onSuccess={() => {
            showToast('Driver and cab details updated successfully!', 'success');
            loadOrderDetails();
          }}
        />
      )}

      {/* Move Booking Modal */}
      <Modal
        visible={showMoveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMoveModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={20} color="#B45309" />
              </View>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Move / Broadcast Booking #{order?.id || order?._id}</Text>
            </View>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 12 }}>
              Broadcast this trip to external driver WhatsApp groups via secure Web Portal or move to an external partner.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 6 }}>Target Destination / Portal:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['External Drivers Portal', 'Savaari', 'MakeMyTrip', 'Goibibo', 'Local Vendor'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: movePlatform === p ? '#B45309' : (isDark ? '#1E293B' : '#F1F5F9') }}
                  onPress={() => setMovePlatform(p)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: movePlatform === p ? '#FFFFFF' : themeColors.text }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {movePlatform === 'External Drivers Portal' && (
              <View style={{ backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Customer Quoted Fare:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>₹{Number(order?.quoted_total_amount || order?.estimated_price || order?.total_amount || 0).toLocaleString('en-IN')}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Driver Net Fare (₹):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text, paddingVertical: 6, height: 38 }]}
                      placeholder={String(Math.round(Number(order?.quoted_total_amount || 0) * 0.9))}
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                      value={moveDriverFare}
                      onChangeText={(val) => {
                        setMoveDriverFare(val);
                        const tot = Number(order?.quoted_total_amount || 0);
                        const drv = Number(val || 0);
                        if (tot > 0 && drv > 0) {
                          setMoveCommissionAmount(String(Math.max(0, tot - drv)));
                        }
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Commission (₹):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text, paddingVertical: 6, height: 38 }]}
                      placeholder={String(Math.round(Number(order?.quoted_total_amount || 0) * 0.1))}
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                      value={moveCommissionAmount}
                      onChangeText={(val) => {
                        setMoveCommissionAmount(val);
                        const tot = Number(order?.quoted_total_amount || 0);
                        const comm = Number(val || 0);
                        if (tot > 0) {
                          setMoveDriverFare(String(Math.max(0, tot - comm)));
                        }
                      }}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: '#25D366', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}
                  onPress={() => {
                    const msg = getMoveBroadcastMessage();
                    openWhatsApp({ message: msg });
                  }}
                >
                  <Share2 size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Broadcast on WhatsApp Groups</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ marginTop: 8, alignItems: 'center' }}
                  onPress={() => {
                    const targetId = order?.id || order?._id;
                    const portalUrl = `https://drivers.dropcars.in/job.php?id=${targetId}&token=dc_${targetId}_job`;
                    Linking.openURL(portalUrl).catch(() => {
                      Linking.openURL(`https://dropcars.in/portal/job.php?id=${targetId}&token=dc_${targetId}_job`);
                    });
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#2563EB', fontWeight: '600', textDecorationLine: 'underline' }}>
                    🌐 Preview Web Portal Link (drivers.dropcars.in)
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {movePlatform !== 'External Drivers Portal' && (
              <TouchableOpacity
                style={{ backgroundColor: '#25D366', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}
                onPress={() => {
                  const pLoc = order?.pickup_drop_location?.pickup;
                  const dLoc = order?.pickup_drop_location?.drop;
                  const routeStr = pLoc?.city ? `${pLoc.city} → ${dLoc?.city || ''}` : 'Outstation Trip';
                  const msg = `*Drop Cars - External Booking Dispatch*\nBooking #${order?.id || order?._id}\nCustomer: ${order?.customer_name || 'N/A'}\nPhone: ${order?.customer_number || 'N/A'}\nRoute: ${routeStr}\nCar: ${order?.car_type || 'Sedan'}\nFare: ₹${order?.quoted_total_amount || order?.estimated_price || 0}\nMoved To Platform: ${movePlatform}\n\nDispatch details: https://dropcars.in`;
                  openWhatsApp({ message: msg });
                }}
              >
                <Share2 size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Share to Partner via WhatsApp</Text>
              </TouchableOpacity>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}
                onPress={() => setShowMoveModal(false)}
              >
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: '#B45309' }, movingOrder && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!order) return;
                  setMovingOrder(true);
                  try {
                    const targetId = order.id || order._id;
                    await apiService.updateOrderExecutedPlatform(targetId, `Moved: ${movePlatform}`);
                    showToast(`Booking #${targetId} marked as moved to ${movePlatform}!`, 'success');
                    setShowMoveModal(false);
                    await loadOrderDetails();
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Failed to move booking');
                  } finally {
                    setMovingOrder(false);
                  }
                }}
                disabled={movingOrder}
              >
                {movingOrder ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.actionBtnText}>Confirm Move</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>


      {/* ✏️ Master Edit Booking Modal */}
      <Modal visible={showMasterEditModal} transparent animationType="slide" onRequestClose={() => setShowMasterEditModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMasterEditModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Edit3 size={20} color="#2563EB" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Edit Booking #{order?.id || order?._id}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowMasterEditModal(false)} style={{ padding: 4 }}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Customer Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={editForm.customer_name}
                  onChangeText={(t) => setEditForm(p => ({ ...p, customer_name: t }))}
                  placeholder="Customer Name"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Customer Mobile Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={editForm.customer_number}
                  onChangeText={(t) => setEditForm(p => ({ ...p, customer_number: t }))}
                  placeholder="10-digit Phone"
                  keyboardType="phone-pad"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Pickup Address / City</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={editForm.pickup_address}
                  onChangeText={(t) => setEditForm(p => ({ ...p, pickup_address: t }))}
                  placeholder="Pickup Location"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Drop Address / City</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={editForm.drop_address}
                  onChangeText={(t) => setEditForm(p => ({ ...p, drop_address: t }))}
                  placeholder="Drop Location"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Trip Distance (KM)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                    value={editForm.trip_distance}
                    onChangeText={(t) => setEditForm(p => ({ ...p, trip_distance: t }))}
                    placeholder="e.g. 150"
                    keyboardType="numeric"
                    placeholderTextColor={themeColors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Total Customer Fare (₹)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                    value={editForm.total_booking_amount}
                    onChangeText={(t) => setEditForm(p => ({ ...p, total_booking_amount: t }))}
                    placeholder="Total Fare"
                    keyboardType="numeric"
                    placeholderTextColor={themeColors.textMuted}
                  />
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 6 }}>Car Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {['SEDAN_4_PLUS_1', 'ETIOS', 'ERTIGA_6_PLUS_1', 'INNOVA', 'CRYSTA', 'TEMPO_12_PLUS_1'].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: editForm.car_type === c ? '#2563EB' : (isDark ? '#1E293B' : '#F1F5F9') }}
                      onPress={() => setEditForm(p => ({ ...p, car_type: c }))}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: editForm.car_type === c ? '#FFFFFF' : themeColors.text }}>{formatCarType(c)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} onPress={() => setShowMasterEditModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: '#2563EB' }, savingEdit && { opacity: 0.6 }]}
                onPress={handleSaveMasterEdit}
                disabled={savingEdit}
              >
                {savingEdit ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.actionBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ⚡ Quick Price Increase Modal */}
      <Modal visible={showIncreaseFareModal} transparent animationType="fade" onRequestClose={() => setShowIncreaseFareModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIncreaseFareModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={20} color="#059669" />
              </View>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Quick Price Increase</Text>
            </View>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 12 }}>
              Enter the new total booking amount. The fare will be updated instantly and an urgent push notification re-broadcasted to all drivers.
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>New Total Fare (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border, fontSize: 16, fontWeight: '800' }]}
              value={newFareInput}
              onChangeText={setNewFareInput}
              placeholder="e.g. 4500"
              keyboardType="numeric"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} onPress={() => setShowIncreaseFareModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: '#059669' }, savingFare && { opacity: 0.6 }]}
                onPress={handleQuickIncreaseFare}
                disabled={savingFare}
              >
                {savingFare ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.actionBtnText}>Update & Broadcast</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 🏁 Force Complete / Close Trip Modal */}
      <Modal visible={showForceCompleteModal} transparent animationType="fade" onRequestClose={() => setShowForceCompleteModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowForceCompleteModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} color="#7C3AED" />
              </View>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Manually Complete / Close Trip</Text>
            </View>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 12 }}>
              Manually close and settle this trip. This marks the booking as COMPLETED and synchronizes across all systems.
            </Text>
            <View style={{ gap: 10, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Closing Odometer KM (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={forceClosingKm}
                  onChangeText={setForceClosingKm}
                  placeholder="Total Trip KM"
                  keyboardType="numeric"
                />
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>Final Total Fare (₹)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                  value={forceClosingFare}
                  onChangeText={setForceClosingFare}
                  placeholder="Final Amount"
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} onPress={() => setShowForceCompleteModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, backgroundColor: '#7C3AED' }, submittingForceComplete && { opacity: 0.6 }]}
                onPress={handleForceCompleteTrip}
                disabled={submittingForceComplete}
              >
                {submittingForceComplete ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.actionBtnText}>Confirm Complete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Royal Blue Senior Header Container */
  headerBannerContainer: {
    backgroundColor: '#1E56E0',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#1E56E0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    flex: 1,
    letterSpacing: -0.2,
  },
  statusCapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  statusCapPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  /* Cards & Sections */
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderContainer: {
    gap: 4,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardSubtitleText: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
    marginLeft: 48,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  distanceBadge: {
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  distanceBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0EA5E9',
  },
  headerPriceText: {
    fontSize: 16,
    fontWeight: '900',
    marginRight: 4,
  },

  /* Inner Card Containers */
  innerContentBox: {
    marginTop: 14,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
  },

  /* Route Details Timeline */
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pickupDotContainer: {
    width: 20,
    alignItems: 'center',
    marginTop: 3,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#D1FAE5',
  },
  connectingVerticalLine: {
    width: 2,
    height: 22,
    backgroundColor: '#CBD5E1',
    marginLeft: 9,
    marginVertical: 2,
  },
  dropDotContainer: {
    width: 20,
    alignItems: 'center',
    marginTop: 3,
  },
  dropDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  pickupLabelText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#0D9488',
    letterSpacing: 0.6,
  },
  dropLabelText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 0.6,
  },
  routeAddressText: {
    fontSize: 14.5,
    fontWeight: '700',
    marginTop: 2,
  },

  /* Contact Cards */
  contactBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactName: {
    fontSize: 15.5,
    fontWeight: '800',
  },
  contactSubText: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  phoneCallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  phoneCallPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  /* OTP Codes Box */
  otpRowContainer: {
    marginTop: 14,
    gap: 10,
  },
  otpGridRow: {
    flexDirection: 'column',
    gap: 10,
  },
  otpBox: {
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otpBoxLabel: { fontSize: 12, fontWeight: '900', color: '#2563EB' },
  otpBoxCode: { fontSize: 20, fontWeight: '900', color: '#1E40AF', letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  otpBoxLabelEnd: { fontSize: 12, fontWeight: '900', color: '#059669' },
  otpBoxCodeEnd: { fontSize: 20, fontWeight: '900', color: '#065F46', letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  otpSmsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(37, 211, 102, 0.12)',
    borderWidth: 1,
    borderColor: '#25D366',
    paddingVertical: 11,
    borderRadius: 6,
    marginTop: 2,
  },
  otpSmsBtnText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '800',
  },

  /* Detailed Info Grids */
  infoContentGrid: {
    marginTop: 14,
    gap: 10,
  },
  infoContentBox: {
    marginTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(156, 163, 175, 0.2)',
    paddingTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: { fontSize: 13.5, fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '700' },

  customerCallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.3)',
  },
  customerCallPillText: {
    color: '#2563EB',
    fontSize: 13.5,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  pdfBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  pdfActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  pdfActionBtnText: { fontSize: 12.5, fontWeight: '800' },

  /* Governance Section */
  governanceCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  governanceTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 8,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 6,
  },
  restrictedBannerText: { fontSize: 12, fontWeight: '600', flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 10, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 16.5, fontWeight: '800' },
  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 14, marginBottom: 14 },
  submitBtn: { borderRadius: 6, alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});


