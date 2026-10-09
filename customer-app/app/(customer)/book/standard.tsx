import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette, ThemePalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import { useTaxiFlow } from '@/contexts/TaxiFlowContext';
import { useCarPool } from '@/contexts/CarPoolContext';
import { useWallet } from '@/contexts/WalletContext';
import { useCityList } from '@/hooks/useCityList';
import {
  BOOKING_CONFIG,
  STANDARD_VEHICLE_CATALOG,
  LOCAL_PACKAGES,
  StandardVehicleCategory,
} from '@/constants/bookingConfig';
import { computeStandardFare, fareFromServer, ServerFare } from '@/utils/taxiPricing';
import { StandardTripType } from '@/types/booking';
import axiosInstance from '@/app/api/axiosInstance';

// Same guarded pattern as TaxiFlowContext.tsx's real DropBid advance-payment
// wiring - the native module isn't available on Expo web, so a require()
// there would crash the whole bundle rather than just this one payment button.
let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
  try {
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch (e) {
    RazorpayCheckout = null;
  }
}
import {
  Car,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  Navigation,
  ArrowRight,
  ArrowLeft,
  Zap,
  Users,
  Luggage,
  Repeat,
  LocateFixed,
  Share2,
  Sparkles,
  BadgeCheck,
  Info,
  Plus,
  X,
  Plane,
  User as UserIcon,
  ChevronUp,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react-native';

// Temporary dev list - South India airports for the Airport subtype's
// location field. Real data source (like /cities/public) can replace this
// once the backend exposes an equivalent airports endpoint.
const AIRPORTS = [
  'Chennai Airport (MAA)',
  'Bangalore Airport (BLR)',
  'Coimbatore Airport (CJB)',
  'Madurai Airport (IXM)',
  'Trichy Airport (TRZ)',
  'Tirupati Airport (TIR)',
  'Salem Airport (SXV)',
  'Pondicherry Airport (PNY)',
  'Hyderabad Airport (HYD)',
  'Cochin Airport (COK)',
];

// Innova / Crysta / Hycross each get their own card (they're separately
// bookable vehicles). Each of those three cards additionally shows a
// seating-layout preference row - Any (default) / 6+1 / 7+1 - since each of
// these models is real-world available in both a 6-seat captain-seat layout
// and a 7-seat bench layout.
const SEATING_OPTION_MODELS: StandardVehicleCategory[] = ['SUV', 'INNOVA', 'CRYSTA', 'HYCROSS'];
const SEATING_OPTIONS: { key: 'ANY' | 'SIX' | 'SEVEN'; label: string }[] = [
  { key: 'ANY', label: 'Any' },
  { key: 'SIX', label: '6+1' },
  { key: 'SEVEN', label: '7+1' },
];

// Disabled until fully planned - Taxi booking is private-only for now.
// Sharing lives in the separate Car Pool feature; re-enable once Share &
// Save's relationship to Car Pool is properly designed (not deleted, just
// hidden - the flow below still works end-to-end when flipped back on).
const SHARE_AND_SAVE_ENABLED = false;

const COUNTRY_CODES = [
  { code: '+91', label: 'India' },
  { code: '+1', label: 'USA/Canada' },
  { code: '+44', label: 'UK' },
  { code: '+971', label: 'UAE' },
  { code: '+65', label: 'Singapore' },
  { code: '+60', label: 'Malaysia' },
  { code: '+966', label: 'Saudi Arabia' },
  { code: '+974', label: 'Qatar' },
  { code: '+968', label: 'Oman' },
  { code: '+973', label: 'Bahrain' },
  { code: '+94', label: 'Sri Lanka' },
  { code: '+977', label: 'Nepal' },
  { code: '+880', label: 'Bangladesh' },
  { code: '+92', label: 'Pakistan' },
  { code: '+61', label: 'Australia' },
];

type Section = 'TRIP' | 'VEHICLE' | 'REVIEW';
const SECTION_ORDER: Section[] = ['TRIP', 'VEHICLE', 'REVIEW'];
const SECTION_LABEL: Record<Section, string> = {
  TRIP: 'Trip details',
  VEHICLE: 'Vehicle',
  REVIEW: 'Review',
};

function recommendedCategoryFor(passengerCount: number): StandardVehicleCategory {
  if (passengerCount <= 3) return 'SEDAN';
  if (passengerCount <= 5) return 'SUV';
  return 'CRYSTA';
}

// Mirrors backend schemas/customer_booking.py CustomerBookingOut - same
// shape my-trips.tsx already consumes from GET /api/customer/bookings,
// only the fields this dashboard actually renders are declared here.
interface DashboardBooking {
  id: string;
  linked_order_id: number | null;
  pickup_drop_location: Record<string, string>;
  start_date_time: string;
  status: string; // PENDING | APPROVED | REJECTED
  trip_status: string | null; // Order.trip_status: PENDING | COMPLETED | CANCELLED
  assignment_status: string | null; // PENDING | ASSIGNED | DRIVING | COMPLETED | CANCELLED
  driver_details: { full_name: string; primary_number: string } | null;
  car_details: { car_name: string; car_type: string; car_number: string } | null;
}

function dashRouteLabel(location: Record<string, string>): string {
  const keys = Object.keys(location || {}).sort((a, b) => Number(a) - Number(b));
  const stops = keys.map((k) => location[k]).filter(Boolean);
  if (stops.length === 0) return 'Route unavailable';
  if (stops.length === 1) return stops[0];
  return `${stops[0]} ➔ ${stops[stops.length - 1]}`;
}

export default function StandardBookingScreen() {
  const router = useRouter();
  const { systemColorScheme, isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user } = useAuth();
  const { setActiveMode } = useServiceMode();
  const { wallet, computeRideSettlement, settleRide } = useWallet();
  useFocusEffect(
    React.useCallback(() => {
      setActiveMode('TAXI');
    }, [setActiveMode])
  );
  const {
    standardDraft,
    updateStandardDraft,
    resetStandardDraft,
    confirmedStandardBooking,
    confirmStandardBooking,
    clearConfirmedStandardBooking,
    addRecentSearch,
  } = useTaxiFlow();
  const { createListingFromBooking } = useCarPool();

  // Taxi tab opens on its own dashboard (active/scheduled rides + a Book Now
  // button) rather than dropping straight into the booking wizard - the
  // wizard only takes over once Book Now is tapped.
  const [showDashboard, setShowDashboard] = useState(true);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [ridesTab, setRidesTab] = useState<'ACTIVE' | 'UPCOMING'>('ACTIVE');
  const [dashboardBookings, setDashboardBookings] = useState<DashboardBooking[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const fetchDashboardBookings = React.useCallback(async () => {
    if (!user) {
      setDashboardLoading(false);
      return;
    }
    try {
      const res = await axiosInstance.get<DashboardBooking[]>('/api/customer/bookings');
      setDashboardBookings(res.data);
    } catch (e) {
      // Non-critical - dashboard just shows an empty state instead of crashing.
      setDashboardBookings([]);
    } finally {
      setDashboardLoading(false);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (showDashboard) fetchDashboardBookings();
    }, [showDashboard, fetchDashboardBookings])
  );

  const activeBooking = dashboardBookings.find(b => b.assignment_status === 'DRIVING');
  const upcomingBookings = dashboardBookings.filter(b =>
    b.assignment_status !== 'DRIVING' &&
    b.trip_status !== 'COMPLETED' &&
    b.assignment_status !== 'COMPLETED' &&
    b.status !== 'REJECTED'
  );
  const [section, setSection] = useState<Section>('TRIP');
  const [activeFocusField, setActiveFocusField] = useState<'pickup' | 'drop' | null>(null);
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);
  const [seatingPrefByVehicle, setSeatingPrefByVehicle] = useState<Record<string, 'ANY' | 'SIX' | 'SEVEN'>>({});
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState('');
  const [modalTime, setModalTime] = useState('');
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactCountryCode, setContactCountryCode] = useState('+91');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [showAdditionalPhone, setShowAdditionalPhone] = useState(false);
  const [additionalCountryCode, setAdditionalCountryCode] = useState('+91');
  const [additionalPhone, setAdditionalPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Book for Someone Else (Guest / Family / Colleague) State
  const [bookingFor, setBookingFor] = useState<'MYSELF' | 'OTHER'>('MYSELF');
  const [riderName, setRiderName] = useState('');
  const [riderCountryCode, setRiderCountryCode] = useState('+91');
  const [riderPhone, setRiderPhone] = useState('');

  // Separate Passenger & Luggage Counters (DropTaxi Style)
  const [adultCount, setAdultCount] = useState<number>(2);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [luggageCount, setLuggageCount] = useState<number>(2);

  const totalPassengers = adultCount + childrenCount;

  // Auto-sync passengerCount and auto-select 7+1 seating layout when totalPassengers > 6
  useEffect(() => {
    if (totalPassengers > 6) {
      SEATING_OPTION_MODELS.forEach(m => {
        setSeatingPrefByVehicle(prev => {
          if (prev[m] !== 'SEVEN') {
            return { ...prev, [m]: 'SEVEN' };
          }
          return prev;
        });
      });
      if (['SEDAN', 'HATCHBACK'].includes(standardDraft.vehicleCategory)) {
        updateStandardDraft({ vehicleCategory: 'INNOVA', passengerCount: totalPassengers });
      } else {
        updateStandardDraft({ passengerCount: totalPassengers });
      }
    } else {
      updateStandardDraft({ passengerCount: totalPassengers });
    }
  }, [totalPassengers]);

  const draft = standardDraft;
  const sectionIndex = SECTION_ORDER.indexOf(section);
  const { search: citySuggestions } = useCityList();
  const isPickupAirportField = draft.onewaySubtype === 'AIRPORT' && draft.airportFieldIsPickup;
  const isDropAirportField = draft.onewaySubtype === 'AIRPORT' && !draft.airportFieldIsPickup;

  // Round Trip always returns to the pickup point - keep drop locked in sync
  const reorderStop = (fromIndex: number, toIndex: number) => {
    const clamped = Math.max(0, Math.min(draft.stops.length - 1, toIndex));
    if (clamped === fromIndex) return;
    const next = [...draft.stops];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(clamped, 0, moved);
    updateStandardDraft({ stops: next });
  };

  const handleSwap = () => {
    updateStandardDraft({
      pickup: draft.drop,
      drop: draft.pickup,
      airportFieldIsPickup: draft.onewaySubtype === 'AIRPORT' ? !draft.airportFieldIsPickup : draft.airportFieldIsPickup,
    });
  };

  const airportSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return AIRPORTS.slice(0, 6);
    return AIRPORTS.filter(a => a.toLowerCase().includes(q)).slice(0, 6);
  };

  const handleLeaveNow = () => {
    const pickupAt = new Date(Date.now() + 20 * 60000);
    const date = pickupAt.toISOString().slice(0, 10);
    const time = `${String(pickupAt.getHours()).padStart(2, '0')}:${String(pickupAt.getMinutes()).padStart(2, '0')}`;
    updateStandardDraft({ scheduleType: 'NOW', startDate: date, startTime: time, isUrgent: true });
  };

  const openScheduleModal = () => {
    if (draft.scheduleType === 'SCHEDULE' && draft.startDate && draft.startTime) {
      setModalDate(draft.startDate);
      setModalTime(draft.startTime);
    } else {
      const suggested = new Date(Date.now() + 20 * 60000);
      setModalDate(suggested.toISOString().slice(0, 10));
      setModalTime(`${String(suggested.getHours()).padStart(2, '0')}:${String(suggested.getMinutes()).padStart(2, '0')}`);
    }
    setActivePickerId(null);
    setShowScheduleModal(true);
  };

  const confirmScheduleModal = () => {
    updateStandardDraft({ scheduleType: 'SCHEDULE', startDate: modalDate, startTime: modalTime, isUrgent: false });
    setActivePickerId(null);
    setShowScheduleModal(false);
  };

  const closeScheduleModal = () => {
    setActivePickerId(null);
    setShowScheduleModal(false);
  };

  // Real driving distance from the backend (Google Distance Matrix API,
  // cached server-side) - see POST /customer/bookings/quote. LOCAL trips
  // don't need this (fixed package km, not distance-based). The local
  // estimateDistanceKm() fallback stays in place for LOCAL and for the
  // brief window before this real fetch resolves.
  const [realDistanceKm, setRealDistanceKm] = useState<number | null>(null);
  const realDistanceRequestId = useRef(0);
  // Live price per vehicle from the backend (the owner's tariffs). Keyed by the backend car type.
  const [serverFares, setServerFares] = useState<Record<string, ServerFare> | null>(null);
  const BACKEND_CAR_TYPE: Record<string, string> = {
    HATCHBACK: 'HATCHBACK', SEDAN: 'SEDAN_4_PLUS_1', ETIOS: 'ETIOS_4_PLUS_1',
    NEW_SEDAN: 'NEW_SEDAN_2022_MODEL', SUV: 'SUV', INNOVA: 'INNOVA',
    CRYSTA: 'INNOVA_CRYSTA', HYCROSS: 'INNOVA_CRYSTA',
  };
  const liveFareFor = (vehicleId: string) => {
    if (!serverFares || draft.tripType === 'LOCAL') return null;
    const q = serverFares[BACKEND_CAR_TYPE[vehicleId] || ''];
    return q ? fareFromServer(q, { tripType: draft.tripType, farePlan: draft.farePlan, vehicleCategory: vehicleId as any }) : null;
  };

  useEffect(() => {
    if (draft.tripType === 'LOCAL' || !draft.pickup.trim() || !draft.drop.trim()) {
      setRealDistanceKm(null);
      setServerFares(null);
      return;
    }
    const thisRequestId = ++realDistanceRequestId.current;
    const timer = setTimeout(async () => {
      const location: Record<string, string> = { '0': draft.pickup };
      draft.stops.filter(s => s.trim()).forEach((s, i) => { location[String(i + 1)] = s; });
      location[String(Object.keys(location).length)] = draft.drop;
      const backendTripType = draft.tripType === 'ROUNDTRIP' ? 'Round Trip'
        : draft.tripType === 'MULTICITY' ? 'Multy City'
        : 'Oneway';
      const carTypeMap: Record<string, string> = {
        HATCHBACK: 'HATCHBACK', SEDAN: 'SEDAN_4_PLUS_1', ETIOS: 'ETIOS_4_PLUS_1',
        NEW_SEDAN: 'NEW_SEDAN_2022_MODEL', SUV: 'SUV', INNOVA: 'INNOVA',
        CRYSTA: 'INNOVA_CRYSTA', HYCROSS: 'INNOVA_CRYSTA',
      };
      try {
        // One call returns a live price for every vehicle (the owner's tariffs); the distance comes from the same answer.
        const res = await axiosInstance.post('/api/customer/bookings/quote-all', {
          pickup_drop_location: location,
          trip_type: backendTripType,
        });
        if (thisRequestId === realDistanceRequestId.current) {
          const fares: Record<string, ServerFare> = res.data?.fares || {};
          setServerFares(Object.keys(fares).length ? fares : null);
          const anyFare = fares[carTypeMap[draft.vehicleCategory] || 'SEDAN_4_PLUS_1'] || Object.values(fares)[0];
          if (anyFare) {
            // total_km is already the full round-trip / multi-city distance; the local fallback expects the one-way figure
            const km = anyFare.total_km ?? null;
            setRealDistanceKm(km != null && (draft.tripType === 'ROUNDTRIP' || draft.tripType === 'MULTICITY') ? km / 2 : km);
          }
        }
      } catch (e) {
        // Keep the previous estimate/real value - never block the booking flow.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [draft.pickup, draft.drop, JSON.stringify(draft.stops), draft.tripType, draft.vehicleCategory]);

  const fare = useMemo(() => {
    if (!draft.pickup || !draft.drop) return null;
    const live = liveFareFor(draft.vehicleCategory);
    if (live) return live;
    return computeStandardFare({
      tripType: draft.tripType,
      farePlan: draft.farePlan,
      vehicleCategory: draft.vehicleCategory,
      pickup: draft.pickup,
      drop: draft.drop,
      localPackageId: draft.localPackageId,
      realDistanceKmOverride: realDistanceKm,
    });
  }, [draft.pickup, draft.drop, draft.tripType, draft.farePlan, draft.vehicleCategory, draft.localPackageId, realDistanceKm, serverFares]);

  const shareDiscountAmount = draft.shareEnabled && fare
    ? Math.round(fare.totalFare * (BOOKING_CONFIG.SHARE_AND_SAVE_DISCOUNT_PERCENT / 100))
    : 0;
  const finalPayable = fare ? fare.totalFare - shareDiscountAmount : 0;

  const vehicleCapacity = STANDARD_VEHICLE_CATALOG.find(v => v.id === draft.vehicleCategory);
  const maxShareSeats = Math.max(1, (vehicleCapacity?.passengerCount ?? 4) - draft.passengerCount);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (section === 'TRIP') {
      addRecentSearch({ pickup: draft.pickup, drop: draft.tripType === 'LOCAL' ? draft.pickup : draft.drop, tripType: draft.tripType, mode: 'STANDARD' });
    }
    const next = SECTION_ORDER[sectionIndex + 1];
    if (next) setSection(next);
  };

  const goBack = () => {
    if (sectionIndex === 0) {
      // Back to the Taxi tab's own dashboard, not out of the tab entirely -
      // this is a step inside the booking flow, not the flow's true start.
      setShowDashboard(true);
      return;
    }
    setSection(SECTION_ORDER[sectionIndex - 1]);
  };

  const canContinueRoute = draft.tripType === 'LOCAL'
    ? draft.pickup.trim().length > 1
    : draft.pickup.trim().length > 1
      && draft.drop.trim().length > 1
      && draft.pickup.trim().toLowerCase() !== draft.drop.trim().toLowerCase()
      && draft.stops.every(stop => stop.trim().length > 1);
  const canContinueTime = draft.scheduleType === 'NOW' || (draft.startDate.trim().length > 0 && draft.startTime.trim().length > 0);
  const canContinueReturn = draft.tripType !== 'ROUNDTRIP' || (draft.endDate.trim().length > 0 && draft.endTime.trim().length > 0);
  const canContinueTrip = canContinueRoute && canContinueTime && canContinueReturn;

  const handleConfirmAndPay = async () => {
    if (!fare) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Real create -> pay -> verify sequence against the backend (same
    // shape as GET /customer/bookings/quote above, and the same
    // create-order -> Razorpay checkout -> verify-signature pattern as
    // TaxiFlowContext.tsx's real DropBid advance payment). This used to
    // fabricate the whole booking (fake order id, fake driver, fake OTPs)
    // entirely client-side with no backend call at all - the Standard
    // Taxi flow is the highest-traffic path, so it must actually create
    // a real CustomerBookingRequest or nothing has really been booked.
    try {
      const location: Record<string, string> = { '0': draft.pickup };
      draft.stops.filter(s => s.trim()).forEach((s, i) => { location[String(i + 1)] = s; });
      location[String(Object.keys(location).length)] = draft.drop;
      const backendTripType = draft.tripType === 'ROUNDTRIP' ? 'Round Trip'
        : draft.tripType === 'MULTICITY' ? 'Multy City'
        : 'Oneway';
      const carTypeMap: Record<string, string> = {
        HATCHBACK: 'HATCHBACK', SEDAN: 'SEDAN_4_PLUS_1', ETIOS: 'ETIOS_4_PLUS_1',
        NEW_SEDAN: 'NEW_SEDAN_2022_MODEL', SUV: 'SUV', INNOVA: 'INNOVA',
        CRYSTA: 'INNOVA_CRYSTA', HYCROSS: 'INNOVA_CRYSTA',
      };
      const startDateTimeIso = draft.scheduleType === 'NOW'
        ? new Date(Date.now() + 5 * 60000).toISOString()
        : new Date(`${draft.startDate}T${draft.startTime}:00`).toISOString();

      const createRes = await axiosInstance.post('/api/customer/bookings', {
        pickup_drop_location: location,
        trip_type: backendTripType,
        car_type: carTypeMap[draft.vehicleCategory] || 'SEDAN_4_PLUS_1',
        start_date_time: startDateTimeIso,
      });
      const booking = createRes.data;
      const bookingId: string = booking.id;
      const totalAmount: number = booking.quoted_total_amount ?? finalPayable;

      if (RazorpayCheckout) {
        const payRes = await axiosInstance.post(`/api/customer/bookings/${bookingId}/pay`);
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
              email: `${contactPhone || user?.phone || 'customer'}@dropcars.in`,
              contact: contactPhone || user?.phone || '9999999999',
              name: contactName || user?.name || 'Drop Cars Customer',
            },
            theme: { color: '#0EA5E9' },
          }).then(resolve).catch(reject);
        });

        await axiosInstance.post(`/api/customer/bookings/${bookingId}/verify`, {
          rp_order_id: razorpayResult.razorpay_order_id || rp_order_id,
          rp_payment_id: razorpayResult.razorpay_payment_id,
          rp_signature: razorpayResult.razorpay_signature,
        });
      }
      // On web / where the native Razorpay module isn't available, the
      // booking request still exists and is visible in "My Trips" -
      // payment there falls back to whatever web checkout flow that
      // screen already offers, rather than blocking booking creation.

      let shareDetails;
      if (draft.shareEnabled) {
        shareDetails = {
          isEnabled: true,
          maxSeatsToShare: maxShareSeats,
          availableSeats: draft.seatsToShare,
          recommendedSeats: Math.min(2, maxShareSeats),
          potentialSavings: shareDiscountAmount,
          actualSavings: 0,
          sharedPassengers: [],
          status: 'SEARCHING_PASSENGERS' as const,
        };

        createListingFromBooking({
          sourceBookingId: bookingId,
          hostName: contactName || user?.name || 'You',
          hostPhone: contactPhone || user?.phone || '',
          pickupCity: draft.pickup,
          dropCity: draft.drop,
          startDate: draft.scheduleType === 'NOW' ? new Date().toISOString().slice(0, 10) : draft.startDate,
          startTime: draft.scheduleType === 'NOW' ? 'Departing now' : draft.startTime,
          carName: vehicleCapacity?.models || draft.vehicleCategory,
          carCategory: draft.vehicleCategory,
          totalSeats: vehicleCapacity?.passengerCount ?? 4,
          seatsToShare: draft.seatsToShare,
          seatFare: Math.max(1, Math.round((fare.totalFare * (BOOKING_CONFIG.SHARE_AND_SAVE_DISCOUNT_PERCENT / 100)) / draft.seatsToShare)),
          privateFareEquivalent: fare.totalFare,
        });
      }

      confirmStandardBooking({
        orderId: bookingId,
        pickup: draft.pickup,
        drop: draft.drop,
        tripType: draft.tripType,
        startDate: draft.scheduleType === 'NOW' ? 'Today' : draft.startDate,
        startTime: draft.scheduleType === 'NOW' ? 'Nearest available' : draft.startTime,
        vehicleName: vehicleCapacity?.models || draft.vehicleCategory,
        totalFare: totalAmount,
        shareAndSave: shareDetails,
        createdAt: new Date().toISOString(),
      });
      fetchDashboardBookings();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e: any) {
      // Includes the customer cancelling the Razorpay sheet, not just
      // network/server failures - either way nothing was confirmed, so
      // surface it truthfully instead of pretending the booking went through.
      const msg = e?.response?.data?.detail || e?.description || 'Could not complete your booking. Please try again.';
      Alert.alert('Booking not completed', String(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookAnother = () => {
    clearConfirmedStandardBooking();
    resetStandardDraft();
    setSection('TRIP');
  };

  const s = getStyles(isDark, palette);
  const Row = makeRow(palette);

  if (showDashboard && !confirmedStandardBooking) {
    return (
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={palette.headerGradient} style={[s.headerGradient, { paddingTop: topPadding }]}>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.headerTitle}>Taxi</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
              Private cab, fixed fare
            </Text>
          </View>
        </LinearGradient>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
          <View style={[s.webCenterWrap, { gap: 14 }]}>

            <TouchableOpacity
              activeOpacity={0.9}
              style={{
                backgroundColor: '#0EA5E9',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowDashboard(false);
              }}
            >
              <Car color="#FFFFFF" size={20} />
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>BOOK NOW</Text>
            </TouchableOpacity>

            {/* ACTIVE / UPCOMING RIDES TAB SWITCHER */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: ridesTab === 'ACTIVE' ? '#0EA5E9' : palette.surface,
                  borderWidth: 1,
                  borderColor: ridesTab === 'ACTIVE' ? '#0EA5E9' : palette.border,
                }}
                onPress={() => setRidesTab('ACTIVE')}
              >
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' }} />
                <Text style={{ color: ridesTab === 'ACTIVE' ? '#FFFFFF' : palette.textPrimary, fontSize: 12.5, fontWeight: '800' }}>Active</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: ridesTab === 'UPCOMING' ? '#8B5CF6' : palette.surface,
                  borderWidth: 1,
                  borderColor: ridesTab === 'UPCOMING' ? '#8B5CF6' : palette.border,
                }}
                onPress={() => setRidesTab('UPCOMING')}
              >
                <Calendar color={ridesTab === 'UPCOMING' ? '#FFFFFF' : palette.textMuted} size={13} />
                <Text style={{ color: ridesTab === 'UPCOMING' ? '#FFFFFF' : palette.textPrimary, fontSize: 12.5, fontWeight: '800' }}>Upcoming</Text>
                <View style={{
                  backgroundColor: ridesTab === 'UPCOMING' ? 'rgba(255,255,255,0.25)' : 'rgba(139, 92, 246, 0.15)',
                  paddingHorizontal: 6,
                  borderRadius: 8,
                  minWidth: 18,
                  alignItems: 'center',
                }}>
                  <Text style={{ color: ridesTab === 'UPCOMING' ? '#FFFFFF' : '#8B5CF6', fontSize: 10, fontWeight: '900' }}>{upcomingBookings.length}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {dashboardLoading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color="#0EA5E9" />
              </View>
            ) : ridesTab === 'ACTIVE' ? (
              activeBooking ? (
                /* LIVE ACTIVE RIDE STATUS TRACKER BANNER (real booking, assignment_status === DRIVING) */
                <View style={{
                  backgroundColor: isDark ? '#1E293B' : '#F0F9FF',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#0EA5E9',
                  gap: 10,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                      <Text style={{ color: '#0EA5E9', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5 }}>ACTIVE RIDE IN PROGRESS</Text>
                    </View>
                    {!!activeBooking.linked_order_id && (
                      <Text style={{ color: palette.textMuted, fontSize: 10 }}>Trip #{activeBooking.linked_order_id}</Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '800' }}>
                        {activeBooking.driver_details?.full_name ? `Driver: ${activeBooking.driver_details.full_name}` : dashRouteLabel(activeBooking.pickup_drop_location)}
                        {activeBooking.car_details?.car_number ? ` • ${activeBooking.car_details.car_number}` : ''}
                      </Text>
                      <Text style={{ color: palette.textSecondary, fontSize: 11 }}>
                        {activeBooking.car_details ? `${activeBooking.car_details.car_name} • ` : ''}{dashRouteLabel(activeBooking.pickup_drop_location)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          borderWidth: 1,
                          borderColor: '#EF4444',
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onPress={() => router.push('/(customer)/safety' as any)}
                      >
                        <ShieldCheck color="#EF4444" size={13} />
                        <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>SOS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          borderWidth: 1,
                          borderColor: '#F59E0B',
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setShowOTPModal(true);
                        }}
                      >
                        <BadgeCheck color="#D97706" size={13} />
                        <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '800' }}>OTP</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: '#0EA5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}
                        onPress={() => router.push({
                          pathname: '/(customer)/live-trip',
                          params: {
                            bookingId: activeBooking.id,
                            orderId: activeBooking.linked_order_id ? String(activeBooking.linked_order_id) : undefined,
                            driverName: activeBooking.driver_details?.full_name,
                            carLabel: activeBooking.car_details ? `${activeBooking.car_details.car_name} • ${activeBooking.car_details.car_number}` : undefined,
                            route: dashRouteLabel(activeBooking.pickup_drop_location),
                          },
                        } as any)}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Live Map ➔</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
                  <Car color={palette.textMuted} size={28} />
                  <Text style={{ color: palette.textMuted, fontSize: 12.5, fontWeight: '600' }}>No active ride right now</Text>
                </View>
              )
            ) : (
              upcomingBookings.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {upcomingBookings.map((b) => (
                    <View
                      key={b.id}
                      style={{
                        backgroundColor: palette.surface,
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: palette.border,
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Calendar color="#8B5CF6" size={16} />
                          <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '800' }}>{dashRouteLabel(b.pickup_drop_location)}</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ color: '#8B5CF6', fontSize: 10, fontWeight: '900' }}>{b.status === 'PENDING' ? 'Pending Approval' : 'Confirmed'}</Text>
                        </View>
                      </View>
                      <Text style={{ color: palette.textSecondary, fontSize: 11 }}>
                        Pickup: {new Date(b.start_date_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {!!b.driver_details && (
                        <Text style={{ color: palette.textMuted, fontSize: 9.5 }}>Driver: {b.driver_details.full_name}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
                  <Calendar color={palette.textMuted} size={28} />
                  <Text style={{ color: palette.textMuted, fontSize: 12.5, fontWeight: '600' }}>No upcoming rides scheduled</Text>
                </View>
              )
            )}
          </View>
        </ScrollView>

        {/* TRIP OTP MODAL (lightweight) */}
        <Modal visible={showOTPModal} transparent animationType="fade" onRequestClose={() => setShowOTPModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 20, width: '100%', maxWidth: 320, alignItems: 'center', gap: 10 }}>
              <BadgeCheck color="#D97706" size={28} />
              <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: '800' }}>Trip start code</Text>
              <Text style={{ color: palette.textSecondary, fontSize: 12.5, textAlign: 'center' }}>
                Your trip start code was emailed to you when the driver was assigned. Share it with your driver only once they've arrived at your pickup point.
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#0EA5E9', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, marginTop: 6 }}
                onPress={() => setShowOTPModal(false)}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (confirmedStandardBooking) {
    const b = confirmedStandardBooking;
    return (
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={palette.headerGradient} style={[s.headerGradient, { paddingTop: topPadding }]}>
          <View style={s.headerRow}>
            <View style={{ width: 30 }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.headerTitle}>Booking Confirmed</Text>
            </View>
            <View style={{ width: 30 }} />
          </View>
        </LinearGradient>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner}>
          <View style={s.webCenterWrap}>
            <View style={s.confirmCard}>
              <CheckCircle2 color="#10B981" size={54} style={{ alignSelf: 'center', marginBottom: 8 }} />
              <Text style={s.confirmTitle}>Booking request sent!</Text>
              <Text style={s.confirmOrderId}>Booking ID #{b.orderId.slice(0, 8).toUpperCase()}</Text>

              <View style={s.divider} />
              <Row label="Route" value={`${b.pickup} → ${b.drop}`} bold />
              <Row label="Trip type" value={b.tripType.replace('_', ' ')} />
              <Row label="Date & time" value={`${b.startDate} • ${b.startTime}`} />
              <Row label="Requested vehicle" value={b.vehicleName} />
              <View style={s.divider} />
              <Row label="Total fare (all-inclusive)" value={`₹${b.totalFare}`} big />

              {b.shareAndSave?.isEnabled && (
                <View style={s.shareNotice}>
                  <Share2 color="#0EA5E9" size={14} />
                  <Text style={s.shareNoticeText}>Share & Save is on — your journey is now visible in Car Pool for others to join.</Text>
                </View>
              )}

              <View style={s.infoNotice}>
                <Info color={palette.textMuted} size={13} />
                <Text style={s.infoNoticeText}>Driver and vehicle details will be shared 2 hours before pickup, or earlier upon request.</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#0EA5E9', marginBottom: 10 }]}
              onPress={() => router.push('/(customer)/my-trips' as any)}
            >
              <Text style={[s.primaryBtnText, { color: '#0EA5E9' }]}>View My Trips</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.primaryBtn} onPress={handleBookAnother}>
              <Text style={s.primaryBtnText}>Book Another Taxi</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={palette.headerGradient} style={[s.headerGradient, { paddingTop: topPadding }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={goBack}>
            <ArrowLeft color="#FFFFFF" size={18} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Book a Taxi</Text>
            <Text style={s.headerSub}>Private cab • Fixed fare</Text>
          </View>
          <View style={{ width: 30 }} />
        </View>

        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${((sectionIndex + 1) / SECTION_ORDER.length) * 100}%` }]} />
        </View>
        <Text style={s.progressLabel}>Step {sectionIndex + 1} of {SECTION_ORDER.length} · {SECTION_LABEL[section]}</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.webCenterWrap}>
          {section === 'TRIP' && (
            <View style={{ gap: 20 }}>
              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>Trip type</Text>
                <View style={s.tripTypeSegment}>
                  {(['ONEWAY', 'ROUNDTRIP', 'LOCAL'] as StandardTripType[]).map(type => {
                    const isActive = type === 'ONEWAY'
                      ? (draft.tripType === 'ONEWAY' || draft.tripType === 'MULTICITY')
                      : draft.tripType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[s.tripTypeSegmentBtn, isActive && s.tripTypeSegmentBtnActive]}
                        onPress={() => {
                          if (type === 'ONEWAY') {
                            const subtype = draft.onewaySubtype === 'MULTICITY' ? 'OUTSTATION' : draft.onewaySubtype;
                            updateStandardDraft({ tripType: 'ONEWAY', onewaySubtype: subtype });
                          } else {
                            updateStandardDraft({ tripType: type });
                          }
                        }}
                      >
                        <Text style={[s.tripTypeSegmentText, isActive && s.tripTypeSegmentTextActive]} numberOfLines={1}>
                          {tripTypeShortLabel(type)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(draft.tripType === 'ONEWAY' || draft.tripType === 'MULTICITY') && (
                  <View style={s.subtypeSegment}>
                    {([['OUTSTATION', 'Outstation', 'ONEWAY'], ['AIRPORT', 'Airport', 'ONEWAY'], ['MULTICITY', 'Multi City', 'MULTICITY']] as const).map(([subtype, label, resolvedType]) => (
                      <TouchableOpacity
                        key={subtype}
                        style={[s.subtypeSegmentBtn, draft.onewaySubtype === subtype && s.subtypeSegmentBtnActive]}
                        onPress={() => {
                          if (subtype === 'AIRPORT' && draft.onewaySubtype !== 'AIRPORT') {
                            updateStandardDraft({
                              tripType: resolvedType,
                              onewaySubtype: subtype,
                              airportFieldIsPickup: true,
                              pickup: AIRPORTS[0],
                            });
                          } else {
                            updateStandardDraft({ tripType: resolvedType, onewaySubtype: subtype });
                          }
                        }}
                      >
                        <Text style={[s.subtypeSegmentText, draft.onewaySubtype === subtype && s.subtypeSegmentTextActive]} numberOfLines={1}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={s.tripTypeCaption}>{tripTypeDescription(draft.tripType)}</Text>

                {draft.tripType === 'ROUNDTRIP' && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.fieldLabel}>Fare Plan</Text>
                    <View style={s.twoOptionRow}>
                      <TouchableOpacity style={[s.planChip, draft.farePlan === 'USUAL' && s.planChipActive]} onPress={() => updateStandardDraft({ farePlan: 'USUAL' })}>
                        <Text style={[s.planChipTitle, draft.farePlan === 'USUAL' && { color: palette.accent }]}>Usual Plan</Text>
                        <Text style={s.planChipSub}>Standard round-trip rate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.planChip, draft.farePlan === 'LOW_BUDGET' && s.planChipActive]} onPress={() => updateStandardDraft({ farePlan: 'LOW_BUDGET' })}>
                        <Text style={[s.planChipTitle, draft.farePlan === 'LOW_BUDGET' && { color: palette.accent }]}>Low Budget Plan</Text>
                        <Text style={s.planChipSub}>Lower per-km rate</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {draft.tripType === 'LOCAL' && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.fieldLabel}>Rental Package</Text>
                    {LOCAL_PACKAGES.map(pkg => (
                      <TouchableOpacity key={pkg.id} style={[s.packageRow, draft.localPackageId === pkg.id && s.packageRowActive]} onPress={() => updateStandardDraft({ localPackageId: pkg.id })}>
                        <Text style={[s.packageLabel, draft.localPackageId === pkg.id && { color: palette.accent }]}>{pkg.label}</Text>
                        {draft.localPackageId === pkg.id && <CheckCircle2 color={palette.accent} size={16} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>{draft.tripType === 'LOCAL' ? 'Pickup location' : 'Where are you going?'}</Text>
                <View style={s.inputCard}>
                  <View style={s.inputRow}>
                    {isPickupAirportField ? <Plane color={palette.accent} size={16} /> : <MapPin color={palette.accent} size={16} />}
                    <TextInput
                      style={s.textInput}
                      value={draft.pickup}
                      onChangeText={(t) => updateStandardDraft({ pickup: t })}
                      onFocus={() => setActiveFocusField('pickup')}
                      onBlur={() => setTimeout(() => setActiveFocusField(null), 200)}
                      placeholder={isPickupAirportField ? 'Airport' : 'Pickup location'}
                      placeholderTextColor={palette.placeholder}
                    />
                    {isPickupAirportField && (
                      <View style={s.airportTag}>
                        <Text style={s.airportTagText}>Airport</Text>
                      </View>
                    )}
                    <TouchableOpacity style={s.gpsBtn} onPress={() => updateStandardDraft({ pickup: 'Chennai (Current Location)' })}>
                      <LocateFixed color={palette.accent} size={14} />
                    </TouchableOpacity>
                  </View>

                  {activeFocusField === 'pickup' && (
                    <View style={s.suggestDropdown}>
                      {(isPickupAirportField ? airportSuggestions(draft.pickup) : citySuggestions(draft.pickup)).map(item => (
                        <TouchableOpacity key={item} style={s.suggestItem} onPressIn={() => { updateStandardDraft({ pickup: item }); setActiveFocusField(null); }}>
                          <MapPin color={palette.accent} size={12} />
                          <Text style={s.suggestText}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {draft.tripType !== 'LOCAL' && (
                    <>
                      {(draft.tripType === 'ROUNDTRIP' || draft.tripType === 'MULTICITY') && draft.stops.map((stop, idx) => {
                        return (
                          <React.Fragment key={idx}>
                            <View style={s.inputDividerWrap}>
                              <View style={s.inputDivider} />
                            </View>
                            <View style={s.inputRow}>
                              <View style={s.reorderStack}>
                                <TouchableOpacity disabled={idx === 0} onPress={() => reorderStop(idx, idx - 1)} style={s.reorderBtn}>
                                  <ChevronUp color={idx === 0 ? palette.border : palette.textMuted} size={13} />
                                </TouchableOpacity>
                                <TouchableOpacity disabled={idx === draft.stops.length - 1} onPress={() => reorderStop(idx, idx + 1)} style={s.reorderBtn}>
                                  <ChevronDown color={idx === draft.stops.length - 1 ? palette.border : palette.textMuted} size={13} />
                                </TouchableOpacity>
                              </View>
                              <MapPin color={palette.textMuted} size={16} />
                              <TextInput
                                style={s.textInput}
                                value={stop}
                                onChangeText={(t) => updateStandardDraft({ stops: draft.stops.map((sVal, i) => (i === idx ? t : sVal)) })}
                                onFocus={() => setActiveStopIndex(idx)}
                                onBlur={() => setTimeout(() => setActiveStopIndex(null), 200)}
                                placeholder={`Stop ${idx + 1}`}
                                placeholderTextColor={palette.placeholder}
                              />
                              <TouchableOpacity onPress={() => updateStandardDraft({ stops: draft.stops.filter((_, i) => i !== idx) })}>
                                <X color={palette.textMuted} size={16} />
                              </TouchableOpacity>
                            </View>

                            {activeStopIndex === idx && (
                              <View style={s.suggestDropdown}>
                                {citySuggestions(stop).map(item => (
                                  <TouchableOpacity key={item} style={s.suggestItem} onPressIn={() => { updateStandardDraft({ stops: draft.stops.map((sVal, i) => (i === idx ? item : sVal)) }); setActiveStopIndex(null); }}>
                                    <MapPin color={palette.accent} size={12} />
                                    <Text style={s.suggestText}>{item}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </React.Fragment>
                        );
                      })}

                      <View style={s.inputDividerWrap}>
                        <View style={s.inputDivider} />
                        <TouchableOpacity style={s.swapBtn} onPress={handleSwap}>
                          <Repeat color={palette.accent} size={12} />
                        </TouchableOpacity>
                      </View>

                      {draft.tripType === 'ROUNDTRIP' && (
                        <View style={s.returnNotice}>
                          <Repeat color={palette.textMuted} size={12} />
                          <Text style={s.returnNoticeText}>You'll return to {draft.pickup || 'your pickup location'}</Text>
                        </View>
                      )}

                      <View style={s.inputRow}>
                        {isDropAirportField ? <Plane color={palette.accent} size={16} /> : <Navigation color={palette.accent} size={16} />}
                        <TextInput
                          style={s.textInput}
                          value={draft.drop}
                          onChangeText={(t) => updateStandardDraft({ drop: t })}
                          onFocus={() => setActiveFocusField('drop')}
                          onBlur={() => setTimeout(() => setActiveFocusField(null), 200)}
                          placeholder={isDropAirportField ? 'Airport' : 'Destination'}
                          placeholderTextColor={palette.placeholder}
                        />
                        {isDropAirportField && (
                          <View style={s.airportTag}>
                            <Text style={s.airportTagText}>Airport</Text>
                          </View>
                        )}
                      </View>

                      {activeFocusField === 'drop' && (
                        <View style={s.suggestDropdown}>
                          {(isDropAirportField ? airportSuggestions(draft.drop) : citySuggestions(draft.drop)).map(item => (
                            <TouchableOpacity key={item} style={s.suggestItem} onPressIn={() => { updateStandardDraft({ drop: item }); setActiveFocusField(null); }}>
                              <Navigation color={palette.accent} size={12} />
                              <Text style={s.suggestText}>{item}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>

                {(draft.tripType === 'ROUNDTRIP' || draft.tripType === 'MULTICITY') && (
                  <TouchableOpacity style={s.addStopBtn} onPress={() => updateStandardDraft({ stops: [...draft.stops, ''] })}>
                    <Plus color={palette.accent} size={14} />
                    <Text style={s.addStopBtnText}>Add a stop{draft.stops.length > 0 ? ' · use ▲▼ to reorder' : ''}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>When are you travelling?</Text>
                <View style={s.twoOptionRow}>
                  <TouchableOpacity style={[s.bigOption, draft.scheduleType === 'NOW' && s.bigOptionActive]} onPress={handleLeaveNow}>
                    <Zap color={draft.scheduleType === 'NOW' ? palette.accent : palette.textMuted} size={20} />
                    <Text style={[s.bigOptionTitle, draft.scheduleType === 'NOW' && { color: palette.accent }]}>Leave Now</Text>
                    <Text style={s.bigOptionSub}>Pickup in ~20 min</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.bigOption, draft.scheduleType === 'SCHEDULE' && s.bigOptionActive]} onPress={openScheduleModal}>
                    <Calendar color={draft.scheduleType === 'SCHEDULE' ? palette.accent : palette.textMuted} size={20} />
                    <Text style={[s.bigOptionTitle, draft.scheduleType === 'SCHEDULE' && { color: palette.accent }]}>Schedule</Text>
                    <Text style={s.bigOptionSub}>
                      {draft.scheduleType === 'SCHEDULE' && draft.startDate ? `${formatDateForDisplay(draft.startDate)} • ${formatTimeForDisplay(draft.startTime)}` : 'Pick date & time'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {draft.scheduleType === 'NOW' && (
                  <View style={s.urgentNotice}>
                    <Zap color={palette.accent} size={13} />
                    <Text style={s.urgentNoticeText}>Marked urgent — nearby drivers are notified immediately.</Text>
                  </View>
                )}

                {draft.tripType === 'ROUNDTRIP' && (
                  <View style={{ gap: 10 }}>
                    <Text style={s.fieldLabel}>Return date & time</Text>
                    <View style={[s.inputRowCard]}>
                      <Calendar color={palette.accent} size={14} />
                      <DateField value={draft.endDate} onChange={(t) => updateStandardDraft({ endDate: t })} palette={palette} minToday id="endDate" activePickerId={activePickerId} setActivePickerId={setActivePickerId} />
                    </View>
                    <View style={s.inputRowCard}>
                      <Clock color={palette.accent} size={14} />
                      <TimeField value={draft.endTime} onChange={(t) => updateStandardDraft({ endTime: t })} palette={palette} id="endTime" activePickerId={activePickerId} setActivePickerId={setActivePickerId} minTime={minTimeIfToday(draft.endDate)} />
                    </View>
                  </View>
                )}
              </View>

              <PrimaryButton label="Continue" disabled={!canContinueTrip} onPress={goNext} palette={palette} />
            </View>
          )}

          {section === 'VEHICLE' && (
            <View style={{ gap: 14 }}>
              <Text style={s.screenHeadline}>Choose your vehicle</Text>
              <Text style={s.screenSubheadline}>Fare updates instantly as you pick</Text>

              {/* PASSENGERS & LUGGAGE COUNTER CARD (DROPTAXI STYLE) */}
              <View style={s.passengerCardContainer}>
                <View style={s.passengerHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Users color={palette.accent} size={18} />
                    <Text style={s.passengerCardTitle}>Passengers & Luggage</Text>
                  </View>
                  <View style={s.totalPassengerBadge}>
                    <Text style={s.totalPassengerBadgeText}>
                      {totalPassengers} Passenger{totalPassengers > 1 ? 's' : ''} • {luggageCount} Bag{luggageCount > 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>

                {/* ADULTS COUNTER */}
                <View style={s.counterRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.counterLabel}>Adults</Text>
                    <Text style={s.counterSub}>Age 12+ yrs</Text>
                  </View>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setAdultCount(prev => Math.max(1, prev - 1))}
                  >
                    <Text style={s.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.stepperValue}>{adultCount}</Text>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setAdultCount(prev => Math.min(8, prev + 1))}
                  >
                    <Text style={s.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* CHILDREN COUNTER */}
                <View style={s.counterRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.counterLabel}>Children</Text>
                    <Text style={s.counterSub}>Below 12 yrs</Text>
                  </View>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setChildrenCount(prev => Math.max(0, prev - 1))}
                  >
                    <Text style={s.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.stepperValue}>{childrenCount}</Text>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setChildrenCount(prev => Math.min(6, prev + 1))}
                  >
                    <Text style={s.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* LUGGAGE BAGS COUNTER */}
                <View style={s.counterRowLast}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Luggage color={palette.accent} size={15} />
                      <Text style={s.counterLabel}>Luggage / Suitcases</Text>
                    </View>
                    <Text style={s.counterSub}>Medium & Large Bags</Text>
                  </View>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setLuggageCount(prev => Math.max(0, prev - 1))}
                  >
                    <Text style={s.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.stepperValue}>{luggageCount}</Text>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setLuggageCount(prev => Math.min(8, prev + 1))}
                  >
                    <Text style={s.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* AUTO 7+1 SEATING SELECTION NOTICE WHEN > 6 PASSENGERS */}
                {totalPassengers > 6 && (
                  <View style={s.autoSevenBadgeNotice}>
                    <Sparkles color="#D97706" size={14} />
                    <Text style={s.autoSevenBadgeNoticeText}>
                      {totalPassengers} Passengers selected — 7+1 Seating Layout auto-selected for Innova & SUV models.
                    </Text>
                  </View>
                )}
              </View>

              {STANDARD_VEHICLE_CATALOG.filter(v => v.passengerCount >= Math.min(totalPassengers, 7)).map(v => {
                const isSelected = draft.vehicleCategory === v.id;
                const isRecommended = v.id === recommendedCategoryFor(totalPassengers);
                const hasSeatingOptions = SEATING_OPTION_MODELS.includes(v.id);
                const seatingPref = seatingPrefByVehicle[v.id] ?? (totalPassengers > 6 ? 'SEVEN' : 'ANY');
                const vFare = liveFareFor(v.id) ?? computeStandardFare({
                  tripType: draft.tripType,
                  farePlan: draft.farePlan,
                  vehicleCategory: v.id,
                  pickup: draft.pickup,
                  drop: draft.drop,
                  localPackageId: draft.localPackageId,
                  realDistanceKmOverride: realDistanceKm,
                });
                return (
                  <View key={v.id} style={[s.vehicleCard, isSelected && s.vehicleCardActive, hasSeatingOptions && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => updateStandardDraft({ vehicleCategory: v.id })}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={s.vehicleName}>{v.name}</Text>
                          {v.id === 'CRYSTA' && (
                            <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.18)', borderColor: '#F59E0B', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Sparkles size={11} color="#D97706" />
                              <Text style={{ color: '#D97706', fontSize: 10, fontWeight: '900' }}>✨ Luxury</Text>
                            </View>
                          )}
                          {isRecommended && (
                            <View style={s.recommendBadge}>
                              <Sparkles color={palette.accent} size={10} />
                              <Text style={s.recommendBadgeText}>Recommended</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.vehicleModels}>{v.models}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Users size={11} color={palette.textMuted} />
                            <Text style={s.vehicleSpec}>{seatingPref === 'SEVEN' ? '7+1 Seats' : seatingPref === 'SIX' ? '6+1 Seats' : v.capacity}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Luggage size={11} color={palette.textMuted} />
                            <Text style={s.vehicleSpec}>{v.luggage}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.vehicleFare}>₹{vFare.totalFare}</Text>
                        <Text style={s.vehicleFareSub}>{vFare.isLive ? 'Fare' : 'Estimated'}</Text>
                      </View>
                    </TouchableOpacity>

                    {hasSeatingOptions && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {SEATING_OPTIONS.map(o => {
                          const chipActive = seatingPref === o.key;
                          return (
                            <TouchableOpacity
                              key={o.key}
                              style={[s.vehiclePrefChip, chipActive && s.vehiclePrefChipActive]}
                              onPress={() => {
                                if (totalPassengers > 6 && o.key !== 'SEVEN') {
                                  if (Platform.OS === 'web') {
                                    alert('7+1 seating layout is auto-selected because you have more than 6 passengers.');
                                  }
                                  return;
                                }
                                setSeatingPrefByVehicle(prev => ({ ...prev, [v.id]: o.key }));
                                updateStandardDraft({ vehicleCategory: v.id });
                              }}
                            >
                              <Text style={[s.vehiclePrefChipText, chipActive && { color: palette.accent }]}>{o.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {SHARE_AND_SAVE_ENABLED && (
                <View style={{ gap: 8 }}>
                  <Text style={s.fieldLabel}>Share & Save (optional)</Text>
                  <TouchableOpacity
                    style={[s.shareToggleCard, draft.shareEnabled && s.shareToggleCardActive]}
                    onPress={() => updateStandardDraft({ shareEnabled: !draft.shareEnabled, seatsToShare: Math.min(draft.seatsToShare, maxShareSeats) })}
                  >
                    <View style={s.shareIconBox}>
                      <Share2 color="#0EA5E9" size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.shareTitle}>{draft.shareEnabled ? 'Share & Save is ON' : 'Turn on Share & Save'}</Text>
                      <Text style={s.shareSub}>You stay the primary booking owner. Others just join your journey.</Text>
                    </View>
                    <View style={[s.toggleTrack, draft.shareEnabled && s.toggleTrackActive]}>
                      <View style={[s.toggleThumb, draft.shareEnabled && s.toggleThumbActive]} />
                    </View>
                  </TouchableOpacity>

                  {draft.shareEnabled && (
                    <View style={s.shareDetailCard}>
                      <Text style={s.fieldLabel}>Seats to share (of {maxShareSeats} free)</Text>
                      <View style={s.chipRow}>
                        {Array.from({ length: maxShareSeats }, (_, i) => i + 1).map(n => (
                          <TouchableOpacity key={n} style={[s.seatChip, draft.seatsToShare === n && s.seatChipActive]} onPress={() => updateStandardDraft({ seatsToShare: n })}>
                            <Text style={[s.seatChipText, draft.seatsToShare === n && { color: '#0EA5E9' }]}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {fare && (
                        <View style={s.savingsRow}>
                          <BadgeCheck color="#10B981" size={14} />
                          <Text style={s.savingsText}>You could save up to ₹{shareDiscountAmount} on this trip</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              <View style={s.actionBar}>
                <SecondaryButton label="Back" onPress={goBack} palette={palette} />
                <PrimaryButton label={`Continue • ₹${finalPayable}`} onPress={goNext} flex palette={palette} />
              </View>
            </View>
          )}

          {section === 'REVIEW' && (
            <View style={{ gap: 14 }}>
              <Text style={s.screenHeadline}>Review & confirm</Text>
              <Text style={s.screenSubheadline}>Check your details before payment</Text>

              {/* RIDER SELECTION (BOOK FOR MYSELF VS SOMEONE ELSE) */}
              <View style={s.bookingForCard}>
                <Text style={s.fieldLabel}>Who is travelling?</Text>
                <View style={s.bookingForSegment}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[s.bookingForSegmentBtn, bookingFor === 'MYSELF' && s.bookingForSegmentBtnActive]}
                    onPress={() => {
                      setBookingFor('MYSELF');
                      setContactName(user?.name || '');
                      setContactPhone(user?.phone || '');
                    }}
                  >
                    <UserIcon color={bookingFor === 'MYSELF' ? palette.accent : palette.textMuted} size={14} />
                    <Text style={[s.bookingForSegmentText, bookingFor === 'MYSELF' && { color: palette.accent }]}>
                      Myself
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[s.bookingForSegmentBtn, bookingFor === 'OTHER' && s.bookingForSegmentBtnActive]}
                    onPress={() => {
                      setBookingFor('OTHER');
                      setRiderName('');
                      setRiderPhone('');
                    }}
                  >
                    <Users color={bookingFor === 'OTHER' ? palette.accent : palette.textMuted} size={14} />
                    <Text style={[s.bookingForSegmentText, bookingFor === 'OTHER' && { color: palette.accent }]}>
                      Someone Else (Guest)
                    </Text>
                  </TouchableOpacity>
                </View>

                {bookingFor === 'OTHER' ? (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={s.inputCard}>
                      <View style={s.inputRow}>
                        <UserIcon color={palette.accent} size={16} />
                        <TextInput
                          style={s.textInput}
                          value={riderName}
                          onChangeText={setRiderName}
                          placeholder="Rider's full name (Family / Friend / Client)"
                          placeholderTextColor={palette.placeholder}
                        />
                      </View>
                      <View style={[s.inputRow, { borderTopWidth: 1, borderTopColor: palette.divider }]}>
                        <Car color={palette.accent} size={16} />
                        <CountryCodeField value={riderCountryCode} onChange={setRiderCountryCode} palette={palette} />
                        <TextInput
                          style={s.textInput}
                          value={riderPhone}
                          onChangeText={setRiderPhone}
                          placeholder="Rider's phone number"
                          keyboardType="phone-pad"
                          placeholderTextColor={palette.placeholder}
                        />
                      </View>
                    </View>
                    <View style={s.riderNoticeBox}>
                      <Info color={palette.accent} size={13} />
                      <Text style={s.riderNoticeText}>
                        Driver details & Start OTP SMS will be sent directly to {riderName ? riderName : "the rider's phone number"}.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.inputCard}>
                    <View style={s.inputRow}>
                      <UserIcon color={palette.accent} size={16} />
                      <TextInput style={s.textInput} value={contactName} onChangeText={setContactName} placeholder="Full name" placeholderTextColor={palette.placeholder} />
                    </View>
                    <View style={[s.inputRow, { borderTopWidth: 1, borderTopColor: palette.divider }]}>
                      <Car color={palette.accent} size={16} />
                      <CountryCodeField value={contactCountryCode} onChange={setContactCountryCode} palette={palette} />
                      <TextInput style={s.textInput} value={contactPhone} onChangeText={setContactPhone} placeholder="Phone number" keyboardType="phone-pad" placeholderTextColor={palette.placeholder} />
                    </View>
                  </View>
                )}
              </View>

              {showAdditionalPhone ? (
                <View style={s.inputCard}>
                  <View style={s.inputRow}>
                    <Users color={palette.textMuted} size={16} />
                    <CountryCodeField value={additionalCountryCode} onChange={setAdditionalCountryCode} palette={palette} />
                    <TextInput style={s.textInput} value={additionalPhone} onChangeText={setAdditionalPhone} placeholder="Additional number (optional)" keyboardType="phone-pad" placeholderTextColor={palette.placeholder} />
                    <TouchableOpacity onPress={() => { setShowAdditionalPhone(false); setAdditionalPhone(''); }}>
                      <X color={palette.textMuted} size={16} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.addStopBtn} onPress={() => setShowAdditionalPhone(true)}>
                  <Plus color={palette.accent} size={14} />
                  <Text style={s.addStopBtnText}>Add additional number</Text>
                </TouchableOpacity>
              )}

              <View style={s.reviewCard}>
                <Row
                  label="Route"
                  value={draft.tripType === 'LOCAL' ? draft.pickup : [draft.pickup, ...draft.stops, draft.drop].filter(Boolean).join(' → ')}
                  bold
                />
                <Row label="Trip type" value={tripTypeLabel(draft.tripType)} />
                <Row label="Pickup timing" value={draft.scheduleType === 'NOW' ? 'Leaving now' : `${formatDateForDisplay(draft.startDate)} • ${formatTimeForDisplay(draft.startTime)}`} />
                {draft.tripType === 'ROUNDTRIP' && (
                  <Row label="Return timing" value={`${formatDateForDisplay(draft.endDate)} • ${formatTimeForDisplay(draft.endTime)}`} />
                )}
                <Row label="Vehicle" value={STANDARD_VEHICLE_CATALOG.find(v => v.id === draft.vehicleCategory)?.name ?? draft.vehicleCategory} />
                <Row label="Passengers" value={`${adultCount} Adult${adultCount > 1 ? 's' : ''}${childrenCount > 0 ? `, ${childrenCount} Child${childrenCount > 1 ? 'ren' : ''}` : ''} (${totalPassengers} Total)`} />
                <Row label="Luggage" value={`${luggageCount} Bag${luggageCount > 1 ? 's' : ''}`} />
                {draft.shareEnabled && <Row label="Share & Save" value={`${draft.seatsToShare} seat(s) shareable`} />}
                <View style={s.divider} />
                {fare && (
                  <>
                    <Row label={`Fare${fare.billedKm ? ` (${fare.billedKm} km)` : ''}`} value={`₹${fare.distanceFare}`} />
                    <Row label="Driver Beta" value={`₹${fare.driverBeta}`} />
                    {(fare.permitAmount || 0) > 0 && <Row label="State permit" value={`₹${fare.permitAmount}`} />}
                    {(fare.hillAmount || 0) > 0 && <Row label="Hill / Ghat" value={`₹${fare.hillAmount}`} />}
                    {fare.tollAmount > 0 && <Row label="Toll" value={`₹${fare.tollAmount}`} />}
                    {(fare.nightAmount || 0) > 0 && <Row label="Night charges" value={`₹${fare.nightAmount}`} />}
                    {!fare.isLive && (
                      <>
                        <Row label="GST (5%)" value={`₹${fare.gstAmount}`} />
                        <Row label="Platform Convenience Fee" value={wallet?.isPremiumMember ? "₹0 (Premium Pass Active 🎉)" : `₹${BOOKING_CONFIG.PLATFORM_CONVENIENCE_FEE}`} />
                      </>
                    )}
                    {draft.shareEnabled && <Row label="Drop Saver seat discount" value={`− ₹${shareDiscountAmount}`} accent />}
                    <View style={s.divider} />
                    <Row label="Total payable · All-inclusive" value={`₹${finalPayable}`} big />
                  </>
                )}
              </View>

              <View style={s.actionBar}>
                <SecondaryButton label="Back" onPress={goBack} palette={palette} />
                <PrimaryButton
                  label={isSubmitting ? 'Processing…' : `Confirm & Pay ₹${finalPayable}`}
                  onPress={handleConfirmAndPay}
                  disabled={isSubmitting || !contactName.trim() || !contactPhone.trim()}
                  flex
                  palette={palette}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showScheduleModal} transparent animationType="slide" onRequestClose={() => closeScheduleModal()}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => closeScheduleModal()}>
          <TouchableOpacity activeOpacity={1} style={[s.modalCard, { maxHeight: '85%' }]} onPress={() => setActivePickerId(null)}>
            <Text style={s.modalTitle}>Pick date & time</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>Date</Text>
                <View style={[s.inputRowCard, { alignItems: 'flex-start' }]}>
                  <Calendar color={palette.accent} size={14} style={{ marginTop: 2 }} />
                  <DateField value={modalDate} onChange={setModalDate} palette={palette} minToday id="modalDate" activePickerId={activePickerId} setActivePickerId={setActivePickerId} />
                </View>
              </View>

              <View style={{ gap: 8, marginTop: 14 }}>
                <Text style={s.fieldLabel}>Time</Text>
                <View style={[s.inputRowCard, { alignItems: 'flex-start' }]}>
                  <Clock color={palette.accent} size={14} style={{ marginTop: 2 }} />
                  <TimeField value={modalTime} onChange={setModalTime} palette={palette} id="modalTime" activePickerId={activePickerId} setActivePickerId={setActivePickerId} minTime={minTimeIfToday(modalDate)} />
                </View>
              </View>

              <View style={[s.modalActionRow, { marginTop: 16 }]}>
                <SecondaryButton label="Cancel" onPress={closeScheduleModal} palette={palette} />
                <PrimaryButton label="Confirm" disabled={!modalDate || !modalTime} onPress={confirmScheduleModal} flex palette={palette} />
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function quickDate(label: string): string {
  const d = new Date();
  if (label === 'Tomorrow') d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function tripTypeLabel(type: StandardTripType): string {
  switch (type) {
    case 'ONEWAY': return 'One Way';
    case 'ROUNDTRIP': return 'Round Trip';
    case 'LOCAL': return 'Local / Hourly';
    case 'MULTICITY': return 'Multi City';
  }
}

function tripTypeShortLabel(type: StandardTripType): string {
  switch (type) {
    case 'ONEWAY': return 'One-Way';
    case 'ROUNDTRIP': return 'Round Trip';
    case 'LOCAL': return 'Local';
    case 'MULTICITY': return 'Multi City';
  }
}

function tripTypeDescription(type: StandardTripType): string {
  switch (type) {
    case 'ONEWAY': return 'One destination, point-to-point drop';
    case 'ROUNDTRIP': return 'Return journey with driver allowance included';
    case 'LOCAL': return 'City rental by the hour with a KM allowance';
    case 'MULTICITY': return 'Multiple destinations in one itinerary';
  }
}

function makeRow(palette: ThemePalette) {
  return function Row({ label, value, bold, big, accent }: { label: string; value: string; bold?: boolean; big?: boolean; accent?: boolean }) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: palette.textMuted, fontSize: big ? 13 : 11.5, fontWeight: big ? '800' : '500' }}>{label}</Text>
        <Text style={{
          color: accent || big ? '#10B981' : palette.textPrimary,
          fontSize: big ? 18 : 12,
          fontWeight: big ? '900' : bold ? '800' : '600',
        }}>{value}</Text>
      </View>
    );
  };
}

function PrimaryButton({ label, onPress, disabled, flex, palette }: { label: string; onPress: () => void; disabled?: boolean; flex?: boolean; palette: ThemePalette }) {
  return (
    <TouchableOpacity
      style={[{ backgroundColor: palette.accent, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }, flex && { flex: 1 }, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={{ color: '#070B12', fontSize: 13, fontWeight: '900' }}>{label}</Text>
      <ArrowRight color="#070B12" size={16} />
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress, palette }: { label: string; onPress: () => void; palette: ThemePalette }) {
  return (
    <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' }} onPress={onPress}>
      <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function minTimeIfToday(dateStr: string): string | undefined {
  const now = new Date();
  if (dateStr !== now.toISOString().slice(0, 10)) return undefined;
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatDateForDisplay(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeForDisplay(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const PICKER_ROW_H = 34;
const PICKER_HEIGHT = 180;
const PICKER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function useScrollToSelected(open: boolean, index: number) {
  const ref = React.useRef<ScrollView>(null);
  useEffect(() => {
    if (open && index >= 0) {
      const offset = Math.max(0, index * PICKER_ROW_H - PICKER_HEIGHT / 2 + PICKER_ROW_H / 2);
      requestAnimationFrame(() => ref.current?.scrollTo({ y: offset, animated: false }));
    }
  }, [open, index]);
  return ref;
}

function PickerColumn({ items, selectedIndex, open, onSelect, palette, disabledUntil = -1 }: { items: string[]; selectedIndex: number; open: boolean; onSelect: (i: number) => void; palette: ThemePalette; disabledUntil?: number }) {
  const scrollRef = useScrollToSelected(open, selectedIndex);
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      {items.map((label, i) => {
        const disabled = i < disabledUntil;
        return (
          <TouchableOpacity
            key={label + i}
            disabled={disabled}
            onPress={() => onSelect(i)}
            style={{ height: PICKER_ROW_H, justifyContent: 'center', alignItems: 'center', backgroundColor: i === selectedIndex ? palette.accentGlow : 'transparent' }}
          >
            <Text style={{ color: disabled ? palette.border : i === selectedIndex ? palette.accent : palette.textPrimary, fontWeight: i === selectedIndex ? '800' : '500', fontSize: 13 }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// Real date/time pickers: a compact custom column picker on web (styled,
// consistent with the app - browsers' native date/time inputs looked crude
// and out of place), the platform DateTimePicker modal on iOS/Android.
function CountryCodeField({ value, onChange, palette }: { value: string; onChange: (v: string) => void; palette: ThemePalette }) {
  return (
    <TextInput
      style={{
        color: palette.textPrimary, fontSize: 13, fontWeight: '700',
        paddingRight: 8, marginRight: 6, borderRightWidth: 1, borderRightColor: palette.divider,
        width: 48, textAlign: 'center',
      }}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9+]/g, ''))}
      keyboardType="phone-pad"
      maxLength={5}
      placeholder="+91"
      placeholderTextColor={palette.placeholder}
    />
  );
}

function DateField({ value, onChange, palette, minToday = true, id, activePickerId, setActivePickerId }: { value: string; onChange: (v: string) => void; palette: ThemePalette; minToday?: boolean; id: string; activePickerId: string | null; setActivePickerId: (id: string | null) => void }) {
  const showPicker = activePickerId === id;
  const setShowPicker = (open: boolean) => setActivePickerId(open ? id : null);

  if (Platform.OS === 'web') {
    const today = new Date();
    const parsed = value ? new Date(`${value}T00:00:00`) : null;
    const selDay = parsed ? parsed.getDate() : today.getDate();
    const selMonth = parsed ? parsed.getMonth() : today.getMonth();
    const selYear = parsed ? parsed.getFullYear() : today.getFullYear();
    const years = [today.getFullYear(), today.getFullYear() + 1];
    const daysInMonth = new Date(selYear > 0 ? selYear : today.getFullYear(), (selMonth >= 0 ? selMonth : today.getMonth()) + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));

    const isThisYear = selYear === today.getFullYear();
    const isThisMonth = isThisYear && selMonth === today.getMonth();

    const monthsDisabledUntil = minToday && isThisYear ? today.getMonth() : -1;
    const daysDisabledUntil = minToday && isThisMonth ? today.getDate() - 1 : -1;

    const emit = (day: number, month: number, year: number) => {
      let targetYear = year;
      let targetMonth = month;
      let targetDay = day;

      if (minToday) {
        if (targetYear < today.getFullYear()) {
          targetYear = today.getFullYear();
          targetMonth = today.getMonth();
          targetDay = today.getDate();
        } else if (targetYear === today.getFullYear()) {
          if (targetMonth < today.getMonth()) {
            targetMonth = today.getMonth();
            targetDay = today.getDate();
          } else if (targetMonth === today.getMonth() && targetDay < today.getDate()) {
            targetDay = today.getDate();
          }
        }
      }

      const mm = String(targetMonth + 1).padStart(2, '0');
      const dd = String(targetDay).padStart(2, '0');
      onChange(`${targetYear}-${mm}-${dd}`);
    };

    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => setShowPicker(!showPicker)}>
          <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '600' }}>
            {value ? formatDateForDisplay(value) : 'Select date'}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <View style={{
            marginTop: 8, height: PICKER_HEIGHT,
            flexDirection: 'row', backgroundColor: palette.surface, borderRadius: 12,
            borderWidth: 1, borderColor: palette.border, overflow: 'hidden',
          }}>
            <PickerColumn
              items={days}
              selectedIndex={selDay - 1}
              disabledUntil={daysDisabledUntil}
              open={showPicker}
              palette={palette}
              onSelect={(i) => emit(i + 1, selMonth >= 0 ? selMonth : today.getMonth(), selYear > 0 ? selYear : today.getFullYear())}
            />
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <PickerColumn
              items={PICKER_MONTHS}
              selectedIndex={selMonth}
              disabledUntil={monthsDisabledUntil}
              open={showPicker}
              palette={palette}
              onSelect={(i) => emit(Math.min(selDay > 0 ? selDay : today.getDate(), new Date((selYear > 0 ? selYear : today.getFullYear()), i + 1, 0).getDate()), i, selYear > 0 ? selYear : today.getFullYear())}
            />
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <PickerColumn
              items={years.map(String)}
              selectedIndex={years.indexOf(selYear)}
              open={showPicker}
              palette={palette}
              onSelect={(i) => emit(selDay > 0 ? selDay : today.getDate(), selMonth >= 0 ? selMonth : today.getMonth(), years[i])}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPicker(true)}>
        <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '600' }}>
          {value ? formatDateForDisplay(value) : 'Select date'}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minToday ? new Date() : undefined}
          onChange={(_event: any, selected?: Date) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) onChange(selected.toISOString().slice(0, 10));
          }}
        />
      )}
    </>
  );
}

const TIME_PICKER_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const TIME_PICKER_HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const TIME_PICKER_PERIODS = ['AM', 'PM'];

function to24Hour(hour12: number, period: string): number {
  const base = hour12 % 12;
  return period === 'PM' ? base + 12 : base;
}

function TimeField({ value, onChange, palette, id, activePickerId, setActivePickerId, minTime }: { value: string; onChange: (v: string) => void; palette: ThemePalette; id: string; activePickerId: string | null; setActivePickerId: (id: string | null) => void; minTime?: string }) {
  const showPicker = activePickerId === id;
  const setShowPicker = (open: boolean) => setActivePickerId(open ? id : null);

  if (Platform.OS === 'web') {
    const [h, m] = value ? value.split(':').map(Number) : [undefined, undefined];
    const pad = (n: number) => String(n).padStart(2, '0');
    const period = h === undefined ? undefined : (h < 12 ? 'AM' : 'PM');
    const hour12 = h === undefined ? undefined : (h % 12 === 0 ? 12 : h % 12);
    const hour12Index = hour12 === undefined ? -1 : TIME_PICKER_HOURS_12.indexOf(hour12);
    const periodIndex = period === undefined ? -1 : TIME_PICKER_PERIODS.indexOf(period);
    const closestMinuteIndex = m === undefined ? -1 : TIME_PICKER_MINUTES.reduce((best, min, i) =>
      Math.abs(min - m) < Math.abs(TIME_PICKER_MINUTES[best] - m) ? i : best, 0);

    const [minHour, minMinute] = minTime ? minTime.split(':').map(Number) : [-1, -1];
    const hoursDisabledUntil = minHour >= 0 && period !== undefined
      ? TIME_PICKER_HOURS_12.filter(hr => to24Hour(hr, period) < minHour).length
      : -1;
    const periodsDisabledUntil = minHour >= 0 && hour12 !== undefined
      ? TIME_PICKER_PERIODS.filter(p => to24Hour(hour12, p) < minHour).length
      : -1;
    const minutesDisabledUntil = minHour >= 0 && (h ?? -1) === minHour
      ? TIME_PICKER_MINUTES.filter(min => min < minMinute).length
      : -1;

    const emit = (newHour12: number, newPeriod: string, newMinute: number) => onChange(`${pad(to24Hour(newHour12, newPeriod))}:${pad(newMinute)}`);

    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => setShowPicker(!showPicker)}>
          <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '600' }}>
            {value ? formatTimeForDisplay(value) : 'Select time'}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <View style={{
            marginTop: 8, height: PICKER_HEIGHT,
            flexDirection: 'row', backgroundColor: palette.surface, borderRadius: 12,
            borderWidth: 1, borderColor: palette.border, overflow: 'hidden',
          }}>
            <PickerColumn
              items={TIME_PICKER_HOURS_12.map(String)}
              selectedIndex={hour12Index}
              open={showPicker}
              palette={palette}
              disabledUntil={hoursDisabledUntil}
              onSelect={(i) => emit(TIME_PICKER_HOURS_12[i], period ?? 'AM', m ?? 0)}
            />
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <PickerColumn
              items={TIME_PICKER_MINUTES.map(pad)}
              selectedIndex={closestMinuteIndex}
              disabledUntil={minutesDisabledUntil}
              open={showPicker}
              palette={palette}
              onSelect={(i) => emit(hour12 ?? 12, period ?? 'AM', TIME_PICKER_MINUTES[i])}
            />
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <PickerColumn
              items={TIME_PICKER_PERIODS}
              selectedIndex={periodIndex}
              disabledUntil={periodsDisabledUntil}
              open={showPicker}
              palette={palette}
              onSelect={(i) => { emit(hour12 ?? 12, TIME_PICKER_PERIODS[i], m ?? 0); setShowPicker(false); }}
            />
          </View>
        )}
      </View>
    );
  }

  const timeToDate = (t: string) => {
    const d = new Date();
    if (t) {
      const [h, m] = t.split(':').map(Number);
      d.setHours(h || 0, m || 0, 0, 0);
    }
    return d;
  };

  return (
    <>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPicker(true)}>
        <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '600' }}>
          {value ? formatTimeForDisplay(value) : 'Select time'}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={timeToDate(value)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_event: any, selected?: Date) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) {
              const hh = String(selected.getHours()).padStart(2, '0');
              const mm = String(selected.getMinutes()).padStart(2, '0');
              onChange(`${hh}:${mm}`);
            }
          }}
        />
      )}
    </>
  );
}

function getStyles(isDark: boolean, palette: ThemePalette) {
  const displayFont = Platform.OS === 'web' ? "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" : undefined;
  const bodyFont = Platform.OS === 'web' ? "'Plus Jakarta Sans', system-ui, sans-serif" : undefined;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    headerGradient: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    backBtn: { padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
    headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontFamily: displayFont },
    headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 1, fontFamily: bodyFont },

    progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.16)', marginTop: 14, overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2, backgroundColor: palette.accent },
    progressLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10.5, fontWeight: '700', marginTop: 6, fontFamily: bodyFont, letterSpacing: 0.2 },

    scroll: { flex: 1 },
    scrollInner: { padding: 14, paddingBottom: 40 },
    webCenterWrap: Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const } : {},

    screenHeadline: { fontSize: 18, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    screenSubheadline: { fontSize: 11.5, color: palette.textMuted, marginTop: -8, fontFamily: bodyFont },
    fieldLabel: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },

    inputCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 2, borderWidth: 1, borderColor: palette.border },
    inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
    gpsBtn: { backgroundColor: palette.accentGlow, padding: 6, borderRadius: 6 },
    inputDividerWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', height: 16 },
    inputDivider: { height: 1, width: '100%', backgroundColor: palette.divider },
    swapBtn: { position: 'absolute', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    addStopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    addStopBtnText: { color: palette.accent, fontSize: 12, fontWeight: '700', fontFamily: bodyFont },
    textInput: { flex: 1, color: palette.textPrimary, fontSize: 13, fontWeight: '600', fontFamily: bodyFont, paddingVertical: Platform.OS === 'web' ? 2 : 0, outlineStyle: 'none' as any },
    suggestDropdown: { paddingHorizontal: 6, paddingBottom: 6, gap: 2 },
    suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 6 },
    suggestText: { fontSize: 12, color: palette.textSecondary, fontFamily: bodyFont },

    twoOptionRow: { flexDirection: 'row', gap: 10 },
    bigOption: { flex: 1, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, borderRadius: 14, padding: 14, gap: 4, alignItems: 'flex-start' },
    bigOptionActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    bigOptionTitle: { fontSize: 13.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    bigOptionSub: { fontSize: 10, color: palette.textMuted, fontFamily: bodyFont },

    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    chipText: { fontSize: 11.5, fontWeight: '700', color: palette.textSecondary, fontFamily: bodyFont },
    inputRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 6, borderWidth: 1, borderColor: palette.border },

    tripTypeSegment: { flexDirection: 'row', backgroundColor: palette.surface, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: palette.border },
    tripTypeSegmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    tripTypeSegmentBtnActive: { backgroundColor: palette.accent },
    tripTypeSegmentText: { fontSize: 11, fontWeight: '800', color: palette.textMuted, fontFamily: bodyFont },
    tripTypeSegmentTextActive: { color: '#070B12' },
    tripTypeCaption: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },
    subtypeSegment: { flexDirection: 'row', gap: 8 },
    subtypeSegmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    subtypeSegmentBtnActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    subtypeSegmentText: { fontSize: 10.5, fontWeight: '700', color: palette.textMuted, fontFamily: bodyFont },
    subtypeSegmentTextActive: { color: palette.accent },
    airportTag: { backgroundColor: palette.accentGlow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
    airportTagText: { color: palette.accent, fontSize: 8.5, fontWeight: '900', fontFamily: bodyFont },
    urgentNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.accentGlow, padding: 10, borderRadius: 10 },
    urgentNoticeText: { flex: 1, fontSize: 10.5, color: palette.accent, fontWeight: '700', fontFamily: bodyFont },
    returnNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 },
    returnNoticeText: { fontSize: 10.5, color: palette.textMuted, fontWeight: '600', fontFamily: bodyFont },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: palette.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, gap: 14 },
    modalTitle: { fontSize: 16, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
    reorderStack: { gap: 1 },
    reorderBtn: { padding: 1 },

    planChip: { flex: 1, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, borderRadius: 12, padding: 12 },
    planChipActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    planChipTitle: { fontSize: 12, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    planChipSub: { fontSize: 9.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },

    packageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: palette.border },
    packageRowActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    packageLabel: { fontSize: 12, fontWeight: '700', color: palette.textPrimary, fontFamily: bodyFont },

    passengerCardContainer: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1.5,
      borderColor: palette.border,
      gap: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 6,
      elevation: 3,
    },
    passengerHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    passengerCardTitle: {
      fontSize: 14.5,
      fontWeight: '900',
      color: palette.textPrimary,
      fontFamily: displayFont,
    },
    totalPassengerBadge: {
      backgroundColor: palette.accentGlow,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    totalPassengerBadgeText: {
      color: palette.accent,
      fontSize: 11,
      fontWeight: '800',
      fontFamily: bodyFont,
    },
    counterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    counterRowLast: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    counterLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: palette.textPrimary,
      fontFamily: bodyFont,
    },
    counterSub: {
      fontSize: 10.5,
      color: palette.textMuted,
      marginTop: 1,
      fontFamily: bodyFont,
    },
    autoSevenBadgeNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#F59E0B',
      marginTop: 4,
    },
    autoSevenBadgeNoticeText: {
      flex: 1,
      color: '#D97706',
      fontSize: 11,
      fontWeight: '800',
      fontFamily: bodyFont,
    },

    passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surfaceAlt, padding: 10, borderRadius: 12 },
    passengerLabel: { fontSize: 12, fontWeight: '700', color: palette.textPrimary, fontFamily: bodyFont },
    stepperBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    stepperBtnText: { fontSize: 16, fontWeight: '900', color: palette.textPrimary },
    stepperValue: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, minWidth: 20, textAlign: 'center' },

    vehicleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: palette.border, gap: 10 },
    vehicleCardActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    vehiclePrefChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border },
    vehiclePrefChipActive: { borderColor: palette.accent, backgroundColor: palette.accentGlow },
    vehiclePrefChipText: { fontSize: 11, fontWeight: '700', color: palette.textMuted, fontFamily: bodyFont },
    vehicleName: { fontSize: 13.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    vehicleModels: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },
    vehicleSpec: { fontSize: 10, color: palette.textMuted, fontFamily: bodyFont },
    recommendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: palette.accentGlow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    recommendBadgeText: { fontSize: 8.5, fontWeight: '800', color: palette.accent, fontFamily: bodyFont },
    vehicleFare: { fontSize: 15, fontWeight: '900', color: palette.textPrimary, fontFamily: bodyFont },
    vehicleFareSub: { fontSize: 8.5, color: palette.textMuted, fontFamily: bodyFont },

    shareToggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: palette.border },
    shareToggleCardActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.08)' },
    shareIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(14,165,233,0.15)', justifyContent: 'center', alignItems: 'center' },
    shareTitle: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    shareSub: { fontSize: 10.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },
    toggleTrack: { width: 40, height: 22, borderRadius: 11, backgroundColor: palette.border, padding: 2 },
    toggleTrackActive: { backgroundColor: '#0EA5E9' },
    toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
    toggleThumbActive: { transform: [{ translateX: 18 }] },

    shareDetailCard: { backgroundColor: palette.surfaceAlt, borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: palette.border },
    seatChip: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    seatChipActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.15)' },
    seatChipText: { fontSize: 13, fontWeight: '800', color: palette.textPrimary },
    savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    savingsText: { fontSize: 11, color: '#10B981', fontWeight: '700', fontFamily: bodyFont },

    reviewCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 8 },
    divider: { height: 1, backgroundColor: palette.divider, marginVertical: 2 },

    bookingForCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1.5,
      borderColor: palette.border,
      gap: 10,
    },
    bookingForSegment: {
      flexDirection: 'row',
      backgroundColor: palette.surfaceAlt,
      borderRadius: 10,
      padding: 3,
      borderWidth: 1,
      borderColor: palette.border,
    },
    bookingForSegmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
    },
    bookingForSegmentBtnActive: {
      backgroundColor: palette.accentGlow,
      borderWidth: 1,
      borderColor: palette.accentBorder,
    },
    bookingForSegmentText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: palette.textMuted,
      fontFamily: bodyFont,
    },
    riderNoticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: palette.accentGlow,
      padding: 10,
      borderRadius: 10,
    },
    riderNoticeText: {
      flex: 1,
      fontSize: 10.5,
      color: palette.accent,
      fontWeight: '700',
      fontFamily: bodyFont,
    },

    actionBar: { flexDirection: 'row', gap: 10, marginTop: 4 },

    confirmCard: { backgroundColor: palette.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: palette.border, gap: 8 },
    confirmTitle: { color: palette.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center', fontFamily: displayFont },
    confirmOrderId: { color: palette.textMuted, fontSize: 11, textAlign: 'center', fontFamily: bodyFont, marginBottom: 4 },
    shareNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14,165,233,0.1)', padding: 10, borderRadius: 10, marginTop: 6 },
    shareNoticeText: { flex: 1, fontSize: 10.5, color: palette.textSecondary, fontFamily: bodyFont },
    infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
    infoNoticeText: { flex: 1, fontSize: 10, color: palette.textMuted, lineHeight: 14, fontFamily: bodyFont },

    primaryBtn: { backgroundColor: palette.accent, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 14 },
    primaryBtnText: { color: '#070B12', fontSize: 13, fontWeight: '900', fontFamily: bodyFont },
  });
}
