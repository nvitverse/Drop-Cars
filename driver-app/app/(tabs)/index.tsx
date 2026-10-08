import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
import { formatAssignmentRemaining } from '@/utils/assignDeadline';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  AppState,
} from 'react-native';
import * as SecureStore from '@/utils/secureStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDashboard, FutureRide } from '@/contexts/DashboardContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import DropCarsWordmark from '@/components/DropCarsWordmark';
import { MessageCircle, Menu, Wallet, MapPin, Clock, User, Phone, Car, RefreshCw, ArrowLeftRight, Bell, Plus, IndianRupee, ShieldCheck, UserCheck, ChevronRight, ChevronDown, X, Search, Check, SlidersHorizontal, UserPlus, CheckCircle, FileText, Sparkles, Tag, Gavel } from 'lucide-react-native';

import BookingCard from '@/components/BookingCard';
import BookingDetailModal from '@/components/BookingDetailModal';
import DrawerNavigation from '@/components/DrawerNavigation';
import WelcomeScreen from '@/components/WelcomeScreen';
import VacantCityPicker from '@/components/VacantCityPicker';
import AnnouncementModal from '@/components/AnnouncementModal';
import DocumentTodoPrompt from '@/components/DocumentTodoPrompt';
import EmptyState from '@/components/EmptyState';
import DashboardSkeleton from '@/components/DashboardSkeleton';
import KycPendingModal from '@/components/KycPendingModal';
import TrustedIntroModal from '@/components/TrustedIntroModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BookingAlreadyTakenModal from '@/components/BookingAlreadyTakenModal';
import ActionableErrorModal, { ErrorType } from '@/components/ActionableErrorModal';
import VehicleMismatchModal from '@/components/VehicleMismatchModal';
import { carTypeSatisfies } from '@/utils/carTypeCompat';
import { vehicleRequestService } from '@/services/vehicle/vehicleRequestService';
import StillWaitingModal from '@/components/StillWaitingModal';
import { fetchDashboardData, DashboardData, forceRefreshDashboardData } from '@/services/orders/dashboardService';
import { getPendingOrders, PendingOrder, fetchAvailableDrivers, assignCarDriverToOrder, AvailableDriver, AvailableCar } from '@/services/orders/assignmentService';
import { updateNotificationSettings } from '@/services/notifications/notificationApi';
import axiosInstance from '@/app/api/axiosInstance';
import { getAuthHeaders } from '@/services/auth/authService';
import { isEffectivelyRunning } from '@/utils/bookingStatus';
import { formatBookingId, formatKmLimitAndHours } from '@/utils/format';
import { fuzzyFilterCities } from '@/utils/fuzzyCitySearch';
import { fetchDocumentStatuses, summarizeVerificationStatus, getDetailedDocumentAlerts, VerificationSummary, DocumentAlertItem } from '@/services/documents/documentStatusService';
import LanguageToggle from '@/components/LanguageToggle';
import DateRangeCalendarModal, { DateRange } from '@/components/DateRangeCalendarModal';
import PartnerBadge from '@/components/PartnerBadge';
import QuickMetrics from '@/components/dashboard/QuickMetrics';
import DispatchFeedHeader from '@/components/dashboard/DispatchFeedHeader';
import bookingFeedService from '@/services/orders/bookingFeedService';
import ttsService from '@/services/notifications/ttsService';
import RouteRequestModal, { RouteRequestData } from '@/components/RouteRequestModal';
import AutoAssignHudModal from '@/components/AutoAssignHudModal';
import { Calendar } from 'lucide-react-native';

interface Booking {
  booking_id: string;
  pickup: string;
  drop: string;
  customer_name: string;
  customer_mobile: string;
  fare_per_km: number;
  distance_km: number;
  total_fare: number;
  status?: string; // Make status optional to match both interfaces
}

// Enhanced debug version of parse/filter logic:
function parseCityListField(field: string | null | undefined): string[] {
  if (!field) return [];
  let raw = field.trim();
  // Remove brackets if array-like
  if (raw.startsWith('[') && raw.endsWith(']')) {
    raw = raw.slice(1, -1);
  }
  // Remove quotes
  raw = raw.replace(/['\"]/g, '');
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

// Helper: convert trip duration text (e.g. "3 hours 30 mins") to total minutes
function parseTripDurationToMinutes(raw: string | null | undefined): number {
  if (!raw) return Number.MAX_SAFE_INTEGER;
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

    // Fallback: if parsing failed but the raw value is numeric, use it directly
    if (!totalMinutes) {
      const numeric = Number(String(raw).replace(/[^\d.]/g, ''));
      if (!Number.isNaN(numeric)) return numeric;
    }

    return totalMinutes || Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

// Header side groups (avatar on the left, notification+menu icons on the
// right) are given this same fixed width so the centered brand text sits in
// truly equal leftover space on both sides. Sized to the wider group: two
// menuButton icons (padding:8 each, sizes 22 and 24) plus their gap:4 -
// (8+22+8) + 4 + (8+24+8) = 82 - comfortably covers the 40px avatar too.
const HEADER_SIDE_WIDTH = 82;

export interface ActiveRide {
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
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[] | null;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { balance, refreshBalance } = useWallet();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { dashboardData, loading, error, fetchData, refreshData, futureRides } = useDashboard();
  const { notificationsEnabled, getNotificationStatus } = useNotifications();
  const router = useRouter();
  const [showDrawer, setShowDrawer] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  // Remove currentTrip concept from owner dashboard
  const [refreshing, setRefreshing] = useState(false);

  // Live main tabs: New Bookings | Upcoming | Running
  type HomeMainTab = 'new_bookings' | 'upcoming' | 'running';
  type UpcomingSubTab = 'unassigned' | 'assigned';

  const [homeMainTab, setHomeMainTab] = useState<HomeMainTab>('new_bookings');
  const [upcomingSubTab, setUpcomingSubTab] = useState<UpcomingSubTab>('unassigned');
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([]);
  const [activeRidesLoading, setActiveRidesLoading] = useState(false);

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

  // This owner's own Preferred/Standard tier - drives the accept-button
  // gating and badge colors on every BookingCard below.
  const [myTier, setMyTier] = useState<'PREFERRED' | 'STANDARD'>('STANDARD');
  useEffect(() => {
    axiosInstance.get('/api/users/vehicle-owner/billing-status')
      .then(res => setMyTier(res.data?.tier === 'PREFERRED' ? 'PREFERRED' : 'STANDARD'))
      .catch(() => {});
  }, []);

  // Verification badges (Owner KYC / Cars / Drivers) - same three gates the
  // backend now enforces on accept/assign (crud/verification.py), surfaced
  // here so an owner sees WHY a booking might get rejected before they hit
  // the error, not just after.
  const [verification, setVerification] = useState<VerificationSummary | null>(null);
  const [docAlerts, setDocAlerts] = useState<DocumentAlertItem[]>([]);
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycDismissed, setKycDismissed] = useState(false);
  const [showAlreadyTakenModal, setShowAlreadyTakenModal] = useState(false);
  const [actionableError, setActionableError] = useState<{
    visible: boolean;
    errorType?: ErrorType;
    title: string;
    message: string;
    actionText?: string;
    actionRoute?: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });
  const [vehicleMismatch, setVehicleMismatch] = useState<{ visible: boolean; orderId: number; requiredCarType: string; reason?: string }>({
    visible: false,
    orderId: 0,
    requiredCarType: '',
  });
  const [pricingTypeFilter, setPricingTypeFilter] = useState<'ALL' | 'STANDARD' | 'ALL_INCLUSIVE' | 'DROP_BID'>('ALL');
  const [tripServiceFilter, setTripServiceFilter] = useState<'ALL' | 'ONEWAY' | 'MULTICITY' | 'ROUNDTRIP' | 'HOURLY_LOCAL'>('ALL');
  const [carTypeFilter, setCarTypeFilter] = useState<'ALL' | 'SEDAN' | 'SUV' | 'INNOVA' | 'HATCHBACK'>('ALL');
  const [dateQuickFilter, setDateQuickFilter] = useState<'ALL' | 'TODAY' | 'TOMORROW'>('ALL');
  const [showTrustedIntroModal, setShowTrustedIntroModal] = useState(false);

  useEffect(() => {
    const checkTrustedIntro = async () => {
      if (myTier !== 'STANDARD') return;
      if (loading || ordersLoading) return;
      try {
        const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const lastShown = await AsyncStorage.getItem('dropcars_trusted_intro_last_shown');
        if (lastShown !== todayIST) {
          setShowTrustedIntroModal(true);
          await AsyncStorage.setItem('dropcars_trusted_intro_last_shown', todayIST);
        }
      } catch (err) {
        console.error('Error checking trusted intro modal status:', err);
      }
    };
    checkTrustedIntro();
  }, [myTier, loading, ordersLoading]);

  const [, setVehicleUpdateTrigger] = useState(0);
  useEffect(() => {
    return vehicleRequestService.subscribe(() => {
      setVehicleUpdateTrigger((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    fetchDocumentStatuses()
      .then(async (statuses) => {
        let isEmailMissing = !(user as any)?.email;
        try {
          const loginDataStr = await SecureStore.getItemAsync('loginResponse');
          if (loginDataStr) {
            const loginData = JSON.parse(loginDataStr);
            if (loginData.email_missing === false || (loginData.email && loginData.email.includes('@'))) {
              isEmailMissing = false;
            } else if (loginData.email_missing === true) {
              isEmailMissing = true;
            }
          }
        } catch {}

        const summary = summarizeVerificationStatus(statuses);
        const alerts = getDetailedDocumentAlerts(statuses, isEmailMissing);
        setVerification(summary);
        setDocAlerts(alerts);
        if (alerts.length > 0 && !kycDismissed) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const lastShown = await SecureStore.getItemAsync('LAST_KYC_POPUP_DATE');
          if (lastShown !== todayStr) {
            setShowKycModal(true);
            await SecureStore.setItemAsync('LAST_KYC_POPUP_DATE', todayStr);
          }
        }
      })
      .catch(() => {});
  }, [kycDismissed, (user as any)?.email]);
  const [previousOrderCount, setPreviousOrderCount] = useState(0);
  // Vacant City (moved here from Settings so it's one tap from the dashboard).
  // Fetch/toggle/save logic now lives in the shared <VacantCityPicker />;
  // this screen just tracks the current list for the "Vacant (n)" badge.
  const [showVacantModal, setShowVacantModal] = useState(false);
  const [vacantCities, setVacantCities] = useState<string[]>([]);
  const [showStillWaitingModal, setShowStillWaitingModal] = useState(false);
  const [vacantCheckCity, setVacantCheckCity] = useState('');
  const [vacantDriverName, setVacantDriverName] = useState<string | undefined>(undefined);
  const [vacantCarNumber, setVacantCarNumber] = useState<string | undefined>(undefined);

  // Real-time WebSocket dispatch feed listener & TTS voice assistant alert
  useEffect(() => {
    const unsubscribe = bookingFeedService.subscribe((msg) => {
      if (msg.type === 'NEW_BOOKING') {
        refreshData();
        if (msg.payload) {
          ttsService.announceNewTrip({
            pickup: msg.payload.pickup || 'Pickup',
            drop: msg.payload.drop || 'Drop',
            totalFare: Number(msg.payload.estimated_price || 0),
            tripType: msg.payload.trip_type,
          });
        }
      }
    });
    // The live feed pauses while the app is in the background (saves server cost; push notifications cover new
    // bookings) - refresh the list once when the driver comes back to the app.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshData();
    });
    return () => { unsubscribe(); appStateSub.remove(); };
  }, []);

  // Check 12h vacant status confirmation on screen focus
  useFocusEffect(
    React.useCallback(() => {
      axiosInstance.get('/api/users/vehicle-owner/vacant-cities')
        .then((res) => {
          const data = res.data || {};
          setVacantCities(data.vacant_cities || []);
          setVacantDriverName(data.driver_name);
          setVacantCarNumber(data.car_number);
          if (data.needs_confirmation && data.vacant_cities && data.vacant_cities.length > 0) {
            setVacantCheckCity(data.vacant_cities[0]);
            setShowStillWaitingModal(true);
          }
        })
        .catch(() => {});
    }, [])
  );

  const handleConfirmStillWaiting = async () => {
    try {
      await axiosInstance.post('/api/users/vehicle-owner/vacant-cities/confirm');
    } catch {}
    setShowStillWaitingModal(false);
  };

  const handleUpdateVacantFromPrompt = () => {
    setShowStillWaitingModal(false);
    setShowVacantModal(true);
  };

  // Owner -> duty driver: auto-login when the owner's number is also a
  // registered driver; otherwise explain clearly (no flicker, no login loop).
  const [switchingToDriver, setSwitchingToDriver] = useState(false);
  const handleSwitchToDriver = async () => {
    if (switchingToDriver) return;
    setSwitchingToDriver(true);
    try {
      const { loginDriverAsOwner } = await import('@/services/driver/driverService');
      const res = await loginDriverAsOwner();
      await SecureStore.setItemAsync('lastActiveRole', 'driver').catch(() => {});
      await SecureStore.setItemAsync('driverLastLogin', Date.now().toString()).catch(() => {});
      if (res?.driver_status === 'PROCESSING') {
        router.push('/driver-verification');
      } else {
        router.push('/(tabs)/duty' as any);
      }
    } catch (e: any) {
      Alert.alert(
        'Driver Login',
        e?.message || 'Could not switch to driver mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login as Different Driver', onPress: () => router.push('/quick-login') },
        ]
      );
    } finally {
      setSwitchingToDriver(false);
    }
  };

  // Available Bookings filters
  const [availableTab, setAvailableTab] = useState<'all' | 'nearcity'>('all');
  // Trip-category pre-filter (Phase 06): Outstation hides Local bookings,
  // Local shows only them, All shows both. City targeting (selectedCities
  // above) already applies uniformly on top of whichever category is picked.
  const [tripCategoryTab, setTripCategoryTab] = useState<'OUTSTATION' | 'ALL' | 'LOCAL'>('ALL');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [showCityModal, setShowCityModal] = useState(false);
  const [selectAllCities, setSelectAllCities] = useState(false);
  const [fromCityFilter, setFromCityFilter] = useState('');
  const [toCityFilter, setToCityFilter] = useState('');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showCarDropdownFilter, setShowCarDropdownFilter] = useState(false);
  const [showPricingDropdownFilter, setShowPricingDropdownFilter] = useState(false);
  const [showTripServiceDropdownFilter, setShowTripServiceDropdownFilter] = useState(false);
  const [showRouteRequestModal, setShowRouteRequestModal] = useState(false);
  const [activeRouteRequest, setActiveRouteRequest] = useState<RouteRequestData | null>(null);
  const [showHudAlert, setShowHudAlert] = useState(false);
  const [matchingHudOrder, setMatchingHudOrder] = useState<any>(null);

  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ fromDate: null, toDate: null });

  const CITY_STORAGE_KEY = 'vo_nearcity_selected_cities';
  
  // Track if we've initialized from server to prevent duplicate API calls
  const hasInitializedCities = React.useRef(false);

  // Tap-through target from the floating "New Booking" bubble overlay (see
  // app/bubble-tap.tsx and contexts/BubbleContext.tsx). When present, this
  // screen scrolls to and briefly highlights the matching pending order -
  // this IS the "accept view" for a not-yet-accepted booking.
  const { focusBookingId, tab: searchTab, subTab: searchSubTab } = useLocalSearchParams<{ focusBookingId?: string; tab?: string; subTab?: string }>();
  const dashboardScrollRef = React.useRef<ScrollView>(null);
  const bookingCardOffsets = React.useRef<Record<string, number>>({});
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (searchTab === 'new_bookings') {
      setHomeMainTab('new_bookings');
    } else if (searchTab === 'upcoming') {
      setHomeMainTab('upcoming');
      if (searchSubTab === 'assigned' || searchSubTab === 'unassigned') {
        setUpcomingSubTab(searchSubTab);
      }
    } else if (searchTab === 'running') {
      setHomeMainTab('running');
    }
  }, [searchTab, searchSubTab]);

  useEffect(() => {
    if (focusBookingId) {
      setHomeMainTab('new_bookings');
      setHighlightedBookingId(String(focusBookingId));
      const scrollTimer = setTimeout(() => {
        const targetY = bookingCardOffsets.current[String(focusBookingId)];
        if (targetY != null && dashboardScrollRef.current) {
          dashboardScrollRef.current.scrollTo({ y: Math.max(0, targetY - 40), animated: true });
        }
      }, 400);
      const clearTimer = setTimeout(() => setHighlightedBookingId(null), 6000);
      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [focusBookingId, pendingOrders]);

  // Master list of cities - Sorted Alphabetically (A-Z) & Deduplicated
  const MASTER_CITIES: string[] = React.useMemo(() => {
    const rawList = [
      'Acharapakkam', 'Ambur', 'Ambattur', 'Anjugramam', 'Annur', 'Anthiyur', 'Arakkonam', 'Arantangi', 'Arcot', 'Ariyalur', 'Avadi', 'Avudayarkoil',
      'Batlagundu', 'Bhavani', 'Bhuvanagiri',
      'Chengalpattu', 'Chennai', 'Chidambaram', 'Chinnasalem', 'Coimbatore', 'Colachel', 'Cuddalore',
      'Devakottai', 'Dharmapuri', 'Dharapuram', 'Dindigul',
      'Erode',
      'Gandarvakkottai', 'Gingee', 'Gobichettipalayam',
      'Harur', 'Hosur',
      'Jayankondam', 'Jolarpettai',
      'Kallakurichi', 'Kallikudi', 'Kallupatti', 'Kamuthi', 'Kanchipuram', 'Kanyakumari', 'Karaikudi', 'Karamadai', 'Karimangalam', 'Katpadi', 'Kattumannarkoil', 'Kodaikanal', 'Kottur', 'Kovilpatti', 'Krishnagiri', 'Kumbakonam', 'Kunnam', 'Kurinjipadi', 'Kuzhithurai',
      'Lalgudi',
      'Madurai', 'Madurantakam', 'Mallankinaru', 'Mamallapuram', 'Manachanallur', 'Manamadurai', 'Manapparai', 'Mannargudi', 'Mayiladuthurai', 'Melur', 'Mettupalayam', 'Mettur', 'Mohanur', 'Mudukulathur', 'Mylapore',
      'Nagalapuram', 'Nagapattinam', 'Nagercoil', 'Namakkal', 'Natham', 'Needamangalam', 'Nellikuppam', 'Neyveli', 'Nilakkottai',
      'Oddanchatram', 'Ooty', 'Orathanadu',
      'Padmanabhapuram', 'Palacode', 'Palani', 'Pallavaram', 'Panruti', 'Papanasam', 'Paramakudi', 'Parangipettai', 'Pattukkottai', 'Pennagaram', 'Peravurani', 'Pernampattu', 'Perundurai', 'Pollachi', 'Pondicherry', 'Poonamallee', 'Pudukkottai', 'Puliyankudi',
      'Rajapalayam', 'Ramanathapuram', 'Rameswaram', 'Ranipet', 'Rasipuram',
      'Salem', 'Sankarankovil', 'Sankarapuram', 'Sathyamangalam', 'Sedapatti', 'Sendamangalam', 'Sengottai', 'Sholingur', 'Sirkazhi', 'Sivaganga', 'Sivakasi', 'Sriperumbudur', 'Sulur', 'Swamimalai',
      'Tambaram', 'Tenkasi', 'Thanjavur', 'Thiagadurgam', 'Thiruthuraipoondi', 'Thiruvaiyaru', 'Thoothukudi', 'Thuraiyur', 'Thuvakudi', 'Tindivanam', 'Tiruchengode', 'Tirukalukundram', 'Tiruchirappalli', 'Tirunelveli', 'Tirupattur', 'Tiruppur', 'Tiruvadanai', 'Tiruvallur', 'Tiruvannamalai',
      'Udhagamandalam', 'Udumalaipettai', 'Udayarpalayam', 'Ulundurpettai', 'Usilampatti', 'Uthiramerur',
      'Vadalur', 'Vadipatti', 'Valparai', 'Vallam', 'Vaniyambadi', 'Varadarajanpettai', 'Vedaranyam', 'Vedasandur', 'Vellore', 'Veppur', 'Vikravandi', 'Villupuram', 'Virudhachalam',
      'Walajabad',
      'Yercaud'
    ];
    return Array.from(new Set(rawList)).sort((a, b) => a.localeCompare(b));
  }, []);

  // State to track accepted orders without driver/car assigned
  const [acceptedOrdersWithoutAssignment, setAcceptedOrdersWithoutAssignment] = useState<any[]>([]);
  const MAX_ACCEPTED_ORDERS = 3;
  
  // Get current wallet balance
  const currentWallet = Number(dashboardData?.user_info?.wallet_balance ?? balance ?? 0);
  
  // Fetch active rides and count accepted orders without driver/car assigned
  const fetchActiveRidesData = async () => {
    try {
      setActiveRidesLoading(true);
      const authHeaders = await getAuthHeaders();
      const axiosDriverModule = (await import('@/app/api/axiosDriver')).default;
      const [response, driverAssignedRes] = await Promise.all([
        axiosInstance.get('/api/orders/vehicle-owner/pending', { headers: authHeaders }).catch(() => ({ data: [] })),
        axiosDriverModule.get('/api/assignments/driver/assigned-orders').catch(() => ({ data: [] })),
      ]);
      
      const orders: ActiveRide[] = Array.isArray(response.data) ? [...response.data] : [];
      const driverAssignedArray = Array.isArray(driverAssignedRes.data) ? driverAssignedRes.data : [];

      for (const dOrd of driverAssignedArray) {
        const exists = orders.some(
          (r: any) => r.id === dOrd.id || r.source_order_id === dOrd.source_order_id || r.id === dOrd.order_id
        );
        if (!exists) {
          orders.push({
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
            trip_status: dOrd.trip_status || 'ACCEPTED',
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

      setActiveRides(orders);
      
      // Filter to count orders without both driver AND car assigned
      const ordersWithoutAssignment = orders.filter((order: any) => {
        const hasDriver = !!(order.assigned_driver_name && order.assigned_driver_name !== 'Assigned Driver' || order.driver_id);
        const hasCar = !!(order.assigned_car_name && order.assigned_car_name !== 'Assigned Vehicle' || order.car_id);
        const isAssigned = (order.assignment_status === 'ASSIGNED' || order.assignment_status === 'DRIVING') && hasDriver && hasCar;
        return !isAssigned;
      });
      
      setAcceptedOrdersWithoutAssignment(ordersWithoutAssignment);
      console.log('📊 Active rides loaded:', orders.length, 'Without assignment:', ordersWithoutAssignment.length);
    } catch (error: any) {
      console.error('❌ Failed to fetch active rides:', error);
      setActiveRides([]);
      setAcceptedOrdersWithoutAssignment([]);
    } finally {
      setActiveRidesLoading(false);
    }
  };

  const fetchAcceptedOrdersCount = fetchActiveRidesData;

  const fetchAvailableAssignments = async () => {
    try {
      setAssignmentsLoading(true);
      const driversResponse = await fetchAvailableDrivers();
      let carsResponse: AvailableCar[] = [];
      try {
        const carsApi = await axiosInstance.get('/api/assignments/available-cars', { noCache: true } as any);
        if (carsApi?.data && Array.isArray(carsApi.data)) {
          carsResponse = carsApi.data as AvailableCar[];
        }
      } catch {
        carsResponse = [];
      }
      setAvailableDrivers(driversResponse || []);
      setAvailableCars(carsResponse || []);
    } catch (error: any) {
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

      // Auto-switch sub-tab to assigned!
      setUpcomingSubTab('assigned');
      await fetchActiveRidesData();

      Alert.alert('Success', 'Driver and car assigned successfully!');
      setShowVehicleModal(false);
      setSelectedRide(null);
      setSelectedDriver(null);
    } catch (error: any) {
      // detail can be a structured object (VEHICLE_TYPE_MISMATCH - see
      // backend's assign_car_driver) instead of a string - Alert.alert
      // needs a real string either way.
      const rawDetail = error?.response?.data?.detail;
      const errorMsg = (rawDetail && typeof rawDetail === 'object' ? rawDetail.message : rawDetail) || error.message || 'Failed to assign driver and car';
      Alert.alert('Assignment Error', errorMsg);
    } finally {
      setAssignmentsLoading(false);
    }
  };
  
  // Count accepted orders without both driver and car assigned
  const acceptedOrdersCount = acceptedOrdersWithoutAssignment.length;
  
  // Calculate total reserved amount from all accepted orders (frozen amounts, min ₹500 per booking)
  const totalReservedAmount = acceptedOrdersWithoutAssignment.reduce((sum, order) => {
    const charges = Number((order as any).charges_to_deduct ?? 0);
    return sum + Math.max(500, charges);
  }, 0);
  
  // Calculate available balance (current wallet minus all frozen amounts)
  const availableForNewOrder = currentWallet - totalReservedAmount;
  
  // Determine button status for an order
  const getOrderButtonStatus = (order: PendingOrder): { disabled: boolean; buttonText: string; priorityBlockedUntil?: string | null; amountNeeded?: number } => {
    // Check if order was already taken by another partner within last 5 minutes
    if ((order as any).is_accepted_by_other || (order as any).trip_status === 'ACCEPTED_BY_OTHER') {
      return {
        disabled: true,
        buttonText: 'Accepted by another partner',
      };
    }

    // Check if order limit reached (3 orders already accepted)
    if (acceptedOrdersCount >= MAX_ACCEPTED_ORDERS) {
      return {
        disabled: true,
        buttonText: 'Max 3 Bookings Reached'
      };
    }

    const chargesToDeduct = Number((order as any).charges_to_deduct ?? 0);
    const amountToCheck = Math.max(500, chargesToDeduct);
    const amountNeeded = availableForNewOrder < amountToCheck ? Math.ceil(amountToCheck - availableForNewOrder) : 0;

    // Priority window - Preferred Partners only until the vendor's chosen cutoff.
    const priorityForPaid = (order as any).priority_for_paid;
    const priorityCutoffAt = (order as any).priority_cutoff_at;
    if (myTier !== 'PREFERRED' && priorityForPaid && priorityCutoffAt && new Date(priorityCutoffAt).getTime() > Date.now()) {
      return {
        disabled: true,
        buttonText: 'Only for Trusted Partners',
        priorityBlockedUntil: priorityCutoffAt,
        amountNeeded: amountNeeded > 0 ? amountNeeded : undefined,
      };
    }

    // Vehicle check: if the fleet owner has cars registered but none match this booking's car type,
    // do not ask them to recharge wallet! Direct them to view vehicle options (Add Car / Request with My Car).
    // Unless the vehicle request has already been approved by the vendor!
    const isVehicleApproved = vehicleRequestService.getRequest(order.order_id)?.status === 'APPROVED';
    const myFleetCars = (dashboardData?.cars as any[]) || [];
    if (!isVehicleApproved && myFleetCars.length > 0 && order.car_type) {
      const hasCar = myFleetCars.some((c: any) => carTypeSatisfies(c.car_type, order.car_type));
      if (!hasCar) {
        const typeLabel = String(order.car_type || '').replace(/_/g, ' ');
        return {
          disabled: false,
          buttonText: `Needs ${typeLabel} • View Options`,
        };
      }
    }

    // Check if available balance (after frozen amounts) is sufficient
    if (availableForNewOrder >= amountToCheck) {
      return {
        disabled: false,
        buttonText: 'Accept Booking'
      };
    } else {
      return {
        disabled: true,
        buttonText: `Add ₹${Math.ceil(amountNeeded)} to Accept the Booking`,
        amountNeeded: amountNeeded,
      };
    }
  };
  
  // Legacy function for backward compatibility (used in handleAcceptBooking)
  const canAcceptOrder = (order: PendingOrder) => {
    const status = getOrderButtonStatus(order);
    return !status.disabled;
  };

  // Helper function to extract pickup and drop locations from the API response
  const getPickupDropLocations = (pickupDropLocation: any) => {
    if (!pickupDropLocation) return { pickup: 'Unknown', drop: '' };
    if (typeof pickupDropLocation === 'object') {
      // Numeric-key shape
      const has0 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '0');
      const has1 = Object.prototype.hasOwnProperty.call(pickupDropLocation, '1');
      if (has0 && has1) {
        return { pickup: String(pickupDropLocation['0'] || 'Unknown'), drop: String(pickupDropLocation['1'] || '') };
      }
      if (has0) {
        return { pickup: String(pickupDropLocation['0'] || 'Unknown'), drop: '' };
      }
      // Named-key shape
      if (pickupDropLocation.pickup || pickupDropLocation.drop) {
        return { pickup: String(pickupDropLocation.pickup || 'Unknown'), drop: String(pickupDropLocation.drop || '') };
      }
    }
    return { pickup: 'Unknown', drop: '' };
  };

  // Debug logging
  useEffect(() => {
    console.log('🔍 DashboardScreen mounted with:', {
      user: user ? { id: user.id, fullName: user.fullName, primaryMobile: user.primaryMobile } : null,
      dashboardData: dashboardData ? {
        user_info: dashboardData.user_info,
        carCount: dashboardData.cars?.length || 0,
        driverCount: dashboardData.drivers?.length || 0
      } : null,
      loading,
      error,
      pendingOrders: pendingOrders.length
    });
  }, [user, dashboardData, loading, error, pendingOrders]);

  // Refresh accepted orders count when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        fetchAcceptedOrdersCount();
      }
    }, [user])
  );

  // Auto-load data when user is available after login
  useEffect(() => {
    if (user && !loading && !dashboardData) {
      console.log('🔄 User available, auto-loading dashboard data...');
      fetchData();
      fetchPendingOrdersData();
      fetchAcceptedOrdersCount();
    }
  }, [user, loading, dashboardData]);

  // Also load data when user changes (login/logout)
  useEffect(() => {
    if (user) {
      console.log('👤 User changed, refreshing dashboard data...');
      fetchData();
      fetchPendingOrdersData();
      fetchAcceptedOrdersCount();
      
      // Automatically send notification token on login (same as toggle ON)
      const sendNotificationTokenOnLogin = async () => {
        try {
          console.log('📱 Sending notification token on login...');
          await updateNotificationSettings({ 
            permission1: true, 
            permission2: true
          });
          console.log('✅ Notification token sent successfully on login');
        } catch (error) {
          console.warn('⚠️ Failed to send notification token on login:', error);
          // Don't block login if notification token sending fails
        }
      };
      
      sendNotificationTokenOnLogin();
    }
  }, [user?.id]); // Only trigger when user ID changes (login/logout)


  // Check for new orders and send notifications
  useEffect(() => {
    if (pendingOrders.length > 0 && previousOrderCount === 0) {
      // First time loading orders, just update count
      setPreviousOrderCount(pendingOrders.length);
    } else if (pendingOrders.length > previousOrderCount && previousOrderCount > 0) {
      // New orders received
          // New orders detected - notifications removed
      setPreviousOrderCount(pendingOrders.length);
    } else if (pendingOrders.length !== previousOrderCount) {
      // Update count if it changed
      setPreviousOrderCount(pendingOrders.length);
    }
  }, [pendingOrders, previousOrderCount]);

  const fetchPendingOrdersData = async () => {
    try {
      setOrdersLoading(true);
      console.log('📋 Fetching pending orders for dashboard...');
      
      const orders = await getPendingOrders();
      console.log('✅ Pending orders loaded:', orders.length);
      
      setPendingOrders(orders);
    } catch (error: any) {
      console.error('❌ Failed to fetch pending orders:', error);
      
      // Check if it's an authentication error
      if (error?.message?.includes('Authentication failed') || 
          error?.message?.includes('Please login again') ||
          error?.response?.status === 401) {
        const driverToken = await SecureStore.getItemAsync('driverAuthToken');
        const ownerToken = await SecureStore.getItemAsync('authToken');
        if (driverToken && !ownerToken) {
          console.log('📱 Duty driver session detected on owner screen, redirecting to quick-dashboard');
          router.replace('/quick-dashboard');
          return;
        }
        console.log('🔐 Authentication error detected, forcing logout...');
        try {
          // Clear dashboard data
          refreshData();
          // Logout and redirect
          await logout();
          router.replace('/login');
        } catch (logoutError) {
          console.error('❌ Error during forced logout:', logoutError);
          // Even if logout fails, redirect to login
          router.replace('/login');
        }
        return;
      }
      // Don't show error alert for other errors, just log it
    } finally {
      setOrdersLoading(false);
    }
  };

  // nearcity city list derived from pending orders (exclude 'ALL')
  const nearcityOptions = Array.from(
    new Set([
      ...MASTER_CITIES,
      ...pendingOrders
        .map(o => ((o.pick_near_city || o.near_city || '').trim()))
        .filter(city => city && city.toUpperCase() !== 'ALL')
    ])
  ).sort();

  // Replace SecureStore persistence with API fetching and updating
  useEffect(() => {
    // On mount/first render, fetch selected cities from server
    (async () => {
      try {
        // Only fetch if user is present (check user?.id)
        if (!user) return;
        const headers = await getAuthHeaders();
        const res = await axiosInstance.get('/api/cities/vehicle-owner/selected', { headers });
        const data = res.data;
        // The API returns: { "Chennai": true, "Vellore": true, ... }
        if (data && typeof data === 'object') {
          const cities = Object.entries(data)
            .filter(([_, v]: [any, any]) => v)
            .map(([city]) => city)
            .filter(city => MASTER_CITIES.includes(city)); // Only include cities that are in MASTER_CITIES
          setSelectedCities(cities);
          // Check if all cities are selected (all MASTER_CITIES are in the response)
          const allCitiesSelected = MASTER_CITIES.every(city => {
            const cityValue = data[city];
            return cityValue === true;
          });
          setSelectAllCities(allCitiesSelected);
          // If no cities selected and "All" is not selected, default to "All"
          if (!allCitiesSelected && cities.length === 0) {
            setSelectAllCities(true);
          }
          hasInitializedCities.current = true;
        } else {
          // If no data from server, default to "All"
          setSelectAllCities(true);
          setSelectedCities([]);
          hasInitializedCities.current = true;
        }
      } catch (e) {
        // On error, default to "All"
        setSelectAllCities(true);
        setSelectedCities([]);
        hasInitializedCities.current = true; // Still mark as initialized to allow manual selection
      }
    })();
  }, [user?.id]);

  // When city selection changes, send it to backend
  useEffect(() => {
    (async () => {
      try {
        if (!user) return;
        // Don't send updates until we've initialized from server
        if (!hasInitializedCities.current) {
          console.log('⚠️ Cities not yet initialized, skipping API call');
          return;
        }

        // Never fire without a live owner token (this used to run on the
        // login screen with a stale/driver token and pop error alerts).
        const ownerToken = await SecureStore.getItemAsync('authToken');
        if (!ownerToken) {
          console.log('⚠️ No owner token, skipping city selection sync');
          return;
        }

        const headers = await getAuthHeaders();
        // Prepare cities array: if "All" is selected, use all MASTER_CITIES, otherwise use selectedCities
        // Filter to only include cities that are in MASTER_CITIES to avoid sending invalid cities
        const citiesToSend = selectAllCities 
          ? MASTER_CITIES 
          : (selectedCities || []).filter(city => MASTER_CITIES.includes(city));
        
        // Always send the array, even if empty (when "All" is unchecked or no cities selected)
        // POST with correct format: array directly (not wrapped in object)
        await axiosInstance.post('/api/cities/vehicle-owner/selected', citiesToSend, {
          headers,
        });
        
        console.log('✅ City selection updated:', { selectAllCities, citiesCount: citiesToSend.length, citiesToSend });
      } catch (e: any) {
        // Background sync - log only. Popping an alert here interrupted
        // users on the LOGIN screen when a stale session fired this effect.
        console.error('❌ Failed to update city selection:', e);
        console.error('❌ Request payload:', { selectAllCities, selectedCities });
        if (e.response?.data) {
          console.error('❌ Error response:', e.response.data);
        }
      }
    })();
  }, [JSON.stringify(selectedCities), selectAllCities, user?.id]);

  // Update toggleCitySelection to just update state (effect syncs to API)
  const toggleCitySelection = (city: string) => {
    setSelectedCities(prev => {
      const exists = prev.includes(city);
      if (exists) {
        return prev.filter(c => c !== city);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, city];
    });
  };

  const isTripTypenearcity = (t: any) => {
    const val = String(t || '').toLowerCase();
    return val.includes('multi'); // handles 'Multy City', 'nearcity', etc.
  };

  const getNearCity = (o: PendingOrder) => (o.pick_near_city || o.near_city || '').toUpperCase();
  const isNearCityMode = (o: PendingOrder) => String((o as any).send_to || '').toUpperCase() === 'NEAR_CITY';
  const hasCityTarget = (o: PendingOrder) => {
    const city = getNearCity(o);
    return city !== '' && city !== 'ALL';
  };

  // Bookings filter: above bookings list, show the selected cities as chips similar to above.
  {availableTab === 'nearcity' && selectedCities.length > 0 && (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 10, marginTop: 4 }}>
      {selectedCities.map(city => (
        <View key={city} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '22', borderRadius: 10, marginRight: 8, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ color: colors.primary, marginRight: 4 }}>{String(city || '')}</Text>
          <TouchableOpacity onPress={() => {
            // If trying to remove the last city, default back to "All"
            if (selectedCities.length === 1) {
              setSelectAllCities(true);
              setSelectedCities([]);
            } else {
              setSelectedCities(selectedCities.filter(x => x !== city));
            }
          }}>
            <Text style={{ color: colors.error, fontWeight: '700', fontSize: 15 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )}

  // Enhanced debug version of parse/filter logic:
  const debugOrderMatch: Array<{order_id:number, pick_near_city:any, pickCitiesArr:string[], selectedCities:string[], didMatch:boolean}> = [];
  const filteredOrders: PendingOrder[] = (() => {
    if (!pendingOrders) return [];
    const byCategory = pendingOrders.filter(o => {
      const type = String(o.trip_type || '').toLowerCase();
      const sendTo = String((o as any).send_to || '').toUpperCase();
      const isAllInclusive = (o as any).fare_type === 'ALL_INCLUSIVE';

      // 1. Pricing / Allocation Filter: Standard, All Inclusive, Drop Bid
      const isBidBooking = sendTo === 'BID' || Boolean((o as any).is_bid);
      if (pricingTypeFilter === 'STANDARD') {
        if (isAllInclusive || isBidBooking) return false;
      } else if (pricingTypeFilter === 'ALL_INCLUSIVE') {
        if (!isAllInclusive || isBidBooking) return false;
      } else if (pricingTypeFilter === 'DROP_BID') {
        if (!isBidBooking) return false;
      }

      // 2. Service Category Filter: One Way, Multi-City (One Way), Round Trip, Hourly / Local
      if (tripServiceFilter === 'ONEWAY') {
        if ((!type.includes('one') && !type.includes('drop')) || type.includes('multi') || type.includes('round')) return false;
      } else if (tripServiceFilter === 'MULTICITY') {
        if ((!type.includes('multi') && !(o.pickup_drop_location && String(o.pickup_drop_location).includes('|'))) || type.includes('round')) return false;
      } else if (tripServiceFilter === 'ROUNDTRIP') {
        if (!type.includes('round') && !type.includes('two')) return false;
      } else if (tripServiceFilter === 'HOURLY_LOCAL') {
        if (!type.includes('local') && !type.includes('hourly') && !type.includes('package')) return false;
      }

      // 3. Car Category Filter
      if (carTypeFilter !== 'ALL') {
        const car = String(o.car_type || '').toLowerCase();
        if (carTypeFilter === 'SEDAN' && !car.includes('sedan')) return false;
        if (carTypeFilter === 'SUV' && (!car.includes('suv') && !car.includes('muv') && !car.includes('xuv'))) return false;
        if (carTypeFilter === 'INNOVA' && (!car.includes('innova') && !car.includes('crysta') && !car.includes('hycross'))) return false;
        if (carTypeFilter === 'HATCHBACK' && (!car.includes('hatchback') && !car.includes('mini') && !car.includes('swift'))) return false;
      }

      // 4. Date Quick Filter
      if (dateQuickFilter !== 'ALL' && o.start_date_time) {
        try {
          const orderDateStr = new Date(o.start_date_time).toISOString().slice(0, 10);
          const todayStr = new Date().toISOString().slice(0, 10);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().slice(0, 10);

          if (dateQuickFilter === 'TODAY' && orderDateStr !== todayStr) return false;
          if (dateQuickFilter === 'TOMORROW' && orderDateStr !== tomorrowStr) return false;
        } catch {}
      }

      return true;
    });
    // Default to "All" if neither 'All' nor any specific city is selected (should not happen, but safety check)
    if (!selectAllCities && selectedCities.length === 0) {
      return byCategory;
    }
    let orders = byCategory.filter(o => {
      const pickCitiesArr = parseCityListField(o.pick_near_city ? String(o.pick_near_city) : '');
      const isAll = pickCitiesArr.some(city => city.trim().toUpperCase() === 'ALL');
      let didMatch = false;
      
      // If "All" is selected in the city selector, show all orders
      if (selectAllCities) {
        didMatch = true;
      } 
      // If order has "ALL" in pick_near_city, always show it
      else if (isAll) {
        didMatch = true;
      } 
      // If specific cities are selected, check if order matches
      else if (selectedCities.length > 0) {
        didMatch = selectedCities.some(sel =>
          pickCitiesArr.some(pick => pick.trim().toLowerCase() === sel.trim().toLowerCase())
        );
      }
      // If no cities selected (handled above), keep as false
      else {
        didMatch = false;
      }
      
      debugOrderMatch.push({
        order_id: Number(o.order_id),
        pick_near_city: o.pick_near_city,
        pickCitiesArr,
        selectedCities: [...selectedCities],
        didMatch
      });
      return didMatch;
    });
    if (bookingSearch.trim()) {
      const searchTerm = bookingSearch.toLowerCase().trim();
      orders = orders.filter(o => {
        const locations = getPickupDropLocations(o.pickup_drop_location);
        return [
          String(o.order_id),
          locations.pickup,
          locations.drop
        ].some(field => field && String(field).toLowerCase().includes(searchTerm));
      });
    }

    if (fromCityFilter.trim()) {
      const fromTerm = fromCityFilter.toLowerCase().trim();
      orders = orders.filter(o => {
        const locations = getPickupDropLocations(o.pickup_drop_location);
        return locations.pickup.toLowerCase().includes(fromTerm) || (o.pick_near_city && o.pick_near_city.toLowerCase().includes(fromTerm));
      });
    }

    if (toCityFilter.trim()) {
      const toTerm = toCityFilter.toLowerCase().trim();
      orders = orders.filter(o => {
        const locations = getPickupDropLocations(o.pickup_drop_location);
        return locations.drop.toLowerCase().includes(toTerm);
      });
    }

    if (dateRange.fromDate) {
      orders = orders.filter(o => {
        if (!o.start_date_time) return false;
        const dStr = o.start_date_time.split('T')[0] || o.start_date_time.split(' ')[0];
        const fromStr = dateRange.fromDate!;
        const toStr = dateRange.toDate || dateRange.fromDate!;
        return dStr >= fromStr && dStr <= toStr;
      });
    }

    // Hide past pickup-date orders (show today + future first)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    orders = orders.filter(o => {
      if (!o.start_date_time) return true;
      const d = new Date(o.start_date_time);
      if (isNaN(d.getTime())) return true;
      return d.getTime() >= todayStart.getTime();
    });

    // Sort so that:
    // 1) Earlier pickup date/time comes first
    // 2) For same pickup time, shorter trip duration comes first
    orders.sort((a, b) => {
      const timeA = a.start_date_time ? new Date(a.start_date_time).getTime() : 0;
      const timeB = b.start_date_time ? new Date(b.start_date_time).getTime() : 0;

      if (timeA !== timeB) {
        return timeA - timeB; // earlier pickups first
      }

      const durA = parseTripDurationToMinutes((a as any).trip_time);
      const durB = parseTripDurationToMinutes((b as any).trip_time);

      if (durA !== durB) {
        return durA - durB; // shorter trips first
      }

      // Stable fallback: lower order_id first
      return Number(a.order_id) - Number(b.order_id);
    });

    return orders;
  })();

  // Scroll to and briefly highlight the booking the driver tapped via the
  // floating bubble overlay, once its card has actually been laid out.
  useEffect(() => {
    if (!focusBookingId) return;
    const id = String(focusBookingId);
    setHighlightedBookingId(id);
    const raf = requestAnimationFrame(() => {
      const offset = bookingCardOffsets.current[id];
      if (offset != null) {
        dashboardScrollRef.current?.scrollTo({ y: Math.max(offset - 80, 0), animated: true });
      }
    });
    const clearTimer = setTimeout(() => setHighlightedBookingId(null), 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clearTimer);
    };
  }, [focusBookingId, filteredOrders.length]);

  // Tab counts
  const allTabCount = pendingOrders.filter(o => {
    const isMulti = isTripTypenearcity(o.trip_type) || isNearCityMode(o) || hasCityTarget(o);
    const pickCity = getNearCity(o);
    if (isMulti && pickCity !== 'ALL') return false;
    return true;
  }).length;
  
  // nearcity count should only show selected cities
  const multiTabCount = (() => {
    if (selectedCities.length === 0) return 0;
    const onlynearcity = pendingOrders.filter(o => isTripTypenearcity(o.trip_type) || isNearCityMode(o) || hasCityTarget(o));
    const setSel = new Set(selectedCities.map(c => c.toUpperCase()));
    return onlynearcity.filter(o => setSel.has(getNearCity(o))).length;
  })();

  // Active rides filtering for Upcoming & Running tabs
  const runningRides = activeRides.filter((r) => isEffectivelyRunning(r));
  const upcomingUnassignedRides = activeRides.filter((r) => {
    if (isEffectivelyRunning(r)) return false;
    const hasDriver = !!(r.assigned_driver_name && r.assigned_driver_name !== 'Assigned Driver');
    const hasCar = !!(r.assigned_car_name && r.assigned_car_name !== 'Assigned Vehicle');
    const isAssigned = (r.assignment_status === 'ASSIGNED' || r.assignment_status === 'DRIVING') && hasDriver && hasCar;
    return !isAssigned;
  });
  const upcomingAssignedRides = activeRides.filter((r) => {
    if (isEffectivelyRunning(r)) return false;
    const hasDriver = !!(r.assigned_driver_name && r.assigned_driver_name !== 'Assigned Driver');
    const hasCar = !!(r.assigned_car_name && r.assigned_car_name !== 'Assigned Vehicle');
    const isAssigned = (r.assignment_status === 'ASSIGNED' || r.assignment_status === 'DRIVING') && hasDriver && hasCar;
    return isAssigned;
  });
  const totalUpcomingCount = upcomingUnassignedRides.length + upcomingAssignedRides.length;

  useEffect(() => {
    if (homeMainTab === 'upcoming' && upcomingUnassignedRides.length === 0 && upcomingAssignedRides.length > 0 && !searchSubTab) {
      setUpcomingSubTab('assigned');
    }
  }, [homeMainTab, upcomingUnassignedRides.length, upcomingAssignedRides.length, searchSubTab]);

  const getAssignmentRemaining = (ride: ActiveRide): string => formatAssignmentRemaining(ride as any, "Assignment window expired");

  const renderRideCard = (ride: ActiveRide) => {
    const { pickup, drop } = getPickupDropLocations(ride.pickup_drop_location);
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

    const fareData = (ride as any);
    const advanceReceived = Number(fareData.advance_received) || 0;
    const totalFareAmount = Number(ride.vendor_price || ride.estimated_price || 0);

    const cleanCarType = (raw: string | null | undefined): string => {
      if (!raw) return 'Sedan';
      let s = String(raw).trim();
      if (s.toUpperCase().includes('NEW_SEDAN_2022_MODEL') || s.toUpperCase().includes('NEW SEDAN 2022 MODEL')) {
        return 'Prime Sedan';
      }
      s = s.replace(/_/g, ' ');
      s = s.replace(/\s*\b\d{4}\s*MODEL\b/gi, '');
      return s.trim() || 'Sedan';
    };

    const vendorName = ride.vendor_name || (ride as any).business_name || 'Drop Cars';
    const hasSpecialRequirement = String(ride.car_type || '').toUpperCase().includes('2022') || (ride as any).carrier_required || (ride as any).car_make_year_requirement || (ride as any).non_cng || (ride as any).pet_friendly;

    return (
      <TouchableOpacity
        key={ride.id}
        activeOpacity={0.95}
        onPress={() => {
          setSelectedBookingForDetail(ride);
          setShowDetailModal(true);
        }}
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14.5, fontFamily: 'Inter-Bold', color: colors.text }}>
              Booking ID: #{formatBookingId((ride as any).order_id || ride.id)}
            </Text>
          </View>

          {ride.trip_type && (
            <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>
                {ride.trip_type}
              </Text>
            </View>
          )}
        </View>

        {/* Vendor / Business Name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: colors.textSecondary }}>
            Vendor / Business: <Text style={{ color: colors.text, fontFamily: 'Inter-Bold' }}>{vendorName}</Text>
          </Text>
          {hasSpecialRequirement && (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: '#EF4444' }}>Special Request</Text>
            </View>
          )}
        </View>

        {/* Fare Type Label: Standard vs All Inclusive */}
        <View style={{ marginBottom: 6 }}>
          {isAllInclusive ? (
            <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
              <Sparkles size={12} color="#D97706" />
              <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '800' }}>
                ✨ All Inclusive
              </Text>
            </View>
          ) : null}
        </View>

        {homeMainTab === 'upcoming' && upcomingSubTab === 'unassigned' && remaining !== '' && !ride.assigned_driver_name && !ride.assigned_car_name && (
          <View style={{ backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#D97706', textAlign: 'center' }}>
              {remaining === 'Assignment window expired' ? 'Assignment window expired' : `Assign driver & car in ${remaining}`}
            </Text>
          </View>
        )}

        {/* Route Box */}
        <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 6, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MapPin color="#10B981" size={14} />
            <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: '#10B981', flex: 1 }} numberOfLines={1}>From: {pickup}</Text>
          </View>
          {!isHourly && !!drop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <MapPin color="#EF4444" size={14} />
              <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: '#EF4444', flex: 1 }} numberOfLines={1}>To: {drop}</Text>
            </View>
          )}
        </View>

        {/* Key details */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
          <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} color={colors.primary} />
            <Text style={{ flexShrink: 1, fontSize: 11.5, fontFamily: 'Inter-Medium', color: colors.text }}>
              {pickupDate && pickupTime ? `${pickupDate} at ${pickupTime}` : (ride.start_date_time || 'N/A')}
            </Text>
          </View>
          {ride.car_type && (
            <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Car size={12} color={colors.textSecondary} />
              <Text style={{ flexShrink: 1, fontSize: 11.5, fontFamily: 'Inter-Bold', color: colors.text }}>
                {cleanCarType(ride.car_type)}
              </Text>
            </View>
          )}
        </View>

        {/* KM & Hours Limit */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
          <Text style={{ marginRight: 8, fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.textSecondary }}>KM & Hours Limit:</Text>
          <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#10B981' }}>
            {formatKmLimitAndHours(ride.trip_distance, ride.trip_time).combined}
          </Text>
        </View>

        {/* Total Amount */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Total Amount</Text>
          <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: '#10B981' }}>₹{totalFareAmount}</Text>
        </View>

        {/* Driver / Cab Assignment & Action */}
        {homeMainTab === 'running' ? (
          <View style={{ backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : '#FEE2E2', borderRadius: 6, padding: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#EF4444', marginBottom: 2 }}>🔒 Trip Running</Text>
            <Text style={{ fontSize: 11.5, color: colors.text }}>Assigned: {ride.assigned_driver_name || 'Duty Driver'} {ride.assigned_driver_phone ? `(${ride.assigned_driver_phone})` : ''}</Text>
            {ride.assigned_car_name && <Text style={{ fontSize: 11, color: colors.textSecondary }}>Vehicle: {ride.assigned_car_name} ({ride.assigned_car_number})</Text>}
          </View>
        ) : ride.assigned_driver_name ? (
          <View style={{ backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF', borderRadius: 6, padding: 8, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: colors.primary }}>Assigned Driver & Cab</Text>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleAssignDriver(ride); }} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.primary + '20' }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 11 }}>Re-assign</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 11.5, color: colors.text }}>Driver: {ride.assigned_driver_name} ({ride.assigned_driver_phone})</Text>
            {ride.assigned_car_name && <Text style={{ fontSize: 11, color: colors.textSecondary }}>Car: {ride.assigned_car_name} ({ride.assigned_car_number})</Text>}
          </View>
        ) : (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 8, borderRadius: 6, marginTop: 4 }}
            onPress={(e) => { e.stopPropagation(); handleAssignDriver(ride); }}
            disabled={assignmentsLoading}
          >
            {assignmentsLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <UserPlus color="#FFFFFF" size={15} />}
            <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Inter-Bold' }}>Assign Driver & Cab</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      console.log('🔄 Manual refresh triggered...');
      
      // Force refresh dashboard data to get latest cars and drivers
      await forceRefreshDashboardData();
      await refreshData();
      await fetchPendingOrdersData(); // Also refresh orders
      await fetchAcceptedOrdersCount(); // Refresh accepted orders count
      // Refresh wallet balance to reflect latest amount
      try { await refreshBalance(); } catch {}
      
      console.log('✅ Manual refresh completed successfully');
    } catch (error: any) {
      console.error('❌ Refresh failed:', error);
      
      // Handle authentication errors
      if (error.message?.includes('No authentication token found') || 
          error.message?.includes('Authentication failed') || 
          error.message?.includes('Please login again') ||
          error?.response?.status === 401) {
        console.log('🔐 Authentication error detected, forcing logout...');
        try {
          // Clear dashboard data
          refreshData();
          // Logout and redirect
          await logout();
          router.replace('/login');
        } catch (logoutError) {
          console.error('❌ Error during forced logout:', logoutError);
          // Even if logout fails, redirect to login
          router.replace('/login');
        }
        return;
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      minHeight: 52,
    },
    menuButton: {
      padding: 8,
      borderRadius: 6,
    },
    balanceContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      marginHorizontal: 4,
    },
    balanceAmount: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    testButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      minWidth: 90,
    },
    testButtonText: {
      color: colors.text,
      fontSize: 10,
      fontWeight: '600',
    },
    refreshButton: {
      padding: 6,
    },
    walletButton: {
      padding: 6,
    },
    warningBanner: {
      backgroundColor: isDarkMode ? '#78350F' : '#FEF3C7',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    warningText: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: isDarkMode ? '#FCD34D' : '#92400E',
      textAlign: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: 8,
    },
    welcomeBanner: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      padding: 20,
      marginTop: 10,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    welcomeBannerTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
      marginBottom: 8,
      textAlign: 'center',
    },
    welcomeBannerSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      marginBottom: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    statNumber: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    currentTripSection: {
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 16,
    },
    currentTripCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    tripHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    tripStatus: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.success,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    tripDetails: {
      marginBottom: 20,
    },
    tripRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    tripText: {
      marginLeft: 12,
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.text,
    },
    endTripButton: {
      backgroundColor: colors.error,
      borderRadius: 6,
      paddingVertical: 14,
      alignItems: 'center',
    },
    endTripButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
    },
    bookingsSection: {
      marginTop: 2,
    },
    searchContainer: {
      marginBottom: 6,
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textSecondary,
    },
    debugButton: {
      backgroundColor: colors.error,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      marginLeft: 8,
    },
    debugButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    debugSection: {
      backgroundColor: '#F3F4F6',
      borderRadius: 6,
      padding: 12,
      marginTop: 16,
      marginBottom: 16,
    },
    debugTitle: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: '#374151',
      marginBottom: 8,
    },
    debugText: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: '#6B7280',
      marginBottom: 4,
    },
    termsButton: {
      marginTop: 12,
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 10,
      alignSelf: 'center',
    },
    termsButtonText: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
    },
  });
  const handleAcceptBooking = (order: PendingOrder) => {
    if (processingOrderId && processingOrderId !== order.order_id.toString()) return;
    
    // Check order limit first
    if (acceptedOrdersCount >= MAX_ACCEPTED_ORDERS) {
      setActionableError({
        visible: true,
        errorType: 'MAX_BOOKINGS_REACHED',
        title: 'Max 3 Bookings Reached',
        message: `You have already accepted ${MAX_ACCEPTED_ORDERS} bookings. Please assign driver and car to your accepted bookings before accepting new ones.`,
        actionText: 'Go to Future Rides',
        actionRoute: '/(tabs)/future-rides',
      });
      return;
    }
    
    // Check wallet balance
    const status = getOrderButtonStatus(order);
    if (status.disabled) {
      const chargesToDeduct = Number((order as any).charges_to_deduct ?? 0);
      const amountToCheck = Math.max(500, chargesToDeduct);
      const amountNeeded = amountToCheck - availableForNewOrder;
      
      setActionableError({
        visible: true,
        errorType: 'INSUFFICIENT_BALANCE',
        title: 'Security Hold Required',
        message: `A minimum wallet security hold of ₹${amountToCheck} is required to accept this booking. Available: ₹${availableForNewOrder.toFixed(2)} (₹${currentWallet} total - ₹${totalReservedAmount} reserved). Add ₹${Math.ceil(amountNeeded)} to accept this booking.`,
        actionText: 'Add Money to Wallet',
        actionRoute: '/(tabs)/wallet',
      });
      return;
    }
    
    // Confirmation already handled in BookingCard modal; proceed directly
    return acceptBooking(order);
  };

  const { addFutureRide } = useDashboard();

  // Just-in-time order availability check (VO token)
  const isOrderFree = async (orderId: number): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders();
      const res = await axiosInstance.get(`/api/assignments/order/${orderId}`, { headers });
      const list = Array.isArray(res.data) ? res.data : [];
      const currentUserId = (user as any)?.id || (user as any)?.vehicle_owner_id;
      const takenByOther = list.some((a: any) => 
        a?.assignment_status && 
        a.assignment_status !== 'CANCELLED' &&
        a.vehicle_owner_id && 
        currentUserId &&
        String(a.vehicle_owner_id) !== String(currentUserId)
      );
      return !takenByOther;
    } catch (e) {
      console.warn('isOrderFree check failed, defaulting to true for server accept check', e);
      return true;
    }
  };

  const acceptBooking = async (order: PendingOrder) => {
    try {
      // Show loading state for this specific order
      setProcessingOrderId(order.order_id.toString());
      // Pre-check order availability just-in-time
      const free = await isOrderFree(Number(order.order_id));
      if (!free) {
        setPendingOrders(prev => prev.filter(o => o.order_id !== order.order_id));
        fetchPendingOrdersData();
        setShowAlreadyTakenModal(true);
        return;
      }
      
      // Accept with VO token
      const headers = await getAuthHeaders();
      let acceptResponse;
      try {
        acceptResponse = await axiosInstance.post('/api/assignments/acceptorder', { order_id: Number(order.order_id) }, { headers });
      } catch (apiError: any) {
        // A 500 here can mean the write actually committed on the backend
        // but the response failed to serialize/send - or it can mean the
        // accept genuinely failed. We used to just assume success and
        // fabricate a fake assignment id, which could show the driver a
        // booking that was never actually recorded (no real assignment row,
        // customer never notified). Instead, re-check via a fresh GET
        // whether an active assignment for THIS owner now exists; only
        // treat it as success if one genuinely does.
        if (apiError?.response?.status === 500) {
          console.warn('⚠️ Server returned 500 on accept - verifying real assignment state before deciding success/failure');
          try {
            const verifyRes = await axiosInstance.get(`/api/assignments/order/${order.order_id}`, { headers });
            const list = Array.isArray(verifyRes.data) ? verifyRes.data : [];
            const mine = list.find((a: any) =>
              a?.assignment_status && a.assignment_status !== 'CANCELLED' && String(a?.vehicle_owner_id) === String(user?.id)
            );
            if (mine) {
              acceptResponse = { data: { success: true, id: mine.id, assignment_id: mine.id } };
            } else {
              throw apiError;
            }
          } catch (verifyError) {
            throw apiError;
          }
        } else {
          // Re-throw other errors to be handled by the outer catch block
          throw apiError;
        }
      }

      if (acceptResponse && (acceptResponse.data?.success === true || acceptResponse.data?.id || acceptResponse.data)) {
        // Remove order from pending list
        setPendingOrders(prev => prev.filter(o => o.order_id !== order.order_id));
        await fetchPendingOrdersData();

        const locations = getPickupDropLocations(order.pickup_drop_location);
        
        // Get the assignment ID from the API response
        const assignmentId = acceptResponse.data?.id || acceptResponse.data?.assignment_id || `B${order.order_id}`;
        
        console.log('🔍 Accept order response data:', acceptResponse.data);
        console.log('🔍 Using assignment ID:', assignmentId);
        console.log('🔍 Original order ID:', order.order_id);
        
        const ride: FutureRide = {
          id: assignmentId, // Use the assignment ID as the main ID
          booking_id: `B${order.order_id}`, // Keep the B-prefixed booking ID
          assignment_id: assignmentId, // Set the assignment_id for assignment operations
          pickup: locations.pickup,
          drop: locations.drop,
          customer_name: order.customer_name,
          customer_mobile: order.customer_number,
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0,5),
          distance: order.trip_distance,
          fare_per_km: order.cost_per_km,
          total_fare: order.estimated_price,
          status: 'confirmed',
          assigned_driver: null,
          assigned_vehicle: null,
        };

        addFutureRide(ride);

        // Auto-swift live tabs to Upcoming -> Unassigned!
        setHomeMainTab('upcoming');
        setUpcomingSubTab('unassigned');
        await fetchActiveRidesData();

        Alert.alert(
          'Booking Accepted',
          'Booking accepted successfully! Assign driver & car in Unassigned.',
          [{ text: 'OK' }]
        );
      } else {
        console.log('❌ Accept order response:', acceptResponse);
        setActionableError({
          visible: true,
          errorType: 'GENERIC',
          title: 'Booking Error',
          message: 'Failed to accept booking. Please try again.',
        });
        return;
      }
    } catch (error: any) {
      console.error('❌ Error accepting order:', error);
      const rawDetail = error?.response?.data?.detail;
      // Backend sends a structured object (not a string) for this specific
      // error - see order_assignments.py's accept_order VEHICLE_TYPE_MISMATCH
      // check - so it must be detected before the generic String(...)
      // stringification below turns it into "[object Object]".
      if (rawDetail && typeof rawDetail === 'object' && rawDetail.error === 'VEHICLE_TYPE_MISMATCH') {
        setVehicleMismatch({ visible: true, orderId: Number(order.order_id), requiredCarType: rawDetail.required_car_type || '', reason: rawDetail.reason });
        return;
      }
      const backendMsg = String(error?.response?.data?.detail || error?.response?.data?.message || error?.message || '');
      const lowerMsg = backendMsg.toLowerCase();

      // Treat backend "already has an active assignment" as already taken ONLY if taken by another partner
      const alreadyTaken = (
        lowerMsg.includes('another driver') ||
        lowerMsg.includes('another partner') ||
        lowerMsg.includes('already been accepted by someone')
      );

      if (alreadyTaken) {
        setPendingOrders(prev => prev.filter(o => o.order_id !== order.order_id));
        fetchPendingOrdersData();
        setShowAlreadyTakenModal(true);
      } else if (lowerMsg.includes('kyc') || lowerMsg.includes('aadhar') || lowerMsg.includes('pan') || lowerMsg.includes('verified')) {
        setActionableError({
          visible: true,
          errorType: 'KYC_REQUIRED',
          title: 'KYC Verification Required',
          message: backendMsg || 'Your KYC (Aadhar + PAN) must be verified before you can accept bookings. Check Settings > Profile.',
          actionText: 'Complete KYC Now',
          actionRoute: '/(tabs)/settings',
        });
      } else if (lowerMsg.includes('insufficient balance') || lowerMsg.includes('wallet') || lowerMsg.includes('balance')) {
        setActionableError({
          visible: true,
          errorType: 'INSUFFICIENT_BALANCE',
          title: 'Insufficient Balance',
          message: backendMsg || 'Not enough wallet balance available to accept this booking. Please top up your wallet.',
          actionText: 'Add Money to Wallet',
          actionRoute: '/(tabs)/wallet',
        });
      } else if (lowerMsg.includes('document') || lowerMsg.includes('expired') || lowerMsg.includes('vehicle')) {
        setActionableError({
          visible: true,
          errorType: 'DOCUMENT_EXPIRED',
          title: 'Document Renewal Required',
          message: backendMsg || 'Your vehicle or driver documents are expired or pending verification.',
          actionText: 'Update Vehicle Documents',
          actionRoute: '/my-cars',
        });
      } else {
        // Check if it's an authentication error
        if (lowerMsg.includes('authentication failed') || 
            lowerMsg.includes('please login again') ||
            error?.response?.status === 401) {
          const driverToken = await SecureStore.getItemAsync('driverAuthToken');
          const ownerToken = await SecureStore.getItemAsync('authToken');
          if (driverToken && !ownerToken) {
            console.log('📱 Duty driver session detected on owner screen, redirecting to quick-dashboard');
            router.replace('/quick-dashboard');
            return;
          }
          console.log('🔐 Authentication error detected, forcing logout...');
          try {
            refreshData();
            await logout();
            router.replace('/login');
          } catch (logoutError) {
            console.error('❌ Error during forced logout:', logoutError);
            router.replace('/login');
          }
          return;
        }
        setActionableError({
          visible: true,
          errorType: 'GENERIC',
          title: 'Booking Error',
          message: backendMsg || 'Failed to accept booking. Please try again.',
        });
      }
    } finally {
      setProcessingOrderId(null);
    }
  };

  if (showWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }
  const activeFilterCount =
    (pricingTypeFilter !== 'ALL' ? 1 : 0) +
    (tripServiceFilter !== 'ALL' ? 1 : 0) +
    (carTypeFilter !== 'ALL' ? 1 : 0) +
    (dateQuickFilter !== 'ALL' || Boolean(dateRange.fromDate) ? 1 : 0) +
    (fromCityFilter.trim() ? 1 : 0) +
    (toCityFilter.trim() ? 1 : 0);

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={[dynamicStyles.header, { justifyContent: 'space-between', alignItems: 'center' }]}>
        {/* Left Side: Circular driver logo + stacked Trusted Partner badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image
            source={require('@/assets/images/driver-logo-small.png')}
            style={{ width: 38, height: 38, borderRadius: 19 }}
            resizeMode="contain"
          />
          <PartnerBadge tier={myTier === 'PREFERRED' ? 'TRUSTED' : 'STANDARD'} stacked={true} />
        </View>


        {/* Right Side: Refresh + Filter + Notification Bell + Profile Avatar Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setShowCityModal(true)}
            style={[
              dynamicStyles.menuButton,
              {
                width: 36,
                height: 36,
                borderRadius: 6,
                backgroundColor: activeFilterCount > 0 ? colors.primary : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(79, 70, 229, 0.08)'),
                borderWidth: 1,
                borderColor: activeFilterCount > 0 ? colors.primary : (isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(79, 70, 229, 0.2)'),
                position: 'relative',
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}
            accessibilityLabel="Filter Bookings"
          >
            <SlidersHorizontal size={17} color={activeFilterCount > 0 ? '#FFFFFF' : colors.primary} />
            {activeFilterCount > 0 && (
              <View style={{
                position: 'absolute', top: -3, right: -3, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1, minWidth: 14, alignItems: 'center', justifyContent: 'center'
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 8.5, fontFamily: 'Inter-Bold' }}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
            style={[
              dynamicStyles.menuButton,
              {
                width: 36,
                height: 36,
                borderRadius: 6,
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}
          >
            <Bell color={colors.text} size={18} />
          </TouchableOpacity>

          {/* Profile Avatar Button - opens full Profile & Settings Drawer */}
          <TouchableOpacity 
            onPress={() => setShowDrawer(true)} 
            style={[
              dynamicStyles.menuButton, 
              { 
                width: 36,
                height: 36,
                borderRadius: 6,
                backgroundColor: colors.primary,
                borderWidth: 1,
                borderColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3,
              }
            ]}
            accessibilityLabel="Open Profile & Settings Menu"
          >
            <User color="#FFFFFF" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={dashboardScrollRef}
        style={dynamicStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (

          <View style={dynamicStyles.loadingContainer}>
            <Text style={dynamicStyles.loadingText}>Error: {String(error || 'Unknown error')}</Text>
            <TouchableOpacity 
              style={[dynamicStyles.endTripButton, { marginTop: 16 }]}
              onPress={fetchData}
            >
              <Text style={dynamicStyles.endTripButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
              {/* Modular Quick Metrics: Request & Wallet Balance */}
              <QuickMetrics
                walletBalance={currentWallet}
                isDarkMode={isDarkMode}
                isTrustedPartner={myTier === 'PREFERRED'}
                hasActiveRouteRequest={Boolean(activeRouteRequest?.active)}
                onPressRequest={() => {
                  if (myTier !== 'PREFERRED') {
                    Alert.alert(
                      'Trusted Partner Exclusive',
                      'Route Request allows Trusted Partners to specify routes and auto-dispatch drivers for matching trips.\n\nUpgrade to Trusted Partner to unlock.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Upgrade Now', onPress: () => router.push('/(tabs)/settings' as any) },
                      ]
                    );
                    return;
                  }
                  fetchAvailableAssignments();
                  setShowRouteRequestModal(true);
                }}
                onPressWallet={() => router.push('/(tabs)/wallet')}
              />

              <View style={dynamicStyles.bookingsSection}>
                {/* Modular Live Dispatch Top Tabs Header: New Bookings | Upcoming | Running */}
                <DispatchFeedHeader
                  activeTab={homeMainTab}
                  newBookingsCount={filteredOrders.length}
                  upcomingCount={totalUpcomingCount}
                  runningCount={runningRides.length}
                  isDarkMode={isDarkMode}
                  onTabChange={(tab) => setHomeMainTab(tab)}
                />

                {/* Content for New Bookings Tab */}
                {homeMainTab === 'new_bookings' && (
                  <>
                    {/* Bookings list */}
                    {(() => {
                      const myFleetCars = (dashboardData?.cars as any[]) || [];
                      return ordersLoading ? (
                        <DashboardSkeleton />
                      ) : filteredOrders.length > 0 ? (
                        filteredOrders.map((order) => {
                          const locations = getPickupDropLocations(order.pickup_drop_location);
                          const orderIdStr = String(order.order_id);
                          const isBubbleFocused = highlightedBookingId === orderIdStr;
                          return (
                            <View
                              key={orderIdStr}
                              onLayout={(e) => { bookingCardOffsets.current[orderIdStr] = e.nativeEvent.layout.y; }}
                              style={isBubbleFocused ? {
                                borderWidth: 2, borderColor: colors.primary, borderRadius: 8, marginBottom: 4,
                              } : undefined}
                            >
                            <BookingCard
                              booking={{
                                order_id: Number(order.order_id),
                                pickup: locations.pickup,
                                drop: locations.drop,
                                customer_name: undefined as any,
                                customer_number: undefined as any,
                                estimated_price: Number(order.estimated_price),
                                trip_distance: Number(order.trip_distance ?? 0),
                                fare_per_km: Number(order.cost_per_km ?? 0),
                                car_type: String(order.car_type || ''),
                                trip_type: String(order.trip_type || ''),
                                pick_near_city: String((order as any).pick_near_city || (order as any).near_city || ''),
                                start_date_time: String(order.start_date_time || ''),
                                trip_time: String(((order as any).trip_time) || ''),
                                created_at: String((order as any).created_at || ''),
                                max_time_to_assign_order: String((order as any).max_time_to_assign_order || ''),
                                expires_at: String((order as any).expires_at || ''),
                                charges_to_deduct: Number((order as any).charges_to_deduct || 0),
                                pickup_notes: String((order as any).pickup_notes || ''),
                                pickup_drop_location: order.pickup_drop_location,
                                location_links: (order as any).location_links,
                                driver_allowance: Number((order as any).driver_allowance || 0),
                                permit_charges: Number((order as any).permit_charges || 0),
                                hill_charges: Number((order as any).hill_charges || 0),
                                toll_charges: Number((order as any).toll_charges || 0),
                                car_make_year_requirement: (order as any).car_make_year_requirement ?? null,
                                carrier_required: !!(order as any).carrier_required,
                                priority_for_paid: (order as any).priority_for_paid !== false,
                                priority_cutoff_at: (order as any).priority_cutoff_at ?? null,
                                fare_type: (order as any).fare_type ?? 'ITEMIZED',
                                charge_items: (order as any).charge_items ?? null,
                                driver_net: (order as any).driver_net ?? null,
                                platform_fee: (order as any).platform_fee ?? null,
                                poster_cc: (order as any).poster_cc ?? null,
                                platform_fee_pct: (order as any).platform_fee_pct ?? null,
                                commission_class: (order as any).commission_class ?? null,
                                commission_waived: !!(order as any).commission_waived || (order as any).apply_commission === false,
                                advance_received: Number((order as any).advance_received || 0),
                              }}
                              onAccept={() => handleAcceptBooking(order)}
                              disabled={(() => {
                                const status = getOrderButtonStatus(order);
                                return status.disabled || processingOrderId === order.order_id.toString();
                              })()}
                              loading={processingOrderId === order.order_id.toString()}
                              buttonText={getOrderButtonStatus(order).buttonText}
                              priorityBlockedUntil={getOrderButtonStatus(order).priorityBlockedUntil}
                              amountNeeded={getOrderButtonStatus(order).amountNeeded}
                              hasMatchingCar={
                                vehicleRequestService.getRequest(order.order_id)?.status === 'APPROVED'
                                  ? true
                                  : (myFleetCars.length > 0 && order.car_type ? myFleetCars.some((c: any) => carTypeSatisfies(c.car_type, order.car_type)) : true)
                              }
                              onVehicleMismatch={(reqType) => {
                                setVehicleMismatch({
                                  visible: true,
                                  orderId: Number(order.order_id),
                                  requiredCarType: reqType || String(order.car_type || ''),
                                  reason: 'NO_CAR',
                                });
                              }}
                              onAddMoneyPress={(amount) => router.push({ pathname: '/(tabs)/wallet', params: { amount: String(amount) } })}
                            />
                            </View>
                          );
                        })
                    ) : (
                      <EmptyState
                        icon={Car}
                        title="No pending bookings available"
                        description="New bookings in your city will automatically appear here in real-time"
                        onRefresh={fetchData}
                        actionText="Refresh Feed"
                      />
                    );
                  })()}
                  </>
                )}

                {/* Content for Upcoming Tab */}
                {homeMainTab === 'upcoming' && (
                  <>
                    {/* ── Upcoming sub-tabs: Unassigned | Assigned ── */}
                    <View
                      style={{
                        flexDirection: 'row',
                        width: '100%',
                        backgroundColor: isDarkMode ? '#0A0F1A' : '#F8FAFC',
                        borderBottomWidth: 1,
                        borderBottomColor: isDarkMode ? '#1E293B' : '#E2E8F0',
                        marginBottom: 6,
                      }}
                    >
                      {([
                        { key: 'unassigned', label: `Unassigned (${upcomingUnassignedRides.length})`, activeColor: '#EF4444' },
                        { key: 'assigned', label: `Assigned (${upcomingAssignedRides.length})`, activeColor: '#3B82F6' },
                      ] as { key: string; label: string; activeColor: string }[]).map((sub) => {
                        const isActive = upcomingSubTab === sub.key;
                        return (
                          <TouchableOpacity
                            key={sub.key}
                            onPress={() => setUpcomingSubTab(sub.key as any)}
                            style={{
                              flex: 1,
                              paddingVertical: 9,
                              alignItems: 'center',
                              backgroundColor: isActive
                                ? (isDarkMode ? sub.activeColor + '20' : sub.activeColor + '12')
                                : 'transparent',
                              borderBottomWidth: 2.5,
                              borderBottomColor: isActive ? sub.activeColor : 'transparent',
                            }}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                                color: isActive ? sub.activeColor : (isDarkMode ? '#94A3B8' : '#64748B'),
                              }}
                            >
                              {sub.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {activeRidesLoading ? (
                      <View style={dynamicStyles.loadingContainer}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={[dynamicStyles.loadingText, { marginTop: 10 }]}>Loading upcoming rides...</Text>
                      </View>
                    ) : (upcomingSubTab === 'unassigned' ? upcomingUnassignedRides : upcomingAssignedRides).length > 0 ? (
                      (upcomingSubTab === 'unassigned' ? upcomingUnassignedRides : upcomingAssignedRides).map(renderRideCard)
                    ) : (
                      <EmptyState
                        icon={Car}
                        title={`No ${upcomingSubTab === 'unassigned' ? 'Unassigned' : 'Assigned'} Upcoming Rides`}
                        description={upcomingSubTab === 'unassigned' ? "Accepted bookings requiring driver & cab assignment will appear here" : "Bookings with driver and cab assigned will appear here"}
                      />
                    )}
                  </>
                )}

                {/* Content for Running Tab */}
                {homeMainTab === 'running' && (
                  <>
                    {activeRidesLoading ? (
                      <View style={dynamicStyles.loadingContainer}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={[dynamicStyles.loadingText, { marginTop: 10 }]}>Loading running trips...</Text>
                      </View>
                    ) : runningRides.length > 0 ? (
                      runningRides.map(renderRideCard)
                    ) : (
                      <EmptyState
                        icon={Car}
                        title="No Running Trips"
                        description="Trips currently in progress will appear here"
                      />
                    )}
                  </>
                )}

              {/* Filter Bookings Modal */}
              <Modal visible={showCityModal} transparent animationType="slide" onRequestClose={() => setShowCityModal(false)}>
                <View style={{
                  flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'flex-end'
                }}>
                  <View style={{
                    backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                    borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    paddingTop: 12, paddingHorizontal: 20, paddingBottom: Math.max(20, insets.bottom + 12),
                    height: '92%',
                    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15,
                  }}>
                    {/* Grab Handle */}
                    <View style={{
                      width: 40, height: 4, borderRadius: 2,
                      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
                      alignSelf: 'center', marginBottom: 12,
                    }} />

                    {/* Header with Title and Close Button */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <SlidersHorizontal size={20} color={colors.primary} />
                        <Text style={{ fontWeight: '700', fontSize: 18, color: colors.text }}>Advanced Filters & Sorting</Text>
                        {activeFilterCount > 0 && (
                          <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>{activeFilterCount} active</Text>
                          </View>
                        )}
                      </View>
                      
                      <TouchableOpacity onPress={() => setShowCityModal(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Whole Modal Scroll Area */}
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      
                      {/* Section 1: Pickup (From City) */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MapPin size={15} color="#10B981" />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Pickup (From City):
                            </Text>
                          </View>
                          {!!fromCityFilter && (
                            <TouchableOpacity onPress={() => setFromCityFilter('')}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>Clear</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* From City Input Box */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                          borderRadius: 6, paddingHorizontal: 12, borderWidth: 1.5,
                          borderColor: fromCityFilter ? '#10B981' : colors.border,
                        }}>
                          <Search size={16} color={fromCityFilter ? '#10B981' : colors.textSecondary} style={{ marginRight: 8 }} />
                          <TextInput
                            style={{ flex: 1, paddingVertical: 10, fontSize: 13.5, fontFamily: 'Inter-Medium', color: colors.text }}
                            value={fromCityFilter}
                            onChangeText={(txt) => {
                              setFromCityFilter(txt);
                              setShowFromDropdown(true);
                            }}
                            onFocus={() => setShowFromDropdown(true)}
                            placeholder="Type or select pickup city (A-Z)..."
                            placeholderTextColor={colors.textSecondary}
                          />
                          {fromCityFilter.length > 0 && (
                            <TouchableOpacity onPress={() => setFromCityFilter('')} style={{ padding: 4 }}>
                              <X size={15} color={colors.textSecondary} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => setShowFromDropdown(!showFromDropdown)} style={{ padding: 4, marginLeft: 2 }}>
                            <ChevronDown size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>



                        {/* Dropdown Selection Box (Alphabetical A-Z) */}
                        {showFromDropdown && (
                          <View style={{
                            maxHeight: 160, borderRadius: 12, borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                            marginTop: 6, paddingHorizontal: 4, paddingVertical: 4,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
                          }}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                              {fuzzyFilterCities(MASTER_CITIES, fromCityFilter)
                                .map((city) => {
                                  const isSelected = fromCityFilter.toLowerCase().trim() === city.toLowerCase();
                                  return (
                                    <TouchableOpacity
                                      key={`from-drop-${city}`}
                                      onPress={() => {
                                        setFromCityFilter(city);
                                        setShowFromDropdown(false);
                                      }}
                                      style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                        paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, marginBottom: 2,
                                        backgroundColor: isSelected ? '#10B98115' : 'transparent',
                                      }}
                                    >
                                      <Text style={{ color: isSelected ? '#10B981' : colors.text, fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Regular', fontSize: 13 }}>
                                        {city}
                                      </Text>
                                      {isSelected && <Check size={14} color="#10B981" strokeWidth={3} />}
                                    </TouchableOpacity>
                                  );
                                })}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      {/* Section 2: Drop (To City) - OPTIONAL */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MapPin size={15} color="#EF4444" />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Drop (To City):
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                              (Optional)
                            </Text>
                          </View>
                          {!!toCityFilter && (
                            <TouchableOpacity onPress={() => setToCityFilter('')}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>Clear</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* To City Input Box */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                          borderRadius: 6, paddingHorizontal: 12, borderWidth: 1.5,
                          borderColor: toCityFilter ? '#EF4444' : colors.border,
                        }}>
                          <Search size={16} color={toCityFilter ? '#EF4444' : colors.textSecondary} style={{ marginRight: 8 }} />
                          <TextInput
                            style={{ flex: 1, paddingVertical: 10, fontSize: 13.5, fontFamily: 'Inter-Medium', color: colors.text }}
                            value={toCityFilter}
                            onChangeText={(txt) => {
                              setToCityFilter(txt);
                              setShowToDropdown(true);
                            }}
                            onFocus={() => setShowToDropdown(true)}
                            placeholder="Type or select drop city (Optional)..."
                            placeholderTextColor={colors.textSecondary}
                          />
                          {toCityFilter.length > 0 && (
                            <TouchableOpacity onPress={() => setToCityFilter('')} style={{ padding: 4 }}>
                              <X size={15} color={colors.textSecondary} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => setShowToDropdown(!showToDropdown)} style={{ padding: 4, marginLeft: 2 }}>
                            <ChevronDown size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>



                        {/* Dropdown Selection Box (Alphabetical A-Z) */}
                        {showToDropdown && (
                          <View style={{
                            maxHeight: 160, borderRadius: 12, borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                            marginTop: 6, paddingHorizontal: 4, paddingVertical: 4,
                            shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
                          }}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                              {fuzzyFilterCities(MASTER_CITIES, toCityFilter)
                                .map((city) => {
                                  const isSelected = toCityFilter.toLowerCase().trim() === city.toLowerCase();
                                  return (
                                    <TouchableOpacity
                                      key={`to-drop-${city}`}
                                      onPress={() => {
                                        setToCityFilter(city);
                                        setShowToDropdown(false);
                                      }}
                                      style={{
                                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                        paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, marginBottom: 2,
                                        backgroundColor: isSelected ? '#EF444415' : 'transparent',
                                      }}
                                    >
                                      <Text style={{ color: isSelected ? '#EF4444' : colors.text, fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Regular', fontSize: 13 }}>
                                        {city}
                                      </Text>
                                      {isSelected && <Check size={14} color="#EF4444" strokeWidth={3} />}
                                    </TouchableOpacity>
                                  );
                                })}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      {/* Section 3: Car Category / Model (Compact Futuristic Dropdown) */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                          onPress={() => setShowCarDropdownFilter(!showCarDropdownFilter)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Car size={16} color={colors.primary} />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Car Category:
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{
                              backgroundColor: carTypeFilter !== 'ALL' ? colors.primary : (isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0'),
                              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
                            }}>
                              <Text style={{
                                fontSize: 11.5,
                                fontFamily: 'Inter-SemiBold',
                                color: carTypeFilter !== 'ALL' ? '#FFFFFF' : colors.text,
                              }}>
                                {carTypeFilter === 'ALL' ? 'All Categories' :
                                 carTypeFilter === 'SEDAN' ? 'Sedan' :
                                 carTypeFilter === 'SUV' ? 'SUV' :
                                 carTypeFilter === 'INNOVA' ? 'Innova / Crysta' : 'Hatchback'}
                              </Text>
                            </View>
                            <ChevronDown size={16} color={colors.textSecondary} style={{ transform: [{ rotate: showCarDropdownFilter ? '180deg' : '0deg' }] }} />
                          </View>
                        </TouchableOpacity>

                        {showCarDropdownFilter && (
                          <View style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
                            gap: 4,
                          }}>
                            {[
                              { key: 'ALL', label: 'All Categories' },
                              { key: 'SEDAN', label: 'Sedan' },
                              { key: 'SUV', label: 'SUV' },
                              { key: 'INNOVA', label: 'Innova / Crysta' },
                              { key: 'HATCHBACK', label: 'Hatchback' },
                            ].map((cat) => {
                              const isSel = carTypeFilter === cat.key;
                              return (
                                <TouchableOpacity
                                  key={cat.key}
                                  onPress={() => {
                                    setCarTypeFilter(cat.key as any);
                                    setShowCarDropdownFilter(false);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 6,
                                    backgroundColor: isSel ? colors.primary + '18' : 'transparent',
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 13,
                                    fontFamily: isSel ? 'Inter-Bold' : 'Inter-Medium',
                                    color: isSel ? colors.primary : colors.text,
                                  }}>
                                    {cat.label}
                                  </Text>
                                  {isSel && <Check size={15} color={colors.primary} strokeWidth={2.5} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      {/* Section 4: Pricing & Fare Type (Compact Futuristic Dropdown) */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                          onPress={() => setShowPricingDropdownFilter(!showPricingDropdownFilter)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Tag size={16} color={colors.primary} />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Booking Type:
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{
                              backgroundColor: pricingTypeFilter !== 'ALL'
                                ? (pricingTypeFilter === 'ALL_INCLUSIVE' ? '#D97706' : pricingTypeFilter === 'DROP_BID' ? '#8B5CF6' : colors.primary)
                                : (isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0'),
                              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
                            }}>
                              <Text style={{
                                fontSize: 11.5,
                                fontFamily: 'Inter-SemiBold',
                                color: pricingTypeFilter !== 'ALL' ? '#FFFFFF' : colors.text,
                              }}>
                                {pricingTypeFilter === 'ALL' ? 'All Booking Types' :
                                 pricingTypeFilter === 'STANDARD' ? 'Standard Tariff' :
                                 pricingTypeFilter === 'ALL_INCLUSIVE' ? 'All Inclusive' : 'Drop Bid'}
                              </Text>
                            </View>
                            <ChevronDown size={16} color={colors.textSecondary} style={{ transform: [{ rotate: showPricingDropdownFilter ? '180deg' : '0deg' }] }} />
                          </View>
                        </TouchableOpacity>

                        {showPricingDropdownFilter && (
                          <View style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
                            gap: 4,
                          }}>
                            {[
                              { key: 'ALL', label: 'All Booking Types', icon: null },
                              { key: 'STANDARD', label: 'Standard Tariff', icon: Tag },
                              { key: 'ALL_INCLUSIVE', label: 'All Inclusive Fare', icon: Sparkles },
                              { key: 'DROP_BID', label: 'Drop Bid', icon: Gavel },
                            ].map((cat) => {
                              const isSel = pricingTypeFilter === cat.key;
                              const Icon = cat.icon;
                              return (
                                <TouchableOpacity
                                  key={cat.key}
                                  onPress={() => {
                                    setPricingTypeFilter(cat.key as any);
                                    setShowPricingDropdownFilter(false);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 6,
                                    backgroundColor: isSel ? colors.primary + '18' : 'transparent',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                    {Icon && <Icon size={14} color={isSel ? colors.primary : colors.textSecondary} />}
                                    <Text style={{
                                      fontSize: 13,
                                      fontFamily: isSel ? 'Inter-Bold' : 'Inter-Medium',
                                      color: isSel ? colors.primary : colors.text,
                                    }}>
                                      {cat.label}
                                    </Text>
                                  </View>
                                  {isSel && <Check size={15} color={colors.primary} strokeWidth={2.5} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      {/* Section 5: Trip Category (Compact Futuristic Dropdown) */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                          onPress={() => setShowTripServiceDropdownFilter(!showTripServiceDropdownFilter)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Clock size={16} color={colors.primary} />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Trip Category:
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{
                              backgroundColor: tripServiceFilter !== 'ALL' ? colors.primary : (isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0'),
                              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
                            }}>
                              <Text style={{
                                fontSize: 11.5,
                                fontFamily: 'Inter-SemiBold',
                                color: tripServiceFilter !== 'ALL' ? '#FFFFFF' : colors.text,
                              }}>
                                {tripServiceFilter === 'ALL' ? 'All Services' :
                                 tripServiceFilter === 'ONEWAY' ? 'One Way' :
                                 tripServiceFilter === 'MULTICITY' ? 'Multi-City' :
                                 tripServiceFilter === 'ROUNDTRIP' ? 'Round Trip' : 'Hourly / Local'}
                              </Text>
                            </View>
                            <ChevronDown size={16} color={colors.textSecondary} style={{ transform: [{ rotate: showTripServiceDropdownFilter ? '180deg' : '0deg' }] }} />
                          </View>
                        </TouchableOpacity>

                        {showTripServiceDropdownFilter && (
                          <View style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
                            gap: 4,
                          }}>
                            {[
                              { key: 'ALL', label: 'All Services', icon: null },
                              { key: 'ONEWAY', label: 'One Way', icon: MapPin },
                              { key: 'MULTICITY', label: 'Multi-City (One Way)', icon: MapPin },
                              { key: 'ROUNDTRIP', label: 'Round Trip', icon: ArrowLeftRight },
                              { key: 'HOURLY_LOCAL', label: 'Hourly / Local', icon: Clock },
                            ].map((cat) => {
                              const isSel = tripServiceFilter === cat.key;
                              const Icon = cat.icon;
                              return (
                                <TouchableOpacity
                                  key={cat.key}
                                  onPress={() => {
                                    setTripServiceFilter(cat.key as any);
                                    setShowTripServiceDropdownFilter(false);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 6,
                                    backgroundColor: isSel ? colors.primary + '18' : 'transparent',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                    {Icon && <Icon size={14} color={isSel ? colors.primary : colors.textSecondary} />}
                                    <Text style={{
                                      fontSize: 13,
                                      fontFamily: isSel ? 'Inter-Bold' : 'Inter-Medium',
                                      color: isSel ? colors.primary : colors.text,
                                    }}>
                                      {cat.label}
                                    </Text>
                                  </View>
                                  {isSel && <Check size={15} color={colors.primary} strokeWidth={2.5} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      {/* Section 6: Pickup Date (Quick Chips + Interactive Calendar Date Picker) */}
                      <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Calendar size={15} color={colors.primary} />
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                              Pickup Date:
                            </Text>
                          </View>
                          {Boolean(dateRange.fromDate || dateQuickFilter !== 'ALL') && (
                            <TouchableOpacity onPress={() => {
                              setDateQuickFilter('ALL');
                              setDateRange({ fromDate: null, toDate: null });
                            }}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>Clear</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Quick Date Chips */}
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                          {[
                            { key: 'ALL', label: 'All Dates' },
                            { key: 'TODAY', label: 'Today' },
                            { key: 'TOMORROW', label: 'Tomorrow' },
                          ].map((cat) => {
                            const isActive = dateQuickFilter === cat.key && !dateRange.fromDate;
                            return (
                              <TouchableOpacity
                                key={cat.key}
                                onPress={() => {
                                  setDateQuickFilter(cat.key as any);
                                  setDateRange({ fromDate: null, toDate: null });
                                }}
                                style={{
                                  flex: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  paddingVertical: 7,
                                  borderRadius: 6,
                                  backgroundColor: isActive ? colors.primary : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF'),
                                  borderWidth: 1,
                                  borderColor: isActive ? colors.primary : colors.border,
                                }}
                                activeOpacity={0.8}
                              >
                                <Text style={{
                                  fontSize: 12,
                                  fontFamily: isActive ? 'Inter-Bold' : 'Inter-Medium',
                                  color: isActive ? '#FFFFFF' : colors.text,
                                }}>
                                  {cat.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Interactive Calendar Date Picker Button */}
                        <TouchableOpacity
                          onPress={() => setShowCalendarModal(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            backgroundColor: dateRange.fromDate ? colors.primary + '14' : (isDarkMode ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
                            borderWidth: 1.5,
                            borderColor: dateRange.fromDate ? colors.primary : colors.border,
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Calendar size={16} color={dateRange.fromDate ? colors.primary : colors.textSecondary} />
                            <Text style={{ flexShrink: 1,
                              fontSize: 12.5,
                              fontFamily: dateRange.fromDate ? 'Inter-Bold' : 'Inter-Medium',
                              color: dateRange.fromDate ? colors.primary : colors.textSecondary,
                            }}>
                              {dateRange.fromDate
                                ? `${dateRange.fromDate}${dateRange.toDate ? ' ➔ ' + dateRange.toDate : ''}`
                                : 'Choose Specific Date / Range...'}
                            </Text>
                          </View>
                          <View style={{
                            backgroundColor: dateRange.fromDate ? colors.primary : (isDarkMode ? 'rgba(255,255,255,0.1)' : '#F1F5F9'),
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}>
                            <Text style={{
                              fontSize: 11,
                              fontFamily: 'Inter-Bold',
                              color: dateRange.fromDate ? '#FFFFFF' : colors.textSecondary,
                            }}>
                              {dateRange.fromDate ? 'Selected' : 'Pick'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>

                    {/* Sticky Footer Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
                      <TouchableOpacity
                        onPress={() => {
                          setFromCityFilter('');
                          setToCityFilter('');
                          setPricingTypeFilter('ALL');
                          setTripServiceFilter('ALL');
                          setCarTypeFilter('ALL');
                          setDateQuickFilter('ALL');
                          setDateRange({ fromDate: null, toDate: null });
                        }}
                        style={{
                          flex: 1, paddingVertical: 12, borderRadius: 8,
                          borderWidth: 1, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Reset All</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setShowCityModal(false)}
                        style={{
                          flex: 1.5, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 14,
                          alignItems: 'center', justifyContent: 'center',
                          shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>
                          Apply Filters ({filteredOrders.length})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Interactive Calendar Date Picker Overlay - rendered inside this Modal so it renders reliably on top */}
                    <DateRangeCalendarModal
                      visible={showCalendarModal}
                      noModalWrapper={true}
                      onClose={() => setShowCalendarModal(false)}
                      initialRange={dateRange}
                      onSelectRange={(range) => setDateRange(range)}
                    />
                  </View>
                </View>
              </Modal>

              <AnnouncementModal />
              <DocumentTodoPrompt />


              {/* Vacant City modal */}
              <VacantCityPicker
                visible={showVacantModal}
                onClose={() => setShowVacantModal(false)}
                variant="compact"
                onCitiesChange={setVacantCities}
              />
            </View>
          </>
        )}
      </ScrollView>

      {/* Driver Assignment Modal */}
      <Modal
        visible={showAssignModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>Select Driver</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 36 }}>
              {assignmentsLoading ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ marginTop: 10, color: colors.textSecondary }}>Loading drivers...</Text>
                </View>
              ) : availableDrivers.length > 0 ? (
                availableDrivers.map((driver) => (
                  <TouchableOpacity
                    key={driver.id}
                    style={{ backgroundColor: colors.background, padding: 14, borderRadius: 6, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    onPress={() => handleDriverSelect(driver)}
                  >
                    <View>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>{driver.full_name}</Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{driver.primary_number}</Text>
                      <Text style={{ fontSize: 12, color: '#10B981', marginTop: 2 }}>{driver.driver_status || 'AVAILABLE'}</Text>
                    </View>
                    <CheckCircle color={colors.primary} size={24} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>No available drivers found. Please complete verification or add a driver first.</Text>
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>Select Car</Text>
              <TouchableOpacity onPress={() => setShowVehicleModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {selectedDriver && (
              <View style={{ backgroundColor: colors.background, padding: 10, borderRadius: 6, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>Selected Driver: {selectedDriver.full_name}</Text>
              </View>
            )}

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 36 }}>
              {assignmentsLoading ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ marginTop: 10, color: colors.textSecondary }}>Assigning...</Text>
                </View>
              ) : (selectedRide?.car_type ? availableCars.filter((c) => carTypeSatisfies(c.car_type, selectedRide.car_type)) : availableCars).length > 0 ? (
                // Only cars matching what THIS booking needs - the backend
                // rejects a mismatched car anyway (see assign_car_driver's
                // VEHICLE_TYPE_MISMATCH check), so filtering here avoids a
                // driver picking one just to get an error back.
                (selectedRide?.car_type ? availableCars.filter((c) => carTypeSatisfies(c.car_type, selectedRide.car_type)) : availableCars).map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={{ backgroundColor: colors.background, padding: 14, borderRadius: 6, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    onPress={() => handleCarAssign(car)}
                    disabled={assignmentsLoading}
                  >
                    <View>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>{car.car_name} ({car.car_type ? car.car_type.replace(/_/g, ' ') : ''})</Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{car.car_number}</Text>
                    </View>
                    <CheckCircle color={colors.primary} size={24} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>No available cars found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Booking Detail Modal */}
      <BookingDetailModal
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        booking={selectedBookingForDetail}
        onRefresh={async () => {
          setUpcomingSubTab('assigned');
          await fetchActiveRidesData();
        }}
      />

      {/* DrawerNavigation must be rendered outside ScrollView */}
      <DrawerNavigation 
        visible={showDrawer} 
        onClose={() => setShowDrawer(false)} 
      />

      {/* Auto-popup Document & Verification Alert Modal */}
      <KycPendingModal
        visible={showKycModal}
        onClose={() => {
          setShowKycModal(false);
          setKycDismissed(true);
        }}
        onCompleteKyc={() => {
          // Previously hardcoded to Settings regardless of what's actually
          // pending - Settings' KYC section only ever shows the OWNER's own
          // Aadhar/PAN (a completely different entity from car/driver docs).
          // A driver with only Driving Licence pending got sent to Settings,
          // saw everything marked "Verified" there, and had no way to tell
          // what was actually wrong. Route to wherever the real pending
          // item(s) actually live, same as tapping a specific group's own
          // "Update" button does.
          router.push((docAlerts[0]?.target_route || '/(tabs)/settings') as any);
        }}
        alerts={docAlerts}
        onUpdateItem={(targetRoute) => router.push(targetRoute as any)}
      />



      {/* 12h Vacant Confirmation Prompt Modal */}
      <StillWaitingModal
        visible={showStillWaitingModal}
        city={vacantCheckCity}
        driverName={vacantDriverName}
        carNumber={vacantCarNumber}
        onConfirmYes={handleConfirmStillWaiting}
        onUpdate={handleUpdateVacantFromPrompt}
      />

      {/* Another driver took the booking first (was set but never rendered) */}
      <BookingAlreadyTakenModal
        visible={showAlreadyTakenModal}
        onClose={() => setShowAlreadyTakenModal(false)}
        onRefresh={() => { setShowAlreadyTakenModal(false); fetchPendingOrdersData(); }}
      />

      {/* Blocked accept - booking needs a car type this fleet doesn't have */}
      <VehicleMismatchModal
        visible={vehicleMismatch.visible}
        onClose={() => setVehicleMismatch({ visible: false, orderId: 0, requiredCarType: '' })}
        orderId={vehicleMismatch.orderId}
        requiredCarType={vehicleMismatch.requiredCarType}
        reason={vehicleMismatch.reason}
      />

      {/* KYC/wallet/document/generic accept-booking errors - was imported and
          populated via setActionableError() throughout this file but never
          actually rendered anywhere, so drivers got zero visible feedback
          when a booking accept failed for any of these reasons. */}
      {/* KYC/wallet/document/generic accept-booking errors */}
      <ActionableErrorModal
        visible={actionableError.visible}
        errorType={actionableError.errorType}
        title={actionableError.title}
        message={actionableError.message}
        actionText={actionableError.actionText}
        actionRoute={actionableError.actionRoute}
        onClose={() => setActionableError((prev) => ({ ...prev, visible: false }))}
      />

      {/* Floating Action Button (FAB): Fleet Vacant Cities Management (Bottom-Right) */}
      <TouchableOpacity
        onPress={() => router.push('/vacants' as any)}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 18,
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: '#2563EB',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#2563EB',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 8,
          zIndex: 999,
        }}
        activeOpacity={0.85}
        accessibilityLabel="Open Vacant City Picker"
      >
        <MapPin size={24} color="#FFFFFF" />
        {vacantCities.length > 0 && (
          <View style={{
            position: 'absolute',
            top: -3,
            right: -3,
            backgroundColor: '#EF4444',
            borderRadius: 6,
            paddingHorizontal: 5,
            paddingVertical: 1,
            minWidth: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: isDarkMode ? '#1E293B' : '#FFFFFF',
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: 'Inter-Bold' }}>
              {vacantCities.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Route Request Modal for Trusted Partners */}
      <RouteRequestModal
        visible={showRouteRequestModal}
        onClose={() => setShowRouteRequestModal(false)}
        isTrustedPartner={myTier === 'PREFERRED'}
        onUpgradePress={() => router.push('/(tabs)/settings' as any)}
        availableDrivers={availableDrivers}
        availableCars={availableCars}
        activeRequest={activeRouteRequest}
        onSaveRequest={(req) => {
          setActiveRouteRequest(req);
          setShowRouteRequestModal(false);
        }}
        onClearRequest={() => {
          setActiveRouteRequest(null);
          Alert.alert('Cancelled', 'Route request deactivated.');
        }}
        onSimulateMatchingRide={() => {
          setShowRouteRequestModal(false);
          setMatchingHudOrder({
            order_id: 10940,
            pickup: activeRouteRequest?.fromCity || 'Chennai',
            drop: activeRouteRequest?.toCity || 'Bangalore',
            fare: 3850,
            distance: '340 km',
            car_type: activeRouteRequest?.carType || 'Sedan',
          });
          setShowHudAlert(true);
        }}
      />

      {/* 10-Second Full Screen HUD Alert Modal for Auto-Assignment */}
      <AutoAssignHudModal
        visible={showHudAlert}
        order={matchingHudOrder || undefined}
        assignedDriverName={activeRouteRequest?.driverName || 'Driver'}
        assignedCarNumber={activeRouteRequest?.carNumber || 'TN-01-AB-1234'}
        onDecline={() => {
          setShowHudAlert(false);
          Alert.alert('Ride Declined', 'Ride was declined within 10s with ₹0 penalty.');
        }}
        onAutoAssign={() => {
          setShowHudAlert(false);
          setHomeMainTab('upcoming');
          setUpcomingSubTab('assigned');
          Alert.alert(
            'Ride Auto-Assigned!',
            `Ride from ${matchingHudOrder?.pickup || 'Pickup'} to ${matchingHudOrder?.drop || 'Drop'} has been auto-assigned to ${activeRouteRequest?.driverName || 'Driver'}.\n\n⚠️ Any cancellation after auto-assignment incurs a ₹500 fee.`,
            [{ text: 'View in Upcoming', onPress: () => { setHomeMainTab('upcoming'); setUpcomingSubTab('assigned'); } }]
          );
        }}
        onClose={() => {
          setShowHudAlert(false);
          setHomeMainTab('upcoming');
          setUpcomingSubTab('assigned');
        }}
      />

      {/* Once-per-day Intro Popup for Standard Partners */}
      <TrustedIntroModal
        visible={showTrustedIntroModal}
        onClose={() => setShowTrustedIntroModal(false)}
        onSeePlans={() => {
          setShowTrustedIntroModal(false);
          router.push('/subscription');
        }}
      />
    </SafeAreaView>
  );
}