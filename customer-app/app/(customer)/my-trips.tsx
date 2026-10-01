import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking, ActivityIndicator, Platform, Alert, Modal } from 'react-native';
import { ShieldCheck, PhoneCall, AlertCircle, Inbox, MapPin, RefreshCw, Star, CheckCircle2, IndianRupee, FileText, Download, X, MessageCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell, useScreenTheme } from '@/components/SafeArea';
import axiosInstance from '@/app/api/axiosInstance';

// Same guarded pattern as TaxiFlowContext.tsx / book/standard.tsx - the
// native module isn't available on Expo web.
let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  try {
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch (e) {
    RazorpayCheckout = null;
  }
}

// Mirrors backend schemas/rating.py RateableTripOut - completed, self-booked
// trips (see crud/ratings.py) that this customer hasn't rated yet.
interface RateableTrip {
  order_id: number;
  booking_id: string;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  driver: { full_name: string; primary_number: string; licence_number?: string | null } | null;
  car: { car_name: string; car_type: string; car_number: string } | null;
}

interface DriverDetails {
  full_name: string;
  primary_number: string;
  licence_number?: string | null;
}

interface CarDetailsShort {
  car_name: string;
  car_type: string;
  car_number: string;
}

// Mirrors backend schemas/customer_booking.py CustomerBookingOut - only the
// fields this screen actually renders are declared here.
interface CustomerBooking {
  id: string;
  pickup_drop_location: Record<string, string>;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  quoted_total_amount: number;
  admin_total_amount: number | null;
  status: string; // PENDING | APPROVED | REJECTED
  rejection_reason: string | null;
  linked_order_id: number | null;
  is_paid: boolean;
  created_at: string;
  driver_details: DriverDetails | null;
  car_details: CarDetailsShort | null;
  trip_status: string | null; // Order.trip_status: PENDING | COMPLETED | CANCELLED
  assignment_status: string | null; // OrderAssignment.assignment_status: PENDING | ASSIGNED | DRIVING | COMPLETED | CANCELLED
  gst_included?: boolean;
  gst_amount?: number;
}

type RideBucket = 'UPCOMING' | 'RUNNING' | 'COMPLETED';

function bucketOf(booking: CustomerBooking): RideBucket {
  if (booking.assignment_status === 'DRIVING') return 'RUNNING';
  if (booking.trip_status === 'COMPLETED' || booking.assignment_status === 'COMPLETED') return 'COMPLETED';
  return 'UPCOMING';
}

function routeLabel(location: Record<string, string>): string {
  const keys = Object.keys(location).sort((a, b) => Number(a) - Number(b));
  const stops = keys.map((k) => location[k]).filter(Boolean);
  if (stops.length === 0) return 'Route unavailable';
  if (stops.length === 1) return stops[0];
  return `${stops[0]} ➔ ${stops[stops.length - 1]}`;
}

function statusColor(booking: CustomerBooking): { bg: string; fg: string; label: string } {
  if (booking.status === 'REJECTED') return { bg: 'rgba(239, 68, 68, 0.2)', fg: '#EF4444', label: 'Rejected' };
  if (booking.status === 'PENDING') return { bg: 'rgba(245, 158, 11, 0.2)', fg: '#F59E0B', label: 'Pending Approval' };
  // APPROVED
  if (booking.linked_order_id) return { bg: 'rgba(16, 185, 129, 0.2)', fg: '#10B981', label: 'Confirmed' };
  return { bg: 'rgba(14, 165, 233, 0.2)', fg: '#0EA5E9', label: 'Approved' };
}

import { useServiceMode } from '@/contexts/ServiceModeContext';

export default function MyTripsScreen() {
  const { isDark } = useScreenTheme();
  const { user } = useAuth();
  const { activeMode } = useServiceMode();
  const isCarpoolMode = activeMode === 'CARPOOL';
  const themeStyles = getStyles(isDark);

  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [rateableTrips, setRateableTrips] = useState<RateableTrip[]>([]);
  const [rateableLoading, setRateableLoading] = useState(true);

  const [activeBucket, setActiveBucket] = useState<RideBucket>('UPCOMING');
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const fetchRateableTrips = useCallback(async () => {
    if (!user) {
      setRateableLoading(false);
      return;
    }
    try {
      const response = await axiosInstance.get<RateableTrip[]>('/api/customer/ratings/rateable');
      setRateableTrips(response.data);
    } catch (error) {
      // Non-critical section - fail quietly, the rest of the screen still works.
      setRateableTrips([]);
    } finally {
      setRateableLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRateableTrips();
  }, [fetchRateableTrips]);

  const handleRated = (orderId: number) => {
    setRateableTrips((prev) => prev.filter((t) => t.order_id !== orderId));
  };

  const fetchBookings = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    try {
      setLoadError('');
      const response = await axiosInstance.get<CustomerBooking[]>('/api/customer/bookings');
      setBookings(response.data);
    } catch (error: any) {
      setLoadError(
        error?.response?.status === 401
          ? 'Your session has expired. Please log in again.'
          : 'Could not load your bookings. Pull down to try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return (
    <ScreenShell
      title={isCarpoolMode ? 'Your Carpools 🤝' : 'My Rides 🚕'}
      subtitle={isCarpoolMode ? 'Your seat requests & hosted Drop Share trips' : 'Your booking history and live trip details'}
    >
        {!rateableLoading && rateableTrips.length > 0 && (
          <>
            <Text style={themeStyles.sectionHeader}>Rate Your Trips</Text>
            {rateableTrips.map((trip) => (
              <RateTripCard key={trip.order_id} trip={trip} themeStyles={themeStyles} isDark={isDark} onRated={handleRated} />
            ))}
          </>
        )}

        <View style={themeStyles.sectionHeaderRow}>
          <Text style={themeStyles.sectionHeader}>Your Bookings</Text>
          <TouchableOpacity onPress={fetchBookings} disabled={isLoading} style={themeStyles.refreshBtn}>
            <RefreshCw color="#0EA5E9" size={16} />
          </TouchableOpacity>
        </View>

        <View style={themeStyles.bucketTabs}>
          {([['UPCOMING', 'Upcoming'], ['RUNNING', 'Running'], ['COMPLETED', 'Completed']] as [RideBucket, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[themeStyles.bucketTab, activeBucket === key && themeStyles.bucketTabActive]}
              onPress={() => { setActiveBucket(key); setExpandedBookingId(null); }}
            >
              <Text style={[themeStyles.bucketTabText, activeBucket === key && themeStyles.bucketTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={themeStyles.emptyStateCard}>
            <ActivityIndicator color="#0EA5E9" />
          </View>
        ) : loadError ? (
          <View style={themeStyles.emptyStateCard}>
            <View style={themeStyles.notFoundIconBadge}>
              <AlertCircle color="#EF4444" size={32} />
            </View>
            <Text style={themeStyles.emptyStateTitle}>Couldn't Load Bookings</Text>
            <Text style={themeStyles.emptyStateText}>{loadError}</Text>
          </View>
        ) : bookings.length === 0 ? (
          <View style={themeStyles.emptyStateCard}>
            <View style={themeStyles.emptyStateIconBadge}>
              <Inbox color="#0EA5E9" size={32} />
            </View>
            <Text style={themeStyles.emptyStateTitle}>No Rides Yet</Text>
            <Text style={themeStyles.emptyStateText}>
              Your completed and ongoing bookings will show up here once you book your first ride.
            </Text>
          </View>
        ) : (
          (() => {
            const filtered = bookings.filter((b) => bucketOf(b) === activeBucket);
            if (filtered.length === 0) {
              return (
                <View style={themeStyles.emptyStateCard}>
                  <View style={themeStyles.emptyStateIconBadge}>
                    <Inbox color="#0EA5E9" size={32} />
                  </View>
                  <Text style={themeStyles.emptyStateTitle}>
                    {activeBucket === 'UPCOMING' ? 'No Upcoming Rides' : activeBucket === 'RUNNING' ? 'No Ride In Progress' : 'No Completed Rides Yet'}
                  </Text>
                </View>
              );
            }
            return filtered.map((booking) => (
              <RideRow
                key={booking.id}
                booking={booking}
                bucket={activeBucket}
                expanded={expandedBookingId === booking.id}
                onToggle={() => setExpandedBookingId((cur) => (cur === booking.id ? null : booking.id))}
                themeStyles={themeStyles}
                isDark={isDark}
                onPaid={fetchBookings}
              />
            ));
          })()
        )}
    </ScreenShell>
  );
}

function RideRow({
  booking,
  bucket,
  expanded,
  onToggle,
  themeStyles,
  isDark,
  onPaid,
}: {
  booking: CustomerBooking;
  bucket: RideBucket;
  expanded: boolean;
  onToggle: () => void;
  themeStyles: any;
  isDark: boolean;
  onPaid: () => void;
}) {
  const status = statusColor(booking);
  const startDate = new Date(booking.start_date_time);
  const startLabel = isNaN(startDate.getTime()) ? '' : startDate.toLocaleDateString();
  const actionLabel = bucket === 'UPCOMING' ? 'Track Booking' : 'View Details';

  return (
    <View style={themeStyles.rideRowWrap}>
      <TouchableOpacity style={themeStyles.rideRow} onPress={onToggle} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <Text style={themeStyles.routeText} numberOfLines={1}>{routeLabel(booking.pickup_drop_location)}</Text>
          <Text style={themeStyles.passengerText}>
            {booking.trip_type} • {booking.car_type}{startLabel ? ` • ${startLabel}` : ''}
          </Text>
        </View>
        <View style={[themeStyles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[themeStyles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={themeStyles.rideActionBtn} onPress={onToggle}>
        <Text style={themeStyles.rideActionBtnText}>{expanded ? 'Hide Details' : actionLabel}</Text>
      </TouchableOpacity>

      {expanded && <BookingCard booking={booking} themeStyles={themeStyles} isDark={isDark} onPaid={onPaid} />}
    </View>
  );
}

function BookingCard({ booking, themeStyles, isDark, onPaid }: { booking: CustomerBooking; themeStyles: any; isDark: boolean; onPaid: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showGstModal, setShowGstModal] = useState(false);
  const [fetchingGst, setFetchingGst] = useState(false);
  const [payingGst, setPayingGst] = useState(false);
  const [gstQuote, setGstQuote] = useState<{
    km_fare: number;
    gst_amount: number;
    gateway_charge: number;
    total_upgrade_amount: number;
  } | null>(null);

  const handleDownloadInvoice = async () => {
    try {
      setDownloadingPdf(true);
      if (Platform.OS === 'web') {
        const res = await axiosInstance.get(`/api/customer/bookings/${booking.id}/invoice-pdf`, {
          responseType: 'blob',
        });
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = (window as any).URL.createObjectURL(blob);
        const a = (document as any).createElement('a');
        a.href = url;
        a.download = `Tax_Invoice_${booking.id}.pdf`;
        (document as any).body.appendChild(a);
        a.click();
        (document as any).body.removeChild(a);
        (window as any).URL.revokeObjectURL(url);
      } else {
        const token = await AsyncStorage.getItem('token');
        const baseUrl = axiosInstance.defaults.baseURL || 'https://drop-cars-api-207918408785.asia-south2.run.app';
        const url = `${baseUrl}/api/customer/bookings/${booking.id}/invoice-pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        Linking.openURL(url);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not download GST invoice.';
      Alert.alert('Download Error', String(msg));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleOpenGstModal = async () => {
    try {
      setFetchingGst(true);
      const res = await axiosInstance.get(`/api/customer/bookings/${booking.id}/gst-status`);
      setGstQuote(res.data);
      setShowGstModal(true);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not calculate GST upgrade.';
      Alert.alert('Error', String(msg));
    } finally {
      setFetchingGst(false);
    }
  };

  const handlePayGstUpgrade = async () => {
    if (!RazorpayCheckout && Platform.OS !== 'web') {
      Alert.alert('Payment unavailable', 'Online payment is not supported on this device.');
      return;
    }
    try {
      setPayingGst(true);
      const orderRes = await axiosInstance.post(`/api/customer/bookings/${booking.id}/create-gst-order`);
      const { razorpay_order_id, amount, key_id } = orderRes.data;

      if (Platform.OS === 'web') {
        const payRes = await new Promise<any>((resolve, reject) => {
          const rzp = (window as any).Razorpay ? new (window as any).Razorpay({
            key: key_id || 'rzp_live_RuMG3DMZFdeT3Y',
            amount,
            currency: 'INR',
            name: 'Drop Cars',
            description: 'GST Tax Invoice Upgrade',
            order_id: razorpay_order_id,
            handler: resolve,
            prefill: {
              contact: user?.phone || '9999999999',
              email: `${user?.phone || 'customer'}@dropcars.in`,
            },
            theme: { color: '#0EA5E9' },
          }) : null;
          if (rzp) {
            rzp.open();
          } else {
            reject(new Error('Razorpay checkout is unavailable.'));
          }
        });

        await axiosInstance.post(`/api/customer/bookings/${booking.id}/verify-gst-payment`, {
          rp_order_id: payRes.razorpay_order_id || razorpay_order_id,
          rp_payment_id: payRes.razorpay_payment_id,
          rp_signature: payRes.razorpay_signature,
        });
      } else {
        const razorpayResult = await new Promise<any>((resolve, reject) => {
          RazorpayCheckout.open({
            description: 'GST Tax Invoice Upgrade',
            currency: 'INR',
            key: key_id || 'rzp_live_RuMG3DMZFdeT3Y',
            amount,
            name: 'Drop Cars',
            order_id: razorpay_order_id,
            prefill: {
              email: `${user?.phone || 'customer'}@dropcars.in`,
              contact: user?.phone || '9999999999',
              name: user?.name || 'Drop Cars Customer',
            },
            theme: { color: '#0EA5E9' },
          }).then(resolve).catch(reject);
        });

        await axiosInstance.post(`/api/customer/bookings/${booking.id}/verify-gst-payment`, {
          rp_order_id: razorpayResult.razorpay_order_id || razorpay_order_id,
          rp_payment_id: razorpayResult.razorpay_payment_id,
          rp_signature: razorpayResult.razorpay_signature,
        });
      }

      setShowGstModal(false);
      Alert.alert('GST Invoice Unlocked! 🎉', 'Official GST Tax invoice has been generated and emailed. You can now download the PDF.');
      onPaid();
      handleDownloadInvoice();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.description || e?.message || 'Payment not completed.';
      Alert.alert('Payment Failed', String(msg));
    } finally {
      setPayingGst(false);
    }
  };

  const status = statusColor(booking);
  const fare = booking.admin_total_amount ?? booking.quoted_total_amount;
  const startDate = new Date(booking.start_date_time);
  const startLabel = isNaN(startDate.getTime()) ? '' : startDate.toLocaleString();
  const hasDiscrepancy = booking.admin_total_amount != null && booking.admin_total_amount !== booking.quoted_total_amount;

  const handlePayNow = async () => {
    if (!RazorpayCheckout) {
      Alert.alert('Payment unavailable', 'Online payment isn\'t available on this device/platform yet. Please contact support to pay.');
      return;
    }
    setPaying(true);
    try {
      const payRes = await axiosInstance.post(`/api/customer/bookings/${booking.id}/pay`);
      const { rp_order_id, amount } = payRes.data;

      const razorpayResult = await new Promise<any>((resolve, reject) => {
        RazorpayCheckout.open({
          description: 'Drop Cars taxi booking',
          currency: 'INR',
          key: 'rzp_live_RuMG3DMZFdeT3Y',
          amount,
          name: 'Drop Cars',
          order_id: rp_order_id,
          prefill: {
            email: `${user?.phone || 'customer'}@dropcars.in`,
            contact: user?.phone || '9999999999',
            name: user?.name || 'Drop Cars Customer',
          },
          theme: { color: '#0EA5E9' },
        }).then(resolve).catch(reject);
      });

      await axiosInstance.post(`/api/customer/bookings/${booking.id}/verify`, {
        rp_order_id: razorpayResult.razorpay_order_id || rp_order_id,
        rp_payment_id: razorpayResult.razorpay_payment_id,
        rp_signature: razorpayResult.razorpay_signature,
      });
      onPaid();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.description || 'Payment was not completed.';
      Alert.alert('Payment not completed', String(msg));
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={themeStyles.card}>
      <View style={themeStyles.cardHeader}>
        <View>
          <Text style={themeStyles.orderId}>
            {booking.linked_order_id ? `Order #${booking.linked_order_id}` : `Booking Request`}
          </Text>
          <Text style={themeStyles.passengerText}>{booking.trip_type} • {booking.car_type}</Text>
        </View>
        <View style={[themeStyles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[themeStyles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>

      <View style={themeStyles.routeRow}>
        <MapPin color="#0EA5E9" size={16} />
        <Text style={themeStyles.routeText}>{routeLabel(booking.pickup_drop_location)}</Text>
      </View>
      {startLabel ? <Text style={themeStyles.detailsText}>{startLabel}</Text> : null}
      <Text style={themeStyles.fareText}>Total: ₹{fare.toLocaleString('en-IN')} {booking.is_paid ? '· Paid' : '· Unpaid'}</Text>

      {hasDiscrepancy && !booking.is_paid ? (
        <View style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 10, padding: 10, gap: 2 }}>
          <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '800' }}>Final bill updated by Drop Cars</Text>
          <Text style={{ color: '#B45309', fontSize: 11 }}>
            You were quoted ₹{booking.quoted_total_amount.toLocaleString('en-IN')}. The reviewed total is ₹{(booking.admin_total_amount as number).toLocaleString('en-IN')}. Please confirm and pay this amount to proceed.
          </Text>
        </View>
      ) : null}

      {!booking.is_paid && booking.status !== 'REJECTED' ? (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0EA5E9', borderRadius: 10, paddingVertical: 10, opacity: paying ? 0.7 : 1 }}
          onPress={handlePayNow}
          disabled={paying}
        >
          {paying ? <ActivityIndicator color="#FFFFFF" size="small" /> : <IndianRupee color="#FFFFFF" size={15} />}
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
            {paying ? 'Processing…' : `Pay ₹${fare.toLocaleString('en-IN')}`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {booking.linked_order_id && booking.status !== 'REJECTED' && bucketOf(booking) !== 'COMPLETED' ? (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#6366F1', borderRadius: 10, paddingVertical: 9 }}
          onPress={() => router.push({ pathname: '/(customer)/chat-room', params: { order: String(booking.linked_order_id), title: 'Your trip chat' } } as any)}
          accessibilityLabel="Chat about this trip"
        >
          <MessageCircle color="#6366F1" size={15} />
          <Text style={{ color: '#6366F1', fontSize: 13, fontWeight: '800' }}>Chat about this trip</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === 'REJECTED' && booking.rejection_reason ? (
        <View style={themeStyles.errorBadge}>
          <AlertCircle color="#EF4444" size={16} />
          <Text style={themeStyles.errorText}>{booking.rejection_reason}</Text>
        </View>
      ) : null}

      {booking.driver_details && (
        <View style={themeStyles.driverBox}>
          <ShieldCheck color="#10B981" size={26} />
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.driverTitle}>Driver: {booking.driver_details.full_name}</Text>
            {booking.car_details ? (
              <Text style={themeStyles.carNo}>{booking.car_details.car_name} • {booking.car_details.car_number}</Text>
            ) : null}
            <Text style={themeStyles.driverPhone}>Mobile: {booking.driver_details.primary_number}</Text>
          </View>
          <TouchableOpacity
            style={themeStyles.callDriverBtn}
            onPress={() => Linking.openURL(`tel:${booking.driver_details!.primary_number}`)}
          >
            <PhoneCall color="#FFFFFF" size={16} />
          </TouchableOpacity>
        </View>
      )}

      {/* GST Tax Invoice Card / Upgrade Trigger */}
      <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#E2E8F0' }}>
        {booking.gst_included ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5', borderWidth: 1, borderColor: '#10B981', borderRadius: 10, padding: 10 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={15} color="#10B981" />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#047857' }}>GST Tax Invoice Available</Text>
              </View>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>Official SAC 9964 tax invoice included</Text>
            </View>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, opacity: downloadingPdf ? 0.7 : 1 }}
              onPress={handleDownloadInvoice}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Download size={14} color="#FFFFFF" />}
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Download PDF</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 10, padding: 10 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: isDark ? '#F1F5F9' : '#0F172A' }}>Need GST Invoice for Tax Filing?</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>5% GST on KM fare · Pure KM tax rule</Text>
            </View>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0284C7', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, opacity: fetchingGst ? 0.7 : 1 }}
              onPress={handleOpenGstModal}
              disabled={fetchingGst}
            >
              {fetchingGst ? <ActivityIndicator size="small" color="#FFFFFF" /> : <FileText size={13} color="#FFFFFF" />}
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Get Invoice</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* GST Upgrade Modal */}
      <Modal visible={showGstModal} transparent animationType="fade" onRequestClose={() => setShowGstModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 440, backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: isDark ? '#334155' : '#CBD5E1' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>GST Tax Invoice Upgrade</Text>
                <Text style={{ fontSize: 11.5, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>Official SAC 9964 corporate tax invoice</Text>
              </View>
              <TouchableOpacity onPress={() => setShowGstModal(false)} style={{ padding: 4 }}>
                <X size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {gstQuote && (
              <View style={{ backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderRadius: 12, padding: 14, marginBottom: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: isDark ? '#94A3B8' : '#64748B' }}>Base KM Fare:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#F8FAFC' : '#0F172A' }}>₹{gstQuote.km_fare.toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: isDark ? '#94A3B8' : '#64748B' }}>GST 5% (2.5% CGST + 2.5% SGST):</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0284C7' }}>+₹{gstQuote.gst_amount.toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: isDark ? '#64748B' : '#94A3B8' }}>Driver Bata & Tolls:</Text>
                  <Text style={{ fontSize: 11.5, color: isDark ? '#64748B' : '#94A3B8' }}>₹0 (Non-Taxable)</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: isDark ? '#94A3B8' : '#64748B' }}>Payment Gateway Fee (~2.4%):</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#F8FAFC' : '#0F172A' }}>+₹{gstQuote.gateway_charge.toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: isDark ? '#334155' : '#CBD5E1', marginVertical: 4 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>Total Amount to Pay:</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#059669' }}>₹{gstQuote.total_upgrade_amount.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0284C7', paddingVertical: 12, borderRadius: 10, opacity: payingGst ? 0.7 : 1 }}
              onPress={handlePayGstUpgrade}
              disabled={payingGst}
            >
              {payingGst ? <ActivityIndicator size="small" color="#FFFFFF" /> : <IndianRupee size={15} color="#FFFFFF" />}
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
                {payingGst ? 'Processing Payment…' : `Pay ₹${gstQuote?.total_upgrade_amount || 0} & Unlock Invoice`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StarPicker({ value, onChange, themeStyles }: { value: number; onChange: (v: number) => void; themeStyles: any }) {
  return (
    <View style={themeStyles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Star
            size={26}
            color={n <= value ? '#F59E0B' : '#64748B'}
            fill={n <= value ? '#F59E0B' : 'transparent'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RateTripCard({
  trip,
  themeStyles,
  isDark,
  onRated,
}: {
  trip: RateableTrip;
  themeStyles: any;
  isDark: boolean;
  onRated: (orderId: number) => void;
}) {
  const [driverRating, setDriverRating] = useState(0);
  const [carRating, setCarRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const startDate = new Date(trip.start_date_time);
  const startLabel = isNaN(startDate.getTime()) ? '' : startDate.toLocaleDateString();

  const handleSubmit = async () => {
    if (!driverRating || !carRating || !serviceRating) {
      setError('Please rate the driver, car, and service before submitting.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await axiosInstance.post('/api/customer/ratings', {
        order_id: trip.order_id,
        driver_rating: driverRating,
        car_rating: carRating,
        service_rating: serviceRating,
        comment: comment.trim() || undefined,
      });
      onRated(trip.order_id);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not submit your rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={themeStyles.card}>
      <View style={themeStyles.cardHeader}>
        <View>
          <Text style={themeStyles.orderId}>Order #{trip.order_id}</Text>
          <Text style={themeStyles.passengerText}>{trip.trip_type} • {trip.car_type}{startLabel ? ` • ${startLabel}` : ''}</Text>
        </View>
      </View>

      <View style={themeStyles.rateRow}>
        <Text style={themeStyles.rateLabel}>Driver{trip.driver ? ` (${trip.driver.full_name})` : ''}</Text>
        <StarPicker value={driverRating} onChange={setDriverRating} themeStyles={themeStyles} />
      </View>

      <View style={themeStyles.rateRow}>
        <Text style={themeStyles.rateLabel}>Car{trip.car ? ` (${trip.car.car_number})` : ''}</Text>
        <StarPicker value={carRating} onChange={setCarRating} themeStyles={themeStyles} />
      </View>

      <View style={themeStyles.rateRow}>
        <Text style={themeStyles.rateLabel}>Overall Service</Text>
        <StarPicker value={serviceRating} onChange={setServiceRating} themeStyles={themeStyles} />
      </View>

      <TextInput
        style={themeStyles.commentInput}
        value={comment}
        onChangeText={setComment}
        placeholder="Add a comment (optional)"
        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
        multiline
      />

      {error ? (
        <View style={themeStyles.errorBadge}>
          <AlertCircle color="#EF4444" size={16} />
          <Text style={themeStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
        <LinearGradient colors={['#F59E0B', '#D97706']} style={themeStyles.trackBtn}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 color="#FFFFFF" size={18} />
              <Text style={themeStyles.trackBtnText}>Submit Rating</Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    errorBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: 10, borderRadius: 10 },
    errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
    trackBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    trackBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 14 },
    sectionHeader: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 18, fontWeight: '800' },
    refreshBtn: { padding: 8, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#F0F9FF' },
    bucketTabs: { flexDirection: 'row', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
    bucketTab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
    bucketTabActive: { backgroundColor: '#0EA5E9' },
    bucketTabText: { fontSize: 12, fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B' },
    bucketTabTextActive: { color: '#FFFFFF' },
    rideRowWrap: { marginBottom: 12 },
    rideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 14, borderWidth: isDark ? 1 : 0, borderColor: '#334155' },
    rideActionBtn: { backgroundColor: isDark ? '#0F172A' : '#F0F9FF', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: isDark ? 1 : 0, borderTopWidth: 0, borderColor: '#334155' },
    rideActionBtnText: { color: '#0EA5E9', fontSize: 12.5, fontWeight: '800' },
    card: { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16, gap: 10, borderWidth: isDark ? 1 : 0, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    orderId: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 17, fontWeight: '800' },
    passengerText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 12, fontWeight: '800' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    routeText: { color: '#0EA5E9', fontSize: 16, fontWeight: '900', flexShrink: 1 },
    detailsText: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 13 },
    fareText: { color: '#10B981', fontSize: 17, fontWeight: '900', marginTop: 2 },
    driverBox: { flexDirection: 'row', gap: 12, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: 14, borderRadius: 14, marginTop: 4, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
    driverTitle: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 14, fontWeight: '800' },
    driverPhone: { color: '#0EA5E9', fontSize: 13, marginTop: 2, fontWeight: '700' },
    carNo: { color: isDark ? '#CBD5E1' : '#475569', fontSize: 12, marginTop: 2 },
    callDriverBtn: { backgroundColor: '#10B981', padding: 10, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    emptyStateCard: { alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 28, marginBottom: 16, gap: 6, borderWidth: isDark ? 1 : 0, borderColor: '#334155' },
    emptyStateIconBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    notFoundIconBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(239, 68, 68, 0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    emptyStateTitle: { color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 16, fontWeight: '800' },
    emptyStateText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
    rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rateLabel: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 13, fontWeight: '700', flexShrink: 1 },
    starRow: { flexDirection: 'row', gap: 4 },
    commentInput: { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderRadius: 12, padding: 12, color: isDark ? '#FFFFFF' : '#0F172A', fontSize: 13, minHeight: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' },
  });
}
