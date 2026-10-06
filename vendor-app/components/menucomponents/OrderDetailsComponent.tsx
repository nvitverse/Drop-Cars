import React, { useState, useEffect } from 'react';
import { getBookingStatusLabel, getBookingStatusColor } from '@/utils/bookingStatus';
import { formatCarType } from '../../utils/format';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Image,
  Linking,
  TextInput,
  Switch,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, User, Phone, Calendar, Clock, MapPin, Car, DollarSign, Route, FileText, Settings, Gauge, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Circle as XCircle, Users, CreditCard, Timer, Navigation, Info, X, RefreshCw, Eye, StickyNote, EyeOff, ShieldCheck, Copy, Zap, Key, Send, ChevronDown, ChevronUp } from 'lucide-react-native';
import api from '../../app/api/api';
import OrderSuccess from '../OrderSuccess';
import DutyAssignModal from '../DutyAssignModal';
import CancelReasonModal from '../CancelReasonModal';

interface OrderDetail {
  id: number;
  source: string;
  source_order_id: number;
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: { [key: string]: string };
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
  closed_vendor_price: number | null;
  closed_driver_price: number | null;
  commision_amount: number | null;
  created_at: string;
  max_time: number | null;
  cancelled_by: string | null;
  max_time_to_assign_order: string;
  toll_charge_update: boolean;
  data_visibility_vehicle_owner: boolean;
  night_charges: number;
  waiting_time: number;
  vendor_earns_estimation: number
  updated_toll_charges: number
  
  // Oneway/Roundtrip specific fields
  cost_per_km: number | null;
  extra_cost_per_km: number | null;
  driver_allowance: number | null;
  extra_driver_allowance: number | null;
  permit_charges: number | null;
  extra_permit_charges: number | null;
  hill_charges: number | null;
  toll_charges: number | null;
  pickup_notes: string | null;
  
  // Hourly rental specific fields
  package_hours: { hours: number; km_range: number } | null;
  cost_per_hour: number | null;
  extra_cost_per_hour: number;
  cost_for_addon_km: number | null;
  extra_cost_for_addon_km: number;
  
  assignments: Assignment[];
  end_records: EndRecord[];
  assigned_driver_name: string | null;
  assigned_driver_phone: string | null;
  assigned_car_name: string | null;
  assigned_car_number: string | null;
  vehicle_owner_name: string | null;
  vendor_profit : number | null;
  admin_profit : number | null;
  vehicle_owner_number: string | null;
}

interface Assignment {
  id: number;
  order_id: number;
  vehicle_owner_id: string;
  driver_id: string;
  car_id: string;
  assignment_status: string;
  assigned_at: string;
  expires_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  // Who put this assignment in place - 'SELF' (fleet owner accepted it
  // themselves), 'VENDOR' (this vendor assigned it directly), or 'ADMIN'.
  // Drives the "Accepted" vs "Allocated" status wording below.
  assigned_by?: string;
  start_trip_otp: string | null;
  end_trip_otp: string | null;
}

interface EndRecord {
  id: number;
  order_id: number;
  driver_id: string;
  start_km: number;
  end_km: number;
  contact_number: string;
  img_url: string;
  close_speedometer_image: string;
  created_at: string;
  updated_at: string;
}

export default function OrderDetailsComponent() {
  // const router = useRouter();
  const router = useRouter();
  
  // Add proper error handling for useLocalSearchParams
  let orderId: string | undefined;
  try {
    const params = useLocalSearchParams();
    orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  } catch (error) {
    console.error('Error with useLocalSearchParams:', error);
    orderId = undefined;
  }
  const [orderDetails, setOrderDetails] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [recreateLoading, setRecreateLoading] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [recreatedOrderData, setRecreatedOrderData] = useState<any>(null);
  const [showRecreateInput, setShowRecreateInput] = useState(false);
  // Edit Fare state
  const [showEditFare, setShowEditFare] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editFields, setEditFields] = useState<Record<string,string>>({});
  const [maxTimeInput, setMaxTimeInput] = useState('30');
  // Assign Duty (direct dispatch to a searched fleet owner/driver)
  const [showAssignDuty, setShowAssignDuty] = useState(false);
  // Collapsible sections - OTP codes and the full tariff breakdown are the
  // bulkiest, least-often-needed sections, so they start collapsed to keep
  // the page scannable; everything else stays visible as before.
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [showTariffSection, setShowTariffSection] = useState(false);
  const [showTripInfoSection, setShowTripInfoSection] = useState(false);
  const [showAssignmentSection, setShowAssignmentSection] = useState(false);
  const [showTripRecordSection, setShowTripRecordSection] = useState(false);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

const fetchOrderDetails = async () => {
  try {
    setLoading(true);
    setError(null);
    // Ensure orderId is treated as string
    const orderIdString = String(orderId);
    const response = await api.get(`/orders/vendor/${orderIdString}`);
    setOrderDetails(response.data);
  } catch (err: any) {
    console.error('Error fetching order details:', err);
    setError('Failed to load booking details. Please try again.');
  } finally {
    setLoading(false);
  }
};

// Replace the showMaxTimeInputDialog function
const showMaxTimeInputDialog = () => {
  setShowRecreateInput(true);
  setMaxTimeInput('30'); // Reset to default when showing
};

const handleRecreateSubmit = () => {
  const timeInMinutes = parseInt(maxTimeInput || '30');
  if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
    Alert.alert('Invalid Input', 'Please enter a valid number of minutes (greater than 0)');
    return;
  }
  setShowRecreateInput(false);
  performRecreateOrder(timeInMinutes);
};

const cancelRecreateInput = () => {
  setShowRecreateInput(false);
  setMaxTimeInput('30');
};

  // const showMaxTimeInputDialog = () => {
  //   Alert.prompt(
  //     'Recreate Order',
  //     'Enter maximum time to assign order (in minutes):',
  //     [
  //       {
  //         text: 'Cancel',
  //         style: 'cancel',
  //       },
  //       {
  //         text: 'Create Order',
  //         onPress: (maxTime) => {
  //           const timeInMinutes = parseInt(maxTime || '30');
  //           if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
  //             Alert.alert('Invalid Input', 'Please enter a valid number of minutes (greater than 0)');
  //             return;
  //           }
  //           performRecreateOrder(timeInMinutes);
  //         },
  //       },
  //     ],
  //     'plain-text',
  //     '30' // Default value
  //   );
  // };
    // const showMaxTimeInputDialog = () =>{
    //   performRecreateOrder(2)
    // }

    // const showMaxTimeInputDialog = () => {
    //   console.log("check 1")
    //     Alert.prompt(
    //       'Recreate Order',
    //       'Enter maximum time to assign order (in minutes):',
    //       [
    //         {
    //           text: 'Cancel',
    //           style: 'cancel',
    //         },
    //         {
    //           text: 'Create Order',
    //           onPress: (maxTime) => {
    //             const timeInMinutes = parseInt(maxTime || '30');
    //             if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
    //               Alert.alert('Invalid Input', 'Please enter a valid number of minutes (greater than 0)');
    //               return;
    //             }
    //             performRecreateOrder(timeInMinutes);
    //           },
    //         },
    //       ],
    //       'plain-text',
    //       '30' // Default value
    //     );
    //   };

  const performRecreateOrder = async (maxTimeInMinutes: number) => {
      console.log("check 2")

    if (!orderDetails) return;
      console.log("check 3")

    try {
      setRecreateLoading(true);
      const response = await api.post('/orders/recreate', {
        order_id: orderDetails.id,
        max_time_to_assign_order: maxTimeInMinutes
      });
      
      if (response.data) {
        setRecreatedOrderData(response.data);
        setShowOrderSuccess(true);
      }
    } catch (err: any) {
      console.error('Error recreating order:', err);
      const errorMessage = err.response?.data?.detail || 'Failed to recreate booking. Please try again.';
      Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setRecreateLoading(false);
    }
  };


  const [showCancelReason, setShowCancelReason] = useState(false);
  const [custVisible, setCustVisible] = useState<boolean | null>(null);
  const [custSwitchBusy, setCustSwitchBusy] = useState(false);

  // Manual "Show customer number to the driver" switch (the number also opens up automatically a few
  // hours before pickup). Lost from the UI at some point - backend routes still exist.
  const toggleCustomerVisibility = async (next: boolean) => {
    if (!orderDetails) return;
    setCustSwitchBusy(true);
    try {
      await api.patch(`/orders/${orderDetails.id}/visibility/vehicle-owner`, { data_visibility_vehicle_owner: next });
      setCustVisible(next);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not change this. Please try again.');
    } finally {
      setCustSwitchBusy(false);
    }
  };

  // Manual "Notify drivers" alarm - the one automatic push at posting time
  // is easy to miss (backend: POST /orders/{id}/notify, 60s cooldown).
  const [notifying, setNotifying] = useState(false);
  const notifyDrivers = async () => {
    if (!orderDetails) return;
    setNotifying(true);
    try {
      const res = await api.post(`/orders/${orderDetails.id}/notify`, {});
      const count = res.data?.detail?.count;
      Alert.alert('Drivers alerted', count ? `Alert sent to ${count} driver${count === 1 ? '' : 's'}.` : 'The alert was sent again.');
    } catch (e: any) {
      Alert.alert('Could not notify', e?.response?.data?.detail || e?.message || 'Please try again.');
    } finally {
      setNotifying(false);
    }
  };

  const cancelOrder = () => {
    if (!orderDetails) return;
    setShowCancelReason(true);
  };

  const confirmCancelOrder = async (reason: string) => {
    if (!orderDetails) return;
    try {
      setCancelLoading(true);
      const response = await api.patch(`/assignments/vendor/cancel-order/${orderDetails.id}`, { reason });
      setShowCancelReason(false);
      if (response.data) {
        Alert.alert('Success', 'Booking cancelled successfully!', [
          { text: 'OK', onPress: () => { fetchOrderDetails(); } },
        ]);
      }
    } catch (err: any) {
      console.error('Error cancelling order:', err);
      const detail = err?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Failed to cancel booking. Please try again.', [{ text: 'OK' }]);
    } finally {
      setCancelLoading(false);
    }
  };

  const makePhoneCall = (phoneNumber: string) => {
      Linking.openURL(`tel:${phoneNumber}`).catch(() => {
        Alert.alert('Error', 'Unable to open dial pad');
      });
  };

  const viewImage = (imageUrl: string, title: string) => {
    Alert.alert(
      title,
      'Open image in browser?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open', 
          onPress: () => {
            Linking.canOpenURL(imageUrl)
              .then((supported) => {
                if (supported) {
                  Linking.openURL(imageUrl);
                } else {
                  Alert.alert('Error', 'Cannot open image URL');
                }
              })
              .catch((err) => console.error('Error opening image:', err));
          }
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return '#F59E0B';
      case 'DRIVER_ASSIGNED': return '#3B82F6';
      case 'TRIP_STARTED': return '#10B981';
      case 'TRIP_COMPLETED': return '#059669';
      case 'CANCELLED': return '#DC2626';
      case 'AUTO_CANCELLED': return '#DC2626';
      case 'PENDING': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return <AlertCircle size={20} color="#F59E0B" />;
      case 'DRIVER_ASSIGNED': return <Car size={20} color="#3B82F6" />;
      case 'TRIP_STARTED': return <CheckCircle size={20} color="#10B981" />;
      case 'TRIP_COMPLETED': return <CheckCircle size={20} color="#059669" />;
      case 'CANCELLED': return <XCircle size={20} color="#DC2626" />;
      case 'AUTO_CANCELLED': return <XCircle size={20} color="#DC2626" />;
      case 'PENDING': return <Clock size={20} color="#6B7280" />;
      default: return <AlertCircle size={20} color="#6B7280" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getLocationEntries = (locations: { [key: string]: string }) => {
    return Object.entries(locations || {}).sort(([a], [b]) => parseInt(a) - parseInt(b));
  };

  const isHourlyRental = orderDetails?.trip_type === 'Hourly Rental';
  const canRecreate = orderDetails?.cancelled_by === 'AUTO_CANCELLED';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d5464ff" />
        <Text style={styles.loadingText}>Loading booking details...</Text>
      </View>
    );
  }

  if (error || !orderDetails) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={48} color="#DC2626" />
        <Text style={styles.errorText}>{error || 'Booking not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchOrderDetails}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const locations = getLocationEntries(orderDetails.pickup_drop_location);
  const currentAssignment = orderDetails.assignments.find(a => a.assignment_status === 'ASSIGNED' || a.assignment_status === 'COMPLETED');
  // Most recent assignment regardless of status - covers the PENDING stage
  // too (claimed by someone, driver+car not chosen yet), which is when
  // "Accepted" vs "Allocated" actually needs to be shown.
  const latestAssignment = orderDetails.assignments.length > 0
    ? orderDetails.assignments[orderDetails.assignments.length - 1]
    : null;
  const acceptedStatusLabel = !latestAssignment
    ? 'Waiting to accept'
    : latestAssignment.assigned_by && latestAssignment.assigned_by !== 'SELF'
      ? 'Allocated'
      : 'Accepted';

  const isHourlyRentalOrder = orderDetails.trip_type === 'HOURLY_RENTAL' || orderDetails.trip_type === 'Hourly Rental';
  const canEditFare = ['PENDING', 'DRIVER_ASSIGNED', 'STARTED'].includes(orderDetails.trip_status);

  const openEditFare = () => {
    const f: Record<string,string> = {};
    if (isHourlyRentalOrder) {
      if (orderDetails.cost_per_km != null) f.cost_per_hour = String(orderDetails.cost_per_km);
      if (orderDetails.extra_cost_per_km != null) f.extra_cost_per_hour = String(orderDetails.extra_cost_per_km);
    } else {
      if (orderDetails.cost_per_km != null) f.cost_per_km = String(orderDetails.cost_per_km);
      if (orderDetails.extra_cost_per_km != null) f.extra_cost_per_km = String(orderDetails.extra_cost_per_km);
      if (orderDetails.driver_allowance != null) f.driver_allowance = String(orderDetails.driver_allowance);
      if (orderDetails.extra_driver_allowance != null) f.extra_driver_allowance = String(orderDetails.extra_driver_allowance);
      if (orderDetails.permit_charges != null) f.permit_charges = String(orderDetails.permit_charges);
      if (orderDetails.extra_permit_charges != null) f.extra_permit_charges = String(orderDetails.extra_permit_charges);
      if (orderDetails.hill_charges != null) f.hill_charges = String(orderDetails.hill_charges);
      if (orderDetails.toll_charges != null) f.toll_charges = String(orderDetails.toll_charges ?? orderDetails.updated_toll_charges);
      if (orderDetails.night_charges != null) f.night_charges = String(orderDetails.night_charges);
    }
    if (orderDetails.pickup_notes) f.pickup_notes = orderDetails.pickup_notes;
    setEditFields(f);
    setShowEditFare(true);
  };

  const submitEditFare = async () => {
    try {
      setEditLoading(true);
      const payload: Record<string,any> = {};
      Object.entries(editFields).forEach(([k, v]) => {
        if (v !== '' && v != null) {
          payload[k] = k === 'pickup_notes' ? v : parseInt(v);
        }
      });
      await api.patch(`/orders/${orderDetails.id}/edit`, payload);
      setShowEditFare(false);
      Alert.alert('✅ Updated', 'Fare details updated successfully.');
      // Refresh
      const res = await api.get(`/orders/vendor/${orderDetails.id}`);
      setOrderDetails(res.data);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to update fare.');
    } finally {
      setEditLoading(false);
    }
  };
  const latestEndRecord = orderDetails.end_records[orderDetails.end_records.length - 1];

  return (
    <>
      <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#1E3A8A', '#1D4ED8', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <ArrowLeft size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>Booking #{orderDetails.id}</Text>
          </View>
          {(() => {
            const stageAssignment = currentAssignment || latestAssignment;
            const stage = getBookingStatusLabel({
              trip_status: orderDetails.trip_status === 'TRIP_COMPLETED' ? 'COMPLETED' : orderDetails.trip_status,
              assignment_status: orderDetails.trip_status === 'TRIP_STARTED' ? 'DRIVING' : stageAssignment?.assignment_status,
              order_accept_status: !!stageAssignment,
              cancelled_by: (orderDetails as any).cancelled_by || (orderDetails.trip_status === 'AUTO_CANCELLED' ? 'AUTO_CANCELLED' : undefined),
              Driver_assigned: !!stageAssignment?.driver_id,
              Car_assigned: !!stageAssignment?.car_id,
            });
            const stageColor = getBookingStatusColor(stage);
            return (
              <View style={[styles.statusBadge, { backgroundColor: `${stageColor}33` }]}>
                <Text style={styles.statusText} numberOfLines={1}>{stage}</Text>
              </View>
            );
          })()}
        </View>
      </LinearGradient>

      {showRecreateInput && (
        <View style={styles.recreateInputContainer}>
          <Text style={styles.recreateInputLabel}>Max time to assign (minutes):</Text>
          <View style={styles.recreateInputRow}>
            <TextInput
              style={styles.recreateInput}
              value={maxTimeInput}
              onChangeText={setMaxTimeInput}
              keyboardType="numeric"
              placeholder="Enter minutes"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity 
              style={[styles.submitButton, (!maxTimeInput || parseInt(maxTimeInput) <= 0) && styles.submitButtonDisabled]}
              onPress={handleRecreateSubmit}
              disabled={!maxTimeInput || parseInt(maxTimeInput) <= 0}
            >
              <Text style={styles.submitButtonText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.cancelInputButton}
              onPress={cancelRecreateInput}
            >
              <Text style={styles.cancelInputButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
            

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Route Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF' }]}>
              <Navigation size={16} color="#2563EB" />
            </View>
            <Text style={styles.sectionTitle}>Route Details</Text>
          </View>
          <View style={styles.routeCard}>
            {locations.map((location, index) => (
              <View key={index} style={styles.routeItem}>
                <View style={styles.routeLeft}>
                  <View style={[
                    styles.routeDot,
                    index === 0 ? styles.routeDotStart :
                    index === locations.length - 1 ? styles.routeDotEnd :
                    styles.routeDotMiddle
                  ]} />
                  {index < locations.length - 1 && <View style={styles.routeLine} />}
                </View>
                <View style={styles.routeRight}>
                  <Text style={styles.routeLabel}>
                    {index === 0 ? 'PICKUP' : index === locations.length - 1 ? 'DROP' : `STOP ${index}`}
                  </Text>
                  <Text style={styles.routeAddress}>{location[1]}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Trip Verification OTPs Card */}
        {(() => {
          const latestAssignment = orderDetails.assignments && orderDetails.assignments.length > 0
            ? orderDetails.assignments[orderDetails.assignments.length - 1]
            : null;

          const startOtp = (orderDetails as any).start_trip_otp || latestAssignment?.start_trip_otp || null;
          const endOtp = (orderDetails as any).end_trip_otp || latestAssignment?.end_trip_otp || null;

          return (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowOtpSection((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBadge, { backgroundColor: '#F0FDF4' }]}>
                  <ShieldCheck size={16} color="#16A34A" />
                </View>
                <Text style={[styles.sectionTitle, { flex: 1 }]}>Trip Verification OTP Codes</Text>
                {showOtpSection ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
              </TouchableOpacity>
              {showOtpSection && (
              <View style={styles.otpCardContainer}>
                <LinearGradient
                  colors={['#0F172A', '#1E293B']}
                  style={styles.otpGradientBox}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.otpCodesRow}>
                    <View style={styles.otpBadgeBox}>
                      <Text style={styles.otpBadgeLabel}>🟢 START TRIP OTP</Text>
                      <Text style={styles.otpBadgeValue}>{startOtp || '----'}</Text>
                    </View>

                    <View style={styles.otpDivider} />

                    <View style={styles.otpBadgeBox}>
                      <Text style={styles.otpBadgeLabel}>🔴 END TRIP OTP</Text>
                      <Text style={styles.otpBadgeValue}>{endOtp || '----'}</Text>
                    </View>
                  </View>

                  <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 10, textAlign: 'center', lineHeight: 16 }}>
                    {startOtp || endOtp
                      ? 'Share these with your customer - the driver asks for the Start OTP at pickup and the End OTP at drop.'
                      : 'OTPs are being generated - pull down to refresh.'}
                  </Text>
                  {(startOtp || endOtp) && (
                    <TouchableOpacity
                      style={styles.copyOtpButton}
                      onPress={() => {
                        const msg = `Drop Cars Booking #${orderDetails.id}\nStart Trip OTP: ${startOtp || 'N/A'} (tell the driver at pickup)\nEnd Trip OTP: ${endOtp || 'N/A'} (tell the driver at drop)`;
                        Share.share({ message: msg }).catch(() => Alert.alert('Trip OTPs', msg));
                      }}
                      activeOpacity={0.85}
                    >
                      <Copy size={14} color="#FFFFFF" />
                      <Text style={styles.copyOtpButtonText}>Share OTPs with Customer</Text>
                    </TouchableOpacity>
                  )}
                </LinearGradient>
              </View>
              )}
            </View>
          );
        })()}

        {orderDetails.vehicle_owner_number ? (
          <>
            {/* Fleet Owner Information */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: '#F5F3FF' }]}>
                  <User size={16} color="#7C3AED" />
                </View>
                <Text style={styles.sectionTitle}>Fleet Owner Contact</Text>
              </View>

              <View style={styles.customerCard}>
                <View style={styles.customerRow}>
                  <Text style={styles.customerName}>
                    {orderDetails.vehicle_owner_name}
                  </Text>

                  <TouchableOpacity
                    style={styles.phoneButton}
                    onPress={() => orderDetails.vehicle_owner_number ? makePhoneCall(orderDetails.vehicle_owner_number) : null}
                  >
                    <Phone size={16} color="#FFFFFF" />
                    <Text style={styles.phoneButtonText}>
                      {orderDetails.vehicle_owner_number}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* Trip Information */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowTripInfoSection((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, { backgroundColor: '#FFF7ED' }]}>
              <Info size={16} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Trip Information</Text>
              {!showTripInfoSection && (
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }} numberOfLines={1}>
                  {orderDetails.trip_type} • {formatCarType(orderDetails.car_type)} • {formatDate(orderDetails.start_date_time)}
                </Text>
              )}
            </View>
            {showTripInfoSection ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
          </TouchableOpacity>
          {showTripInfoSection && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Car size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Trip Type:</Text>
              <Text style={styles.infoValue}>{orderDetails.trip_type}</Text>
            </View>
            <View style={styles.infoRow}>
              <Settings size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Car Type:</Text>
              <Text style={styles.infoValue}>{formatCarType(orderDetails.car_type)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Calendar size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{formatDate(orderDetails.start_date_time)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Clock size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Time:</Text>
              <Text style={styles.infoValue}>{formatTime(orderDetails.start_date_time)}</Text>
            </View>
            <View style={styles.infoRow}>
              <MapPin size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>City:</Text>
              <Text style={styles.infoValue}>{orderDetails.pick_near_city}</Text>
            </View>
            {(orderDetails.trip_distance ?? 0) > 0 && (
              <View style={styles.infoRow}>
                <Route size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Distance:</Text>
                <Text style={styles.infoValue}>{orderDetails.trip_distance} km</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Timer size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Duration:</Text>
              <Text style={styles.infoValue}>
                {isHourlyRental ? `${orderDetails.trip_time} hours` : orderDetails.trip_time}
              </Text>
            </View>
              <View style={styles.infoRow}>
              <Timer size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Assign Max Time:</Text>
              <Text style={styles.infoValue}>
                {orderDetails.max_time != null ? orderDetails.max_time + ' Min' : '—'}
              </Text>
            </View>
            {orderDetails.pickup_notes && (
              <View style={styles.infoRow}>
                <StickyNote size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Pickup Notes:</Text>
                <Text style={styles.infoValue}>{orderDetails.pickup_notes}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Timer size={16} color="#6B7280" />
              <Text style={styles.infoLabel}>Accepted Status:</Text>
              <Text style={[styles.infoValue,{color: latestAssignment ? "#10B981" : "#EF4444"}]}>{acceptedStatusLabel}</Text>
            </View>


            {orderDetails.assignments.length > 0?(            
              <>
                <View style={styles.infoRow}>
                <Timer size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Driver Status:</Text>
                <Text style={[styles.infoValue,{color: orderDetails.assigned_driver_name == null? "#EF4444" : "#10B981"}]}>{orderDetails.assigned_driver_name == null?"Not Assigned":"Assigned"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Timer size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Car Status:</Text>
                <Text style={[styles.infoValue,{color: orderDetails.assigned_car_name == null? "#EF4444" : "#10B981"}]}>{orderDetails.assigned_car_name == null?"Not Assigned":"Assigned"}</Text>
              </View>
              {
                orderDetails.cancelled_by && (              
                <View style={styles.infoRow}>
                <Timer size={16} color="#6B7280" />
                <Text style={styles.infoLabel}>Cancelled By:</Text>
                <Text style={[styles.infoValue,{color: orderDetails.cancelled_by == "AUTO_CANCELLED"? "#EF4444" : "#10B981"}]}>{orderDetails.cancelled_by}</Text>
              </View>)
              }
              </>)
            :null}
          </View>
          )}
        </View>


        {/* Assignment Details */}
        {currentAssignment && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowAssignmentSection((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBadge, { backgroundColor: '#ECFDF5' }]}>
                <Users size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Assignment Details</Text>
                {!showAssignmentSection && (
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }} numberOfLines={1}>
                    {orderDetails.assigned_driver_name || orderDetails.assigned_car_name || 'Driver & vehicle info'}
                  </Text>
                )}
              </View>
              {showAssignmentSection ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
            </TouchableOpacity>
            {showAssignmentSection && (
            <View style={styles.assignmentCard}>
              {orderDetails.assigned_driver_name && (
                <View style={styles.assignmentRow}>
                  <View style={styles.assignmentItem}>
                    <Text style={styles.assignmentLabel}>Driver</Text>
                    <Text style={styles.assignmentValue}>{orderDetails.assigned_driver_name}</Text>
                    {orderDetails.assigned_driver_phone && (
                      <TouchableOpacity onPress={() => makePhoneCall(orderDetails.assigned_driver_phone!)}>
                        <Text style={[styles.assignmentSubValue, styles.clickablePhone]}>{orderDetails.assigned_driver_phone}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              
              {orderDetails.assigned_car_name && (
                <View style={styles.assignmentRow}>
                  <View style={styles.assignmentItem}>
                    <Text style={styles.assignmentLabel}>Vehicle</Text>
                    <Text style={styles.assignmentValue}>{orderDetails.assigned_car_name}</Text>
                    {orderDetails.assigned_car_number && (
                      <Text style={styles.assignmentSubValue}>{orderDetails.assigned_car_number}</Text>
                    )}
                  </View>
                </View>
              )}

              {orderDetails.vehicle_owner_name && (
                <View style={styles.assignmentRow}>
                  <View style={styles.assignmentItem}>
                    <Text style={styles.assignmentLabel}>Fleet</Text>
                    <Text style={styles.assignmentValue}>{orderDetails.vehicle_owner_name}</Text>
                  </View>
                </View>
              )}

              {(currentAssignment.start_trip_otp || currentAssignment.end_trip_otp) && (
                <View style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#92400E', marginBottom: 6 }}>
                    Trip Codes - share these with your customer
                  </Text>
                  <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 8 }}>
                    The driver will ask the customer for these to start and end the trip.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 20 }}>
                    {currentAssignment.start_trip_otp && (
                      <View>
                        <Text style={{ fontSize: 11, color: '#92400E' }}>Start Code</Text>
                        <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: '#92400E', letterSpacing: 2 }}>
                          {currentAssignment.start_trip_otp}
                        </Text>
                      </View>
                    )}
                    {currentAssignment.end_trip_otp && (
                      <View>
                        <Text style={{ fontSize: 11, color: '#92400E' }}>End Code</Text>
                        <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: '#92400E', letterSpacing: 2 }}>
                          {currentAssignment.end_trip_otp}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.assignmentRow}>
                <View style={styles.assignmentItem}>
                  <Text style={styles.assignmentLabel}>Assignment Status</Text>
                  <Text style={[styles.assignmentValue, { color: getStatusColor(currentAssignment.assignment_status) }]}>
                    {currentAssignment.assignment_status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            </View>
            )}
          </View>
        )}

        {/* Financial Details */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowTariffSection((v) => !v)}
            activeOpacity={0.7}
          >
            <CreditCard size={20} color="#0d5464ff" />
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Tariff Details</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginRight: 6 }}>
              ₹{orderDetails.vendor_price}
            </Text>
            {showTariffSection ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
          </TouchableOpacity>
          {showTariffSection && (
          <View style={styles.financialCard}>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Estimated Price</Text>
              <Text style={styles.financialValue}>₹{orderDetails.estimated_price}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Your Quote</Text>
              <Text style={[styles.financialValue, styles.vendorPrice]}>₹{orderDetails.vendor_price}</Text>
            </View>
            <View style={styles.divider} />
            
            {/* Cost Breakdown for different trip types */}
            {!isHourlyRental ? (
              // Oneway/Roundtrip costs
              <>
                {(orderDetails.cost_per_km ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Cost per KM</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.cost_per_km}</Text>
                  </View>
                )}
                {(orderDetails.extra_cost_per_km ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Extra Cost per KM</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.extra_cost_per_km}</Text>
                  </View>
                )}
                {(orderDetails.driver_allowance ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Driver Allowance</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.driver_allowance}</Text>
                  </View>
                )}
                {(orderDetails.extra_driver_allowance ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Extra Driver Allowance</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.extra_driver_allowance}</Text>
                  </View>
                )}
                {(orderDetails.permit_charges ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Permit Charges</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.permit_charges}</Text>
                  </View>
                )}
                {(orderDetails.extra_permit_charges ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Extra Permit Charges</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.extra_permit_charges}</Text>
                  </View>
                )}
                {(orderDetails.hill_charges ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Hill Charges</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.hill_charges}</Text>
                  </View>
                )}
                {((orderDetails.updated_toll_charges ?? 0) > 0 || (orderDetails.toll_charges ?? 0) > 0) && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Toll Charges</Text>
                    <Text style={styles.financialValue}>₹{(orderDetails.updated_toll_charges ?? 0) > 0 ? orderDetails.updated_toll_charges : orderDetails.toll_charges}</Text>
                  </View>
                )}
                {orderDetails.night_charges > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Night Charges</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.night_charges}</Text>
                  </View>
                )}
                {orderDetails.waiting_time > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Waiting Charges</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.waiting_time}</Text>
                  </View>
                )}
              </>
            ) : (
              // Hourly rental costs
              <>
                {orderDetails.package_hours && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Package</Text>
                    <Text style={styles.financialValue}>
                      {orderDetails.package_hours.hours}hrs / {orderDetails.package_hours.km_range}km
                    </Text>
                  </View>
                )}
                {(orderDetails.cost_per_hour ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Cost per Hour</Text>
                    <Text style={styles.financialValue}>₹{(orderDetails.cost_per_hour ?? 0) + (orderDetails.extra_cost_per_hour ?? 0)}</Text>
                  </View>
                )}
                {(orderDetails.cost_for_addon_km ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Cost for Add-on KM</Text>
                    <Text style={styles.financialValue}>₹{(orderDetails.cost_for_addon_km ?? 0) + (orderDetails.extra_cost_for_addon_km ?? 0)}</Text>
                  </View>
                )}
                {(orderDetails.updated_toll_charges ?? 0) > 0 && (
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Toll Charge</Text>
                    <Text style={styles.financialValue}>₹{orderDetails.updated_toll_charges}</Text>
                  </View>
                )}
              </>
            )}
            
            <View style={styles.divider} />
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Your Earning</Text>
              <Text style={[styles.financialValue, styles.profit]}>
                +₹{orderDetails.vendor_profit != null ? orderDetails.vendor_profit : orderDetails.source == "NEW_ORDERS"?
                orderDetails.vendor_earns_estimation 
                // ((orderDetails.vendor_price-orderDetails.estimated_price)+Math.round(((orderDetails.cost_per_km || 0) * (orderDetails.trip_distance || 0))*orderDetails.platform_fees_percent)/100) - Math.round((((orderDetails.vendor_price-orderDetails.estimated_price)+Math.round(((orderDetails.cost_per_km || 0) * (orderDetails.trip_distance || 0))*orderDetails.platform_fees_percent)/100))* orderDetails.platform_fees_percent/100)
                :
                (orderDetails.vendor_price-orderDetails.estimated_price) - Math.round((orderDetails.vendor_price-orderDetails.estimated_price)*orderDetails.platform_fees_percent/100)
                }
                
              </Text>
            </View>
            {/* <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Platform Fee ({orderDetails.platform_fees_percent}%)</Text>
              <Text style={[styles.financialValue, styles.fee]}>
                -₹{orderDetails.admin_profit? orderDetails.admin_profit :orderDetails.source == "NEW_ORDERS"?
                Math.round((((orderDetails.vendor_price-orderDetails.estimated_price)+Math.round(((orderDetails.cost_per_km || 0) * (orderDetails.trip_distance || 0))*orderDetails.platform_fees_percent)/100))* orderDetails.platform_fees_percent/100)
                :
                Math.round((orderDetails.vendor_price-orderDetails.estimated_price)*orderDetails.platform_fees_percent/100)
              }
              </Text>
            </View> */}
            {(orderDetails.closed_vendor_price ?? 0) > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.financialRow}>
                  <Text style={[styles.financialLabel, styles.finalLabel]}>Customer Amount</Text>
                  <Text style={[styles.financialValue, styles.finalValue]}>₹{orderDetails.closed_vendor_price}</Text>
                </View>
              </>
            )}
          </View>
          )}
        </View>

        {/* Customer Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={20} color="#0d5464ff" />
            <Text style={styles.sectionTitle}>Customer Details</Text>
          </View>
          <View style={styles.customerCard}>
            <View style={styles.customerRow}>
              <Text style={styles.customerName}>{orderDetails.customer_name}</Text>
              <TouchableOpacity 
                style={styles.phoneButton}
                onPress={() => makePhoneCall(orderDetails.customer_number)}
              >
                <Phone size={16} color="#FFFFFF" />
                <Text style={styles.phoneButtonText}>{orderDetails.customer_number}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* End Records */}
        {latestEndRecord && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowTripRecordSection((v) => !v)}
              activeOpacity={0.7}
            >
              <Gauge size={20} color="#0d5464ff" />
              <Text style={[styles.sectionTitle, { flex: 1 }]}>Trip Record</Text>
              {showTripRecordSection ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
            </TouchableOpacity>
            {showTripRecordSection && (
            <View style={styles.endRecordCard}>
              <View style={styles.kmRow}>
                <View style={styles.kmItem}>
                  <Text style={styles.kmLabel}>Start KM</Text>
                  <Text style={styles.kmValue}>{latestEndRecord.start_km}</Text>
                </View>
                <View style={styles.kmItem}>
                  <Text style={styles.kmLabel}>End KM</Text>
                  <Text style={styles.kmValue}>{latestEndRecord.end_km}</Text>
                </View>
                <View style={styles.kmItem}>
                  <Text style={styles.kmLabel}>Total KM</Text>
                  <Text style={[styles.kmValue, styles.totalKm]}>
                    {latestEndRecord.end_km>0? latestEndRecord.end_km - latestEndRecord.start_km:0}
                  </Text>
                </View>
              </View>
              
              {/* Odometer Images */}
              {(latestEndRecord.img_url || latestEndRecord.close_speedometer_image) && (
                <View style={styles.imageSection}>
                  <Text style={styles.imageLabel}>Odometer Images</Text>
                  <View style={styles.imageRow}>
                    {latestEndRecord.img_url && (
                      <TouchableOpacity 
                        style={styles.imageButton}
                        onPress={() => viewImage(latestEndRecord.img_url, 'Start Odometer')}
                      >
                        <Eye size={16} color="#0d5464ff" />
                        <Text style={styles.imageButtonText}>Start Odometer</Text>
                      </TouchableOpacity>
                    )}
                    {latestEndRecord.close_speedometer_image && (
                      <TouchableOpacity 
                        style={styles.imageButton}
                        onPress={() => viewImage(latestEndRecord.close_speedometer_image, 'End Odometer')}
                      >
                        <Eye size={16} color="#0d5464ff" />
                        <Text style={styles.imageButtonText}>End Odometer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
            )}
          </View>
        )}

        {/* Action Buttons - at the bottom of the page (with Cancel), not
            crowding the top, since they're occasional actions rather than
            something needed on every visit to this screen. */}
        {(canEditFare || canRecreate || !latestAssignment) && (
          <View style={styles.headerActionsBar}>
            {!latestAssignment && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#2563EB' }]}
                onPress={() => setShowAssignDuty(true)}
                activeOpacity={0.85}
              >
                <Send size={14} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Assign Duty</Text>
              </TouchableOpacity>
            )}

            {canEditFare && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#059669' }]}
                onPress={openEditFare}
                activeOpacity={0.85}
              >
                <Settings size={14} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Edit Fare</Text>
              </TouchableOpacity>
            )}

            {canRecreate && (
              <TouchableOpacity
                style={[styles.actionButton, styles.recreateButton, recreateLoading && styles.actionButtonDisabled]}
                onPress={showMaxTimeInputDialog}
                disabled={recreateLoading || showRecreateInput}
                activeOpacity={0.85}
              >
                {recreateLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <RefreshCw size={14} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>Recreate</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {orderDetails.trip_status === 'PENDING' && (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>Show customer number to driver</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17 }}>
                Hidden until a few hours before pickup. Turn on to show it to the driver now.
              </Text>
            </View>
            <Switch
              value={custVisible ?? !!orderDetails.data_visibility_vehicle_owner}
              disabled={custSwitchBusy}
              onValueChange={toggleCustomerVisibility}
            />
          </View>
        )}

        {orderDetails.trip_status === 'PENDING' && (
          <TouchableOpacity
            onPress={notifyDrivers}
            disabled={notifying}
            activeOpacity={0.85}
            style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 14, opacity: notifying ? 0.7 : 1 }}
          >
            {notifying ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={16} color="#FFFFFF" />}
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>{notifying ? 'Alerting drivers...' : 'Notify drivers again'}</Text>
          </TouchableOpacity>
        )}

        {orderDetails.trip_status === 'PENDING' && (
          <View style={styles.bottomCancelContainer}>
            <TouchableOpacity
              style={styles.bottomCancelBtn}
              onPress={cancelOrder}
              disabled={cancelLoading}
            >
              {cancelLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <X size={16} color="#EF4444" />
                  <Text style={styles.bottomCancelBtnText}>Cancel Booking</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
      </View>
      
      {/* Order Success Modal */}
      <OrderSuccess
        visible={showOrderSuccess}
        onClose={() => {
          setShowOrderSuccess(false);
          setRecreatedOrderData(null);
          router.back();
        }}
        orderData={recreatedOrderData}
      />

      {/* ── Edit Fare Bottom Sheet ── */}
      <Modal visible={showEditFare} transparent animationType="slide" onRequestClose={() => setShowEditFare(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 10, marginBottom: 4 }} />
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0F172A' }}>Edit Fare — Booking #{orderDetails.id}</Text>
              <TouchableOpacity onPress={() => setShowEditFare(false)} style={{ padding: 4 }}>
                <X size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              {Object.entries({
                cost_per_km: 'Cost per KM (₹)',
                extra_cost_per_km: 'Extra Cost per KM (₹)',
                driver_allowance: 'Driver Allowance (₹)',
                extra_driver_allowance: 'Extra Driver Allowance (₹)',
                permit_charges: 'Permit Charges (₹)',
                extra_permit_charges: 'Extra Permit Charges (₹)',
                hill_charges: 'Hill Charges (₹)',
                toll_charges: 'Toll Charges (₹)',
                night_charges: 'Night Charges (₹)',
                cost_per_hour: 'Cost per Hour (₹)',
                extra_cost_per_hour: 'Extra Cost per Hour (₹)',
                pickup_notes: 'Pickup Notes',
              }).filter(([k]) => k in editFields).map(([key, label]) => (
                <View key={key} style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 5 }}>{label}</Text>
                  <TextInput
                    style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC' }}
                    value={editFields[key]}
                    onChangeText={v => setEditFields(prev => ({ ...prev, [key]: v }))}
                    keyboardType={key === 'pickup_notes' ? 'default' : 'numeric'}
                    placeholder={`Enter ${label}`}
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              ))}
            </ScrollView>
            {/* Confirm */}
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
              <TouchableOpacity
                style={{ backgroundColor: editLoading ? '#94A3B8' : '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={submitEditFare}
                disabled={editLoading}
              >
                {editLoading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DutyAssignModal
        visible={showAssignDuty}
        onClose={() => setShowAssignDuty(false)}
        bookingDetails={{
          order_id: orderDetails.id,
          pickup: orderDetails.pickup_drop_location?.['0'] || 'Unknown',
          drop: orderDetails.pickup_drop_location?.['1'] || 'Unknown',
          estimated_price: orderDetails.estimated_price,
          car_type: orderDetails.car_type,
        }}
        onDispatchConfirmed={() => {
          setShowAssignDuty(false);
          fetchOrderDetails();
        }}
      />

      <CancelReasonModal
        visible={showCancelReason}
        message="The driver who accepted this booking (if any) will be told the reason you pick."
        confirmLabel="Cancel Booking"
        submitting={cancelLoading}
        onClose={() => !cancelLoading && setShowCancelReason(false)}
        onConfirm={confirmCancelOrder}
      />
    </>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0d5464ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleGroup: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  headerActionsBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
  },
  cancelButton: {
    backgroundColor: '#DC2626',
    flex: 1,
  },
  recreateButton: {
    backgroundColor: '#10B981',
    flex: 1,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  phoneButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  clickablePhone: {
    color: '#10B981',
    textDecorationLine: 'underline',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  routeItem: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  routeLeft: {
    alignItems: 'center',
    marginRight: 14,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  routeDotStart: {
    backgroundColor: '#10B981',
  },
  routeDotMiddle: {
    backgroundColor: '#F59E0B',
  },
  routeDotEnd: {
    backgroundColor: '#DC2626',
  },
  routeLine: {
    width: 1.5,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginTop: 3,
  },
  routeRight: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 3,
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  assignmentRow: {
    marginBottom: 14,
  },
  assignmentItem: {
    flex: 1,
  },
  assignmentLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  assignmentValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  assignmentSubValue: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  financialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  financialLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  financialValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  vendorPrice: {
    color: '#0d5464ff',
  },
  profit: {
    color: '#10B981',
  },
  fee: {
    color: '#DC2626',
  },
  finalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  finalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 6,
  },
  endRecordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  kmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  kmItem: {
    alignItems: 'center',
    flex: 1,
  },
  kmLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  kmValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#202124',
  },
  totalKm: {
    color: '#10B981',
  },
  imageSection: {
    marginTop: 14,
  },
  imageLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 10,
  },
  imageRow: {
    flexDirection: 'row',
    gap: 10,
  },
recreateContainer: {
  flex: 1,
  minWidth: 100, // Ensure minimum width
},
recreateInputContainer: {
  backgroundColor: '#FFFFFF',
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
  elevation: 2,
  borderWidth: 1,
  borderColor: '#E5E7EB',
},
recreateInputLabel: {
  fontSize: 12,
  color: '#6B7280',
  marginBottom: 8,
  fontWeight: '500',
},
recreateInputRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},
recreateInput: {
  flex: 1,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  borderRadius: 6,
  paddingHorizontal: 10,
  paddingVertical: 8,
  fontSize: 14,
  color: '#202124',
  backgroundColor: '#F9FAFB',
},
submitButton: {
  backgroundColor: '#10B981',
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 6,
},
submitButtonDisabled: {
  backgroundColor: '#9CA3AF',
  opacity: 0.6,
},
submitButtonText: {
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: '600',
},
cancelInputButton: {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: '#D1D5DB',
},
cancelInputButtonText: {
  color: '#6B7280',
  fontSize: 12,
  fontWeight: '600',
},
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flex: 1,
    justifyContent: 'center',
  },
  imageButtonText: {
    fontSize: 13,
    color: '#0d5464ff',
    fontWeight: '600',
    marginLeft: 6,
  },
  imageContainer: {
    alignItems: 'center',
  },
  bottomSpacing: {
    height: 20,
  },
  visibilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  visibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visibilityInfo: {
    flex: 1,
    marginRight: 14,
  },
  visibilityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 3,
  },
  visibilityDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  switchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 54,
    height: 36,
  },
  otpCardContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  otpGradientBox: {
    padding: 16,
    borderRadius: 14,
  },
  otpHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  otpHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  otpHeaderSub: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  otpInstructionText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  otpCodesRow: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  otpBadgeBox: {
    flex: 1,
    alignItems: 'center',
  },
  otpBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  otpBadgeValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  otpDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#334155',
  },
  copyOtpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
    marginTop: 12,
  },
  copyOtpButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomCancelContainer: {
    marginTop: 20,
    marginBottom: 8,
    alignItems: 'center',
  },
  bottomCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  bottomCancelBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});