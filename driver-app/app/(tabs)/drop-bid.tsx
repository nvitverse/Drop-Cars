import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
import { CustomDatePickerModal, CustomTimePickerModal } from '@/components/DateTimePickerModals';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import DropMarketSwitcher from '@/components/DropMarketSwitcher';
import {
  Zap,
  MapPin,
  Clock,
  IndianRupee,
  User,
  Send,
  X,
  CheckCircle,
  Filter,
  RefreshCw,
  Car,
  Users,
  SlidersHorizontal,
  Calendar,
  Navigation,
  Plus,
  ChevronDown,
  Sparkles,
  Tag,
  Info,
  Radio,
} from 'lucide-react-native';
import PartnerBadge from '@/components/PartnerBadge';
import PageInfoModal from '@/components/PageInfoModal';
import DateRangeCalendarModal, { DateRange } from '@/components/DateRangeCalendarModal';
import { formatBookingId, formatCarType, formatDateTime, formatKmLimitAndHours } from '@/utils/format';
// Driver-authenticated (driverAuthToken) - /api/dropbid/* is authenticated
// via get_current_driver (customer-facing endpoints are separate, called
// from the Customer App).
import axiosDriver from '@/app/api/axiosDriver';
import { useEnsureDriverSession } from '@/hooks/useEnsureDriverSession';
import { useCarDriver } from '@/contexts/CarDriverContext';

interface NegotiationRequest {
  id: string;
  order_id: string;
  customer_name: string;
  pickup_location: string;
  drop_location: string;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  customer_target_price: number;
  estimated_distance: number;
  offers_count: number;
  status: 'OPEN' | 'OFFER_SENT' | 'ACCEPTED';
  submitted_offer?: number;
  my_offer_id?: string;
  // Counter-offer negotiation (2026-09-04) - a pending customer counter on
  // this driver's own offer, surfaced right in the feed so it doesn't
  // need a separate screen to notice.
  my_counter_price?: number;
  my_counter_by?: 'customer' | 'driver';
}

// Maps one /api/dropbid/requests row (see drop_bid_routes.py) into the
// shape this screen already renders.
const mapDropBidRequest = (r: any): NegotiationRequest => ({
  id: r.id,
  order_id: r.id,
  customer_name: r.customer_name,
  pickup_location: r.pickup_location,
  drop_location: r.drop_location,
  trip_type: r.trip_type,
  car_type: r.car_type,
  start_date_time: r.start_date_time,
  customer_target_price: r.customer_target_price,
  estimated_distance: r.estimated_distance || 0,
  offers_count: r.offers_count,
  status: r.submitted_offer ? 'OFFER_SENT' : 'OPEN',
  submitted_offer: r.submitted_offer || undefined,
  my_offer_id: r.my_offer_id || undefined,
  my_counter_price: r.my_counter_price ?? undefined,
  my_counter_by: r.my_counter_by ?? undefined,
});


// Departure date/time helpers for the "Offer seats" flow (picked with the calendar / wheel pickers, never typed).
const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toAmPm = (d: Date) => {
  const h = d.getHours();
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const formatDisplayDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const parseDeparture = (dateIso: string, timeAmPm: string): Date => {
  const d = new Date(`${dateIso}T00:00:00`);
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(timeAmPm || '');
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    d.setHours(h, parseInt(m[2], 10), 0, 0);
  }
  return d;
};

function LiveBiddingBeacon({ color = '#10B981', size = 8 }: { color?: string; size?: number }) {
  const pulse = React.useRef(new Animated.Value(1)).current;
  const opacity = React.useRef(new Animated.Value(0.85)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 2.3,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.85,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, opacity]);

  return (
    <View style={{ width: size * 2.2, height: size * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale: pulse }],
          opacity,
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export default function DropBidScreen() {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { ready: sessionReady } = useEnsureDriverSession();
  const { driver } = useCarDriver();
  const [requests, setRequests] = useState<NegotiationRequest[]>([]);
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'MARKET' | 'MY_OFFERS' | 'CONFIRMED'>('MARKET');
  const [showPipelineInfoModal, setShowPipelineInfoModal] = useState<boolean>(false);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReq, setSelectedReq] = useState<NegotiationRequest | null>(null);
  const [offerPrice, setOfferPrice] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return;
    if (!cancelReason.trim()) {
      Alert.alert('Reason Required', 'Please select or type a reason for cancelling this booking.');
      return;
    }
    setSubmittingCancel(true);
    try {
      const orderId = cancellingOrder.order_id || cancellingOrder.id;
      await axiosDriver.post(`/api/assignments/driver/cancel-order/${orderId}`, {
        reason: cancelReason.trim(),
      });
      Alert.alert(
        'Booking Cancelled',
        `Booking #${orderId} has been cancelled. A mandatory ₹500 cancellation penalty fee has been debited from your fleet wallet.`
      );
      setCancellingOrder(null);
      setCancelReason('');
      fetchRequests();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Could not cancel booking.';
      Alert.alert('Cancellation Failed', typeof detail === 'string' ? detail : 'Could not cancel booking.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const [reqRes, offerRes] = await Promise.all([
        axiosDriver.get('/api/dropbid/requests'),
        axiosDriver.get('/api/dropbid/driver-offers').catch(() => ({ data: [] })),
      ]);
      const rows = Array.isArray(reqRes.data) ? reqRes.data : [];
      setRequests(rows.map(mapDropBidRequest));
      setDriverOffers(Array.isArray(offerRes.data) ? offerRes.data : []);
    } catch (e: any) {
      console.error('Failed to load Drop Bid requests:', e);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (sessionReady) fetchRequests();
  }, [sessionReady]);

  const [minFare, setMinFare] = useState<number | null>(null);
  const [showMinFareModal, setShowMinFareModal] = useState<boolean>(false);
  const [customMinFareInput, setCustomMinFareInput] = useState<string>('');
  const [carFilter, setCarFilter] = useState<string>('ALL');
  const [fromCityFilter, setFromCityFilter] = useState<string>('');
  const [toCityFilter, setToCityFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<'NEWEST' | 'FARE_HIGH_LOW' | 'FARE_LOW_HIGH' | 'DISTANCE'>('NEWEST');
  const [showCarFilterDropdown, setShowCarFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ fromDate: null, toDate: null });

  // Fleet cars and drivers for offer assignment
  const [fleetCars, setFleetCars] = useState<{ id: string; car_name: string; car_number: string; car_type: string }[]>([]);
  const [fleetDrivers, setFleetDrivers] = useState<{ id: string; full_name: string; primary_number?: string; is_owner_driver?: boolean }[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>('');
  const [showCarDropdown, setShowCarDropdown] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('owner');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

  const [allowChangeBid, setAllowChangeBid] = useState(false);

  useEffect(() => {
    if (!sessionReady) return;
    axiosDriver.get('/api/dropbid/settings')
      .then((res) => {
        setAllowChangeBid(!!res.data?.allow_change_bid);
      })
      .catch(() => setAllowChangeBid(false));

    axiosDriver.get('/api/assignments/driver/available-cars')
      .then((res) => {
        const cars = Array.isArray(res.data) ? res.data : [];
        setFleetCars(cars);
        if (cars.length > 0) setSelectedCarId(cars[0].id);
      })
      .catch((e) => console.error('Failed to load fleet cars:', e));

    axiosDriver.get('/api/assignments/driver/available-drivers')
      .then((res) => {
        const drivers = Array.isArray(res.data) ? res.data : [];
        setFleetDrivers(drivers);
      })
      .catch((e) => console.error('Failed to load fleet drivers:', e));
  }, [sessionReady]);

  const [showOfferSeatsModal, setShowOfferSeatsModal] = useState(false);
  const [offerSeatsStep, setOfferSeatsStep] = useState<number>(1);
  const [showOfferStop, setShowOfferStop] = useState(false);
  const [offerStopCity, setOfferStopCity] = useState('');
  const [showDeparturePicker, setShowDeparturePicker] = useState<null | 'date' | 'time'>(null);
  const [offerSeatsData, setOfferSeatsData] = useState({
    fromCity: 'Chennai Koyambedu',
    toCity: 'Pondicherry Rock Beach',
    departureDate: toIsoDate(new Date()),
    departureTime: toAmPm(new Date(Date.now() + 60 * 60 * 1000)),
    carModel: 'Maruti Suzuki Swift Dzire',
    availableSeats: '3',
    pricePerSeat: '350',
  });
  const [publishingSeat, setPublishingSeat] = useState(false);

  const filteredRequests = requests.filter((r) => {
    if (minFare != null && r.customer_target_price < minFare) return false;
    if (carFilter !== 'ALL' && !(r.car_type || '').toLowerCase().includes(carFilter.toLowerCase())) return false;
    if (fromCityFilter.trim() && !r.pickup_location.toLowerCase().includes(fromCityFilter.toLowerCase().trim())) return false;
    if (toCityFilter.trim() && !r.drop_location.toLowerCase().includes(toCityFilter.toLowerCase().trim())) return false;
    return true;
  });

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    if (sortOption === 'FARE_HIGH_LOW') return b.customer_target_price - a.customer_target_price;
    if (sortOption === 'FARE_LOW_HIGH') return a.customer_target_price - b.customer_target_price;
    if (sortOption === 'DISTANCE') return (b.estimated_distance || 0) - (a.estimated_distance || 0);
    return 0; // Default NEWEST (original order)
  });

  const displayedRequests = sortedRequests;
  const pendingOffers = driverOffers.filter((o) => o.offer_status === 'PENDING');
  const confirmedBids = driverOffers.filter((o) => o.offer_status === 'ACCEPTED');

  const handleRefresh = async () => {
    setRefreshing(true);
    fetchRequests().finally(() => setRefreshing(false));
  };

  const handleOpenOfferModal = (req: NegotiationRequest) => {
    if (req.submitted_offer && !allowChangeBid) {
      Alert.alert(t('dropBid.optionDisabledTitle'), t('dropBid.optionDisabledBody'));
      return;
    }
    setSelectedReq(req);
    if (req.submitted_offer) {
      setOfferPrice(req.submitted_offer.toString());
    } else {
      setOfferPrice(req.customer_target_price.toString());
    }
  };

  const handleSubmitOffer = () => {
    if (!selectedReq) return;
    const priceNum = parseFloat(offerPrice);
    if (!priceNum || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert(t('dropBid.invalidPriceTitle'), t('dropBid.invalidPriceBody'));
      return;
    }

    // Validation: Reasonable bounds on driver offer price
    const maxAllowedFare = Math.round(selectedReq.customer_target_price * 2.5);
    const minAllowedFare = Math.round(selectedReq.customer_target_price * 0.5);

    if (priceNum > maxAllowedFare) {
      Alert.alert(
        'Offer Too High',
        `Offer price (₹${priceNum}) cannot exceed 2.5x customer target price (Max allowed bid: ₹${maxAllowedFare}). Please enter a realistic offer.`
      );
      return;
    }

    if (priceNum < minAllowedFare) {
      Alert.alert(
        'Offer Too Low',
        `Offer price (₹${priceNum}) cannot be less than 50% of customer target (Min allowed bid: ₹${minAllowedFare}).`
      );
      return;
    }

    // A pending customer counter is answered on the already-submitted
    // offer (car was already picked then) - no car re-pick needed here.
    const isRespondingToCounter = selectedReq.my_counter_by === 'customer' && !!selectedReq.my_offer_id;
    if (!isRespondingToCounter && !selectedCarId) {
      Alert.alert(t('dropBid.selectVehicleTitle'), t('dropBid.selectVehicleBody'));
      return;
    }

    const assignedCar = fleetCars.find((c) => c.id === selectedCarId);
    const activeDriverId = selectedDriverId === 'owner' ? (driver?.id || 'owner') : selectedDriverId;

    setSubmitting(true);
    const request = isRespondingToCounter
      ? axiosDriver.post(`/api/dropbid/offers/${selectedReq.my_offer_id}/counter-response`, { action: 'counter', price: priceNum })
      : axiosDriver.post(`/api/dropbid/requests/${selectedReq.id}/offers`, {
          offer_price: priceNum,
          car_id: selectedCarId,
          driver_id: activeDriverId,
        });

    request
      .then(() => {
        setSelectedReq(null);
        Alert.alert(
          isRespondingToCounter ? '🎉 Counter Sent!' : '🎉 Offer Submitted!',
          `Your offer of ₹${priceNum}${assignedCar ? ` with ${assignedCar.car_name} (${assignedCar.car_number})` : ''} has been sent to ${selectedReq.customer_name}.`
        );
        fetchRequests();
      })
      .catch((e: any) => {
        const detail = e?.response?.data?.detail || e?.message || 'Could not submit this offer.';
        Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : t('dropBid.couldNotSubmitOffer'));
      })
      .finally(() => setSubmitting(false));
  };

  const addQuickAmount = (increment: number) => {
    const base = parseFloat(offerPrice) || (selectedReq?.customer_target_price || 0);
    setOfferPrice((base + increment).toString());
  };

  // Counter-offer negotiation (2026-09-04, see /counter-response on the
  // backend). accept/reject respond to the CUSTOMER's pending counter
  // directly from the card; typing a different number and hitting
  // "Send Offer Now" in the modal (handleSubmitOffer below) sends the
  // driver's own counter back instead.
  const [respondingCounterId, setRespondingCounterId] = useState<string | null>(null);
  const respondToCounter = async (offerId: string, action: 'accept' | 'reject') => {
    setRespondingCounterId(offerId);
    try {
      await axiosDriver.post(`/api/dropbid/offers/${offerId}/counter-response`, { action });
      await fetchRequests();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Could not respond to this counter offer.';
      Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : t('dropBid.couldNotRespondCounter'));
    } finally {
      setRespondingCounterId(null);
    }
  };

  const [showPageInfo, setShowPageInfo] = useState<boolean>(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 }]}>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.zapIconCircle, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
            <Zap color="#EAB308" size={20} fill="#EAB308" />
          </View>
          <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text, fontSize: 18, flexShrink: 1 }]}>{t('dropBid.headerTitle')}</Text>
            <TouchableOpacity
              onPress={() => setShowPageInfo(true)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.primary + '18',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.primary + '33',
              }}
            >
              <Info size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: (minFare || carFilter !== 'ALL' || fromCityFilter || toCityFilter || dateRange.fromDate)
              ? 'rgba(79, 70, 229, 0.15)'
              : colors.surface,
            borderColor: colors.primary,
            borderWidth: 1,
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
          onPress={() => setShowFilterModal(true)}
        >
          <SlidersHorizontal size={14} color={colors.primary} />
          <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.primary }}>
            {t('dropBid.filterRequestsLabel')}{(minFare || carFilter !== 'ALL' || fromCityFilter || toCityFilter || dateRange.fromDate) ? t('dropBid.activeSuffix') : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Attached Drop Market Switcher Tabs */}
      <DropMarketSwitcher active="bid" />

      <PageInfoModal
        visible={showPageInfo}
        title="Drop Bid Marketplace"
        description="Live reverse-bidding system where customers post trip requests with their expected fare, and drivers/fleet owners place custom price bids."
        workflowSteps={[
          'Explore live customer trip requests under the ⚡ Live tab.',
          'Select a car and driver from your fleet, and enter your bid amount.',
          'Respond to customer counter-offers or update your submitted bid if allowed.',
          'When the customer accepts your bid and pays the advance, the trip is automatically confirmed and added to your Upcoming Rides!',
        ]}
        tips={[
          'Track Bids: Track your pending bids under 📩 Offers and accepted trips under ✅ Confirmed.',
          'Commission Hold: When your bid is accepted, at least ₹500 (or the 5% commission, if more) is held from your wallet. After the trip the commission is deducted and the rest is refunded.',
        ]}
        onClose={() => setShowPageInfo(false)}
      />

      {/* ── Edge-to-edge Sub-Segment Tabs: Live | Offers | Confirmed ── */}
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
          { key: 'MARKET', emoji: '⚡', label: 'Live', count: displayedRequests.length, activeColor: colors.primary },
          { key: 'MY_OFFERS', emoji: '📩', label: 'Offers', count: pendingOffers.length, activeColor: '#F59E0B' },
          { key: 'CONFIRMED', emoji: '✅', label: 'Confirmed', count: confirmedBids.length, activeColor: '#10B981' },
        ] as { key: string; emoji: string; label: string; count: number; activeColor: string }[]).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              style={{ flex: 1, alignItems: 'center' }}
              activeOpacity={0.75}
            >
              <View
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 4,
                  backgroundColor: isActive
                    ? (isDarkMode ? tab.activeColor + '20' : tab.activeColor + '12')
                    : 'transparent',
                  width: '100%',
                }}
              >
                <Text style={{ fontSize: 13 }}>{tab.emoji}</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-SemiBold',
                    color: isActive ? tab.activeColor : colors.textSecondary,
                  }}
                >
                  {tab.label} ({tab.count})
                </Text>
              </View>
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

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12, paddingTop: 6 }}
        refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {loadingRequests && requests.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : activeTab === 'MARKET' ? (
          displayedRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Zap size={44} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t('dropBid.noLiveRequestsTitle')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {t('dropBid.noLiveRequestsBody')}
              </Text>
            </View>
          ) : (
            displayedRequests.map((req) => (
              <TouchableOpacity
                key={req.id}
                activeOpacity={0.9}
                onPress={() => handleOpenOfferModal(req)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 14,
                  },
                ]}
              >
                {/* Card Top Row: ID, Trip Type, Vehicle Type & Status Badge */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>
                      {formatBookingId(req.order_id || req.id, req.start_date_time)}
                    </Text>
                    <View style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', color: '#1D4ED8', textTransform: 'uppercase' }}>
                        {req.trip_type || 'ONE WAY'}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#F5F3FF', borderColor: '#DDD6FE', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', color: '#6D28D9' }}>
                        {formatCarType(req.car_type)}
                      </Text>
                    </View>
                  </View>

                  <View style={{
                    backgroundColor: req.status === 'OFFER_SENT' ? '#D1FAE5' : '#FEF3C7',
                    borderColor: req.status === 'OFFER_SENT' ? '#10B981' : '#F59E0B',
                    borderWidth: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: req.status === 'OFFER_SENT' ? '#047857' : '#D97706' }}>
                      {req.status === 'OFFER_SENT' ? '✓ Offer Sent' : req.offers_count ? `⚡ ${req.offers_count} Bids` : '⚡ Live'}
                    </Text>
                  </View>
                </View>

                {/* Customer Name Subhead */}
                {req.customer_name ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <User size={13} color={colors.textSecondary} />
                    <Text style={{ flexShrink: 1, fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                      {req.customer_name}
                    </Text>
                  </View>
                ) : null}

                {/* Route Box with Embedded Distance Badge */}
                <View style={{
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                  borderWidth: 1,
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  {/* Route Timeline */}
                  <View style={{ flex: 1, gap: 8, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MapPin size={15} color="#10B981" />
                      <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#34D399' : '#059669' }} numberOfLines={1}>
                        From: {req.pickup_location}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MapPin size={15} color="#EF4444" />
                      <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#F87171' : '#DC2626' }} numberOfLines={1}>
                        To: {req.drop_location}
                      </Text>
                    </View>
                  </View>

                  {/* Embedded KM / Trip Limit Badge */}
                  <View style={{
                    backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                    borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
                    borderWidth: 1,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                    minWidth: 95,
                  }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: isDarkMode ? '#34D399' : '#047857' }}>
                      {formatKmLimitAndHours(req.estimated_distance, req.trip_type).combined}
                    </Text>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Medium', color: isDarkMode ? '#A7F3D0' : '#059669', marginTop: 1 }}>
                      • {req.trip_type || 'One-Way'}
                    </Text>
                  </View>
                </View>

                {/* Pickup Time Bar */}
                <View style={{
                  backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                  borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}>
                  <Clock size={14} color="#D97706" />
                  <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#B45309' }}>
                    Pickup: {formatDateTime(req.start_date_time)}
                  </Text>
                </View>

                {/* Pending Customer Counter Offer */}
                {req.my_counter_by === 'customer' && req.my_counter_price != null && (
                  <View style={{ backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB', borderRadius: 6, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F59E0B' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#B45309' }}>
                      Customer Countered Your Bid: ₹{req.my_counter_price}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }}
                        disabled={respondingCounterId === req.my_offer_id}
                        onPress={() => req.my_offer_id && respondToCounter(req.my_offer_id, 'accept')}
                      >
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12 }}>Accept ₹{req.my_counter_price}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, borderRadius: 6, alignItems: 'center' }}
                        disabled={respondingCounterId === req.my_offer_id}
                        onPress={() => req.my_offer_id && respondToCounter(req.my_offer_id, 'reject')}
                      >
                        <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 12 }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 8, borderRadius: 6, alignItems: 'center' }}
                        onPress={() => handleOpenOfferModal(req)}
                      >
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12 }}>Counter</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Fare & Action Row */}
                {req.status === 'OFFER_SENT' ? (
                  <View style={{
                    backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                    borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
                    borderWidth: 1,
                    borderRadius: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={{ flex: 1, fontSize: 12.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#34D399' : '#047857' }}>
                        Expected: ₹{req.customer_target_price} • Your Bid: ₹{req.submitted_offer}
                      </Text>
                    </View>
                    {allowChangeBid && (
                      <TouchableOpacity
                        style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                        onPress={() => handleOpenOfferModal(req)}
                      >
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 11 }}>Change</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.primary,
                      borderRadius: 6,
                      paddingVertical: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                    }}
                    onPress={() => handleOpenOfferModal(req)}
                  >
                    <Zap size={16} color="#FFFFFF" fill="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>
                      Place Offer / Bid (Target: ₹{req.customer_target_price})
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )
        ) : activeTab === 'MY_OFFERS' ? (
          pendingOffers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Send size={44} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Sent Bids</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                You haven't submitted any bids yet. Switch to the Live tab to place bids on customer requests!
              </Text>
            </View>
          ) : (
            pendingOffers.map((off: any) => (
              <TouchableOpacity
                key={off.offer_id}
                activeOpacity={0.9}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 12, borderRadius: 8, marginBottom: 14 }]}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={[styles.customerName, { color: colors.text, fontSize: 15, fontFamily: 'Inter-Bold' }]}>
                      <User size={14} color={colors.primary} /> {off.customer_name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Submitted Offer: ₹{off.offer_price}</Text>
                  </View>
                  <View style={[styles.statusTag, { backgroundColor: 'rgba(234, 179, 8, 0.15)', borderColor: '#F59E0B', borderWidth: 1 }]}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#B45309' }}>⏳ Waiting Customer</Text>
                  </View>
                </View>

                {/* Route Timeline with embedded distance */}
                <View style={[styles.routeBox, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#FAFAFA', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} color="#10B981" />
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>From: {off.pickup_location}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} color="#EF4444" />
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>To: {off.drop_location}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Price Pill */}
                <View style={{ backgroundColor: isDarkMode ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF', padding: 10, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: isDarkMode ? 'rgba(79, 70, 229, 0.3)' : '#C7D2FE' }}>
                  <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12, color: colors.textSecondary }}>Customer Target: <Text style={{ fontFamily: 'Inter-Bold', color: colors.text }}>₹{off.customer_target_price}</Text></Text>
                  <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 15, fontFamily: 'Inter-Bold', color: colors.primary }}>Your Bid: ₹{off.offer_price}</Text>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : (
          confirmedBids.length === 0 ? (
            <View style={styles.emptyContainer}>
              <CheckCircle size={44} color="#10B981" />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Confirmed Trips Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                When a customer accepts your bid offer, confirmed trip details & direct booking links will appear right here!
              </Text>
            </View>
          ) : (
            confirmedBids.map((off: any) => (
              <View key={off.offer_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: '#10B981', borderWidth: 1.5, padding: 12, borderRadius: 8, marginBottom: 14 }]}>
                {/* Header Badge */}
                <View style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 8, borderTopLeftRadius: 14, borderTopRightRadius: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: -12, marginTop: -12, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CheckCircle color="#FFFFFF" size={15} />
                    <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12.5 }}>✅ BOOKING CONFIRMED</Text>
                  </View>
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 11.5 }}>#{off.order_id || 'CONFIRMED'}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>{off.customer_name}</Text>
                    {off.customer_phone && (
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.primary, marginTop: 2 }}>📞 {off.customer_phone}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>Final Agreed Fare</Text>
                    <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: '#10B981' }}>₹{off.offer_price}</Text>
                  </View>
                </View>

                {/* Route Timeline */}
                <View style={[styles.routeBox, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : '#FAFAFA', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }]}>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>From: {off.pickup_location}</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>To: {off.drop_location}</Text>
                  </View>
                </View>

                {/* Primary Action to Track Booking & Cancel Option */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={{ flex: 2, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    onPress={() => router.push({ pathname: '/(tabs)', params: { tab: 'upcoming', subTab: 'assigned' } })}
                  >
                    <Car color="#FFFFFF" size={16} />
                    <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>🚗 Track in My Rides</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 10, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setCancellingOrder(off)}
                  >
                    <Text style={{ color: '#DC2626', fontFamily: 'Inter-Bold', fontSize: 12 }}>🚫 Cancel Trip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Offer Submission Modal */}
      <Modal
        visible={!!selectedReq}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReq(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('dropBid.submitPriceOfferTitle')}</Text>
              <TouchableOpacity onPress={() => setSelectedReq(null)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {selectedReq && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ backgroundColor: colors.background, padding: 10, borderRadius: 6, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.text }}>
                    {selectedReq.pickup_location} → {selectedReq.drop_location}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                    {t('dropBid.customerTargetLabel')} <Text style={{ fontFamily: 'Inter-Bold', color: '#10B981' }}>₹{selectedReq.customer_target_price}</Text>
                  </Text>
                </View>

                <Text style={[styles.inputLabel, { color: colors.text, marginBottom: 4 }]}>{t('dropBid.yourOfferAmountLabel')}</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 8, paddingVertical: 6 }]}>
                  <IndianRupee size={18} color={colors.text} />
                  <TextInput
                    style={[styles.input, { color: colors.text, fontSize: 16 }]}
                    value={offerPrice}
                    onChangeText={setOfferPrice}
                    keyboardType="number-pad"
                    placeholder={t('dropBid.enterPricePlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                {/* 1. Driver Selection Dropdown (FIRST) */}
                {(() => {
                  const fleetName = driver?.full_name || t('dropBid.fleetOwnerFallback');
                  const isOwnerSelected = selectedDriverId === 'owner' || selectedDriverId === driver?.id || !selectedDriverId;
                  const selDriverObj = fleetDrivers.find((d) => d.id === selectedDriverId);
                  const selectedDisplayLabel = isOwnerSelected
                    ? t('dropBid.imTheDriver', { name: fleetName })
                    : selDriverObj
                    ? `${selDriverObj.full_name}${selDriverObj.primary_number ? ` (${selDriverObj.primary_number})` : ''}`
                    : t('dropBid.imTheDriver', { name: fleetName });

                  // Filter out duplicate owner if present in fleetDrivers array
                  const otherDrivers = fleetDrivers.filter((d) => {
                    if (!d || !d.id) return false;
                    if (driver?.id && String(d.id).toLowerCase() === String(driver.id).toLowerCase()) return false;
                    if (d.is_owner_driver) return false;
                    return true;
                  });

                  return (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.inputLabel, { color: colors.text, marginBottom: 4 }]}>{t('dropBid.driverLabel')}</Text>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: showDriverDropdown ? colors.primary : colors.border,
                          backgroundColor: colors.background,
                        }}
                        onPress={() => {
                          setShowDriverDropdown(!showDriverDropdown);
                          if (showCarDropdown) setShowCarDropdown(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <User size={15} color={colors.primary} />
                          <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.text }} numberOfLines={1}>
                            {selectedDisplayLabel}
                          </Text>
                        </View>
                        <ChevronDown size={16} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {showDriverDropdown && (
                        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginTop: 4, backgroundColor: colors.surface, maxHeight: 180, overflow: 'hidden' }}>
                          <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                            {/* First option: I'm the driver (fleet name) */}
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                                backgroundColor: isOwnerSelected ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : 'transparent',
                              }}
                              onPress={() => {
                                setSelectedDriverId('owner');
                                setShowDriverDropdown(false);
                              }}
                            >
                              <View>
                                <Text style={{ fontSize: 12.5, fontFamily: isOwnerSelected ? 'Inter-Bold' : 'Inter-Medium', color: isOwnerSelected ? colors.primary : colors.text }}>
                                  {t('dropBid.imTheDriverPhrase')} <Text style={{ color: colors.textSecondary }}>({fleetName})</Text>
                                </Text>
                                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>{t('dropBid.selfFleetOwnerLabel')}</Text>
                              </View>
                              {isOwnerSelected && <CheckCircle size={14} color={colors.primary} />}
                            </TouchableOpacity>

                            {/* Remaining fleet drivers */}
                            {otherDrivers.map((d) => {
                              const isSelected = selectedDriverId === d.id;
                              return (
                                <TouchableOpacity
                                  key={d.id}
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingHorizontal: 12,
                                    paddingVertical: 9,
                                    borderBottomWidth: 1,
                                    borderBottomColor: colors.border,
                                    backgroundColor: isSelected ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : 'transparent',
                                  }}
                                  onPress={() => {
                                    setSelectedDriverId(d.id);
                                    setShowDriverDropdown(false);
                                  }}
                                >
                                  <View>
                                    <Text style={{ fontSize: 12, fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Medium', color: isSelected ? colors.primary : colors.text }}>
                                      {d.full_name}
                                    </Text>
                                    {d.primary_number ? (
                                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>{d.primary_number}</Text>
                                    ) : null}
                                  </View>
                                  {isSelected && <CheckCircle size={14} color={colors.primary} />}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* 2. Vehicle Selection Dropdown (SECOND) */}
                {(() => {
                  const selCar = fleetCars.find(c => c.id === selectedCarId) || fleetCars[0];
                  return (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.inputLabel, { color: colors.text, marginBottom: 4 }]}>{t('dropBid.vehicleLabel')}</Text>
                      {fleetCars.length === 0 ? (
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('dropBid.noVerifiedCarFound')}</Text>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingHorizontal: 12,
                              paddingVertical: 9,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: showCarDropdown ? colors.primary : colors.border,
                              backgroundColor: colors.background,
                            }}
                            onPress={() => {
                              setShowCarDropdown(!showCarDropdown);
                              if (showDriverDropdown) setShowDriverDropdown(false);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Car size={15} color={colors.primary} />
                              <Text style={{ flexShrink: 1, fontSize: 12.5, fontFamily: 'Inter-Bold', color: colors.text }} numberOfLines={1}>
                                {selCar?.car_name} <Text style={{ fontFamily: 'Inter-Regular', color: colors.textSecondary }}>({selCar?.car_number})</Text>
                              </Text>
                            </View>
                            <ChevronDown size={16} color={colors.textSecondary} />
                          </TouchableOpacity>

                          {showCarDropdown && (
                            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginTop: 4, backgroundColor: colors.surface }}>
                              {fleetCars.map((car) => (
                                <TouchableOpacity
                                  key={car.id}
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingHorizontal: 12,
                                    paddingVertical: 9,
                                    borderBottomWidth: 1,
                                    borderBottomColor: colors.border,
                                    backgroundColor: selectedCarId === car.id ? (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF') : 'transparent',
                                  }}
                                  onPress={() => {
                                    setSelectedCarId(car.id);
                                    setShowCarDropdown(false);
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontFamily: selectedCarId === car.id ? 'Inter-Bold' : 'Inter-Medium', color: selectedCarId === car.id ? colors.primary : colors.text }}>
                                    {car.car_name} <Text style={{ color: colors.textSecondary }}>({car.car_number} · {car.car_type})</Text>
                                  </Text>
                                  {selectedCarId === car.id && <CheckCircle size={14} color={colors.primary} />}
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  );
                })()}

                {/* Mandatory Auto-Assignment & Cancellation Penalty Terms */}
                <View style={{ backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2', borderColor: '#EF4444', borderWidth: 1, borderRadius: 6, padding: 10, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Tag color="#EF4444" size={14} />
                    <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#DC2626' }}>
                      Binding Offer & Cancellation Policy Notice
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10.8, fontFamily: 'Inter-Medium', color: isDarkMode ? '#FCA5A5' : '#991B1B', lineHeight: 15 }}>
                    • Once accepted by customer, this trip will be <Text style={{ fontFamily: 'Inter-Bold' }}>AUTOMATICALLY ASSIGNED</Text> to your vehicle.{'\n'}
                    • Cancelling or refusing an accepted trip incurs a mandatory <Text style={{ fontFamily: 'Inter-Bold', color: '#DC2626' }}>₹500 Cancellation Penalty</Text> debited from your wallet.
                  </Text>
                </View>

                {/* Submit Action */}
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary, paddingVertical: 11 }]}
                  onPress={handleSubmitOffer}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Send color="#FFFFFF" size={16} />
                      <Text style={[styles.submitBtnText, { fontSize: 13 }]}>
                        {selectedReq?.my_counter_by === 'customer' ? t('dropBid.sendCounterBtn') : t('dropBid.sendOfferNowBtn')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      {/* Advanced Filter Modal Sheet */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, padding: 18, borderRadius: 8 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal color={colors.primary} size={18} />
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: 16 }]}>{t('dropBid.advancedFiltersTitle')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420, marginVertical: 6 }} showsVerticalScrollIndicator={false}>
              {/* Pickup City Input with Autocomplete Chips */}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 4 }}>
                  {t('dropBid.pickupFromCityLabel')}
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}>
                  <MapPin color="#10B981" size={16} />
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontFamily: 'Inter-Medium',
                      color: colors.text,
                      marginLeft: 8,
                      padding: 0,
                    }}
                    value={fromCityFilter}
                    onChangeText={setFromCityFilter}
                    placeholder={t('dropBid.pickupCityPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  {fromCityFilter.length > 0 && (
                    <TouchableOpacity onPress={() => setFromCityFilter('')}>
                      <X color={colors.textSecondary} size={16} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Quick Pick Location Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['Chennai', 'Bangalore', 'Coimbatore', 'Pondicherry', 'Salem', 'Trichy', 'Madurai', 'Tiruppur', 'Mysore', 'Hosur'].map((city) => (
                      <TouchableOpacity
                        key={`from-${city}`}
                        style={{
                          backgroundColor: fromCityFilter.toLowerCase().includes(city.toLowerCase()) ? colors.primary : colors.background,
                          borderColor: fromCityFilter.toLowerCase().includes(city.toLowerCase()) ? colors.primary : colors.border,
                          borderWidth: 1,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                        onPress={() => setFromCityFilter(city)}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontFamily: 'Inter-Medium',
                          color: fromCityFilter.toLowerCase().includes(city.toLowerCase()) ? '#FFFFFF' : colors.text,
                        }}>
                          {city}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Drop City Input with Autocomplete Chips */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 4 }}>
                  {t('dropBid.dropToCityLabel')}
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}>
                  <MapPin color="#EF4444" size={16} />
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontFamily: 'Inter-Medium',
                      color: colors.text,
                      marginLeft: 8,
                      padding: 0,
                    }}
                    value={toCityFilter}
                    onChangeText={setToCityFilter}
                    placeholder={t('dropBid.dropCityPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                  />
                  {toCityFilter.length > 0 && (
                    <TouchableOpacity onPress={() => setToCityFilter('')}>
                      <X color={colors.textSecondary} size={16} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Quick Pick Location Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['Pondicherry', 'Bangalore', 'Coimbatore', 'Chennai', 'Salem', 'Trichy', 'Madurai', 'Mysore', 'Hosur', 'Tiruppur'].map((city) => (
                      <TouchableOpacity
                        key={`to-${city}`}
                        style={{
                          backgroundColor: toCityFilter.toLowerCase().includes(city.toLowerCase()) ? '#EF4444' : colors.background,
                          borderColor: toCityFilter.toLowerCase().includes(city.toLowerCase()) ? '#EF4444' : colors.border,
                          borderWidth: 1,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                        onPress={() => setToCityFilter(city)}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontFamily: 'Inter-Medium',
                          color: toCityFilter.toLowerCase().includes(city.toLowerCase()) ? '#FFFFFF' : colors.text,
                        }}>
                          {city}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Car Category Dropdown Selection (Includes Innova, Crysta, Sedan, SUV, etc.) */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 4 }}>
                  {t('dropBid.carCategoryModelLabel')}
                </Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderWidth: 1,
                    borderColor: carFilter !== 'ALL' ? colors.primary : colors.border,
                    backgroundColor: carFilter !== 'ALL' ? (isDarkMode ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF') : colors.background,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}
                  onPress={() => setShowCarFilterDropdown(!showCarFilterDropdown)}
                >
                  <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: carFilter !== 'ALL' ? colors.primary : colors.text }}>
                    {carFilter === 'ALL' ? t('dropBid.allCarCategoriesFull') : t('dropBid.categoryPrefixLabel', { category: carFilter })}
                  </Text>
                  <ChevronDown size={16} color={carFilter !== 'ALL' ? colors.primary : colors.textSecondary} />
                </TouchableOpacity>

                {showCarFilterDropdown && (
                  <View style={{
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}>
                    {[
                      { label: t('dropBid.allCarCategoriesShort'), val: 'ALL' },
                      { label: 'Sedan (Swift Dzire, Etios, Aura)', val: 'Sedan' },
                      { label: 'SUV (Ertiga, Carens, Triber)', val: 'SUV' },
                      { label: 'Innova / Crysta / Hycross', val: 'Innova' },
                      { label: 'Hatchback (Swift, i10, WagonR)', val: 'Hatchback' },
                      { label: 'Traveller / Bus (12+ Seater)', val: 'Traveller' },
                      { label: 'Luxury (Camry, Mercedes, BMW)', val: 'Luxury' },
                    ].map((item, idx) => (
                      <TouchableOpacity
                        key={item.val}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          backgroundColor: carFilter === item.val ? (isDarkMode ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF') : 'transparent',
                          borderBottomWidth: idx < 6 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}
                        onPress={() => {
                          setCarFilter(item.val);
                          setShowCarFilterDropdown(false);
                        }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontFamily: carFilter === item.val ? 'Inter-Bold' : 'Inter-Medium',
                          color: carFilter === item.val ? colors.primary : colors.text,
                        }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Pickup Date Selection */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 4 }}>
                  {t('dropBid.pickupDateLabel')}
                </Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: dateRange.fromDate ? colors.primary : colors.border,
                    backgroundColor: dateRange.fromDate ? (isDarkMode ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF') : colors.background,
                  }}
                  onPress={() => {
                    setShowFilterModal(false);
                    setShowCalendarModal(true);
                  }}
                >
                  <Calendar color={dateRange.fromDate ? colors.primary : colors.textSecondary} size={16} />
                  <Text style={{
                    flex: 1,
                    marginLeft: 8,
                    color: dateRange.fromDate ? colors.primary : colors.text,
                    fontFamily: 'Inter-Medium',
                    fontSize: 12,
                  }} numberOfLines={1}>
                    {dateRange.fromDate ? `${dateRange.fromDate}${dateRange.toDate ? ' - ' + dateRange.toDate : ''}` : t('dropBid.selectDateRangeText')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sort By Dropdown Selector */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 4 }}>
                  {t('dropBid.sortRequestsByLabel')}
                </Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderWidth: 1,
                    borderColor: sortOption !== 'NEWEST' ? colors.primary : colors.border,
                    backgroundColor: sortOption !== 'NEWEST' ? (isDarkMode ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF') : colors.background,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}
                  onPress={() => setShowSortDropdown(!showSortDropdown)}
                >
                  <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: sortOption !== 'NEWEST' ? colors.primary : colors.text }}>
                    {sortOption === 'NEWEST' && t('dropBid.sortNewestFirst')}
                    {sortOption === 'FARE_HIGH_LOW' && t('dropBid.sortFareHighLow')}
                    {sortOption === 'FARE_LOW_HIGH' && t('dropBid.sortFareLowHigh')}
                    {sortOption === 'DISTANCE' && t('dropBid.sortDistanceLongest')}
                  </Text>
                  <ChevronDown size={16} color={sortOption !== 'NEWEST' ? colors.primary : colors.textSecondary} />
                </TouchableOpacity>

                {showSortDropdown && (
                  <View style={{
                    marginTop: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}>
                    {[
                      { label: t('dropBid.sortNewestFirst'), val: 'NEWEST' },
                      { label: t('dropBid.sortFareHighLow'), val: 'FARE_HIGH_LOW' },
                      { label: t('dropBid.sortFareLowHigh'), val: 'FARE_LOW_HIGH' },
                      { label: t('dropBid.sortDistanceLongest'), val: 'DISTANCE' },
                    ].map((item, idx) => (
                      <TouchableOpacity
                        key={item.val}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          backgroundColor: sortOption === item.val ? (isDarkMode ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF') : 'transparent',
                          borderBottomWidth: idx < 3 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}
                        onPress={() => {
                          setSortOption(item.val as any);
                          setShowSortDropdown(false);
                        }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontFamily: sortOption === item.val ? 'Inter-Bold' : 'Inter-Medium',
                          color: sortOption === item.val ? colors.primary : colors.text,
                        }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
                onPress={() => {
                  setFromCityFilter('');
                  setToCityFilter('');
                  setMinFare(null);
                  setCustomMinFareInput('');
                  setCarFilter('ALL');
                  setSortOption('NEWEST');
                  setDateRange({ fromDate: null, toDate: null });
                }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>{t('dropBid.resetAllBtn')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 2,
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                }}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>{t('dropBid.applyFiltersBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calendar Date Range Modal */}
      <DateRangeCalendarModal
        visible={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        initialRange={dateRange}
        onSelectRange={(range) => setDateRange(range)}
      />

      {/* Custom Min Fare Filter Modal */}
      <Modal visible={showMinFareModal} transparent animationType="fade" onRequestClose={() => setShowMinFareModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('dropBid.customFarePriceFilterTitle')}</Text>
              <TouchableOpacity onPress={() => setShowMinFareModal(false)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              {t('dropBid.filterLiveRequestsText')}
            </Text>

            {/* Quick Preset Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[1500, 2500, 3500, 5000].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: minFare === val ? colors.primary : colors.background,
                      borderColor: minFare === val ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setMinFare(val);
                    setCustomMinFareInput(val.toString());
                    setShowMinFareModal(false);
                  }}
                >
                  <Text style={{ color: minFare === val ? '#FFFFFF' : colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>
                    ≥ ₹{val.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Input */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.orEnterExactMinFare')}</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 16 }]}>
              <IndianRupee size={18} color={colors.text} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={customMinFareInput}
                onChangeText={setCustomMinFareInput}
                keyboardType="number-pad"
                placeholder="e.g. 2500"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  setMinFare(null);
                  setCustomMinFareInput('');
                  setShowMinFareModal(false);
                }}
              >
                <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold' }}>{t('dropBid.clearFilterBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, backgroundColor: colors.primary }]}
                onPress={() => {
                  const parsed = parseFloat(customMinFareInput);
                  if (!isNaN(parsed) && parsed > 0) {
                    setMinFare(parsed);
                  } else {
                    setMinFare(null);
                  }
                  setShowMinFareModal(false);
                }}
              >
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-SemiBold' }}>{t('dropBid.applyFilterBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Commercial Driver Offer Seats Modal (Customer-App 3-Step Carpool Publish Wizard) */}
      <Modal visible={showOfferSeatsModal} transparent animationType="slide" onRequestClose={() => setShowOfferSeatsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {/* Header with Step Indicator */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users color="#10B981" size={22} />
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('dropBid.offerSeatsTitle')}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t('dropBid.stepOfVehicleListing', { step: offerSeatsStep })}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowOfferSeatsModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {/* Step Progress Bar */}
            <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: offerSeatsStep >= 1 ? '#10B981' : colors.border }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: offerSeatsStep >= 2 ? '#10B981' : colors.border }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: offerSeatsStep >= 3 ? '#10B981' : colors.border }} />
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {/* STEP 1: ROUTE & VIA STOPS */}
              {offerSeatsStep === 1 && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>{t('dropBid.step1RouteTitle')}</Text>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.pickupLocationLabel')}</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MapPin color="#10B981" size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={offerSeatsData.fromCity}
                      onChangeText={(txt) => setOfferSeatsData(prev => ({ ...prev, fromCity: txt }))}
                      placeholder="e.g. Chennai Koyambedu"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.dropLocationLabel')}</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MapPin color="#EF4444" size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={offerSeatsData.toCity}
                      onChangeText={(txt) => setOfferSeatsData(prev => ({ ...prev, toCity: txt }))}
                      placeholder="e.g. Pondicherry Rock Beach"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {showOfferStop ? (
                    <View>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.intermediateViaLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Navigation color="#0EA5E9" size={18} />
                        <TextInput
                          style={[styles.input, { color: colors.text }]}
                          value={offerStopCity}
                          onChangeText={setOfferStopCity}
                          placeholder="e.g. Tindivanam / Chengalpattu"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}
                      onPress={() => setShowOfferStop(true)}
                    >
                      <Plus color={colors.primary} size={16} />
                      <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>{t('dropConnect.addViaStopBtn')}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 }}
                    onPress={() => {
                      if (!offerSeatsData.fromCity || !offerSeatsData.toCity) {
                        Alert.alert(t('dropBid.missingLocationTitle'), t('dropBid.missingLocationBody'));
                        return;
                      }
                      setOfferSeatsStep(2);
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>{t('dropBid.nextScheduleVehicle')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* STEP 2: SCHEDULE, VEHICLE & SEATS */}
              {offerSeatsStep === 2 && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>{t('dropBid.step2ScheduleTitle')}</Text>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.departureDateLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Calendar color="#0EA5E9" size={16} />
                        <TouchableOpacity style={{ flex: 1, paddingVertical: 10 }} onPress={() => setShowDeparturePicker('date')}>
                          <Text style={{ color: colors.text, fontSize: 14 }}>{formatDisplayDate(offerSeatsData.departureDate)}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.departureTimeLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Clock color="#0EA5E9" size={16} />
                        <TouchableOpacity style={{ flex: 1, paddingVertical: 10 }} onPress={() => setShowDeparturePicker('time')}>
                          <Text style={{ color: colors.text, fontSize: 14 }}>{offerSeatsData.departureTime}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.commercialVehicleModelLabel')}</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Car color="#0EA5E9" size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={offerSeatsData.carModel}
                      onChangeText={(txt) => setOfferSeatsData(prev => ({ ...prev, carModel: txt }))}
                      placeholder="e.g. Maruti Suzuki Swift Dzire"
                    />
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.availableSeatsOfferedLabel')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <TouchableOpacity
                        key={n}
                        style={{
                          paddingHorizontal: 13,
                          paddingVertical: 7,
                          borderRadius: 6,
                          backgroundColor: parseInt(offerSeatsData.availableSeats, 10) === n ? colors.primary : colors.background,
                          borderWidth: 1,
                          borderColor: parseInt(offerSeatsData.availableSeats, 10) === n ? colors.primary : colors.border,
                        }}
                        onPress={() => setOfferSeatsData(prev => ({ ...prev, availableSeats: n.toString() }))}
                      >
                        <Text style={{ color: parseInt(offerSeatsData.availableSeats, 10) === n ? '#FFFFFF' : colors.text, fontFamily: 'Inter-Bold', fontSize: 12 }}>
                          {n} {n === 1 ? t('dropConnect.seatSingular') : t('dropConnect.seatPlural')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropBid.pricePerSeatLabel')}</Text>
                  <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={{ color: '#10B981', fontFamily: 'Inter-Bold', fontSize: 16 }}>₹</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={offerSeatsData.pricePerSeat}
                      onChangeText={(txt) => setOfferSeatsData(prev => ({ ...prev, pricePerSeat: txt }))}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                      onPress={() => setOfferSeatsStep(1)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>{t('dropBid.backBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 2, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}
                      onPress={() => setOfferSeatsStep(3)}
                    >
                      <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>{t('dropBid.reviewListingBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* STEP 3: REVIEW & PUBLISH */}
              {offerSeatsStep === 3 && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>{t('dropBid.step3ReviewTitle')}</Text>

                  <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{t('dropBid.routeLabel')}</Text><Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{offerSeatsData.fromCity} ➔ {offerSeatsData.toCity}</Text></View>
                    {offerStopCity ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{t('dropBid.viaStopLabel')}</Text><Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{offerStopCity}</Text></View> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{t('dropBid.scheduleLabel')}</Text><Text style={{ color: colors.text, fontFamily: 'Inter-Medium', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{offerSeatsData.departureDate} {t('dropBid.atConnector')} {offerSeatsData.departureTime}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{t('dropBid.commercialVehicleLabel')}</Text><Text style={{ color: colors.text, fontFamily: 'Inter-Medium', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{offerSeatsData.carModel}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{t('dropBid.seatsOfferedLabel')}</Text><Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{offerSeatsData.availableSeats} {t('dropConnect.seatPlural')}</Text></View>
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{t('dropBid.pricePerSeatSummaryLabel')}</Text><Text style={{ color: '#10B981', fontFamily: 'Inter-Bold', fontSize: 18 }}>₹{offerSeatsData.pricePerSeat} {t('dropBid.perPersonLabel')}</Text></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                      onPress={() => setOfferSeatsStep(2)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>{t('dropBid.backBtn')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 2, backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        setPublishingSeat(true);
                        setTimeout(() => {
                          setPublishingSeat(false);
                          setShowOfferSeatsModal(false);
                          setOfferSeatsStep(1);
                          Alert.alert(
                            t('dropBid.publishedSeatOfferTitle'),
                            t('dropBid.publishedSeatOfferBody', { seats: offerSeatsData.availableSeats, price: offerSeatsData.pricePerSeat, from: offerSeatsData.fromCity, to: offerSeatsData.toCity })
                          );
                        }, 900);
                      }}
                      disabled={publishingSeat}
                    >
                      {publishingSeat ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>{t('dropBid.publishSeatOfferNowBtn')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pipeline Guidance Modal */}
      <Modal
        visible={showPipelineInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPipelineInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Zap color={colors.primary} size={22} />
                <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text }}>Drop Bid Booking Pipeline</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPipelineInfoModal(false)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: 14 }}>
                <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.primary }}>Step 1: Submit Your Bid</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                    Choose any live trip request in the Live Market tab and offer your best competitive fare with your chosen vehicle.
                  </Text>
                </View>

                <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#B45309' }}>Step 2: Customer Accept / Counter</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                    The customer reviews competing offers or proposes a counter-offer. You can accept, decline, or counter back directly.
                  </Text>
                </View>

                <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#10B981' }}>Step 3: Automated Booking Creation & Assignment</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                    The moment the customer accepts your bid, an advance payment is collected, an official Order ID is generated, and the trip is automatically assigned to your driver in My Bookings!
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 6, alignItems: 'center', marginTop: 18 }}
                onPress={() => setShowPipelineInfoModal(false)}
              >
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>Got It!</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Driver Cancellation Modal */}
      <Modal
        visible={!!cancellingOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setCancellingOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, padding: 18, borderRadius: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <X color="#EF4444" size={20} />
                <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>Cancel Confirmed Booking</Text>
              </View>
              <TouchableOpacity onPress={() => setCancellingOrder(null)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            {cancellingOrder && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ₹500 Penalty Warning Card */}
                <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 6, padding: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#DC2626' }}>
                    ⚠️ MANDATORY CANCELLATION PENALTY FEE
                  </Text>
                  <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 4, lineHeight: 16 }}>
                    Cancelling confirmed trip <Text style={{ fontFamily: 'Inter-Bold' }}>#{cancellingOrder.order_id || cancellingOrder.id}</Text> will incur a mandatory <Text style={{ fontFamily: 'Inter-Bold', color: '#DC2626' }}>₹500 Penalty Fee</Text> automatically debited from your fleet wallet.
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
                    onPress={() => setCancellingOrder(null)}
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
      <CustomDatePickerModal
        visible={showDeparturePicker === 'date'}
        title="Departure date"
        initialDate={parseDeparture(offerSeatsData.departureDate, offerSeatsData.departureTime)}
        onClose={() => setShowDeparturePicker(null)}
        onConfirm={(d) => {
          setOfferSeatsData((prev) => ({ ...prev, departureDate: toIsoDate(d) }));
          setShowDeparturePicker(null);
        }}
      />
      <CustomTimePickerModal
        visible={showDeparturePicker === 'time'}
        title="Departure time"
        initialDate={parseDeparture(offerSeatsData.departureDate, offerSeatsData.departureTime)}
        onClose={() => setShowDeparturePicker(null)}
        onConfirm={(d) => {
          setOfferSeatsData((prev) => ({ ...prev, departureTime: toAmPm(d) }));
          setShowDeparturePicker(null);
        }}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  zapIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  refreshIconButton: {
    padding: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  partnerBanner: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  bannerSub: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderId: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  customerName: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  targetPriceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  routeBox: {
    gap: 6,
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 6,
    marginBottom: 14,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
  },
  metaVal: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    marginTop: 2,
  },
  sentOfferBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  offerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  offerBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: 10,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  reqSummary: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginLeft: 8,
  },
  quickLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgePreview: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 6,
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
});
