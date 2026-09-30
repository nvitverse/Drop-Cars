import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette, ThemePalette } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceMode } from '@/contexts/ServiceModeContext';
import { useTaxiFlow } from '@/contexts/TaxiFlowContext';
import {
  BOOKING_CONFIG,
  DROPBID_VEHICLE_CATALOG,
  DropBidVehicleCategory,
} from '@/constants/bookingConfig';
import { estimateDistanceKm } from '@/utils/taxiPricing';
import axiosInstance from '@/app/api/axiosInstance';
import {
  sortOffers,
  OfferSortMode,
  isWithinDropBidScheduleLimit,
  classifyTripType,
  classifyMultiStopTripType,
  calculateMultiStopDistance,
  saveDiscoveredLocationToCache,
  searchDebouncedLocations,
  buildGoogleMapsRouteUrl,
} from '@/utils/dropBidEngine';
import { DriverQuote, DropBidCounterStep } from '@/types/booking';

// Free reverse-geocode (OpenStreetMap Nominatim via our own backend proxy)
// for the "use current location" GPS pickup button - no Google Maps
// billing involved, kept separate from the paid Google-backed city lookup
// used elsewhere in the app.
const GEOCODE_BASE = 'https://drop-cars-api-207918408785.asia-south2.run.app/api/geocode';
import {
  MapPin,
  Navigation,
  Calendar,
  Clock,
  Zap,
  ArrowRight,
  ArrowLeft,
  Users,
  Star,
  Repeat,
  LocateFixed,
  ShieldCheck,
  User,
  X,
  TrendingUp,
  Sparkles,
  Award,
  Timer,
  Info,
  Compass,
  Search,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  BadgeCheck,
  Luggage,
} from 'lucide-react-native';

type Stage = 'REQUEST' | 'FINDING' | 'OFFERS' | 'REVIEW' | 'CONFIRMED';

const REQUEST_STEP_LABEL: Record<number, string> = {
  1: 'Route & Timing',
  2: 'Vehicle & Passengers',
  3: 'Review Request',
};

const SORT_OPTIONS: { id: OfferSortMode; label: string }[] = [
  { id: 'RECOMMENDED', label: 'Recommended' },
  { id: 'LOWEST_FARE', label: 'Lowest Fare' },
  { id: 'HIGHEST_RATED', label: 'Highest Rated' },
  { id: 'FASTEST', label: 'Fastest' },
  { id: 'NEAREST', label: 'Nearest' },
];

function maskRegistration(plate: string): string {
  const parts = plate.split(' ');
  if (parts.length < 4) return plate;
  return `${parts[0]} ${parts[1]} ${parts[2]} ****`;
}

function minutesLeft(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

function secondsLeft(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatCountdown(iso?: string): string {
  const s = secondsLeft(iso);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function DropBidScreen() {
  const router = useRouter();
  const { systemColorScheme, isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const { user } = useAuth();
  const { setActiveMode } = useServiceMode();
  useFocusEffect(
    useCallback(() => {
      setActiveMode('TAXI');
    }, [setActiveMode])
  );
  const {
    dropBidRequest,
    dropBidOffers,
    confirmedDropBidBooking,
    createDropBidRequest,
    refreshDropBidOffers,
    sendCounterOffer,
    simulateDriverCounterResponse,
    instantBookNoNegotiation,
    switchMatchedDriver,
    selectOffer,
    payAdvanceForSelectedOffer,
    resetDropBid,
    addRecentSearch,
  } = useTaxiFlow();

  const [stage, setStage] = useState<Stage>('OFFERS');
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);

  const fetchMyRequests = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/dropbid/my-requests');
      if (Array.isArray(res.data)) {
        setMyRequests(res.data);
        if (res.data.length > 0 && !expandedReqId) {
          setExpandedReqId(res.data[0].id);
        }
      }
    } catch (e) {
      // ignore
    }
  }, [expandedReqId]);

  useEffect(() => {
    if (stage === 'OFFERS') {
      fetchMyRequests();
      const interval = setInterval(fetchMyRequests, 6000);
      return () => clearInterval(interval);
    }
  }, [stage, fetchMyRequests]);

  // REQUEST FORM STEP STATE
  const [requestStep, setRequestStep] = useState<1 | 2 | 3>(1);

  // REQUEST FORM STATE
  const [pickup, setPickup] = useState('');
  const [pickupIsGPS, setPickupIsGPS] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [drop, setDrop] = useState('Bangalore');
  const [activeFocusField, setActiveFocusField] = useState<string | null>(null);
  const [locatingGPS, setLocatingGPS] = useState(false);
  const [scheduleType, setScheduleType] = useState<'NOW' | 'SCHEDULE'>('NOW');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [adultCount, setAdultCount] = useState(3);
  const [childrenCount, setChildrenCount] = useState(0);
  const [luggageCount, setLuggageCount] = useState(2);
  const totalPassengers = adultCount + childrenCount;
  const [vehicleCategory, setVehicleCategory] = useState<DropBidVehicleCategory>('SEDAN');
  const [expectedFareInput, setExpectedFareInput] = useState('');

  // MULTI-STOP WAYPOINTS STATE
  const [stops, setStops] = useState<string[]>([]);

  // LOCATION MAP PINNING MODAL STATE
  const [pinModalField, setPinModalField] = useState<'pickup' | 'drop' | null>(null);

  // Real driving distance from the backend (Google Distance Matrix API,
  // cached server-side) - the local calculateMultiStopDistance() estimate
  // is a hash-based placeholder that falls back to a flat 28km for any
  // route it doesn't recognize, which is exactly why an unrelated
  // pickup/drop pair could show a wrong, unrelated-looking km figure.
  const [realDistanceKm, setRealDistanceKm] = useState<number | null>(null);
  const realDistanceRequestId = useRef(0);

  useEffect(() => {
    if (!pickup.trim() || !drop.trim()) {
      setRealDistanceKm(null);
      return;
    }
    const thisRequestId = ++realDistanceRequestId.current;
    const timer = setTimeout(async () => {
      const location: Record<string, string> = { '0': pickup };
      stops.filter(s => s.trim()).forEach((s, i) => { location[String(i + 1)] = s; });
      location[String(Object.keys(location).length)] = drop;
      try {
        const res = await axiosInstance.post('/api/customer/bookings/quote', {
          pickup_drop_location: location,
          trip_type: 'Oneway',
          car_type: vehicleCategory === 'SEDAN' ? 'SEDAN_4_PLUS_1' : vehicleCategory === 'SUV' ? 'SUV' : vehicleCategory === 'INNOVA' ? 'INNOVA' : 'INNOVA_CRYSTA',
        });
        if (thisRequestId === realDistanceRequestId.current) {
          setRealDistanceKm(res.data?.fare?.total_km ?? null);
        }
      } catch (e) {
        // Backend couldn't quote this route (unrecognized place name, API
        // hiccup, etc.) - keep whatever the local estimate/last real value
        // was rather than blocking the screen.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [pickup, drop, JSON.stringify(stops), vehicleCategory]);

  const tripClassification = useMemo(() => {
    return classifyMultiStopTripType(pickup || 'Chennai', stops, drop || 'Bangalore', vehicleCategory, realDistanceKm);
  }, [pickup, stops, drop, vehicleCategory, realDistanceKm]);

  const pickupSuggestions = useMemo(() => {
    return activeFocusField === 'pickup' ? searchDebouncedLocations(pickup) : [];
  }, [pickup, activeFocusField]);

  const dropSuggestions = useMemo(() => {
    return activeFocusField === 'drop' ? searchDebouncedLocations(drop) : [];
  }, [drop, activeFocusField]);

  const dateOptions = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const fmtMonthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fmtDayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' });

    return [
      { label: `Today (${fmtMonthDay(today)})`, val: today.toISOString().slice(0, 10) },
      { label: `Tomorrow (${fmtMonthDay(tomorrow)})`, val: tomorrow.toISOString().slice(0, 10) },
      { label: `${fmtDayName(dayAfter)} (${fmtMonthDay(dayAfter)})`, val: dayAfter.toISOString().slice(0, 10) },
    ];
  }, []);

  useEffect(() => {
    if (!startDate && dateOptions.length > 0) {
      setStartDate(dateOptions[0].val);
    }
    if (!startTime) {
      const now = new Date(Date.now() + 20 * 60000);
      const hrs = now.getHours();
      const mins = Math.floor(now.getMinutes() / 5) * 5;
      setStartTime(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
    }
  }, [startDate, startTime, dateOptions]);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalTime, setModalTime] = useState('');
  const [activePickerId, setActivePickerId] = useState<string | null>('modalDate');

  const openScheduleModal = () => {
    if (scheduleType === 'SCHEDULE' && startDate && startTime) {
      setModalDate(startDate);
      setModalTime(startTime);
    } else {
      const suggested = new Date(Date.now() + 20 * 60000);
      const dateStr = suggested.toISOString().slice(0, 10);
      const timeStr = `${String(suggested.getHours()).padStart(2, '0')}:${String(suggested.getMinutes()).padStart(2, '0')}`;
      setModalDate(dateStr);
      setModalTime(timeStr);
    }
    setActivePickerId('modalDate');
    setShowScheduleModal(true);
  };

  const confirmScheduleModal = () => {
    if (modalDate) setStartDate(modalDate);
    if (modalTime) setStartTime(modalTime);
    setScheduleType('SCHEDULE');
    setActivePickerId(null);
    setShowScheduleModal(false);
  };

  const closeScheduleModal = () => {
    setActivePickerId(null);
    setShowScheduleModal(false);
  };

  // OFFERS STATE
  const [sortMode, setSortMode] = useState<OfferSortMode>('RECOMMENDED');
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [detailOffer, setDetailOffer] = useState<DriverQuote | null>(null);
  const [negotiateOffer, setNegotiateOffer] = useState<DriverQuote | null>(null);
  const [counterInput, setCounterInput] = useState('');
  const [tick, setTick] = useState(0);
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [reviewOffer, setReviewOffer] = useState<DriverQuote | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const liveOfferTimer = useRef<any>(null);

  const handleUseCurrentLocation = async (silent = false) => {
    setLocatingGPS(true);
    setGpsDenied(false);
    try {
      let coords: { latitude: number; longitude: number } | null = null;

      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          throw new Error('Geolocation not supported');
        }
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Location permission denied');
        const pos = await Location.getCurrentPositionAsync({});
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }

      if (!coords) throw new Error('Could not get location');

      const res = await axios.get(`${GEOCODE_BASE}/reverse`, {
        params: { lat: coords.latitude, lng: coords.longitude },
        timeout: 10000,
      });
      setPickup(res.data?.display_name || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
      setPickupIsGPS(true);
    } catch {
      setGpsDenied(true);
      setPickupIsGPS(false);
      if (!silent) {
        Alert.alert('Location unavailable', 'Could not detect your current location. Please enter your pickup manually.');
      }
    } finally {
      setLocatingGPS(false);
    }
  };

  // Map-first: request the customer's location the moment DropBid opens,
  // instead of waiting for a manual tap - fails silently into manual entry.
  useEffect(() => {
    handleUseCurrentLocation(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Real polling now (was a one-shot fake-offer timer) - drivers respond
  // asynchronously, so this is the only way new real offers actually
  // reach the screen without the customer manually tapping Refresh over
  // and over.
  useEffect(() => {
    if (stage !== 'OFFERS') return;
    refreshDropBidOffers();
    liveOfferTimer.current = setInterval(() => {
      refreshDropBidOffers();
    }, 8000);
    return () => clearInterval(liveOfferTimer.current);
  }, [stage]);

  const activeOffers = useMemo(
    () => dropBidOffers.filter(o => o.status !== 'REJECTED' && secondsLeft(o.offerExpiresAt) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropBidOffers, tick]
  );
  const expiredOffers = useMemo(
    () => dropBidOffers.filter(o => o.status !== 'REJECTED' && secondsLeft(o.offerExpiresAt) <= 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropBidOffers, tick]
  );

  const sortedOffers = useMemo(() => sortOffers(activeOffers, sortMode), [activeOffers, sortMode]);
  const topOffers = useMemo(() => sortOffers(activeOffers, 'RECOMMENDED').slice(0, 3), [activeOffers]);

  const distanceEstimate = pickup && drop ? calculateMultiStopDistance(pickup, stops, drop) : 0;
  const fairFareLow = Math.round(distanceEstimate * 14 + 400);
  const fairFareHigh = Math.round(distanceEstimate * 20 + 550);
  const expectedFareNum = parseInt(expectedFareInput, 10);
  let fareGuidance: string | null = null;
  if (!isNaN(expectedFareNum) && expectedFareNum > 0) {
    if (expectedFareNum < fairFareLow * 0.85) fareGuidance = 'This looks low — drivers may be slower to accept.';
    else if (expectedFareNum <= fairFareHigh * 1.05) fareGuidance = 'This looks competitive for your route.';
    else fareGuidance = 'This is on the higher side — you should get offers quickly.';
  }

  const withinScheduleLimit = isWithinDropBidScheduleLimit(scheduleType, startDate, startTime);
  const canSubmitRequest = pickup.trim().length > 1 && drop.trim().length > 1 &&
    (scheduleType === 'NOW' || (startDate.trim().length > 0 && startTime.trim().length > 0)) &&
    withinScheduleLimit;

  const handleSubmitRequest = () => {
    if (!canSubmitRequest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addRecentSearch({ pickup, drop, tripType: 'ONEWAY', mode: 'DROPBID' });
    setStage('FINDING');
    // The backend requires a target price - fall back to the same
    // fair-fare midpoint the "Instant Book" flow already uses if the
    // customer left the field blank, rather than let the request 400.
    const targetFareForSubmit = !isNaN(expectedFareNum) && expectedFareNum > 0
      ? expectedFareNum
      : Math.round((fairFareLow + fairFareHigh) / 2);
    setTimeout(async () => {
      const req = await createDropBidRequest({
        pickupLocation: pickup,
        dropLocation: drop,
        scheduleType,
        startDate: scheduleType === 'SCHEDULE' ? startDate : undefined,
        startTime: scheduleType === 'SCHEDULE' ? startTime : undefined,
        passengerCount: totalPassengers,
        vehicleCategory,
        expectedFare: targetFareForSubmit,
      });
      if (!req) {
        Alert.alert('Could not post your request', 'Please check your connection and try again.');
        setStage('REQUEST');
        return;
      }
      setStage('OFFERS');
    }, 1400);
  };

  const handleInstantBookAtEstimatedFare = () => {
    if (!canSubmitRequest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const fairFare = Math.round((fairFareLow + fairFareHigh) / 2);
    addRecentSearch({ pickup, drop, tripType: 'ONEWAY', mode: 'DROPBID' });
    setStage('FINDING');
    setTimeout(async () => {
      const req = await createDropBidRequest({
        pickupLocation: pickup,
        dropLocation: drop,
        scheduleType,
        startDate: scheduleType === 'SCHEDULE' ? startDate : undefined,
        startTime: scheduleType === 'SCHEDULE' ? startTime : undefined,
        passengerCount: totalPassengers,
        vehicleCategory,
        expectedFare: fairFare,
      });
      if (!req) {
        Alert.alert('Could not post your request', 'Please check your connection and try again.');
        setStage('REQUEST');
        return;
      }
      setStage('OFFERS');
    }, 1000);
  };

  const openNegotiate = (offer: DriverQuote) => {
    setDetailOffer(null);
    setNegotiateOffer(offer);
    setCounterInput('');
  };

  const handleSendCounter = async () => {
    if (!negotiateOffer) return;
    const amount = parseInt(counterInput, 10);
    if (isNaN(amount) || amount <= 0) return;
    setIsNegotiating(true);
    try {
      await sendCounterOffer(negotiateOffer.quoteId, amount);
      setCounterInput('');
    } catch (e: any) {
      Alert.alert('Could not send counter offer', e?.response?.data?.detail || 'Please check your connection and try again.');
    } finally {
      setIsNegotiating(false);
    }
  };

  // Keep the negotiation modal's offer object fresh as context state updates.
  const liveNegotiateOffer = negotiateOffer ? dropBidOffers.find(o => o.quoteId === negotiateOffer.quoteId) ?? negotiateOffer : null;

  const goToReview = (offer: DriverQuote) => {
    setDetailOffer(null);
    setNegotiateOffer(null);
    selectOffer(offer.quoteId);
    setReviewOffer(offer);
    setStage('REVIEW');
  };

  const handlePayAdvance = async () => {
    setIsPaying(true);
    const ok = await payAdvanceForSelectedOffer();
    setIsPaying(false);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setStage('CONFIRMED');
    }
  };

  const targetFare = expectedFareInput ? parseInt(expectedFareInput, 10) : tripClassification.estimatedFare;

  // "Instant book" can no longer truly instant-match - a real driver
  // hasn't seen (let alone bid on) a request that was just created.
  // instantBookNoNegotiation() correctly returns null against a real,
  // still-empty offer list, so this now always degrades to the normal
  // OFFERS waiting screen instead of pretending to match a driver.
  const handleInstantBookNoNegotiate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage('FINDING');
    const req = await createDropBidRequest({
      pickupLocation: pickup || 'Chennai',
      dropLocation: drop || 'Bangalore',
      scheduleType,
      startDate: scheduleType === 'SCHEDULE' ? startDate : undefined,
      startTime: scheduleType === 'SCHEDULE' ? startTime : undefined,
      passengerCount: totalPassengers,
      vehicleCategory,
      expectedFare: targetFare,
    });
    if (!req) {
      Alert.alert('Could not post your request', 'Please check your connection and try again.');
      setStage('REQUEST');
      return;
    }
    setTimeout(() => {
      const matchedOffer = instantBookNoNegotiation();
      if (matchedOffer) {
        setReviewOffer(matchedOffer);
        setStage('REVIEW');
      } else {
        setStage('OFFERS');
      }
    }, 900);
  };

  const handleSwitchDriver = () => {
    Alert.alert(
      'Choose a Different Driver?',
      'Would you like to release this driver and pick another driver offer from your broadcast list?',
      [
        { text: 'Keep Current Driver', style: 'cancel' },
        {
          text: 'Choose Different Driver',
          onPress: () => {
            switchMatchedDriver();
            setReviewOffer(null);
            setStage('OFFERS');
          },
        },
      ]
    );
  };

  const handleStartOver = () => {
    resetDropBid();
    setStage('OFFERS');
    setRequestStep(1);
    setPickup('Chennai');
    setDrop('Bangalore');
    setScheduleType('NOW');
    setStartDate('');
    setStartTime('');
    setExpectedFareInput('');
  };

  const goBack = () => {
    if (stage === 'REQUEST') {
      if (requestStep > 1) {
        setRequestStep(prev => (prev - 1) as 1 | 2 | 3);
        return;
      }
      setStage('OFFERS');
      return;
    }
    if (stage === 'OFFERS') { router.back(); return; }
    if (stage === 'REVIEW') { setStage('OFFERS'); return; }
    router.back();
  };

  const s = getStyles(isDark, palette);

  // -------------------------------------------------------------------------
  // CONFIRMED
  // -------------------------------------------------------------------------
  if (stage === 'CONFIRMED' && confirmedDropBidBooking) {
    const b = confirmedDropBidBooking;
    const statusSteps = ['Request Created', 'Offers Received', 'Offer Accepted', 'Payment Confirmed', 'Confirmed'];
    return (
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={palette.headerGradient} style={[s.headerGradient, { paddingTop: topPadding }]}>
          <View style={s.headerRow}>
            <View style={{ width: 30 }} />
            <Text style={s.headerTitle}>Booking Confirmed</Text>
            <View style={{ width: 30 }} />
          </View>
        </LinearGradient>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner}>
          <View style={s.webCenterWrap}>
            <View style={s.confirmCard}>
              <CheckCircle2 color="#10B981" size={54} style={{ alignSelf: 'center', marginBottom: 8 }} />
              <Text style={s.confirmTitle}>Your Drop Bid ride is confirmed!</Text>
              <Text style={s.confirmOrderId}>Booking ID #{b.orderId}</Text>

              <View style={s.statusTimeline}>
                {statusSteps.map((label, idx) => (
                  <View key={label} style={s.statusStep}>
                    <View style={[s.statusDot, s.statusDotActive]} />
                    <Text style={s.statusStepText}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={s.divider} />

              {/* Match Reasons Explanation (Section 1) */}
              {b.quote.matchReasons && b.quote.matchReasons.length > 0 && (
                <View style={{ backgroundColor: 'rgba(14,165,233,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(14,165,233,0.2)', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Sparkles color="#0EA5E9" size={15} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#0EA5E9', letterSpacing: 0.5 }}>MATCH RATIONALE</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {b.quote.matchReasons.map((reason, idx) => (
                      <View key={idx} style={{ backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: palette.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: palette.textPrimary }}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Row palette={palette} label="Driver" value={b.quote.driverName} bold />
              <Row palette={palette} label="Vehicle" value={b.quote.carName} />
              <Row palette={palette} label="Requested vehicle" value={dropBidRequest?.vehicleCategory ?? '—'} />
              <Row palette={palette} label="Confirmed vehicle" value={`${b.quote.carName}${b.quote.isAlternativeVehicle ? ' (Alternative)' : ''}`} />
              <Row palette={palette} label="Registration" value={b.quote.carNumber} />
              <Row palette={palette} label="Route" value={`${b.pickup} → ${b.drop}`} />
              <Row palette={palette} label="Pickup" value={b.startDate ? `${b.startDate} • ${b.startTime}` : 'Now'} />
              <View style={s.divider} />
              <Row palette={palette} label="Final fare (all-inclusive)" value={`₹${b.quote.quotedFare}`} big />
              <Row palette={palette} label="Advance paid" value={`₹${b.advancePaid}`} accent />
              <Row palette={palette} label="Balance to pay driver" value={`₹${b.balanceDue}`} />

              <View style={s.infoNotice}>
                <Info color={palette.textMuted} size={13} />
                <Text style={s.infoNoticeText}>Driver and vehicle details will be shared 2 hours before pickup, or earlier upon request.</Text>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(239,68,68,0.2)',
                  marginTop: 10,
                }}
                onPress={handleSwitchDriver}
              >
                <Repeat color="#EF4444" size={14} />
                <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Choose a Different Driver</Text>
              </TouchableOpacity>

              <View style={s.warnNotice}>
                <AlertTriangle color="#F59E0B" size={13} />
                <Text style={s.warnNoticeText}>This booking is non-refundable now that your advance has been paid.</Text>
              </View>
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={handleStartOver}>
              <Text style={s.primaryBtnText}>Request Another Drop Bid</Text>
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
            <Text style={s.headerTitle}>Drop Bid Offers</Text>
            <Text style={s.headerSub}>
              {stage === 'REQUEST' && 'Tell us your trip'}
              {stage === 'FINDING' && 'Finding nearby drivers…'}
              {stage === 'OFFERS' && 'Manage your trip inquiries & live driver bids'}
              {stage === 'REVIEW' && 'Confirm your offer'}
            </Text>
          </View>
          <View style={{ width: 30 }} />
        </View>
        {stage === 'REQUEST' && (
          <>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${(requestStep / 3) * 100}%` }]} />
            </View>
            <Text style={s.progressLabel}>Step {requestStep} of 3 · {REQUEST_STEP_LABEL[requestStep]}</Text>
          </>
        )}
      </LinearGradient>

      {/* ------------------------------------------------------------- REQUEST */}
      {stage === 'REQUEST' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.webCenterWrap}>
            {/* STEP 1: ROUTE & TIMING */}
            {requestStep === 1 && (
              <View style={{ gap: 14 }}>
                <Text style={s.screenHeadline}>Where & when are you going?</Text>
                <Text style={s.screenSubheadline}>Enter pickup, destination, and timing</Text>

                {locatingGPS && !pickup && (
                  <View style={s.gpsStatusRow}>
                    <ActivityIndicator color="#0EA5E9" size="small" />
                    <Text style={s.gpsStatusText}>Detecting your location…</Text>
                  </View>
                )}

                {gpsDenied && !pickup && !locatingGPS && (
                  <View style={s.warnNotice}>
                    <AlertTriangle color="#F59E0B" size={13} />
                    <Text style={s.warnNoticeText}>Couldn't detect your location. Enter your pickup manually below.</Text>
                  </View>
                )}

                {/* 1. LOCATION INPUT CARD FIRST (PICKUP, STOPS, DROP) */}
                <View style={s.inputCard}>
                  {/* PICKUP ROW */}
                  <View style={s.inputRow}>
                    <MapPin color="#0EA5E9" size={16} />
                    <TextInput
                      style={s.textInput}
                      value={pickup}
                      onChangeText={(t) => { setPickup(t); setPickupIsGPS(false); saveDiscoveredLocationToCache(t); }}
                      onFocus={() => setActiveFocusField('pickup')}
                      onBlur={() => setTimeout(() => setActiveFocusField(null), 200)}
                      placeholder="Pickup location"
                      placeholderTextColor={palette.placeholder}
                    />
                    {pickupIsGPS && (
                      <View style={s.gpsTag}>
                        <Text style={s.gpsTagText}>Current Location</Text>
                      </View>
                    )}
                    <TouchableOpacity style={s.gpsBtn} onPress={() => setPinModalField('pickup')}>
                      <MapPin color="#0EA5E9" size={14} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.gpsBtn} onPress={() => handleUseCurrentLocation(false)} disabled={locatingGPS}>
                      {locatingGPS ? <ActivityIndicator color="#0EA5E9" size="small" /> : <LocateFixed color="#0EA5E9" size={14} />}
                    </TouchableOpacity>
                  </View>

                  {/* DEBOUNCED PICKUP PLACES SUGGESTIONS */}
                  {pickupSuggestions.length > 0 && (
                    <View style={s.suggestDropdown}>
                      {pickupSuggestions.map((place) => (
                        <TouchableOpacity
                          key={place}
                          style={s.suggestItem}
                          onPress={() => {
                            setPickup(place);
                            setPickupIsGPS(false);
                            setActiveFocusField(null);
                            saveDiscoveredLocationToCache(place);
                          }}
                        >
                          <MapPin color="#0EA5E9" size={13} />
                          <Text style={s.suggestText} numberOfLines={1}>{place}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* DYNAMIC INTERMEDIATE STOPS ROWS */}
                  {stops.map((stopVal, index) => {
                    const stopFieldKey = `stop_${index}`;
                    const stopSuggestions = activeFocusField === stopFieldKey ? searchDebouncedLocations(stopVal) : [];

                    return (
                      <View key={`stop_${index}`} style={{ gap: 4 }}>
                        <View style={s.inputDividerWrap}>
                          <View style={s.inputDivider} />
                        </View>
                        <View style={s.inputRow}>
                          <MapPin color="#F59E0B" size={16} />
                          <TextInput
                            style={s.textInput}
                            value={stopVal}
                            onChangeText={(t) => {
                              const updated = [...stops];
                              updated[index] = t;
                              setStops(updated);
                              saveDiscoveredLocationToCache(t);
                            }}
                            onFocus={() => setActiveFocusField(stopFieldKey)}
                            onBlur={() => setTimeout(() => setActiveFocusField(null), 200)}
                            placeholder={`Stop ${index + 1} (e.g. Temple, Station)`}
                            placeholderTextColor={palette.placeholder}
                          />
                          <TouchableOpacity
                            style={{ padding: 6, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' }}
                            onPress={() => setStops(stops.filter((_, i) => i !== index))}
                          >
                            <X color="#EF4444" size={14} />
                          </TouchableOpacity>
                        </View>

                        {/* DEBOUNCED STOP SUGGESTIONS */}
                        {stopSuggestions.length > 0 && (
                          <View style={s.suggestDropdown}>
                            {stopSuggestions.map((place) => (
                              <TouchableOpacity
                                key={place}
                                style={s.suggestItem}
                                onPress={() => {
                                  const updated = [...stops];
                                  updated[index] = place;
                                  setStops(updated);
                                  setActiveFocusField(null);
                                  saveDiscoveredLocationToCache(place);
                                }}
                              >
                                <MapPin color="#F59E0B" size={13} />
                                <Text style={s.suggestText} numberOfLines={1}>{place}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* ADD STOP BUTTON */}
                  {stops.length < 3 && (
                    <TouchableOpacity
                      onPress={() => setStops([...stops, ''])}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingVertical: 8, paddingHorizontal: 12, marginTop: 4,
                        alignSelf: 'flex-start', borderRadius: 8,
                        backgroundColor: 'rgba(14,165,233,0.1)',
                      }}
                    >
                      <Sparkles color="#0EA5E9" size={12} />
                      <Text style={{ color: '#0EA5E9', fontSize: 12, fontWeight: '800' }}>+ Add Stop</Text>
                    </TouchableOpacity>
                  )}

                  <View style={s.inputDividerWrap}>
                    <View style={s.inputDivider} />
                    <TouchableOpacity style={s.swapBtn} onPress={() => { const t = pickup; setPickup(drop); setDrop(t); setPickupIsGPS(false); }}>
                      <Repeat color="#0EA5E9" size={12} />
                    </TouchableOpacity>
                  </View>

                  {/* DROP ROW */}
                  <View style={s.inputRow}>
                    <Navigation color="#0EA5E9" size={16} />
                    <TextInput
                      style={s.textInput}
                      value={drop}
                      onChangeText={(t) => { setDrop(t); saveDiscoveredLocationToCache(t); }}
                      onFocus={() => setActiveFocusField('drop')}
                      onBlur={() => setTimeout(() => setActiveFocusField(null), 200)}
                      placeholder="Where to?"
                      placeholderTextColor={palette.placeholder}
                    />
                    <TouchableOpacity style={s.gpsBtn} onPress={() => setPinModalField('drop')}>
                      <Navigation color="#0EA5E9" size={14} />
                    </TouchableOpacity>
                  </View>

                  {/* DEBOUNCED DROP PLACES SUGGESTIONS */}
                  {dropSuggestions.length > 0 && (
                    <View style={s.suggestDropdown}>
                      {dropSuggestions.map((place) => (
                        <TouchableOpacity
                          key={place}
                          style={s.suggestItem}
                          onPress={() => {
                            setDrop(place);
                            setActiveFocusField(null);
                            saveDiscoveredLocationToCache(place);
                          }}
                        >
                          <Navigation color="#0EA5E9" size={13} />
                          <Text style={s.suggestText} numberOfLines={1}>{place}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* 2. VECTOR MAP PREVIEW SECOND (BELOW LOCATION CARD) */}
                <DropBidMapPreview
                  pickup={pickup}
                  stops={stops}
                  drop={drop}
                  isLocal={tripClassification.isLocal}
                  distanceKm={tripClassification.distanceKm}
                  palette={palette}
                  onOpenPinModal={(field) => setPinModalField(field)}
                />



                <Text style={s.fieldLabel}>Pickup timing</Text>
                <View style={s.twoOptionRow}>
                  <TouchableOpacity style={[s.bigOption, scheduleType === 'NOW' && s.bigOptionActiveBlue]} onPress={() => setScheduleType('NOW')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Zap color={scheduleType === 'NOW' ? '#0EA5E9' : palette.textMuted} size={15} />
                      <Text style={[s.bigOptionTitle, scheduleType === 'NOW' && { color: '#0EA5E9' }]}>Leave Now</Text>
                    </View>
                    <Text style={s.bigOptionSub}>Nearest practical pickup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.bigOption, scheduleType === 'SCHEDULE' && s.bigOptionActiveBlue]}
                    onPress={() => {
                      setScheduleType('SCHEDULE');
                      openScheduleModal();
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Calendar color={scheduleType === 'SCHEDULE' ? '#0EA5E9' : palette.textMuted} size={15} />
                      <Text style={[s.bigOptionTitle, scheduleType === 'SCHEDULE' && { color: '#0EA5E9' }]}>Schedule</Text>
                    </View>
                    <Text style={s.bigOptionSub}>Pick specific date & time</Text>
                  </TouchableOpacity>
                </View>

                {scheduleType === 'SCHEDULE' && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={s.rowTwoCols}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={[s.inputRowCard, { flex: 1 }]}
                        onPress={openScheduleModal}
                      >
                        <Calendar color="#0EA5E9" size={14} />
                        <Text style={{ flex: 1, color: startDate ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
                          {startDate ? formatDateForDisplay(startDate) : 'YYYY-MM-DD'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={[s.inputRowCard, { flex: 1 }]}
                        onPress={openScheduleModal}
                      >
                        <Clock color="#0EA5E9" size={14} />
                        <Text style={{ flex: 1, color: startTime ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
                          {startTime ? formatTimeForDisplay(startTime) : 'HH:MM AM/PM'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.dropBidSubmitBtn, { marginTop: 14 }, !(pickup.trim().length > 1 && drop.trim().length > 1) && { opacity: 0.45 }]}
                  disabled={!(pickup.trim().length > 1 && drop.trim().length > 1)}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setRequestStep(2);
                  }}
                >
                  <Text style={s.dropBidSubmitBtnText}>Continue to Vehicle & Passengers</Text>
                  <ArrowRight color="#FFFFFF" size={16} />
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 2: VEHICLE & PASSENGERS */}
            {requestStep === 2 && (
              <View style={{ gap: 14 }}>
                <Text style={s.screenHeadline}>Who & what vehicle?</Text>
                <Text style={s.screenSubheadline}>Select passengers, luggage, and preferred vehicle</Text>

                {/* PASSENGERS & LUGGAGE COUNTER CARD */}
                <View style={s.passengerCardContainer}>
                  <View style={s.passengerHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Users color="#0EA5E9" size={18} />
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
                        <Luggage color="#0EA5E9" size={15} />
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

                <Text style={s.fieldLabel}>Vehicle</Text>
                <View style={{ gap: 8 }}>
                  {DROPBID_VEHICLE_CATALOG.map(v => (
                    <TouchableOpacity key={v.id} style={[s.vehicleChoiceRow, vehicleCategory === v.id && s.vehicleChoiceRowActive]} onPress={() => setVehicleCategory(v.id)}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.vehicleChoiceTitle, vehicleCategory === v.id && { color: '#0EA5E9' }]}>{v.name}</Text>
                        <Text style={s.vehicleChoiceSub}>{v.description}</Text>
                      </View>
                      {vehicleCategory === v.id && <CheckCircle2 color="#0EA5E9" size={18} />}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>Your target fare (optional)</Text>
                <View style={s.inputRowCard}>
                  <Text style={{ color: palette.textMuted, fontWeight: '800' }}>₹</Text>
                  <TextInput style={s.textInput} value={expectedFareInput} onChangeText={setExpectedFareInput} placeholder={`e.g. ${fairFareLow}`} keyboardType="number-pad" placeholderTextColor={palette.placeholder} />
                </View>
                {fareGuidance && (
                  <View style={s.guidanceRow}>
                    <TrendingUp color="#0EA5E9" size={13} />
                    <Text style={s.guidanceText}>{fareGuidance}</Text>
                  </View>
                )}

                <View style={s.actionBar}>
                  <TouchableOpacity style={s.secondaryBtn} onPress={() => setRequestStep(1)}>
                    <Text style={s.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dropBidSubmitBtn, { flex: 1 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRequestStep(3);
                    }}
                  >
                    <Text style={s.dropBidSubmitBtnText}>Review Request</Text>
                    <ArrowRight color="#FFFFFF" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 3: REVIEW REQUEST */}
            {requestStep === 3 && (
              <View style={{ gap: 14 }}>
                <Text style={s.screenHeadline}>Review & Request Live Offers</Text>
                <Text style={s.screenSubheadline}>Verify your details before broadcasting to nearby drivers</Text>

                <View style={s.reviewCard}>
                  <Row palette={palette} label="Route" value={`${pickup} → ${drop}`} bold />
                  <Row
                    palette={palette}
                    label="Pickup timing"
                    value={scheduleType === 'NOW' ? 'Leave Now (Instant)' : `${formatDateForDisplay(startDate)} • ${formatTimeForDisplay(startTime)}`}
                  />
                  <Row
                    palette={palette}
                    label="Passengers & Luggage"
                    value={`${totalPassengers} Passenger${totalPassengers > 1 ? 's' : ''} • ${luggageCount} Bag${luggageCount > 1 ? 's' : ''}`}
                  />
                  <Row
                    palette={palette}
                    label="Vehicle Category"
                    value={DROPBID_VEHICLE_CATALOG.find(v => v.id === vehicleCategory)?.name || vehicleCategory}
                  />
                  <View style={s.divider} />
                  <Row
                    palette={palette}
                    label="Target / Expected Fare"
                    value={expectedFareInput ? `₹${expectedFareInput}` : `Est. ₹${tripClassification.estimatedFare} (${tripClassification.isLocal ? 'Meter' : 'Bidding'})`}
                    accent={!!expectedFareInput}
                  />

                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(14,165,233,0.12)',
                      borderRadius: 10, borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)', marginTop: 8,
                    }}
                    onPress={() => {
                      const url = buildGoogleMapsRouteUrl(pickup || 'Pickup', drop || 'Drop');
                      if (typeof window !== 'undefined') window.open(url, '_blank');
                    }}
                  >
                    <Compass color="#0EA5E9" size={14} />
                    <Text style={{ color: '#0EA5E9', fontSize: 12, fontWeight: '700' }}>Open Route in Google Maps ↗</Text>
                  </TouchableOpacity>
                </View>

                {fareGuidance && (
                  <View style={s.guidanceRow}>
                    <TrendingUp color="#0EA5E9" size={13} />
                    <Text style={s.guidanceText}>{fareGuidance}</Text>
                  </View>
                )}

                <View style={s.infoNotice}>
                  <Info color={palette.textMuted} size={13} />
                  <Text style={s.infoNoticeText}>Drivers will receive your broadcast and respond with custom quotes within seconds.</Text>
                </View>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    backgroundColor: '#10B981',
                    borderRadius: 12,
                    marginTop: 4,
                  }}
                  disabled={!canSubmitRequest}
                  onPress={handleInstantBookNoNegotiate}
                >
                  <Zap color="#FFFFFF" size={16} fill="#FFFFFF" />
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }}>
                    ⚡ 1-Tap Instant Book @ ₹{targetFare} (Skip Negotiating)
                  </Text>
                </TouchableOpacity>

                <View style={s.actionBar}>
                  <TouchableOpacity style={s.secondaryBtn} onPress={() => setRequestStep(2)}>
                    <Text style={s.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dropBidSubmitBtn, { flex: 1 }, !canSubmitRequest && { opacity: 0.45 }]}
                    disabled={!canSubmitRequest}
                    onPress={handleSubmitRequest}
                  >
                    <Users color="#FFFFFF" size={16} />
                    <Text style={s.dropBidSubmitBtnText}>Broadcast & Negotiate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- FINDING */}
      {stage === 'FINDING' && (
        <View style={s.centeredLoading}>
          <View style={s.loadingPulse}>
            <Zap color="#0EA5E9" size={30} />
          </View>
          <Text style={s.loadingTitle}>Finding nearby drivers…</Text>
          <Text style={s.loadingSub}>Broadcasting your request to eligible drivers</Text>
        </View>
      )}

      {/* ------------------------------------------------------------- OFFERS */}
      {stage === 'OFFERS' && (
        <View style={{ flex: 1, position: 'relative' }}>
          {myRequests.length === 0 && activeOffers.length === 0 ? (
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollInner, { paddingBottom: 90 }]} showsVerticalScrollIndicator={false}>
              <View style={s.webCenterWrap}>
                <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
                  <View style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: 'rgba(14,165,233,0.12)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: 'rgba(14,165,233,0.3)',
                    marginBottom: 4,
                  }}>
                    <Sparkles color="#0EA5E9" size={34} />
                  </View>
                  <Text style={{ fontSize: 19, fontWeight: '900', color: palette.textPrimary, textAlign: 'center' }}>
                    No Active Trip Inquiries
                  </Text>
                  <Text style={{ fontSize: 12.5, color: palette.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 320 }}>
                    Post your pickup, drop location & expected fare to receive competing live price offers from drivers with instant negotiation!
                  </Text>

                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0EA5E9',
                      paddingVertical: 13,
                      paddingHorizontal: 26,
                      borderRadius: 30,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      shadowColor: '#0EA5E9',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setStage('REQUEST');
                      setRequestStep(1);
                    }}
                  >
                    <Zap color="#FFFFFF" size={17} fill="#FFFFFF" />
                    <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 }}>
                      Post New Trip Request
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* HOW DROP BID WORKS CARD */}
                <View style={{
                  backgroundColor: palette.surface,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: palette.border,
                  gap: 14,
                  marginTop: 6,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Sparkles color="#0EA5E9" size={16} />
                    <Text style={{ fontSize: 13, fontWeight: '900', color: palette.textPrimary, letterSpacing: 0.3 }}>
                      HOW DROP BID WORKS
                    </Text>
                  </View>

                  <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(14,165,233,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#0EA5E9' }}>1</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: palette.textPrimary }}>Set Route & Target Price</Text>
                        <Text style={{ fontSize: 11, color: palette.textMuted, marginTop: 2 }}>Enter pickup, destination, timing & the fare you're willing to pay.</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(16,185,129,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#10B981' }}>2</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: palette.textPrimary }}>Receive Direct Driver Offers</Text>
                        <Text style={{ fontSize: 11, color: palette.textMuted, marginTop: 2 }}>Nearby verified drivers review your request and send competing bids.</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(245,158,11,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#F59E0B' }}>3</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: palette.textPrimary }}>Negotiate & Accept</Text>
                        <Text style={{ fontSize: 11, color: palette.textMuted, marginTop: 2 }}>Counter-offer in real-time, pick your preferred driver, and lock in your ride!</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollInner, { paddingBottom: 90 }]} showsVerticalScrollIndicator={false}>
              <View style={s.webCenterWrap}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: palette.textPrimary }}>
                    My Trip Requests ({myRequests.length || (dropBidRequest ? 1 : 0)})
                  </Text>
                  <TouchableOpacity onPress={fetchMyRequests} style={s.refreshIconBtn}>
                    <RefreshCw color={palette.accent} size={14} />
                  </TouchableOpacity>
                </View>

                {(myRequests.length > 0 ? myRequests : dropBidRequest ? [{
                  id: dropBidRequest.requestId,
                  pickup_location: dropBidRequest.pickupLocation,
                  drop_location: dropBidRequest.dropLocation,
                  car_type: dropBidRequest.vehicleCategory,
                  customer_target_price: dropBidRequest.expectedFare,
                  status: 'OPEN',
                  created_at: dropBidRequest.createdAt,
                  offers: activeOffers,
                }] : []).map((req: any) => {
                  const isExpanded = expandedReqId === req.id || myRequests.length === 1;
                  const reqOffers = (req.offers || []).map((o: any) => o.quoteId ? o : {
                    quoteId: String(o.id),
                    driverId: String(o.driver_id || ''),
                    driverName: o.driver_name || 'Driver',
                    driverPhone: o.driver_phone_masked || '',
                    driverRating: o.driver_rating ?? 4.8,
                    completedTrips: o.completed_trips ?? 45,
                    carName: o.car_name || 'Taxi Sedan',
                    carCategory: req.car_type || 'SEDAN',
                    carNumber: o.car_number || 'TN 01 AB 1234',
                    quotedFare: o.offer_price,
                    advanceAmount: Math.round((o.offer_price || 0) * 0.2),
                    balanceAmount: Math.round((o.offer_price || 0) * 0.8),
                    walletHoldAmount: 0,
                    etaMinutes: 15,
                    currentCounterAmount: o.counter_price,
                    counterHistory: o.counter_price ? [{
                      sender: o.counter_by === 'driver' ? 'DRIVER' : 'CUSTOMER',
                      amount: o.counter_price,
                      timestamp: new Date().toISOString(),
                    }] : undefined,
                    status: o.status === 'PENDING' ? 'ACTIVE' : o.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
                  });

                  return (
                    <View key={req.id} style={{ backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ backgroundColor: 'rgba(14,165,233,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ fontSize: 11, fontWeight: '900', color: '#0EA5E9' }}>#{req.id}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: palette.textMuted, fontWeight: '600' }}>
                            {req.created_at ? new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                          </Text>
                        </View>

                        <View style={{
                          backgroundColor: req.status === 'OPEN' ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
                          borderColor: req.status === 'OPEN' ? 'rgba(16,185,129,0.3)' : palette.border,
                        }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: req.status === 'OPEN' ? '#10B981' : palette.textMuted }}>
                            {req.status === 'OPEN' ? 'BROADCASTING' : req.status}
                          </Text>
                        </View>
                      </View>

                      <View style={{ gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MapPin color="#0EA5E9" size={15} />
                          <Text style={{ fontSize: 13.5, fontWeight: '800', color: palette.textPrimary, flex: 1 }} numberOfLines={1}>
                            {req.pickup_location}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                          <Navigation color="#10B981" size={14} />
                          <Text style={{ fontSize: 13.5, fontWeight: '800', color: palette.textPrimary, flex: 1 }} numberOfLines={1}>
                            {req.drop_location}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: palette.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                        <Text style={{ fontSize: 11.5, color: palette.textMuted, fontWeight: '600' }}>
                          Vehicle: <Text style={{ color: palette.textPrimary, fontWeight: '800' }}>{req.car_type || 'SEDAN'}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: palette.textPrimary, fontWeight: '800' }}>
                          Target: <Text style={{ color: '#10B981', fontWeight: '900' }}>₹{req.customer_target_price}</Text>
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={{
                          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                          backgroundColor: reqOffers.length > 0 ? 'rgba(14,165,233,0.1)' : palette.surfaceAlt,
                          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                          borderWidth: 1, borderColor: reqOffers.length > 0 ? 'rgba(14,165,233,0.3)' : palette.border,
                        }}
                        onPress={() => setExpandedReqId(isExpanded ? null : req.id)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Zap color={reqOffers.length > 0 ? '#0EA5E9' : palette.textMuted} size={15} fill={reqOffers.length > 0 ? '#0EA5E9' : 'transparent'} />
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: reqOffers.length > 0 ? '#0EA5E9' : palette.textPrimary }}>
                            {reqOffers.length > 0 ? `${reqOffers.length} Driver Offer${reqOffers.length === 1 ? '' : 's'} Received` : '0 Driver Bids yet (Drivers reviewing...)'}
                          </Text>
                        </View>
                        <ChevronRight color={palette.textMuted} size={16} style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }} />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={{ gap: 10, marginTop: 4 }}>
                          {reqOffers.length === 0 ? (
                            <Text style={{ fontSize: 11.5, color: palette.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                              No bids received for this inquiry yet. Nearby drivers are currently notified.
                            </Text>
                          ) : (
                            reqOffers.map((offer: DriverQuote) => (
                              <OfferCard key={offer.quoteId} offer={offer} palette={palette} onPress={() => setDetailOffer(offer)} />
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Sticky Bottom Floating Bar */}
          <View style={{
            position: 'absolute',
            bottom: 12,
            left: 16,
            right: 16,
            zIndex: 90,
          }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#0EA5E9',
                paddingVertical: 14,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                shadowColor: '#0EA5E9',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 8,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setStage('REQUEST');
                setRequestStep(1);
              }}
            >
              <Zap color="#FFFFFF" size={18} fill="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 14.5, fontWeight: '900', letterSpacing: 0.3 }}>
                Request Drop Taxi
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- REVIEW */}
      {stage === 'REVIEW' && reviewOffer && dropBidRequest && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
          <View style={s.webCenterWrap}>
            <Text style={s.screenHeadline}>Confirm your offer</Text>
            <Text style={s.screenSubheadline}>Review everything before you pay</Text>

            {/* Match Reasons Explanation (Section 1) */}
            {reviewOffer.matchReasons && reviewOffer.matchReasons.length > 0 && (
              <View style={{ backgroundColor: 'rgba(14,165,233,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(14,165,233,0.2)', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Sparkles color="#0EA5E9" size={15} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#0EA5E9', letterSpacing: 0.5 }}>WHY THIS DRIVER WAS MATCHED</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {reviewOffer.matchReasons.map((reason, idx) => (
                    <View key={idx} style={{ backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: palette.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: palette.textPrimary }}>{reason}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={s.reviewCard}>
              <Row palette={palette} label="Driver" value={reviewOffer.driverName} bold />
              <Row palette={palette} label="Vehicle" value={reviewOffer.carName} />
              {reviewOffer.isAlternativeVehicle && <Row palette={palette} label="Vehicle type" value="Alternative vehicle" accent />}
              <Row palette={palette} label="Pickup" value={dropBidRequest.pickupLocation} />
              <Row palette={palette} label="Destination" value={dropBidRequest.dropLocation} />
              <Row palette={palette} label="Date & time" value={dropBidRequest.scheduleType === 'NOW' ? 'As soon as possible' : `${dropBidRequest.startDate} • ${dropBidRequest.startTime}`} />
              <View style={s.divider} />
              <Row palette={palette} label="Final accepted fare" value={`₹${reviewOffer.quotedFare}`} big />
              <Row palette={palette} label="Advance to pay now" value={`₹${reviewOffer.advanceAmount}`} accent />
              <Row palette={palette} label="Remaining balance" value={`₹${reviewOffer.balanceAmount}`} />
            </View>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: 'rgba(239,68,68,0.08)',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.2)',
                marginBottom: 10,
              }}
              onPress={handleSwitchDriver}
            >
              <Repeat color="#EF4444" size={14} />
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Choose a Different Driver</Text>
            </TouchableOpacity>

            <View style={s.warnNotice}>
              <AlertTriangle color="#F59E0B" size={13} />
              <Text style={s.warnNoticeText}>Once confirmed and the advance is paid, this booking cannot be refunded or cancelled.</Text>
            </View>

            <View style={s.actionBar}>
              <TouchableOpacity style={s.secondaryBtn} onPress={() => setStage('OFFERS')}>
                <Text style={s.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dropBidSubmitBtn, { flex: 1 }, isPaying && { opacity: 0.6 }]} onPress={handlePayAdvance} disabled={isPaying}>
                <CheckCircle2 color="#FFFFFF" size={16} />
                <Text style={s.dropBidSubmitBtnText}>{isPaying ? 'Processing…' : `Pay ₹${reviewOffer.advanceAmount} & Confirm`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- OFFER DETAIL MODAL */}
      <Modal visible={!!detailOffer} transparent animationType="slide" onRequestClose={() => setDetailOffer(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Driver Details</Text>
              <TouchableOpacity onPress={() => setDetailOffer(null)}><X color={palette.textPrimary} size={20} /></TouchableOpacity>
            </View>
            {detailOffer && (
              <View style={{ gap: 12 }}>
                <View style={s.profileRow}>
                  <View style={s.profileAvatar}><User color={palette.textPrimary} size={22} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.profileName}>{detailOffer.driverName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Star color="#F59E0B" size={12} fill="#F59E0B" />
                      <Text style={s.profileMeta}>{detailOffer.driverRating.toFixed(2)} • {detailOffer.completedTrips} trips</Text>
                    </View>
                  </View>
                  <View style={s.verifiedPill}>
                    <ShieldCheck color="#10B981" size={12} />
                    <Text style={s.verifiedPillText}>Verified</Text>
                  </View>
                </View>

                <View style={s.reviewCard}>
                  <Row palette={palette} label="Vehicle" value={detailOffer.carName} />
                  <Row palette={palette} label="Category" value={detailOffer.isAlternativeVehicle ? `${detailOffer.carCategory} (Alternative)` : detailOffer.carCategory} />
                  <Row palette={palette} label="Registration" value={maskRegistration(detailOffer.carNumber)} />
                  <Row palette={palette} label="Reliability" value={`${detailOffer.reliabilityScore ?? 90}%`} />
                  <Row palette={palette} label="Distance from you" value={`${detailOffer.distanceKm ?? 0} km`} />
                  <Row palette={palette} label="Estimated arrival" value={`${detailOffer.etaMinutes} min`} />
                  <View style={s.divider} />
                  <Row palette={palette} label="Quoted fare (all-inclusive)" value={`₹${detailOffer.quotedFare}`} big />
                </View>

                <View style={s.actionBar}>
                  <TouchableOpacity style={s.secondaryBtn} onPress={() => openNegotiate(detailOffer)}>
                    <Text style={s.secondaryBtnText}>Negotiate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dropBidSubmitBtn, { flex: 1 }]} onPress={() => goToReview(detailOffer)}>
                    <Text style={s.dropBidSubmitBtnText}>Accept Offer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- NEGOTIATION MODAL */}
      <Modal visible={!!negotiateOffer} transparent animationType="slide" onRequestClose={() => setNegotiateOffer(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Negotiate Fare</Text>
              <TouchableOpacity onPress={() => setNegotiateOffer(null)}><X color={palette.textPrimary} size={20} /></TouchableOpacity>
            </View>
            {liveNegotiateOffer && (
              <View style={{ gap: 12 }}>
                <View style={s.currentOfferBox}>
                  <Text style={s.currentOfferLabel}>Current offer from {liveNegotiateOffer.driverName}</Text>
                  <Text style={s.currentOfferValue}>₹{liveNegotiateOffer.quotedFare}</Text>
                </View>

                {(liveNegotiateOffer.counterHistory?.length ?? 0) > 0 && (
                  <View style={s.negotiationHistory}>
                    {liveNegotiateOffer.counterHistory!.map((step: DropBidCounterStep, idx: number) => (
                      <View key={idx} style={[s.negotiationStep, step.sender === 'CUSTOMER' ? s.negotiationStepCustomer : s.negotiationStepDriver]}>
                        <Text style={s.negotiationStepSender}>{step.sender === 'CUSTOMER' ? 'You offered' : `${liveNegotiateOffer.driverName} offered`}</Text>
                        <Text style={s.negotiationStepAmount}>₹{step.amount}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={s.fieldLabel}>Your counter offer (₹)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(14,165,233,0.12)', borderRadius: 10 }}
                    onPress={() => {
                      const currentVal = parseInt(counterInput || String(liveNegotiateOffer.quotedFare), 10);
                      setCounterInput(String(Math.max(100, currentVal - 50)));
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#0EA5E9', fontSize: 13 }}>- ₹50</Text>
                  </TouchableOpacity>

                  <View style={[s.inputRowCard, { flex: 1 }]}>
                    <Text style={{ color: palette.textMuted, fontWeight: '800' }}>₹</Text>
                    <TextInput
                      style={s.textInput}
                      value={counterInput}
                      onChangeText={setCounterInput}
                      keyboardType="number-pad"
                      placeholder={`e.g. ${Math.round(liveNegotiateOffer.quotedFare * 0.92)}`}
                      placeholderTextColor={palette.placeholder}
                    />
                  </View>

                  <TouchableOpacity
                    style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(14,165,233,0.12)', borderRadius: 10 }}
                    onPress={() => {
                      const currentVal = parseInt(counterInput || String(liveNegotiateOffer.quotedFare), 10);
                      setCounterInput(String(currentVal + 50));
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#0EA5E9', fontSize: 13 }}>+ ₹50</Text>
                  </TouchableOpacity>
                </View>

                {isNegotiating && (
                  <View style={s.negotiatingRow}>
                    <Timer color="#0EA5E9" size={14} />
                    <Text style={s.negotiatingText}>Updating offer in-place & awaiting response…</Text>
                  </View>
                )}

                <View style={s.actionBar}>
                  <TouchableOpacity style={s.secondaryBtn} onPress={handleSendCounter}>
                    <Text style={s.secondaryBtnText}>{isNegotiating ? 'Update Offer' : 'Send Counter Offer'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dropBidSubmitBtn, { flex: 1 }]} onPress={() => goToReview(liveNegotiateOffer)}>
                    <Text style={s.dropBidSubmitBtnText}>Accept ₹{liveNegotiateOffer.quotedFare}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* SCHEDULE PICKER MODAL (MATCHING SCREENSHOT 2) */}
      <Modal visible={showScheduleModal} transparent animationType="fade" onRequestClose={closeScheduleModal}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxWidth: 440 }]}>
            <Text style={[s.modalTitle, { fontSize: 16, fontWeight: '900', marginBottom: 12 }]}>Pick date & time</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 8 }}>
                <Text style={s.fieldLabel}>Date</Text>
                <View style={[s.inputRowCard, { alignItems: 'flex-start' }]}>
                  <Calendar color="#F59E0B" size={14} style={{ marginTop: 2 }} />
                  <DateField
                    value={modalDate}
                    onChange={setModalDate}
                    palette={palette}
                    minToday
                    id="modalDate"
                    activePickerId={activePickerId}
                    setActivePickerId={setActivePickerId}
                  />
                </View>
              </View>

              <View style={{ gap: 8, marginTop: 14 }}>
                <Text style={s.fieldLabel}>Time</Text>
                <View style={[s.inputRowCard, { alignItems: 'flex-start' }]}>
                  <Clock color="#F59E0B" size={14} style={{ marginTop: 2 }} />
                  <TimeField
                    value={modalTime}
                    onChange={setModalTime}
                    palette={palette}
                    id="modalTime"
                    activePickerId={activePickerId}
                    setActivePickerId={setActivePickerId}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: palette.border,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  onPress={closeScheduleModal}
                >
                  <Text style={{ color: palette.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#F59E0B',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onPress={confirmScheduleModal}
                >
                  <Text style={{ color: '#070B12', fontSize: 14, fontWeight: '900' }}>Confirm</Text>
                  <ArrowRight color="#070B12" size={16} />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* INTERACTIVE LOCATION PINNING MODAL (100% FREE) */}
      <LocationPinModal
        visible={!!pinModalField}
        targetField={pinModalField}
        currentAddress={pinModalField === 'pickup' ? pickup : drop}
        onConfirm={(address) => {
          if (pinModalField === 'pickup') {
            setPickup(address);
            setPickupIsGPS(false);
          } else if (pinModalField === 'drop') {
            setDrop(address);
          }
        }}
        onClose={() => setPinModalField(null)}
        palette={palette}
      />
    </SafeAreaView>
  );
}
const PICKER_ROW_H = 34;
const PICKER_HEIGHT = 180;
const PICKER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function DropBidMapPreview({
  pickup,
  stops = [],
  drop,
  isLocal,
  distanceKm,
  palette,
  onOpenPinModal,
}: {
  pickup: string;
  stops?: string[];
  drop: string;
  isLocal: boolean;
  distanceKm: number;
  palette: ThemePalette;
  onOpenPinModal: (field: 'pickup' | 'drop') => void;
}) {
  const cleanStops = stops.filter(s => s.trim().length > 0);
  const openMapsUrl = () => {
    const url = buildGoogleMapsRouteUrl(pickup || 'Chennai', drop || 'Bangalore', cleanStops);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  const allWaypoints = [
    { type: 'pickup', title: pickup ? pickup.split(',')[0] : 'Pickup', color: '#10B981' },
    ...cleanStops.map((s, idx) => ({ type: 'stop', title: `Stop ${idx + 1}: ${s.split(',')[0]}`, color: '#F59E0B' })),
    { type: 'drop', title: drop ? drop.split(',')[0] : 'Drop', color: '#EF4444' },
  ];

  const totalWaypoints = allWaypoints.length;
  const startPercent = 12;
  const endPercent = 88;
  const stepPercent = totalWaypoints > 1 ? (endPercent - startPercent) / (totalWaypoints - 1) : 0;

  return (
    <View style={{
      backgroundColor: palette.surface,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
      marginTop: 6,
      marginBottom: 2,
    }}>
      <View style={{ height: 140, backgroundColor: '#090D16', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        {/* DASHED ROUTE LINE */}
        <View style={{
          position: 'absolute', width: '74%', height: 2,
          borderStyle: 'dashed', borderWidth: 1, borderColor: isLocal ? '#0EA5E9' : '#F59E0B',
          borderRadius: 1,
        }} />

        {/* DYNAMIC WAYPOINTS PINS & STAGGERED BADGES */}
        {allWaypoints.map((wp, idx) => {
          const leftPercent = startPercent + idx * stepPercent;
          const isPickup = wp.type === 'pickup';
          const isDrop = wp.type === 'drop';
          const isEven = idx % 2 === 0;

          return (
            <TouchableOpacity
              key={`${wp.title}_${idx}`}
              onPress={() => {
                if (isPickup) onOpenPinModal('pickup');
                else if (isDrop) onOpenPinModal('drop');
              }}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                transform: [{ translateX: -35 }],
                width: 70,
                alignItems: 'center',
                gap: 3,
                top: isEven ? 32 : 72,
              }}
            >
              <View style={{
                backgroundColor: wp.color,
                padding: isPickup || isDrop ? 5 : 4,
                borderRadius: 20,
                borderWidth: 2,
                borderColor: '#FFFFFF',
              }}>
                {isDrop ? <Navigation color="#FFFFFF" size={12} /> : <MapPin color="#FFFFFF" size={12} />}
              </View>
              <View style={{
                backgroundColor: 'rgba(7,11,18,0.92)',
                paddingHorizontal: 5,
                paddingVertical: 2,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: `${wp.color}66`,
                maxWidth: 75,
              }}>
                <Text style={{ color: wp.color, fontSize: 8.5, fontWeight: '800' }} numberOfLines={1}>
                  {wp.title}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* CLASSIFICATION BADGE */}
        <View style={{
          position: 'absolute', top: 6, backgroundColor: isLocal ? 'rgba(14,165,233,0.95)' : 'rgba(245,158,11,0.95)',
          paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 5,
        }}>
          <Sparkles color="#FFFFFF" size={10} />
          <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>
            {isLocal ? `⚡ Local Drop • ${distanceKm} km` : `🛣️ Intercity Outstation • ${distanceKm} km`}
          </Text>
        </View>

        {/* OPEN IN GOOGLE MAPS DEEP LINK BUTTON */}
        <TouchableOpacity
          onPress={openMapsUrl}
          style={{
            position: 'absolute', bottom: 6, right: 8, backgroundColor: 'rgba(15,23,42,0.9)',
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
            flexDirection: 'row', alignItems: 'center', gap: 4,
          }}
        >
          <Compass color="#0EA5E9" size={11} />
          <Text style={{ color: '#0EA5E9', fontSize: 9.5, fontWeight: '700' }}>View Route in Google Maps ↗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LocationPinModal({
  visible,
  targetField,
  currentAddress,
  onConfirm,
  onClose,
  palette,
}: {
  visible: boolean;
  targetField: 'pickup' | 'drop' | null;
  currentAddress: string;
  onConfirm: (address: string) => void;
  onClose: () => void;
  palette: ThemePalette;
}) {
  const [pinnedAddress, setPinnedAddress] = useState(currentAddress);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setPinnedAddress(currentAddress);
    setSearchQuery('');
  }, [currentAddress, visible]);

  if (!visible || !targetField) return null;

  const suggestions = searchQuery.trim().length > 1 ? searchDebouncedLocations(searchQuery) : [];

  const sampleLandmarks = [
    'Chengam',
    'Tiruvannamalai Arunachaleshwarar Temple',
    'Tiruvannamalai Railway Station',
    'Tiruvannamalai Main Bus Stand',
    'Girivalam Path Entrance',
    'Polur',
    'Arani',
    'Gingee',
    'Kallakurichi',
    'Ramanasramam Ashram',
    'Chennai Central Railway Station',
    'Koyambedu CMBT Bus Stand',
    'Kempegowda Bangalore City',
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,11,18,0.85)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 16,
          maxHeight: '90%',
          borderWidth: 1,
          borderColor: palette.border,
          gap: 12,
        }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MapPin color="#0EA5E9" size={20} />
              <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: '900' }}>
                {targetField === 'pickup' ? 'Pin Pickup Location' : 'Pin Destination Drop'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6, borderRadius: 12, backgroundColor: palette.cardBg }}>
              <X color={palette.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          {/* SEARCH BOX INSIDE MODAL */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: palette.cardBg,
            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
            borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)',
          }}>
            <Search color="#0EA5E9" size={16} />
            <TextInput
              style={{ flex: 1, color: palette.textPrimary, fontSize: 13, fontWeight: '700' }}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search town, landmark or address (e.g. Chengam)..."
              placeholderTextColor={palette.placeholder}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X color={palette.textMuted} size={15} />
              </TouchableOpacity>
            )}
          </View>

          {/* SEARCH SUGGESTIONS DROPDOWN IN MODAL */}
          {suggestions.length > 0 && (
            <View style={{
              backgroundColor: palette.cardBg, borderRadius: 12, padding: 6, gap: 2,
              borderWidth: 1, borderColor: palette.border, maxHeight: 150,
            }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {suggestions.map((place) => (
                  <TouchableOpacity
                    key={place}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 }}
                    onPress={() => {
                      setPinnedAddress(place);
                      setSearchQuery('');
                    }}
                  >
                    <MapPin color="#0EA5E9" size={14} />
                    <Text style={{ color: palette.textPrimary, fontSize: 12.5, fontWeight: '700' }}>{place}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* INTERACTIVE VECTOR MAP CONTAINER WITH PIN TARGET */}
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => {
              // Toggle sample location when tapping map canvas
              const sampleIndex = Math.floor(Math.random() * sampleLandmarks.length);
              setPinnedAddress(sampleLandmarks[sampleIndex]);
            }}
            style={{
              height: 200,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: '#070B12',
              position: 'relative',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(14,165,233,0.3)',
            }}
          >
            {/* GRID LINES PATTERN */}
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.25,
              backgroundImage: 'radial-gradient(#0EA5E9 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            } as any} />

            {/* CENTER GLOWING PIN TARGET */}
            <View style={{ alignItems: 'center', gap: 6, zIndex: 10 }}>
              <View style={{
                backgroundColor: targetField === 'pickup' ? '#10B981' : '#EF4444',
                padding: 10, borderRadius: 30, borderWidth: 3, borderColor: '#FFFFFF',
              }}>
                <MapPin color="#FFFFFF" size={22} />
              </View>
              <View style={{
                backgroundColor: 'rgba(7,11,18,0.92)', paddingHorizontal: 12, paddingVertical: 5,
                borderRadius: 10, borderWidth: 1, borderColor: '#0EA5E9', maxWidth: 280,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>
                  📍 {pinnedAddress || 'Search or tap landmark below'}
                </Text>
              </View>
            </View>

            {/* PIN INSTRUCTION BADGE */}
            <View style={{
              position: 'absolute', top: 10, backgroundColor: 'rgba(14,165,233,0.95)',
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Compass color="#FFFFFF" size={12} />
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>Search above, tap landmark or click map to move pin</Text>
            </View>
          </TouchableOpacity>

          {/* QUICK LANDMARKS */}
          <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '800' }}>Popular Towns & Landmarks:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {sampleLandmarks.map((place) => (
              <TouchableOpacity
                key={place}
                style={{
                  backgroundColor: pinnedAddress === place ? 'rgba(14,165,233,0.2)' : palette.cardBg,
                  borderWidth: 1,
                  borderColor: pinnedAddress === place ? '#0EA5E9' : palette.border,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                }}
                onPress={() => setPinnedAddress(place)}
              >
                <Text style={{ color: pinnedAddress === place ? '#0EA5E9' : palette.textPrimary, fontSize: 11.5, fontWeight: '700' }}>{place}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* CONFIRM BUTTON */}
          <TouchableOpacity
            style={{
              backgroundColor: '#0EA5E9',
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              marginTop: 4,
            }}
            onPress={() => {
              onConfirm(pinnedAddress);
              onClose();
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Confirm Pinned Location ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
          <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
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
        <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
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
          <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
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
  const now = new Date();
  const dateStr = value ? value : now.toISOString().slice(0, 10);
  const timeDateObj = value ? new Date(`${dateStr}T${value}:00`) : new Date();

  return (
    <>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowPicker(true)}>
        <Text style={{ color: value ? palette.textPrimary : palette.placeholder, fontSize: 13, fontWeight: '700' }}>
          {value ? formatTimeForDisplay(value) : 'Select time'}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={isNaN(timeDateObj.getTime()) ? new Date() : timeDateObj}
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

function OfferCard({ offer, palette, onPress }: { offer: DriverQuote; palette: ThemePalette; onPress: () => void }) {
  const s = cardStyles(palette);
  const countdown = formatCountdown(offer.offerExpiresAt);
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.9} onPress={onPress}>
      <View style={s.topRow}>
        <View style={s.avatar}><User color={palette.textPrimary} size={18} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.driverName}>{offer.driverName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star color="#F59E0B" size={11} fill="#F59E0B" />
            <Text style={s.metaText}>{offer.driverRating.toFixed(2)} • {offer.completedTrips} trips</Text>
          </View>
        </View>
        <View style={s.countdownBox}>
          <Timer color={palette.textMuted} size={11} />
          <Text style={s.countdownText}>{countdown}</Text>
        </View>
      </View>

      {offer.recommendationTag && (
        <View style={s.tagRow}>
          {offer.recommendationTag === 'Best Value' && <Award color={palette.accent} size={11} />}
          {offer.recommendationTag === 'Top Rated' && <Star color={palette.accent} size={11} />}
          {offer.recommendationTag === 'Fastest Arrival' && <Zap color={palette.accent} size={11} />}
          {offer.recommendationTag === 'Highly Reliable' && <ShieldCheck color={palette.accent} size={11} />}
          {offer.recommendationTag === 'Great Alternative' && <Sparkles color={palette.accent} size={11} />}
          <Text style={s.tagText}>{offer.recommendationTag}</Text>
        </View>
      )}

      <View style={s.vehicleRow}>
        <Text style={s.vehicleName}>{offer.carName}</Text>
        {offer.isAlternativeVehicle && (
          <View style={s.altBadge}><Text style={s.altBadgeText}>Alternative Vehicle</Text></View>
        )}
      </View>

      <View style={s.bottomRow}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={s.smallMeta}>{offer.distanceKm} km away</Text>
          <Text style={s.smallMeta}>ETA {offer.etaMinutes} min</Text>
        </View>
        <Text style={s.fareText}>₹{offer.quotedFare}</Text>
      </View>
    </TouchableOpacity>
  );
}

function cardStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { backgroundColor: palette.surface, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: palette.border, gap: 8, marginBottom: 12 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    driverName: { fontSize: 13.5, fontWeight: '800', color: palette.textPrimary },
    metaText: { fontSize: 10.5, color: palette.textMuted },
    countdownBox: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: palette.surfaceAlt, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    countdownText: { fontSize: 10, fontWeight: '700', color: palette.textMuted },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.accentGlow, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    tagText: { fontSize: 9.5, fontWeight: '800', color: palette.accent },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    vehicleName: { fontSize: 12, fontWeight: '700', color: palette.textSecondary },
    altBadge: { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    altBadgeText: { fontSize: 8.5, fontWeight: '800', color: '#D97706' },
    bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: palette.divider },
    smallMeta: { fontSize: 10, color: palette.textMuted },
    fareText: { fontSize: 18, fontWeight: '900', color: palette.textPrimary },
  });
}

function Row({ label, value, bold, big, accent, palette }: { label: string; value: string; bold?: boolean; big?: boolean; accent?: boolean; palette: ThemePalette }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: palette.textMuted, fontSize: big ? 13 : 11.5, fontWeight: big ? '800' : '500' }}>{label}</Text>
      <Text style={{
        color: accent || big ? '#10B981' : palette.textPrimary,
        fontSize: big ? 18 : 12,
        fontWeight: big ? '900' : bold ? '800' : '600',
        flexShrink: 1,
        textAlign: 'right',
      }}>{value}</Text>
    </View>
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

    progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 10, overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2, backgroundColor: '#0EA5E9' },
    progressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700', marginTop: 6, fontFamily: bodyFont, letterSpacing: 0.2 },

    scroll: { flex: 1 },
    scrollInner: { padding: 14, paddingBottom: 40, gap: 12 },
    webCenterWrap: Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const, gap: 12 } : { gap: 12 },

    screenHeadline: { fontSize: 18, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    screenSubheadline: { fontSize: 11.5, color: palette.textMuted, marginTop: -6, fontFamily: bodyFont },
    fieldLabel: { fontSize: 11.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },

    inputCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 2, borderWidth: 1, borderColor: palette.border },
    inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
    gpsBtn: { backgroundColor: 'rgba(14,165,233,0.15)', padding: 6, borderRadius: 6 },
    inputDividerWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', height: 16 },
    inputDivider: { height: 1, width: '100%', backgroundColor: palette.divider },
    swapBtn: { position: 'absolute', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    textInput: { flex: 1, color: palette.textPrimary, fontSize: 13, fontWeight: '600', fontFamily: bodyFont, paddingVertical: Platform.OS === 'web' ? 2 : 0 },
    suggestDropdown: { paddingHorizontal: 8, paddingBottom: 6, gap: 2 },
    suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 },
    suggestText: { fontSize: 12, color: palette.textSecondary, fontFamily: bodyFont, flex: 1 },

    twoOptionRow: { flexDirection: 'row', gap: 8 },
    bigOption: { flex: 1, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2, alignItems: 'flex-start' },
    bigOptionActiveBlue: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.08)' },
    bigOptionTitle: { fontSize: 12.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    bigOptionSub: { fontSize: 9.5, color: palette.textMuted, fontFamily: bodyFont },

    rowTwoCols: { flexDirection: 'row', gap: 8 },
    inputRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 6, borderWidth: 1, borderColor: palette.border },

    datePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: 'rgba(14,165,233,0.3)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      marginRight: 6,
    },
    datePillActive: {
      backgroundColor: '#0EA5E9',
      borderColor: '#0EA5E9',
    },
    datePillText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: palette.textPrimary,
      fontFamily: bodyFont,
    },
    datePillTextActive: {
      color: '#FFFFFF',
      fontWeight: '900',
    },

    passengerCardContainer: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
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
      backgroundColor: 'rgba(14,165,233,0.15)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(14,165,233,0.3)',
    },
    totalPassengerBadgeText: {
      color: '#0EA5E9',
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
    stepperBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    stepperBtnText: { fontSize: 16, fontWeight: '900', color: palette.textPrimary },
    stepperValue: { fontSize: 14, fontWeight: '900', color: palette.textPrimary, minWidth: 24, textAlign: 'center' },

    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    seatChip: { width: 38, height: 38, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    seatChipActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.15)' },
    seatChipText: { fontSize: 13, fontWeight: '800', color: palette.textPrimary },

    vehicleChoiceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: palette.border },
    vehicleChoiceRowActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.08)' },
    vehicleChoiceTitle: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    vehicleChoiceSub: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },

    guidanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    guidanceText: { fontSize: 11, color: '#0EA5E9', fontWeight: '600', fontFamily: bodyFont },

    dropBidSubmitBtn: { backgroundColor: '#0EA5E9', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    dropBidSubmitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontFamily: bodyFont },
    secondaryBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center' },
    secondaryBtnText: { color: palette.textMuted, fontSize: 12, fontWeight: '700', fontFamily: bodyFont },
    actionBar: { flexDirection: 'row', gap: 10 },

    centeredLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 8 },
    loadingPulse: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(14,165,233,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    loadingTitle: { fontSize: 15, fontWeight: '800', color: palette.textPrimary, fontFamily: displayFont, textAlign: 'center' },
    loadingSub: { fontSize: 11.5, color: palette.textMuted, textAlign: 'center', fontFamily: bodyFont, maxWidth: 260 },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
    refreshBtnText: { color: '#0EA5E9', fontSize: 12, fontWeight: '800', fontFamily: bodyFont },

    offerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    offerHeaderTitle: { fontSize: 16, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },
    offerHeaderSub: { fontSize: 10.5, color: palette.textMuted, marginTop: 2, fontFamily: bodyFont },
    refreshIconBtn: { padding: 6, borderRadius: 8, backgroundColor: palette.surfaceAlt },

    sortChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sortChipActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.12)' },
    sortChipText: { fontSize: 11, fontWeight: '700', color: palette.textSecondary, fontFamily: bodyFont },

    viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, backgroundColor: palette.surface, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
    viewAllBtnText: { color: '#0EA5E9', fontSize: 12.5, fontWeight: '800', fontFamily: bodyFont },
    expiredNote: { fontSize: 10, color: palette.textMuted, textAlign: 'center', marginTop: 8, fontFamily: bodyFont },

    reviewCard: { backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 8 },
    divider: { height: 1, backgroundColor: palette.divider, marginVertical: 2 },

    warnNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(245,158,11,0.1)', padding: 10, borderRadius: 10 },
    warnNoticeText: { flex: 1, fontSize: 10.5, color: palette.textSecondary, lineHeight: 14, fontFamily: bodyFont },
    gpsStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14,165,233,0.1)', padding: 10, borderRadius: 10 },
    gpsStatusText: { fontSize: 11.5, color: '#0EA5E9', fontWeight: '700', fontFamily: bodyFont },
    gpsTag: { backgroundColor: 'rgba(14,165,233,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
    gpsTagText: { color: '#0EA5E9', fontSize: 8.5, fontWeight: '900', fontFamily: bodyFont },
    infoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
    infoNoticeText: { flex: 1, fontSize: 10, color: palette.textMuted, lineHeight: 14, fontFamily: bodyFont },

    confirmCard: { backgroundColor: palette.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: palette.border, gap: 8 },
    confirmTitle: { color: palette.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center', fontFamily: displayFont },
    confirmOrderId: { color: palette.textMuted, fontSize: 11, textAlign: 'center', fontFamily: bodyFont, marginBottom: 8 },

    statusTimeline: { gap: 6, marginBottom: 8 },
    statusStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
    statusDotActive: { backgroundColor: '#10B981' },
    statusStepText: { fontSize: 11, color: palette.textSecondary, fontFamily: bodyFont },

    primaryBtn: { backgroundColor: '#0EA5E9', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 14 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontFamily: bodyFont },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: palette.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: palette.border, maxHeight: '85%' },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 15, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },

    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    profileAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    profileName: { fontSize: 14.5, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },
    profileMeta: { fontSize: 11, color: palette.textMuted, fontFamily: bodyFont },
    verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    verifiedPillText: { fontSize: 9.5, fontWeight: '800', color: '#10B981', fontFamily: bodyFont },

    currentOfferBox: { backgroundColor: palette.surfaceAlt, borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 },
    currentOfferLabel: { fontSize: 10.5, color: palette.textMuted, fontFamily: bodyFont },
    currentOfferValue: { fontSize: 22, fontWeight: '900', color: palette.textPrimary, fontFamily: displayFont },

    negotiationHistory: { gap: 6 },
    negotiationStep: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10 },
    negotiationStepCustomer: { backgroundColor: palette.accentGlow, alignSelf: 'flex-end', width: '80%' },
    negotiationStepDriver: { backgroundColor: 'rgba(14,165,233,0.1)', alignSelf: 'flex-start', width: '80%' },
    negotiationStepSender: { fontSize: 10, color: palette.textMuted, fontFamily: bodyFont },
    negotiationStepAmount: { fontSize: 13, fontWeight: '800', color: palette.textPrimary, fontFamily: bodyFont },

    negotiatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10 },
    negotiatingText: { fontSize: 11.5, color: palette.textMuted, fontFamily: bodyFont },
  });
}
