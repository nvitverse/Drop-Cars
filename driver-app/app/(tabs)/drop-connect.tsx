import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
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
  Switch,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateRangeCalendarModal from '@/components/DateRangeCalendarModal';
import DropMarketSwitcher from '@/components/DropMarketSwitcher';
import PageInfoModal from '@/components/PageInfoModal';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
// Driver-authenticated (driverAuthToken) - this screen runs under a
// CarDriver session, and /api/carpool/* is authenticated via get_current_driver.
import axiosDriver from '@/app/api/axiosDriver';
import { useEnsureDriverSession } from '@/hooks/useEnsureDriverSession';
import {
  Users,
  MapPin,
  Clock,
  Calendar,
  Car,
  Navigation,
  Plus,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  User,
  Phone,
  Check,
  X,
  Share2,
  Minus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Radio,
} from 'lucide-react-native';

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

interface CarpoolSeatRequest {
  id: string;
  passengerName: string;
  passengerPhone: string;
  seatsRequested: number;
  status: 'REQUESTED' | 'ACCEPTED' | 'DECLINED';
}

interface ActiveSeatOffer {
  id: string;
  fromCity: string;
  toCity: string;
  viaStop?: string;
  date: string;
  time: string;
  carModel: string;
  totalSeats: number;
  availableSeats: number;
  pricePerSeat: number;
  isAutoAccept: boolean;
  status: string;
  requests: CarpoolSeatRequest[];
  // Kept for the existing "Passenger Bookings" display below (accepted only).
  passengersBooked: { id: string; name: string; seats: number; phone: string }[];
}

// Maps one /api/carpool/my-journeys journey (see carpool_routes.py) into the
// shape this screen already renders.
const mapJourneyToOffer = (j: any): ActiveSeatOffer => {
  const requests: CarpoolSeatRequest[] = (j.requests || []).map((r: any) => ({
    id: r.id,
    passengerName: r.passengerName,
    passengerPhone: r.passengerPhone,
    seatsRequested: r.seatsRequested,
    status: r.status,
  }));
  return {
    id: j.id,
    fromCity: j.pickupCity,
    toCity: j.dropCity,
    viaStop: (j.intermediateStops || [])[0],
    date: j.startDate,
    time: j.startTime,
    carModel: j.carName,
    totalSeats: j.totalSeats,
    availableSeats: j.availableSeats,
    pricePerSeat: j.seatFare,
    isAutoAccept: !!j.isAutoAccept,
    status: j.status,
    requests,
    passengersBooked: requests
      .filter(r => r.status === 'ACCEPTED')
      .map(r => ({ id: r.id, name: r.passengerName, seats: r.seatsRequested, phone: r.passengerPhone })),
  };
};

const POPULAR_LOCATIONS = [
  'Chennai Koyambedu',
  'Chennai Airport (MAA)',
  'Chennai Central Railway Station',
  'Chennai Tambaram',
  'Coimbatore Gandhipuram',
  'Coimbatore Ukkadam',
  'Coimbatore Airport (CJB)',
  'Cuddalore Main Bus Stand',
  'Cuddalore OT (Old Town)',
  'Pondicherry ECR Bus Stand',
  'Pondicherry Rock Beach',
  'Madurai Periyar Bus Stand',
  'Madurai Mattuthavani (MIBT)',
  'Trichy Central Bus Stand',
  'Trichy Chathiram Bus Stand',
  'Salem New Bus Stand',
  'Salem Junction',
  'Tiruppur Old Bus Stand',
  'Erode Central Bus Stand',
  'Vellore Old Bus Stand',
  'Vellore Katpadi Junction',
  'Tanjore Old Bus Stand',
  'Dindigul Bus Stand',
  'Nagercoil Bus Stand',
  'Kanyakumari Main Stand',
  'Tirunelveli New Bus Stand',
  'Bengaluru Silk Board',
  'Bengaluru Majestic',
  'Bengaluru Electronic City',
  'Hyderabad MGBS',
];

const DRIVER_FLEET = [
  { id: 'v1', name: 'Maruti Swift Dzire', category: 'Sedan', maxSeats: 4, plate: 'TN 09 AB 1234' },
  { id: 'v2', name: 'Maruti Ertiga', category: 'SUV', maxSeats: 6, plate: 'TN 10 XY 5678' },
  { id: 'v3', name: 'Toyota Innova Crysta', category: 'MPV', maxSeats: 7, plate: 'TN 01 CZ 9999' },
];

// Route Distance & Max Price Ceiling Matrix
const ROUTE_CEILING_MATRIX: { [key: string]: { distanceKm: number; recPrice: number; maxCap: number } } = {
  'chennai_coimbatore': { distanceKm: 500, recPrice: 450, maxCap: 650 },
  'chennai_pondicherry': { distanceKm: 150, recPrice: 280, maxCap: 400 },
  'chennai_cuddalore': { distanceKm: 180, recPrice: 300, maxCap: 450 },
  'chennai_madurai': { distanceKm: 460, recPrice: 480, maxCap: 700 },
  'chennai_trichy': { distanceKm: 330, recPrice: 380, maxCap: 550 },
  'chennai_salem': { distanceKm: 340, recPrice: 380, maxCap: 550 },
  'chennai_vellore': { distanceKm: 140, recPrice: 220, maxCap: 350 },
  'chennai_tanjore': { distanceKm: 340, recPrice: 350, maxCap: 520 },
  'chennai_thanjavur': { distanceKm: 340, recPrice: 350, maxCap: 520 },
  'chennai_bengaluru': { distanceKm: 350, recPrice: 400, maxCap: 600 },
  'chennai_bangalore': { distanceKm: 350, recPrice: 400, maxCap: 600 },
  'chennai_tirunelveli': { distanceKm: 620, recPrice: 650, maxCap: 900 },
  'chennai_kanyakumari': { distanceKm: 700, recPrice: 700, maxCap: 1000 },
  'coimbatore_bangalore': { distanceKm: 360, recPrice: 420, maxCap: 600 },
  'coimbatore_bengaluru': { distanceKm: 360, recPrice: 420, maxCap: 600 },
  'coimbatore_madurai': { distanceKm: 210, recPrice: 300, maxCap: 450 },
  'coimbatore_salem': { distanceKm: 160, recPrice: 250, maxCap: 380 },
  'cuddalore_pondicherry': { distanceKm: 25, recPrice: 80, maxCap: 150 },
  'cuddalore_trichy': { distanceKm: 180, recPrice: 280, maxCap: 420 },
};

export function getRouteFareLimits(from: string, to: string) {
  const normFrom = (from || '').toLowerCase();
  const normTo = (to || '').toLowerCase();

  for (const key of Object.keys(ROUTE_CEILING_MATRIX)) {
    const [c1, c2] = key.split('_');
    if (
      (normFrom.includes(c1) && normTo.includes(c2)) ||
      (normFrom.includes(c2) && normTo.includes(c1))
    ) {
      return ROUTE_CEILING_MATRIX[key];
    }
  }

  // Dynamic estimate based on distance substring checks
  let estimatedKm = 250;
  if (normFrom.includes('cuddalore') || normTo.includes('cuddalore')) {
    estimatedKm = 180;
  } else if (normFrom.includes('pondicherry') || normTo.includes('pondicherry')) {
    estimatedKm = 150;
  } else if (normFrom.includes('vellore') || normTo.includes('vellore')) {
    estimatedKm = 140;
  }
  const recPrice = Math.max(100, Math.round(estimatedKm * 1.8));
  const maxCap = Math.round(recPrice * 1.5);
  return { distanceKm: estimatedKm, recPrice, maxCap };
}

export default function DropConnectScreen() {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();

  // Reached directly off the tab bar (Drop Market) - a driver session
  // (driverAuthToken) may not exist yet if Duty was never opened. See the
  // hook's docstring for what silently broke here before this existed.
  const { ready: sessionReady } = useEnsureDriverSession();

  // Mode tabs inside Drop Connect: 'MY_OFFERS' (Active Rides) | 'REQUESTS' (Passenger Requests) | 'PUBLISH' (Offer Seats)
  const [activeTab, setActiveTab] = useState<'MY_OFFERS' | 'REQUESTS' | 'PUBLISH'>('MY_OFFERS');
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [selectedOfferForDetails, setSelectedOfferForDetails] = useState<ActiveSeatOffer | null>(null);

  // Registered Fleet Selection Dropdown
  const [selectedVehicle, setSelectedVehicle] = useState(DRIVER_FLEET[2]); // Default Innova
  const [showFleetDropdown, setShowFleetDropdown] = useState(false);

  // Active Focused Location Input for Autocomplete Suggestions
  const [activeFocusedField, setActiveFocusedField] = useState<'FROM' | 'VIA' | 'TO' | null>(null);
  const [onlineSuggestions, setOnlineSuggestions] = useState<string[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Date & Time Picker Modal States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // PUBLISH WIZARD STEPS (1: Route, 2: Schedule & Vehicle, 3: Review & Publish)
  const [publishStep, setPublishStep] = useState<number>(1);
  const [showViaStop, setShowViaStop] = useState(false);
  const [viaStopCity, setViaStopCity] = useState('');

  const [formData, setFormData] = useState({
    fromCity: '',
    toCity: '',
    date: new Date().toISOString().slice(0, 10),
    time: '06:00 AM',
    carModel: DRIVER_FLEET[2].name,
    offeredSeats: 4,
    pricePerSeat: '450',
    isAutoAccept: false,
  });

  useEffect(() => {
    const query =
      activeFocusedField === 'FROM'
        ? formData.fromCity
        : activeFocusedField === 'VIA'
        ? viaStopCity
        : activeFocusedField === 'TO'
        ? formData.toCity
        : '';

    if (!activeFocusedField || !query || query.trim().length < 2) {
      setOnlineSuggestions([]);
      setIsSearchingOnline(false);
      return;
    }

    setIsSearchingOnline(true);
    const timer = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=6&q=${encodeURIComponent(
          query.trim()
        )}`,
        {
          headers: {
            'User-Agent': 'DropCarsVendorApp/1.0',
          },
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const places = data.map((item: any) => {
              const name = item.name || item.display_name.split(',')[0].trim();
              const parts = item.display_name.split(',').map((s: string) => s.trim());
              const districtOrCity = parts.length > 2 ? parts[1] || parts[2] : '';
              if (districtOrCity && !name.toLowerCase().includes(districtOrCity.toLowerCase())) {
                return `${name}, ${districtOrCity}`;
              }
              return name;
            });
            setOnlineSuggestions(Array.from(new Set(places)));
          }
        })
        .catch(() => {})
        .finally(() => setIsSearchingOnline(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [activeFocusedField, formData.fromCity, formData.toCity, viaStopCity]);

  const currentRouteLimits = getRouteFareLimits(formData.fromCity, formData.toCity);

  const handleSelectFleetVehicle = (veh: typeof DRIVER_FLEET[0]) => {
    setSelectedVehicle(veh);
    setShowFleetDropdown(false);
    setFormData(prev => ({
      ...prev,
      carModel: veh.name,
      offeredSeats: Math.min(prev.offeredSeats, veh.maxSeats),
    }));
  };

  const handleSeatIncrement = () => {
    if (formData.offeredSeats >= selectedVehicle.maxSeats) return;
    setFormData(prev => ({ ...prev, offeredSeats: prev.offeredSeats + 1 }));
  };

  const handleSeatDecrement = () => {
    if (formData.offeredSeats <= 1) return;
    setFormData(prev => ({ ...prev, offeredSeats: prev.offeredSeats - 1 }));
  };

  const handlePriceIncrement = () => {
    const limits = getRouteFareLimits(formData.fromCity, formData.toCity);
    const current = parseInt(formData.pricePerSeat, 10) || limits.recPrice;
    if (current >= limits.maxCap) {
      Alert.alert(
        '🚫 Maximum Seat Price Ceiling Reached',
        `For the ~${limits.distanceKm} km route between ${formData.fromCity.split(' ')[0]} and ${formData.toCity.split(' ')[0]}, the maximum seat contribution cap is ₹${limits.maxCap} to keep seat sharing fair and affordable.`
      );
      return;
    }
    const nextVal = Math.min(limits.maxCap, current + 50);
    setFormData(prev => ({ ...prev, pricePerSeat: nextVal.toString() }));
  };

  const handlePriceDecrement = () => {
    const limits = getRouteFareLimits(formData.fromCity, formData.toCity);
    const current = parseInt(formData.pricePerSeat, 10) || limits.recPrice;
    if (current <= 100) return;
    const nextVal = Math.max(100, current - 50);
    setFormData(prev => ({ ...prev, pricePerSeat: nextVal.toString() }));
  };

  const [publishing, setPublishing] = useState(false);
  const [activeOffers, setActiveOffers] = useState<ActiveSeatOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const allPendingRequests = activeOffers.flatMap(offer =>
    (offer.requests || [])
      .filter(r => r.status === 'REQUESTED')
      .map(r => ({ ...r, offer }))
  );
  const totalPendingRequests = allPendingRequests.length;

  const fetchMyJourneys = async () => {
    try {
      setLoadingOffers(true);
      const res = await axiosDriver.get('/api/carpool/my-journeys');
      const journeys = res.data?.journeys || [];
      setActiveOffers(journeys.map(mapJourneyToOffer));
    } catch (e: any) {
      console.error('Failed to load my carpool listings:', e);
    } finally {
      setLoadingOffers(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'MY_OFFERS' || activeTab === 'REQUESTS') && sessionReady) {
      fetchMyJourneys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sessionReady]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMyJourneys().finally(() => setRefreshing(false));
  };

  const handleConfirmPublish = async () => {
    if (!sessionReady) {
      Alert.alert(t('dropConnect.settingUpAlertTitle'), t('dropConnect.settingUpAlertBody'));
      return;
    }
    setPublishing(true);
    try {
      await axiosDriver.post('/api/carpool/journeys', {
        pickup_city: formData.fromCity,
        drop_city: formData.toCity,
        intermediate_stops: viaStopCity ? [viaStopCity] : [],
        start_date: formData.date,
        start_time: formData.time,
        car_name: formData.carModel,
        car_category: selectedVehicle.category,
        total_seats: formData.offeredSeats,
        available_seats: formData.offeredSeats,
        seat_fare: parseInt(formData.pricePerSeat, 10) || 400,
        is_auto_accept: formData.isAutoAccept,
      });
      setActiveTab('MY_OFFERS');
      setPublishStep(1);
      Alert.alert(
        t('dropConnect.publishedAlertTitle'),
        t('dropConnect.publishedAlertBody', { seats: formData.offeredSeats, from: formData.fromCity, to: formData.toCity, price: formData.pricePerSeat })
      );
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t('dropConnect.couldNotPublish');
      Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : t('dropConnect.couldNotPublish'));
    } finally {
      setPublishing(false);
    }
  };

  const handleRespondToRequest = async (requestId: string, action: 'approve' | 'decline') => {
    if (respondingRequestId) return;
    try {
      setRespondingRequestId(requestId);
      await axiosDriver.post(`/api/carpool/requests/${requestId}/${action}`);
      await fetchMyJourneys();
    } catch (e: any) {
      const fallback = action === 'approve' ? t('dropConnect.couldNotApprove') : t('dropConnect.couldNotDecline');
      const detail = e?.response?.data?.detail || e?.message || fallback;
      Alert.alert(t('quickDashboard.errorTitle'), typeof detail === 'string' ? detail : fallback);
    } finally {
      setRespondingRequestId(null);
    }
  };

  const renderLocationSuggestions = (
    field: 'FROM' | 'VIA' | 'TO',
    currentQuery: string,
    onSelect: (selectedVal: string) => void
  ) => {
    if (activeFocusedField !== field) return null;

    const trimmedQuery = currentQuery.trim();
    const filteredLocal = POPULAR_LOCATIONS.filter(loc =>
      loc.toLowerCase().includes(trimmedQuery.toLowerCase())
    );

    const showLocalSection = !trimmedQuery || filteredLocal.length > 0;
    const localDisplayItems = !trimmedQuery ? POPULAR_LOCATIONS.slice(0, 5) : filteredLocal.slice(0, 5);
    const hasOnline = onlineSuggestions.length > 0;

    return (
      <View style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        marginTop: 4,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
      }}>
        {/* Local Suggestions (only show when query is empty OR has matching popular cities!) */}
        {showLocalSection && (
          <>
            <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: colors.primary, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              {trimmedQuery ? t('dropConnect.matchingPopularCities') : t('dropConnect.popularCities')}
            </Text>
            
            {localDisplayItems.map((loc, idx) => (
              <TouchableOpacity
                key={`local_${idx}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: colors.border,
                }}
                onPress={() => {
                  onSelect(loc);
                  setActiveFocusedField(null);
                }}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MapPin color={colors.primary} size={14} />
                  <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Inter-Medium', color: colors.text }}>
                    {loc}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>{t('dropConnect.cityLabel')}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Online Map API Results (OpenStreetMap / Drop Cars Geocoder) */}
        {trimmedQuery.length >= 2 && (
          <View style={{ borderTopWidth: showLocalSection ? 1 : 0, borderTopColor: colors.border, backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: '#0EA5E9' }}>
                {t('dropConnect.onlineMapSearch')}
              </Text>
              {isSearchingOnline && <ActivityIndicator size="small" color="#0EA5E9" />}
            </View>

            {hasOnline ? (
              onlineSuggestions.map((place, idx) => (
                <TouchableOpacity
                  key={`online_${idx}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: colors.border,
                  }}
                  onPress={() => {
                    onSelect(place);
                    setActiveFocusedField(null);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Navigation color="#0EA5E9" size={14} />
                    <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Medium', color: colors.text }} numberOfLines={1}>
                      {place}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(14,165,233,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, fontFamily: 'Inter-Bold', color: '#0EA5E9' }}>{t('dropConnect.mapBadge')}</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : !isSearchingOnline && (
              <TouchableOpacity
                style={{ padding: 10, alignItems: 'center' }}
                onPress={() => {
                  onSelect(trimmedQuery);
                  setActiveFocusedField(null);
                }}
              >
                <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Inter-SemiBold' }}>
                  {t('dropConnect.useCustomPlace', { query: trimmedQuery })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 }]}>
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Share2 size={20} color="#10B981" />
          </View>
          <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text, fontSize: 18, flexShrink: 1 }]}>{t('dropConnect.headerTitle')}</Text>
            <TouchableOpacity
              onPress={() => setShowPageInfo(true)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(16, 185, 129, 0.3)',
              }}
            >
              <Info size={13} color="#10B981" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: activeTab === 'PUBLISH' ? '#10B981' : colors.surface,
            borderColor: '#10B981',
            borderWidth: 1,
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
          onPress={() => setActiveTab(activeTab === 'PUBLISH' ? 'MY_OFFERS' : 'PUBLISH')}
        >
          <Plus size={14} color={activeTab === 'PUBLISH' ? '#FFFFFF' : '#10B981'} />
          <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: activeTab === 'PUBLISH' ? '#FFFFFF' : '#10B981' }}>
            {activeTab === 'PUBLISH' ? 'Active Rides' : 'Offer Seats'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Attached Drop Market Switcher Tabs */}
      <DropMarketSwitcher active="connect" />

      <PageInfoModal
        visible={showPageInfo}
        title="Drop Connect - Empty Seat Sharing"
        description="Share empty seats in your vehicle during return trips or intercity journeys to earn extra guaranteed income while providing passengers affordable travel."
        pipelineText="🔄 Pipeline: 1. Offer Seats ➔ 2. Passengers Request ➔ 3. Approve & Earn"
        workflowSteps={[
          'Publish your route, departure schedule, and number of available seats under 💺 Offer Seats.',
          'Set a fair per-seat contribution with smart distance-based fare recommendations.',
          'Review passenger join requests under 📩 Seat Requests and approve verified riders.',
          'Coordinate pickup via in-app calling and complete the shared ride smoothly.',
        ]}
        tips={[
          'Auto-Accept: Enable Auto-Accept if you want requests confirmed immediately without manual review.',
          'Fare Cap: Per-seat fares are capped based on route distance to maintain fair and legal ride sharing.',
          'Zero Commission: Keep maximum earnings from every shared passenger seat.',
        ]}
        onClose={() => setShowPageInfo(false)}
      />

      {/* ── Edge-to-edge Sub-Segment Tabs: Active Rides | Requests | Offer Seats ── */}
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
          {
            key: 'MY_OFFERS',
            label: 'Active',
            emoji: '🚗',
            count: activeOffers.length,
            activeColor: '#10B981',
            isBeacon: true,
          },
          {
            key: 'REQUESTS',
            label: 'Requests',
            emoji: '📩',
            count: totalPendingRequests,
            activeColor: '#F59E0B',
            hasBadge: totalPendingRequests > 0,
          },
          {
            key: 'PUBLISH',
            label: 'Offer Seats',
            emoji: '➕',
            count: null,
            activeColor: '#6366F1',
          },
        ] as any[]).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
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
                {tab.isBeacon ? (
                  <LiveBiddingBeacon color={isActive ? '#10B981' : '#94A3B8'} size={5} />
                ) : null}
                <Text style={{ fontSize: 13 }}>{tab.emoji}</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-SemiBold',
                    color: isActive ? tab.activeColor : colors.textSecondary,
                  }}
                >
                  {tab.label}{tab.count !== null ? ` (${tab.count})` : ''}
                </Text>
                {tab.hasBadge && !isActive && (
                  <View style={{ backgroundColor: '#F59E0B', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginLeft: 2 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 8.5, fontFamily: 'Inter-Bold' }}>NEW</Text>
                  </View>
                )}
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
        style={{ flex: 1, paddingHorizontal: 8 }}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* TAB 1: PUBLISH CARPOOL WIZARD */}
        {activeTab === 'PUBLISH' && (
          <View style={{ marginTop: 8, gap: 16 }}>
            {/* Step Progress Bar */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                  {t('dropConnect.publishSeatOfferProgress', { step: publishStep })}
                </Text>
                <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 11, fontFamily: 'Inter-Medium', color: colors.primary }}>
                  {publishStep === 1 ? t('dropConnect.routeStopsLabel') : publishStep === 2 ? t('dropConnect.scheduleVehicleLabel') : t('dropConnect.reviewConfirmLabel')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: publishStep >= 1 ? '#10B981' : colors.border }} />
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: publishStep >= 2 ? '#10B981' : colors.border }} />
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: publishStep >= 3 ? '#10B981' : colors.border }} />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* STEP 1: ROUTE */}
              {publishStep === 1 && (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t('dropConnect.step1Title')}</Text>
                    <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{t('dropConnect.routeBadge')}</Text></View>
                  </View>

                  {/* Pickup Location */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.pickupLocationLabel')}</Text>
                  <View>
                    <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <MapPin color="#10B981" size={18} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        value={formData.fromCity}
                        onChangeText={(txt) => setFormData(prev => ({ ...prev, fromCity: txt }))}
                        onFocus={() => setActiveFocusedField('FROM')}
                        placeholder={t('dropConnect.pickupPlaceholder')}
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                    {renderLocationSuggestions('FROM', formData.fromCity, (val) => setFormData(prev => ({ ...prev, fromCity: val })))}
                  </View>

                  {/* Via Stop positioned BETWEEN Pickup and Drop */}
                  {showViaStop ? (
                    <View>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.intermediateViaLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Navigation color="#0EA5E9" size={18} />
                        <TextInput
                          style={[styles.input, { color: colors.text }]}
                          value={viaStopCity}
                          onChangeText={setViaStopCity}
                          onFocus={() => setActiveFocusedField('VIA')}
                          placeholder={t('dropConnect.viaPlaceholder')}
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      {renderLocationSuggestions('VIA', viaStopCity, (val) => setViaStopCity(val))}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}
                      onPress={() => setShowViaStop(true)}
                    >
                      <Plus color={colors.primary} size={16} />
                      <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>{t('dropConnect.addViaStopBtn')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Drop Location */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.dropLocationLabel')}</Text>
                  <View>
                    <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <MapPin color="#EF4444" size={18} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        value={formData.toCity}
                        onChangeText={(txt) => setFormData(prev => ({ ...prev, toCity: txt }))}
                        onFocus={() => setActiveFocusedField('TO')}
                        placeholder={t('dropConnect.dropPlaceholder')}
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                    {renderLocationSuggestions('TO', formData.toCity, (val) => setFormData(prev => ({ ...prev, toCity: val })))}
                  </View>

                  <TouchableOpacity
                    style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      if (!formData.fromCity || !formData.toCity) {
                        Alert.alert(t('dropConnect.missingInfoTitle'), t('dropConnect.missingInfoBody'));
                        return;
                      }
                      setPublishStep(2);
                    }}
                  >
                    <Text style={styles.nextBtnText}>{t('dropConnect.nextScheduleVehicle')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* STEP 2: SCHEDULE, VEHICLE & SEATS */}
              {publishStep === 2 && (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t('dropConnect.step2Title')}</Text>
                    <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{t('dropConnect.detailsBadge')}</Text></View>
                  </View>

                  {/* Interactive Departure Date & Time Pickers */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.departureDateLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Calendar color="#0EA5E9" size={16} />
                        <Text style={[styles.input, { color: colors.text }]}>
                          {formData.date}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.departureTimeLabel')}</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Clock color="#0EA5E9" size={16} />
                        <Text style={[styles.input, { color: colors.text }]}>
                          {formData.time}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* 1. Dropdown Select Vehicle from Driver's Registered Fleet */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.selectVehicleLabel')}</Text>
                  
                  {/* Dropdown Trigger Box */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 6,
                      backgroundColor: colors.background,
                      borderWidth: 1.5,
                      borderColor: showFleetDropdown ? colors.primary : colors.border,
                    }}
                    onPress={() => setShowFleetDropdown(!showFleetDropdown)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Car color={colors.primary} size={20} />
                      <View>
                        <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }}>
                          {selectedVehicle.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          {selectedVehicle.plate} • {selectedVehicle.category} ({t('dropConnect.maxSeatsBadge', { count: selectedVehicle.maxSeats })})
                        </Text>
                      </View>
                    </View>
                    {showFleetDropdown ? (
                      <ChevronUp color={colors.primary} size={20} />
                    ) : (
                      <ChevronDown color={colors.textSecondary} size={20} />
                    )}
                  </TouchableOpacity>

                  {/* Dropdown Expanded Options List (Scrollable box max 180px for 100+ cars) */}
                  {showFleetDropdown && (
                    <View style={{
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      overflow: 'hidden',
                      marginTop: -4,
                      elevation: 3,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                    }}>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                        {DRIVER_FLEET.map((veh) => {
                          const isSelected = selectedVehicle.id === veh.id;
                          return (
                            <TouchableOpacity
                              key={veh.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 14,
                                paddingVertical: 12,
                                backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                              }}
                              onPress={() => handleSelectFleetVehicle(veh)}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Car color={isSelected ? colors.primary : colors.textSecondary} size={18} />
                                <View>
                                  <Text style={{ fontSize: 13, fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Medium', color: isSelected ? colors.primary : colors.text }}>
                                    {veh.name}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                                    {veh.plate} • {veh.category}
                                  </Text>
                                </View>
                              </View>

                              <View style={{
                                backgroundColor: isSelected ? colors.primary : colors.background,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 6,
                              }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: isSelected ? '#FFFFFF' : colors.textSecondary }}>
                                  {t('dropConnect.maxSeatsBadge', { count: veh.maxSeats })}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  {/* 2. Compact Seat Stepper Section ([ - ] 4 Seats [ + ]) */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>{t('dropConnect.offerSeatsLabel')}</Text>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.background,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}>
                    <TouchableOpacity
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: formData.offeredSeats <= 1 ? '#94A3B8' : colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={handleSeatDecrement}
                      disabled={formData.offeredSeats <= 1}
                    >
                      <Minus size={18} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.primary }}>
                        {formData.offeredSeats} {formData.offeredSeats === 1 ? t('dropConnect.seatSingular') : t('dropConnect.seatPlural')}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {t('dropConnect.maxSeatsForVehicle', { max: selectedVehicle.maxSeats, name: selectedVehicle.name })}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: formData.offeredSeats >= selectedVehicle.maxSeats ? '#94A3B8' : colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={handleSeatIncrement}
                      disabled={formData.offeredSeats >= selectedVehicle.maxSeats}
                    >
                      <Plus size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {/* 3. BlaBlaCar Style Stepper Control & Dynamic Route Ceiling */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.inputLabel, { color: colors.text, flexShrink: 1, marginRight: 8 }]}>{t('dropConnect.setContributionLabel')}</Text>
                    <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>
                      {t('dropConnect.kmTripLabel', { km: currentRouteLimits.distanceKm })}
                    </Text>
                  </View>
                  
                  <View style={{
                    backgroundColor: colors.background,
                    borderRadius: 8,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    {/* Dynamic BlaBlaCar Status Color Badge */}
                    {(() => {
                      const cur = parseInt(formData.pricePerSeat, 10) || currentRouteLimits.recPrice;
                      let badgeBg = 'rgba(16,185,129,0.12)';
                      let badgeColor = '#10B981';
                      let badgeText = t('dropConnect.fairPriceZone');

                      if (cur >= currentRouteLimits.maxCap) {
                        badgeBg = 'rgba(239,68,68,0.15)';
                        badgeColor = '#EF4444';
                        badgeText = t('dropConnect.maxPriceCeiling', { cap: currentRouteLimits.maxCap });
                      } else if (cur > currentRouteLimits.recPrice + 50) {
                        badgeBg = 'rgba(245,158,11,0.15)';
                        badgeColor = '#F59E0B';
                        badgeText = t('dropConnect.higherFare', { rec: currentRouteLimits.recPrice });
                      }

                      return (
                        <View style={{ backgroundColor: badgeBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: badgeColor }}>
                            {badgeText}
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Stepper controls [-] ₹ Price [+] */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                      <TouchableOpacity
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: '#EF4444',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={handlePriceDecrement}
                      >
                        <Minus size={20} color="#FFFFFF" />
                      </TouchableOpacity>

                      <View style={{ alignItems: 'center', minWidth: 130 }}>
                        <Text style={{ fontSize: 30, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                          ₹ {formData.pricePerSeat}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t('dropConnect.perSeatLabel')}</Text>
                        <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2, fontFamily: 'Inter-Medium' }}>
                          {t('dropConnect.minMaxCapLabel', { cap: currentRouteLimits.maxCap })}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: parseInt(formData.pricePerSeat, 10) >= currentRouteLimits.maxCap ? '#94A3B8' : '#10B981',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={handlePriceIncrement}
                      >
                        <Plus size={20} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>

                    {/* Dynamic Route-Based Fare Suggestions */}
                    <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, marginBottom: 8, textAlign: 'center' }}>
                        💡 Smart Fare Suggestions for this route (~{currentRouteLimits.distanceKm} km):
                      </Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                        {[
                          { label: 'Budget', price: (Math.max(100, currentRouteLimits.recPrice - 50)).toString(), emoji: '💡' },
                          { label: 'Recommended', price: currentRouteLimits.recPrice.toString(), emoji: '🔥' },
                          { label: 'High Demand', price: (Math.min(currentRouteLimits.maxCap, currentRouteLimits.recPrice + 50)).toString(), emoji: '⚡' },
                        ].map((sug) => (
                          <TouchableOpacity
                            key={sug.label}
                            style={{
                              backgroundColor: formData.pricePerSeat === sug.price ? 'rgba(16,185,129,0.15)' : colors.surface,
                              borderColor: formData.pricePerSeat === sug.price ? '#10B981' : colors.border,
                              borderWidth: 1,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                            }}
                            onPress={() => setFormData(prev => ({ ...prev, pricePerSeat: sug.price }))}
                          >
                            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: formData.pricePerSeat === sug.price ? '#10B981' : colors.text }}>
                              {sug.emoji} ₹{sug.price}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    <TouchableOpacity
                      style={[styles.backBtn, { borderColor: colors.border }]}
                      onPress={() => setPublishStep(1)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>{t('dropConnect.backBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.nextBtn, { flex: 2, backgroundColor: colors.primary }]}
                      onPress={() => setPublishStep(3)}
                    >
                      <Text style={styles.nextBtnText}>{t('dropConnect.reviewSeatOffer')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* STEP 3: REVIEW & PUBLISH */}
              {publishStep === 3 && (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t('dropConnect.step3Title')}</Text>
                    <View style={[styles.stepBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                      <Text style={[styles.stepBadgeText, { color: '#10B981' }]}>{t('dropConnect.confirmBadge')}</Text>
                    </View>
                  </View>

                  <View style={[styles.summaryCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{t('dropConnect.routeLabel')}</Text><Text style={[styles.summaryValBold, { color: colors.text }]}>{formData.fromCity} ➔ {formData.toCity}</Text></View>
                    {viaStopCity ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{t('dropConnect.viaStopLabel')}</Text><Text style={[styles.summaryValBold, { color: colors.text }]}>{viaStopCity}</Text></View> : null}
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{t('dropConnect.scheduleLabel')}</Text><Text style={[styles.summaryVal, { color: colors.text }]}>{formData.date} {t('dropConnect.atConnector')} {formData.time}</Text></View>
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{t('dropConnect.vehicleLabel')}</Text><Text style={[styles.summaryVal, { color: colors.text }]}>{formData.carModel}</Text></View>
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{t('dropConnect.offerSeatsSummaryLabel')}</Text><Text style={[styles.summaryValBold, { color: colors.text }]}>{formData.offeredSeats} {t('dropConnect.seatPlural')}</Text></View>
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 13 }}>{t('dropConnect.seatContributionLabel')}</Text>
                      <Text style={{ color: '#10B981', fontFamily: 'Inter-Bold', fontSize: 18 }}>₹{formData.pricePerSeat} {t('dropConnect.perPersonLabel')}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>{t('dropConnect.autoAcceptLabel')}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                        {t('dropConnect.autoAcceptDesc')}
                      </Text>
                    </View>
                    <Switch
                      value={formData.isAutoAccept}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, isAutoAccept: v }))}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    <TouchableOpacity
                      style={[styles.backBtn, { borderColor: colors.border }]}
                      onPress={() => setPublishStep(2)}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>{t('dropConnect.backBtn')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.confirmBtn, { backgroundColor: '#10B981' }]}
                      onPress={handleConfirmPublish}
                      disabled={publishing}
                    >
                      {publishing ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.confirmBtnText}>{t('dropConnect.publishSeatOfferBtn')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* TAB 2: MY ACTIVE SEAT OFFERS */}
        {activeTab === 'MY_OFFERS' && (
          <View style={{ marginTop: 12, gap: 14 }}>
            {loadingOffers && activeOffers.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : activeOffers.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Users size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('dropConnect.noActiveOffersTitle')}</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{t('dropConnect.noActiveOffersBody')}</Text>
                <TouchableOpacity
                  style={{
                    marginTop: 14,
                    backgroundColor: '#10B981',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onPress={() => setActiveTab('PUBLISH')}
                >
                  <Plus size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>Offer Empty Seats</Text>
                </TouchableOpacity>
              </View>
            ) : (
              activeOffers.map(offer => {
                const pendingRequests = (offer.requests || []).filter(r => r.status === 'REQUESTED');
                return (
                  <View
                    key={offer.id}
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, gap: 10 }]}
                  >
                    {/* Top Live Bidding & Real-Time Strip */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexShrink: 1, marginRight: 8 }}>
                        <LiveBiddingBeacon color="#10B981" size={7} />
                        <Text style={{ flexShrink: 1, fontSize: 11, fontFamily: 'Inter-Bold', color: isDarkMode ? '#34D399' : '#047857', letterSpacing: 0.3 }} numberOfLines={1}>
                          LIVE SEAT SHARING • INSTANT JOIN
                        </Text>
                      </View>
                      <Text style={{ flexShrink: 0, fontSize: 13, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                        ₹{offer.pricePerSeat} <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Regular', color: colors.textSecondary }}>/ seat</Text>
                      </Text>
                    </View>

                    {/* Route Timeline Container with Embedded Vehicle & Seats Box */}
                    <View
                      style={{
                        backgroundColor: colors.background,
                        borderRadius: 8,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 10,
                      }}
                    >
                      {/* Route Timeline (full width, wraps instead of overlapping) */}
                      <View style={{ alignSelf: 'stretch' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MapPin color="#10B981" size={16} />
                          <Text style={{ flex: 1, fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }} numberOfLines={2}>
                            From: {offer.fromCity}
                          </Text>
                        </View>

                        {!!offer.viaStop && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3, marginLeft: 2 }}>
                            <Navigation color="#0EA5E9" size={13} />
                            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: '#0EA5E9' }} numberOfLines={1}>
                              Via: {offer.viaStop}
                            </Text>
                          </View>
                        )}

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: !!offer.viaStop ? 0 : 5 }}>
                          <MapPin color="#EF4444" size={16} />
                          <Text style={{ flex: 1, fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }} numberOfLines={2}>
                            To: {offer.toCity}
                          </Text>
                        </View>
                      </View>

                      {/* Vehicle & Seats Left Badge Box (Right side embedded) */}
                      <View
                        style={{
                          backgroundColor: colors.surface,
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <View style={{ flex: 1, flexShrink: 1 }}>
                          <Text style={{ fontSize: 9.5, color: colors.textSecondary, fontFamily: 'Inter-SemiBold', letterSpacing: 0.3 }}>
                            VEHICLE
                          </Text>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.text, marginTop: 1 }} numberOfLines={2}>
                            {offer.carModel}
                          </Text>
                        </View>

                        <View
                          style={{
                            flexShrink: 0,
                            backgroundColor: offer.availableSeats > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', color: offer.availableSeats > 0 ? '#10B981' : '#EF4444' }}>
                            {offer.availableSeats} of {offer.totalSeats} Seats Left
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Full-width Warm Departure Time Bar */}
                    <View
                      style={{
                        backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                        borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} color="#D97706" />
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#B45309' }}>
                          DEPARTURE
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#B45309' }}>
                        📅 {offer.date} • ⏰ {offer.time}
                      </Text>
                    </View>

                    {/* Inline Pending Passenger Requests with 1-Tap Approve/Decline */}
                    {pendingRequests.length > 0 && (
                      <View style={{
                        backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                        borderRadius: 6,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
                        gap: 10,
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <LiveBiddingBeacon color="#D97706" size={6} />
                            <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: '#B45309' }}>
                              Pending Passenger Requests ({pendingRequests.length})
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: '#B45309' }}>
                            Needs Review
                          </Text>
                        </View>

                        {pendingRequests.map(req => (
                          <View key={req.id} style={{
                            backgroundColor: colors.surface,
                            borderRadius: 6,
                            padding: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            gap: 8,
                          }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                                <User size={15} color={colors.primary} />
                                <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                                  {req.passengerName || 'Guest Rider'}
                                </Text>
                              </View>
                              <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                                  {req.seatsRequested} {req.seatsRequested === 1 ? 'Seat' : 'Seats'} • ₹{req.seatsRequested * offer.pricePerSeat}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              {req.passengerPhone ? (
                                <TouchableOpacity
                                  onPress={() => Linking.openURL(`tel:${req.passengerPhone}`)}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  <Phone size={13} color="#10B981" />
                                  <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#10B981' }}>
                                    {req.passengerPhone}
                                  </Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={{ fontSize: 11.5, color: colors.textSecondary }}>📞 Phone not shared</Text>
                              )}
                            </View>

                            {/* Quick Action Buttons */}
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                              <TouchableOpacity
                                onPress={() => handleRespondToRequest(req.id, 'approve')}
                                disabled={respondingRequestId === req.id}
                                style={{
                                  flex: 1.2,
                                  backgroundColor: '#10B981',
                                  borderRadius: 6,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  gap: 5,
                                }}
                              >
                                {respondingRequestId === req.id ? (
                                  <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                  <>
                                    <Check size={14} color="#FFFFFF" />
                                    <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Inter-Bold' }}>
                                      Approve ({req.seatsRequested})
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleRespondToRequest(req.id, 'decline')}
                                disabled={respondingRequestId === req.id}
                                style={{
                                  flex: 1,
                                  backgroundColor: colors.background,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: 6,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontFamily: 'Inter-SemiBold' }}>
                                  Decline
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Confirmed Passengers Section (if any) */}
                    {offer.passengersBooked.length > 0 && (
                      <View style={{
                        backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5',
                        borderRadius: 6,
                        padding: 10,
                        borderWidth: 1,
                        borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0',
                        gap: 6,
                      }}>
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#047857' }}>
                          ✅ Confirmed Passengers ({offer.passengersBooked.length})
                        </Text>
                        {offer.passengersBooked.map(p => (
                          <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.text }}>
                              👤 {p.name} ({p.seats} {p.seats === 1 ? 'seat' : 'seats'})
                            </Text>
                            {p.phone ? (
                              <TouchableOpacity onPress={() => Linking.openURL(`tel:${p.phone}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Phone size={12} color="#10B981" />
                                <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#10B981' }}>{p.phone}</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Bottom Card Controls */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: colors.background,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingVertical: 9,
                          borderRadius: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => setSelectedOfferForDetails(offer)}
                      >
                        <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold', fontSize: 12.5 }}>
                          Trip Details & Settings
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          borderWidth: 1,
                          borderColor: '#10B981',
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          borderRadius: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => {
                          setFormData(prev => ({
                            ...prev,
                            fromCity: offer.fromCity,
                            toCity: offer.toCity,
                            carModel: offer.carModel,
                            pricePerSeat: offer.pricePerSeat.toString(),
                          }));
                          setActiveTab('PUBLISH');
                          setPublishStep(2);
                        }}
                      >
                        <Text style={{ color: '#10B981', fontFamily: 'Inter-Bold', fontSize: 12.5 }}>
                          Duplicate Offer
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 3: DEDICATED SEAT REQUESTS TAB */}
        {activeTab === 'REQUESTS' && (
          <View style={{ marginTop: 12, gap: 12 }}>
            {allPendingRequests.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Users size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Pending Seat Requests</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  When passengers request seats on any of your active rides, they will appear here for instant 1-tap approval.
                </Text>
              </View>
            ) : (
              allPendingRequests.map(item => (
                <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, gap: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <LiveBiddingBeacon color="#D97706" size={6} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#D97706' }}>
                        PENDING SEAT REQUEST
                      </Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                        {item.seatsRequested} {item.seatsRequested === 1 ? 'Seat' : 'Seats'} • ₹{item.seatsRequested * item.offer.pricePerSeat}
                      </Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: colors.background, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                      Trip: {item.offer.fromCity} ➔ {item.offer.toCity}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.textSecondary }}>
                      {item.offer.date} at {item.offer.time} • {item.offer.carModel}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                      <User size={16} color={colors.primary} />
                      <Text style={{ flexShrink: 1, fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }}>
                        {item.passengerName || 'Guest Rider'}
                      </Text>
                    </View>
                    {item.passengerPhone ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${item.passengerPhone}`)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                      >
                        <Phone size={13} color="#10B981" />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                          Call {item.passengerPhone}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>📞 Phone not shared</Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => handleRespondToRequest(item.id, 'approve')}
                      disabled={respondingRequestId === item.id}
                      style={{
                        flex: 1.3,
                        backgroundColor: '#10B981',
                        borderRadius: 6,
                        paddingVertical: 10,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {respondingRequestId === item.id ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Check size={16} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>
                            Approve & Lock Seats
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleRespondToRequest(item.id, 'decline')}
                      disabled={respondingRequestId === item.id}
                      style={{
                        flex: 1,
                        backgroundColor: colors.background,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 6,
                        paddingVertical: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Bold' }}>
                        Decline
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Full Passenger Request & Offer Details Modal */}
      <Modal
        visible={!!selectedOfferForDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOfferForDetails(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: colors.surface, borderRadius: 10, padding: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users color={colors.primary} size={20} />
                <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text }}>{t('dropConnect.tripRequestDetailsTitle')}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedOfferForDetails(null)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            {selectedOfferForDetails && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Route Header Box */}
                <View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 6, marginBottom: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>
                      {selectedOfferForDetails.fromCity} ➔ {selectedOfferForDetails.toCity}
                    </Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                      ₹{selectedOfferForDetails.pricePerSeat} / seat
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    📅 {selectedOfferForDetails.date} at {selectedOfferForDetails.time}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {t('dropConnect.vehicleColonLabel', { model: selectedOfferForDetails.carModel })}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.primary, marginTop: 2 }}>
                    {t('dropConnect.seatsAvailableLabel', { available: selectedOfferForDetails.availableSeats, total: selectedOfferForDetails.totalSeats })}
                  </Text>
                </View>

                {/* Pending Requests Section */}
                {(() => {
                  const pendingReqs = selectedOfferForDetails.requests.filter(r => r.status === 'REQUESTED');
                  return (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 8 }}>
                        {t('dropConnect.pendingPassengerRequests', { count: pendingReqs.length })}
                      </Text>

                      {pendingReqs.length === 0 ? (
                        <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 6, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('dropConnect.noPendingRequests')}</Text>
                        </View>
                      ) : (
                        pendingReqs.map(r => (
                          <View key={r.id} style={{ backgroundColor: colors.background, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 10, gap: 10 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <User color={colors.primary} size={18} />
                                <View>
                                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>
                                    {r.passengerName || t('dropConnect.guestPassenger')}
                                  </Text>
                                  <Text style={{ fontSize: 11.5, color: colors.textSecondary }}>
                                    📞 {r.passengerPhone || t('dropConnect.phoneNotShared')}
                                  </Text>
                                </View>
                              </View>
                              <View style={{ backgroundColor: 'rgba(79,70,229,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.primary }}>
                                  {r.seatsRequested} {r.seatsRequested === 1 ? t('dropConnect.seatSingular') : t('dropConnect.seatPlural')}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                              <TouchableOpacity
                                onPress={() => {
                                  handleRespondToRequest(r.id, 'approve');
                                  setSelectedOfferForDetails(null);
                                }}
                                disabled={respondingRequestId === r.id}
                                style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 6, paddingVertical: 10, alignItems: 'center' }}
                              >
                                {respondingRequestId === r.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>{t('dropConnect.approveRequestBtn')}</Text>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => {
                                  handleRespondToRequest(r.id, 'decline');
                                  setSelectedOfferForDetails(null);
                                }}
                                disabled={respondingRequestId === r.id}
                                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 10, alignItems: 'center' }}
                              >
                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter-Bold' }}>{t('dropConnect.declineRequestBtn')}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  );
                })()}

                {/* Confirmed Passenger Bookings */}
                {selectedOfferForDetails.passengersBooked.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 8 }}>
                      {t('dropConnect.confirmedBookingsTitle')}
                    </Text>
                    {selectedOfferForDetails.passengersBooked.map(p => (
                      <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.08)', padding: 10, borderRadius: 6, marginBottom: 6 }}>
                        <Text style={{ flex: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                          👤 {p.name} ({p.seats} {p.seats === 1 ? t('dropConnect.seatSingular') : t('dropConnect.seatPlural')})
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'Inter-Bold' }}>📞 {p.phone}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={{ backgroundColor: colors.background, paddingVertical: 12, borderRadius: 6, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: colors.border }}
              onPress={() => setSelectedOfferForDetails(null)}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 13 }}>{t('dropConnect.closeDetailsBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Interactive Single Departure Date Calendar Modal */}
      <DateRangeCalendarModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        singleDateMode={true}
        onSelectSingleDate={(selectedDate) => {
          setFormData(prev => ({ ...prev, date: selectedDate }));
        }}
      />

      {/* Interactive Departure Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock color={colors.primary} size={20} />
                <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>{t('dropConnect.selectDepartureTimeTitle')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('dropConnect.chooseDepartureSlot')}</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                '05:00 AM', '06:00 AM', '07:30 AM', '09:00 AM',
                '12:00 PM', '03:30 PM', '06:00 PM', '09:00 PM', '11:00 PM',
              ].map(slot => (
                <TouchableOpacity
                  key={slot}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 6,
                    backgroundColor: formData.time === slot ? colors.primary : colors.background,
                    borderWidth: 1,
                    borderColor: formData.time === slot ? colors.primary : colors.border,
                  }}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, time: slot }));
                    setShowTimePicker(false);
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: formData.time === slot ? '#FFFFFF' : colors.text }}>
                    {slot}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 19, fontFamily: 'Inter-Bold' },
  headerSub: { fontSize: 11, fontFamily: 'Inter-Regular' },
  segmentBar: { flexDirection: 'row', borderRadius: 6, padding: 3, gap: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 6 },
  segmentText: { fontSize: 12, fontFamily: 'Inter-Bold' },
  card: { borderRadius: 8, padding: 16, borderWidth: 1 },
  stepTitle: { fontSize: 15, fontFamily: 'Inter-Bold' },
  stepBadge: { backgroundColor: 'rgba(14,165,233,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  stepBadgeText: { color: '#0EA5E9', fontSize: 10, fontFamily: 'Inter-Bold' },
  inputLabel: { fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6, borderWidth: 1, gap: 8 },
  input: { flex: 1, fontSize: 13, fontFamily: 'Inter-Medium', padding: 0 },
  nextBtn: { paddingVertical: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 },
  backBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seatChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 6, borderWidth: 1 },
  summaryCard: { borderRadius: 6, padding: 12, borderWidth: 1, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  summaryLabel: { fontSize: 12, color: '#94A3B8', flexShrink: 1 },
  summaryVal: { fontSize: 12.5, fontFamily: 'Inter-Medium', flexShrink: 1, textAlign: 'right' },
  summaryValBold: { fontSize: 13, fontFamily: 'Inter-Bold', flexShrink: 1, textAlign: 'right' },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 6 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Bold' },
  emptySub: { fontSize: 12, fontFamily: 'Inter-Regular' },
});
