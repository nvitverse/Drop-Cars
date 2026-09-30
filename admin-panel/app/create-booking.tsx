import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, Plus, X, Search, CheckCircle2, Car, ChevronDown, ChevronRight, Sparkles,
  Route, Send, UserCheck, MapPin, User, Sliders, SlidersHorizontal, Clock, IndianRupee, FileText,
  Percent, StickyNote, Check, Info, Phone, ArrowUpDown, Globe, AlertCircle, GripVertical, ChevronUp,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LocationPickerModal from '@/components/LocationPickerModal';
import DateTimeField from '@/components/DateTimeField';
import PageInfoModal from '@/components/PageInfoModal';

type TripType = 'oneway' | 'roundtrip' | 'multicity' | 'hourly' | 'local';

const TRIP_TYPES: { label: string; value: TripType }[] = [
  { label: 'Oneway', value: 'oneway' },
  { label: 'Round Trip', value: 'roundtrip' },
  { label: 'Multi City', value: 'multicity' },
  { label: 'Local', value: 'local' },
  { label: 'Hourly', value: 'hourly' },
];

// Endpoints only exist for oneway/roundtrip/multicity/hourly - Local reuses
// the oneway quote/confirm route with trip_type: "Local" in the body.
const apiTripType = (t: TripType): 'oneway' | 'roundtrip' | 'multicity' | 'hourly' =>
  t === 'local' ? 'oneway' : t;

// Matches backend schemas.new_orders.CarType exactly - selecting anything
// outside this list 422s on quote/confirm.
const VEHICLE_CATEGORIES = [
  { id: 'hatchback', name: 'Hatchback', models: 'WagonR, Indica, Swift (4+1 Seater)', baseValue: 'HATCHBACK' },
  { id: 'sedan', name: 'Sedan', models: 'Dzire, Etios, Aura (4+1 Seater)', baseValue: 'SEDAN_4_PLUS_1' },
  { id: 'etios', name: 'Etios', models: 'Toyota Etios Premium (4+1 Seater)', baseValue: 'ETIOS_4_PLUS_1' },
  { id: 'prime_sedan', name: 'Prime Sedan', models: 'Maruti Ciaz, Honda City, Toyota Corolla or equivalent', baseValue: 'NEW_SEDAN_2022_MODEL' },
  {
    id: 'suv',
    name: 'SUV',
    models: 'Ertiga, Xylo, Lodgy',
    baseValue: 'SUV',
    subTiers: [
      { label: 'Any', value: 'SUV' },
      { label: '6+1', value: 'SUV_6_PLUS_1' },
      { label: '7+1', value: 'SUV_7_PLUS_1' },
    ],
  },
  {
    id: 'innova',
    name: 'Innova',
    models: 'Toyota Innova Premium',
    baseValue: 'INNOVA',
    subTiers: [
      { label: 'Any', value: 'INNOVA' },
      { label: '6+1', value: 'INNOVA_6_PLUS_1' },
      { label: '7+1', value: 'INNOVA_7_PLUS_1' },
    ],
  },
  {
    id: 'innova_crysta',
    name: 'Innova Crysta',
    models: 'Toyota Innova Crysta Luxury',
    baseValue: 'INNOVA_CRYSTA',
    subTiers: [
      { label: 'Any', value: 'INNOVA_CRYSTA' },
      { label: '6+1', value: 'INNOVA_CRYSTA_6_PLUS_1' },
      { label: '7+1', value: 'INNOVA_CRYSTA_7_PLUS_1' },
    ],
  },
];

const CAR_TYPES: { label: string; value: string }[] = [
  { label: 'Hatchback', value: 'HATCHBACK' },
  { label: 'Sedan', value: 'SEDAN_4_PLUS_1' },
  { label: 'Etios', value: 'ETIOS_4_PLUS_1' },
  { label: 'SUV', value: 'SUV' },
  { label: 'SUV 6+1', value: 'SUV_6_PLUS_1' },
  { label: 'SUV 7+1', value: 'SUV_7_PLUS_1' },
  { label: 'Innova', value: 'INNOVA' },
  { label: 'Innova 6+1', value: 'INNOVA_6_PLUS_1' },
  { label: 'Innova 7+1', value: 'INNOVA_7_PLUS_1' },
  { label: 'Innova Crysta', value: 'INNOVA_CRYSTA' },
  { label: 'Innova Crysta 6+1', value: 'INNOVA_CRYSTA_6_PLUS_1' },
  { label: 'Innova Crysta 7+1', value: 'INNOVA_CRYSTA_7_PLUS_1' },
];

// Presentational-only labels for the Trip Type summary card (added for the
// card/summary-picker redesign) - purely descriptive, no effect on the
// trip_type value sent to the backend.
const TRIP_TYPE_SUBTITLES: Record<TripType, string> = {
  oneway: 'Single pickup to drop, one direction',
  roundtrip: 'Pickup, wait, and return with the same car',
  multicity: 'Multiple stops across different cities',
  local: 'Within-city day use, serviceable cities only',
  hourly: 'Time & km based package pricing',
};

const HOURLY_PACKAGES = [
  { hours: 5, km_range: 50 },
  { hours: 10, km_range: 100 },
  { hours: 12, km_range: 120 },
];

const currentYear = new Date().getFullYear();
const CAR_MAKE_YEARS: string[] = (() => {
  const years: string[] = [];
  for (let y = currentYear; y >= 2008; y--) years.push(String(y));
  return years;
})();

interface VendorOption {
  id: string;
  reg_id?: string | null;
  full_name: string;
  primary_number: string;
}

interface ChargeItem {
  label: string;
  included: boolean;
}

// Pickup defaults to "now + 30 minutes" across every booking-creation page
// (Admin/Vendor/Driver) so an urgent booking can be posted right away
// without first having to pick a date/time.
  const defaultPickupDateTimeObj = () => new Date(Date.now() + 30 * 60 * 1000);
const defaultPickupDate = () => {
  const d = defaultPickupDateTimeObj();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const defaultPickupTime = () => {
  const d = defaultPickupDateTimeObj();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toIsoDateTime = (date: string, time: string): string | undefined => {
  if (!date || !time) return undefined;
  // date: YYYY-MM-DD, time: HH:MM (24hr) - treated as IST wall-clock time.
  const iso = `${date}T${time}:00+05:30`;
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export default function CreateBookingScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const params = useLocalSearchParams<{
    customer_name?: string;
    customer_phone?: string;
    pickup?: string;
    drop?: string;
    trip_type?: string;
    car_type?: string;
    pickup_notes?: string;
  }>();

  const [tripType, setTripType] = useState<TripType>('oneway');
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [showSpecialRequestsModal, setShowSpecialRequestsModal] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [showBookingConfigModal, setShowBookingConfigModal] = useState(false);
  const [showFareChargesModal, setShowFareChargesModal] = useState(false);
  const [showTrustedPartnersModal, setShowTrustedPartnersModal] = useState(false);
  const [showWaiveCommissionModal, setShowWaiveCommissionModal] = useState(false);
  const [showTargetCityModal, setShowTargetCityModal] = useState(false);
  const [targetCitySearch, setTargetCitySearch] = useState('');
  // Hoisted above the `if (createdOrderId) return ...` early return below -
  // it was previously declared after that return, which violates the Rules
  // of Hooks (a conditional hook call) and crashed with "Rendered more/
  // fewer hooks than during the previous render" the moment a booking was
  // successfully created (createdOrderId flips from null to a real id).
  const [showPageInfo, setShowPageInfo] = useState(false);

  // Theme-aware shell styles reused across every card section below (kept
  // as plain objects, not StyleSheet.create, so they re-render with the
  // live theme instead of being frozen at module load like the rest of
  // this file's StyleSheet colors).
  const cardShell = { backgroundColor: themeColors.surface, borderColor: themeColors.border };
  const badgeShell = { backgroundColor: themeColors.primaryTint, borderColor: themeColors.border };
  const summaryShell = { backgroundColor: themeColors.background, borderColor: themeColors.border };
  const pillShell = { backgroundColor: themeColors.primaryTint, borderColor: themeColors.border };

  // Several driver-allowance fields below start at '0' (a real value, not
  // just a placeholder), so typing into them appended onto that leading
  // zero ("1" typed after "0" became "01") instead of replacing it.
  const stripLeadingZero = (value: string) => value.replace(/^0+(?=\d)/, '');

  // Vendor (optional)
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorResults, setVendorResults] = useState<VendorOption[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorOption | null>(null);
  const [showVendorSearch, setShowVendorSearch] = useState(false);
  const [searchingVendor, setSearchingVendor] = useState(false);

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerCountryCode, setCustomerCountryCode] = useState('+91');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isVendorAsCustomer, setIsVendorAsCustomer] = useState(false);

  const fillVendorAsCustomer = (vendor: VendorOption) => {
    if (vendor.full_name) {
      setCustomerName(vendor.full_name);
    }
    if (vendor.primary_number) {
      let digits = vendor.primary_number.replace(/[^0-9]/g, '');
      if (digits.startsWith('91') && digits.length > 10) {
        digits = digits.slice(2);
      } else if (digits.startsWith('0') && digits.length > 10) {
        digits = digits.slice(1);
      }
      setCustomerPhone(digits.slice(0, 10));
      setCustomerCountryCode('+91');
    }
  };

  const handleToggleVendorAsCustomer = () => {
    const nextVal = !isVendorAsCustomer;
    setIsVendorAsCustomer(nextVal);
    if (nextVal) {
      if (selectedVendor) {
        fillVendorAsCustomer(selectedVendor);
      } else {
        setShowVendorSearch(true);
        Alert.alert('Select Vendor', 'Please select a vendor to auto-fill customer details.');
      }
    }
  };

  const handleCustomerPhoneChange = (rawText: string) => {
    let digits = rawText.replace(/[^0-9]/g, '');
    if (digits.startsWith('91') && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (customerCountryCode.trim() === '+91') {
      digits = digits.slice(0, 10);
    }
    setCustomerPhone(digits);
  };

  const getExtrasTotalAmount = () => {
    let total = 0;
    if (includeToll) total += Number(tollCharges) || 0;
    if (includePermit) total += (Number(permitCharges) || 0) + (Number(extraPermitCharges) || 0);
    if (includeHill) total += Number(hillCharges) || 0;
    if (includeNight) total += Number(nightCharges) || 0;
    if (includeCustomCharge) total += Number(customChargeAmount) || 0;
    if (includeGst) total += Number(gstAmount) || 0;
    customCharges.forEach((c) => {
      if (c.included) total += Number(c.amount) || 0;
    });
    return total;
  };

  const getExtrasSummaryText = () => {
    const active: string[] = [];
    if (includeToll) active.push('Toll');
    if (includePermit) active.push('Permit');
    if (includeHill) active.push('Hill');
    if (includeNight) active.push('Night');
    if (includeCustomCharge) active.push(customChargeName || 'Custom');
    if (includeGst) active.push('GST 5%');
    if (active.length === 0) return 'Tap to configure Toll, Permit, Hill, GST';
    return active.join(', ');
  };


  // Location Modal State
  const [showLocationPickerModal, setShowLocationPickerModal] = useState(false);
  const [activeLocationIndex, setActiveLocationIndex] = useState<number | null>(null);
  const [locationPickerTitle, setLocationPickerTitle] = useState('Select Location');

  // Trip
  const [carType, setCarType] = useState(CAR_TYPES[1].value);
  const [innovaSubTier, setInnovaSubTier] = useState<'ANY' | '6_PLUS_1' | '7_PLUS_1'>('ANY');
  const [showCarTypePicker, setShowCarTypePicker] = useState(false);
  const [stops, setStops] = useState<string[]>(['', '']);
  const [locationLinksEnabled, setLocationLinksEnabled] = useState(false);
  const [locationLinks, setLocationLinks] = useState<Record<string, string>>({});
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Pickup defaults to now + 30 minutes, not blank - so an urgent booking
  // can be posted immediately without first having to pick a date/time.
  const [startDate, setStartDate] = useState(() => defaultPickupDate());
  const [startTime, setStartTime] = useState(() => defaultPickupTime());
  const [endDate, setEndDate] = useState('');

  const tripDays = (() => {
    if ((tripType !== 'roundtrip' && tripType !== 'multicity') || !startDate || !endDate) return 1;
    try {
      const d1 = new Date(startDate);
      const d2 = new Date(endDate);
      const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, diff + 1);
    } catch (e) {
      return 1;
    }
  })();
  const [endTime, setEndTime] = useState('');
  const [hourlyPackageIndex, setHourlyPackageIndex] = useState(0);
  const [pickupNotes, setPickupNotes] = useState('');
  const [tollChargeUpdate, setTollChargeUpdate] = useState(false);

  // Local Booking serviceable cities
  const [localServiceableCities, setLocalServiceableCities] = useState<string[]>([]);

  // Pricing (km-based trip types)
  const [costPerKm, setCostPerKm] = useState('15');
  const [extraCostPerKm, setExtraCostPerKm] = useState('0');
  const [driverAllowance, setDriverAllowance] = useState('300');
  const [extraDriverAllowance, setExtraDriverAllowance] = useState('100');
  const [permitCharges, setPermitCharges] = useState('0');
  const [extraPermitCharges, setExtraPermitCharges] = useState('0');
  const [hillCharges, setHillCharges] = useState('0');
  const [tollCharges, setTollCharges] = useState('0');
  const [nightCharges, setNightCharges] = useState('0');
  const [includeToll, setIncludeToll] = useState(false);
  const [includePermit, setIncludePermit] = useState(true);
  const [includeHill, setIncludeHill] = useState(true);
  const [includeNight, setIncludeNight] = useState(true);
  const [includeCustomCharge, setIncludeCustomCharge] = useState(false);
  const [customChargeName, setCustomChargeName] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('0');
  const [customCharges, setCustomCharges] = useState<{ id: string; name: string; amount: string; included: boolean }[]>([]);
  const [includeGst, setIncludeGst] = useState(false);
  const [gstAmount, setGstAmount] = useState('0');
  const [advanceReceived, setAdvanceReceived] = useState('');
  const [totalBookingAmount, setTotalBookingAmount] = useState('');
  const [extraAmount, setExtraAmount] = useState('0');

  // Vehicle Default Tariffs Matrix
  const getDefaultsForCarType = (selectedCar: string, currentTrip: string = tripType) => {
    const t = (selectedCar || '').toUpperCase();
    const isRound = currentTrip === 'roundtrip' || currentTrip === 'multicity';
    
    if (t.includes('CRYSTA')) {
      return {
        cost_per_km: isRound ? '22' : '23',
        extra_cost_per_km: '0',
        driver_allowance: isRound ? '400' : '300',
        extra_driver_allowance: '0',
      };
    }
    if (t.includes('INNOVA')) {
      return {
        cost_per_km: isRound ? '20' : '21',
        extra_cost_per_km: '0',
        driver_allowance: isRound ? '400' : '300',
        extra_driver_allowance: '0',
      };
    }
    if (t.includes('SUV')) {
      return {
        cost_per_km: isRound ? '19' : '20',
        extra_cost_per_km: '0',
        driver_allowance: '300',
        extra_driver_allowance: '0',
      };
    }
    if (t.includes('NEW_SEDAN_2022_MODEL')) {
      // "Prime Sedan" (Maruti Ciaz / Honda City / Toyota Corolla or
      // equivalent) - owner set 2026-09-29.
      return {
        cost_per_km: isRound ? '15' : '16',
        extra_cost_per_km: '0',
        driver_allowance: '300',
        extra_driver_allowance: '0',
      };
    }
    // Sedan / Etios / Hatchback default
    return {
      cost_per_km: isRound ? '14' : '15',
      extra_cost_per_km: '0',
      driver_allowance: '300',
      extra_driver_allowance: '0',
    };
  };

  // Populate initial values if passed via router params (e.g. Recreate booking flow)
  useEffect(() => {
    if (params.customer_name) setCustomerName(String(params.customer_name));
    if (params.customer_phone) handleCustomerPhoneChange(String(params.customer_phone));
    if (params.pickup || params.drop) {
      setStops([String(params.pickup || ''), String(params.drop || '')]);
    }
    if (params.trip_type) {
      const raw = String(params.trip_type).toLowerCase().replace(/[\s_-]+/g, '');
      if (raw.includes('round')) setTripType('roundtrip');
      else if (raw.includes('multi')) setTripType('multicity');
      else if (raw.includes('hourly')) setTripType('hourly');
      else if (raw.includes('local')) setTripType('local');
      else setTripType('oneway');
    }
    if (params.car_type) {
      setCarType(String(params.car_type));
    }
    if (params.pickup_notes) {
      setPickupNotes(String(params.pickup_notes));
    }
  }, [params.customer_name, params.customer_phone, params.pickup, params.drop, params.trip_type, params.car_type, params.pickup_notes]);

  // Auto populate tariffs on car type / trip type change
  useEffect(() => {
    if (tripType !== 'hourly') {
      const defs = getDefaultsForCarType(carType, tripType);
      setCostPerKm(defs.cost_per_km);
      setExtraCostPerKm(defs.extra_cost_per_km);
      setDriverAllowance(defs.driver_allowance);
      setExtraDriverAllowance(defs.extra_driver_allowance);
    } else {
      if (!costPerHour || costPerHour === '0') setCostPerHour('250');
      if (!extraCostPerHour) setExtraCostPerHour('50');
      if (!costForAddonKm || costForAddonKm === '0') setCostForAddonKm('15');
      if (!extraCostForAddonKm) setExtraCostForAddonKm('5');
    }
  }, [carType, tripType]);

  // Round Trip Auto Return Location & Default Return Time
  useEffect(() => {
    if (tripType === 'roundtrip') {
      if (stops[0] && stops.length > 1) {
        setStops((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = copy[0];
          return copy;
        });
      }
      if (!endDate) setEndDate(startDate);
      if (!endTime) setEndTime('21:30');
    }
  }, [tripType, stops[0]]);

  const handleTotalBookingAmountChange = (val: string) => {
    setTotalBookingAmount(val);
    const tot = parseFloat(val);
    const drv = parseFloat(driverAllowance);
    if (!isNaN(tot) && !isNaN(drv) && drv > 0) {
      const extra = Math.max(0, tot - drv);
      setExtraAmount(String(extra));
    }
  };

  const handleDriverFareChange = (val: string) => {
    setDriverAllowance(val);
    const drv = parseFloat(val);
    const tot = parseFloat(totalBookingAmount);
    const extra = parseFloat(extraAmount);
    if (!isNaN(tot) && !isNaN(drv) && tot > 0) {
      setExtraAmount(String(Math.max(0, tot - drv)));
    } else if (!isNaN(drv) && !isNaN(extra) && extra > 0) {
      setTotalBookingAmount(String(drv + extra));
    }
  };

  const handleExtraAmountChange = (val: string) => {
    setExtraAmount(val);
    const extra = parseFloat(val) || 0;
    const drv = parseFloat(driverAllowance) || 0;
    if (drv > 0) {
      setTotalBookingAmount(String(drv + extra));
    }
  };

  // Pricing (hourly)
  const [costPerHour, setCostPerHour] = useState('');
  const [extraCostPerHour, setExtraCostPerHour] = useState('0');
  const [costForAddonKm, setCostForAddonKm] = useState('0');
  const [extraCostForAddonKm, setExtraCostForAddonKm] = useState('0');

  // Fare Type / included-excluded charges (km-based trip types only -
  // backend's RentalOrderRequest for Hourly doesn't carry these fields yet)
  const [fareType, setFareType] = useState<'ALL_INCLUSIVE' | 'STANDARD'>('STANDARD');
  const [waitingHoursIncluded, setWaitingHoursIncluded] = useState('');
  const [chargeItems, setChargeItems] = useState<ChargeItem[]>([
    { label: 'State Tax', included: false },
    { label: 'Parking', included: false },
    { label: 'Waiting', included: false },
  ]);
  const [newChargeLabel, setNewChargeLabel] = useState('');

  // Sync Total Booking Amount automatically in ALL_INCLUSIVE mode (Driver Share + Vendor Extra)
  useEffect(() => {
    if (fareType === 'ALL_INCLUSIVE') {
      const drv = parseFloat(driverAllowance) || 0;
      const ext = parseFloat(extraAmount) || 0;
      setTotalBookingAmount(String(drv + ext));
    }
  }, [fareType, driverAllowance, extraAmount]);

  // Special Requirements (km-based trip types only)
  const [requireCarMakeYear, setRequireCarMakeYear] = useState(false);
  const [carMakeYear, setCarMakeYear] = useState('');
  const [carYearCharge, setCarYearCharge] = useState('0');
  const [carrierRequired, setCarrierRequired] = useState(false);
  const [carrierCharge, setCarrierCharge] = useState('0');
  const [nonCng, setNonCng] = useState(false);
  const [nonCngCharge, setNonCngCharge] = useState('0');
  const [petFriendly, setPetFriendly] = useState(false);
  const [petFriendlyCharge, setPetFriendlyCharge] = useState('0');
  const [customSpecialRequests, setCustomSpecialRequests] = useState<{ id: string; name: string; allowance: string; included: boolean }[]>([]);

  // "10% CC" toggle (added 2026-09-04) - on by default, unchanged platform
  // commission behavior; off skips admin_profit entirely at trip close
  // (see backend crud/end_records.py's update_end_trip_record).
  const [applyCommission, setApplyCommission] = useState(true);

  // Booking Configuration (km-based trip types only)
  const [liveUntilDate, setLiveUntilDate] = useState('');
  const [liveUntilTime, setLiveUntilTime] = useState('');
  const [acceptByDays, setAcceptByDays] = useState('0');
  const [priorityForPaid, setPriorityForPaid] = useState(true);
  const [priorityCutoffDate, setPriorityCutoffDate] = useState('');
  const [priorityCutoffTime, setPriorityCutoffTime] = useState('');
  // Customer Number Visibility to Driver - shown inline in the form (not
  // hidden behind Configure) as either Instant or an exact reveal time that
  // auto-fills to pickup minus 2 hrs and follows the pickup time until staff
  // edits it themselves (owner feedback 2026-09-30).
  const [custPhoneRevealMode, setCustPhoneRevealMode] = useState<'default' | 'instant' | '1h' | '4h' | 'custom'>('default');
  const [custPhoneRevealDate, setCustPhoneRevealDate] = useState('');
  const [custPhoneRevealTime, setCustPhoneRevealTime] = useState('');
  const [custPhoneRevealTouched, setCustPhoneRevealTouched] = useState(false);

  useEffect(() => {
    if (custPhoneRevealTouched || (custPhoneRevealMode !== 'default' && custPhoneRevealMode !== 'custom')) return;
    const pickup = new Date(`${startDate}T${startTime}:00`);
    if (isNaN(pickup.getTime())) return;
    const reveal = new Date(pickup.getTime() - 2 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    setCustPhoneRevealMode('custom');
    setCustPhoneRevealDate(`${reveal.getFullYear()}-${p(reveal.getMonth() + 1)}-${p(reveal.getDate())}`);
    setCustPhoneRevealTime(`${p(reveal.getHours())}:${p(reveal.getMinutes())}`);
  }, [startDate, startTime, custPhoneRevealTouched, custPhoneRevealMode]);

  // Send To - who this booking is broadcast to (all trip types).
  // 'DRIVER' = "Allocate manually": give it directly to one fleet
  // owner/driver at creation time instead of broadcasting it (backend:
  // send_to:"DRIVER" + target_driver_id, already supported end to end).
  const [sendTo, setSendTo] = useState<'ALL' | 'NEAR_CITY' | 'DRIVER'>('ALL');
  const [nearCities, setNearCities] = useState<string[]>([]);
  const [nearCityInput, setNearCityInput] = useState('');
  const [allocateQuery, setAllocateQuery] = useState('');
  const [allocateSearching, setAllocateSearching] = useState(false);
  const [allocateResults, setAllocateResults] = useState<Array<{ id: string; name: string; primary_number?: string | null; account_status: string }>>([]);
  const [allocateTarget, setAllocateTarget] = useState<{ id: string; name: string; primary_number?: string | null; account_status: string } | null>(null);

  // Live search-as-you-type for the "Allocate manually" driver picker -
  // debounced so it doesn't fire on every keystroke. This searches actual
  // CarDriver records (account_type "driver") by name or phone - the
  // backend's target_driver_id on a new order is a foreign key to
  // car_driver.id specifically, not a fleet-owner id (unlike the existing
  // Booking-card "Allocate manually" for an already-posted order, which
  // targets the fleet owner via /orders/{id}/manual-assign).
  useEffect(() => {
    if (sendTo !== 'DRIVER' || allocateTarget) return;
    const q = allocateQuery.trim();
    if (q.length < 3) { setAllocateResults([]); return; }
    const t = setTimeout(async () => {
      setAllocateSearching(true);
      try {
        const { accounts } = await apiService.getAllAccounts(0, 20, 'driver', undefined, q);
        setAllocateResults(accounts || []);
      } catch {
        setAllocateResults([]);
      } finally {
        setAllocateSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [allocateQuery, sendTo, allocateTarget]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [showNearCitySuggestions, setShowNearCitySuggestions] = useState(false);

  const [quoting, setQuoting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fare, setFare] = useState<any>(null);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);

  useEffect(() => {
    apiService.getPublicCities().then(setCityOptions).catch(() => {});
    apiService.getLocalServiceableCities().then(setLocalServiceableCities).catch(() => {});
  }, []);

  const searchVendor = async () => {
    if (vendorQuery.trim().length < 3) {
      Alert.alert('Type more', 'Enter at least 3 characters of the vendor\'s name or phone.');
      return;
    }
    setSearchingVendor(true);
    try {
      const res = await apiService.searchWalletTargets('vendor', vendorQuery.trim());
      setVendorResults((res.results || []).map((r: any) => ({ id: r.id, reg_id: r.reg_id, full_name: r.full_name, primary_number: r.primary_number })));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Search failed');
    } finally {
      setSearchingVendor(false);
    }
  };

  const openLocationPicker = (idx: number) => {
    let title = 'Select Location';
    if (idx === 0) title = 'Select Pickup Location';
    else if (tripType === 'roundtrip' && idx === stops.length - 1) title = 'Select Return Location';
    else if (idx === stops.length - 1) title = 'Select Drop Location';
    else title = `Select Stop ${idx + 1} Location`;

    setActiveLocationIndex(idx);
    setLocationPickerTitle(title);
    setShowLocationPickerModal(true);
  };

  const handleLocationSelectModal = (location: string) => {
    if (activeLocationIndex !== null) {
      updateStop(activeLocationIndex, location);
      if (tripType === 'roundtrip' && activeLocationIndex === 0 && stops.length > 1) {
        updateStop(stops.length - 1, location);
      }
    }
  };

  const swapPickupAndDrop = () => {
    if (stops.length >= 2) {
      setStops((prev) => {
        const copy = [...prev];
        const temp = copy[0];
        copy[0] = copy[copy.length - 1];
        copy[copy.length - 1] = temp;
        return copy;
      });
      setLocationLinks((prev) => {
        const copy = { ...prev };
        const link0 = copy['0'];
        const lastIdx = String(stops.length - 1);
        const linkLast = copy[lastIdx];
        copy['0'] = linkLast ?? '';
        copy[lastIdx] = link0 ?? '';
        return copy;
      });
    }
  };

  const moveStopUp = (idx: number) => {
    if (idx <= 0) return;
    setStops((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[idx - 1];
      copy[idx - 1] = temp;
      return copy;
    });
    setLocationLinks((prev) => {
      const copy = { ...prev };
      const curr = copy[String(idx)];
      const prevL = copy[String(idx - 1)];
      copy[String(idx - 1)] = curr ?? '';
      copy[String(idx)] = prevL ?? '';
      return copy;
    });
  };

  const moveStopDown = (idx: number) => {
    if (idx >= stops.length - 1) return;
    setStops((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[idx + 1];
      copy[idx + 1] = temp;
      return copy;
    });
    setLocationLinks((prev) => {
      const copy = { ...prev };
      const curr = copy[String(idx)];
      const nextL = copy[String(idx + 1)];
      copy[String(idx + 1)] = curr ?? '';
      copy[String(idx)] = nextL ?? '';
      return copy;
    });
  };

  const reorderStops = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    setStops((prev) => {
      if (fromIdx >= prev.length || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setLocationLinks((prev) => {
      const list: string[] = [];
      for (let i = 0; i < stops.length; i++) {
        list.push(prev[String(i)] ?? '');
      }
      if (fromIdx < list.length && toIdx < list.length) {
        const [movedLink] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, movedLink);
      }
      const nextLinks: Record<string, string> = {};
      list.forEach((val, i) => {
        if (val) nextLinks[String(i)] = val;
      });
      return nextLinks;
    });
  };

  const addStop = () => setStops((prev) => [...prev, '']);
  const removeStop = (idx: number) => setStops((prev) => prev.filter((_, i) => i !== idx));
  const updateStop = (idx: number, value: string) => setStops((prev) => prev.map((s, i) => (i === idx ? value : s)));

  const addNearCity = (city: string) => {
    const c = city.trim();
    if (!c || nearCities.includes(c)) return;
    setNearCities((prev) => [...prev, c]);
    setNearCityInput('');
  };
  const removeNearCity = (city: string) => setNearCities((prev) => prev.filter((c) => c !== city));

  // Dropdown suggestions for the Near City picker - prefix match first, then
  // "contains", against the same platform city list (GET /cities/public)
  // already loaded into cityOptions. With no input yet, shows the first
  // handful of cities so there's always something to pick from.
  const nearCityQuery = nearCityInput.trim().toLowerCase();
  const nearCitySuggestions = (() => {
    const pool = cityOptions.filter((c) => !nearCities.includes(c));
    if (!nearCityQuery) return pool.slice(0, 8);
    const starts = pool.filter((c) => c.toLowerCase().startsWith(nearCityQuery));
    const contains = pool.filter((c) => !c.toLowerCase().startsWith(nearCityQuery) && c.toLowerCase().includes(nearCityQuery));
    return [...starts, ...contains].slice(0, 8);
  })();

  const buildPickupDropLocation = (): Record<string, string> => {
    if (tripType === 'hourly') {
      return { '0': stops[0] || '' };
    }
    const active = (tripType === 'multicity' || tripType === 'roundtrip') ? stops : [stops[0], stops[stops.length - 1]];
    const obj: Record<string, string> = {};
    active.forEach((s, i) => { obj[String(i)] = s; });
    return obj;
  };

  const validateBeforeQuote = (): string | null => {
    if (!customerName.trim()) return 'Enter the customer\'s name';
    let cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(2);
    else if (cleanPhone.startsWith('0') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(1);
    if (!cleanPhone || cleanPhone.length < 8) return 'Enter a valid customer phone number';
    if (customerCountryCode.trim() === '+91' && cleanPhone.length !== 10) return 'Enter a valid 10-digit customer phone number for India (+91)';
    if (!startDate || !startTime) return 'Enter the pickup date and time';
    if (tripType !== 'hourly') {
      const locs = (tripType === 'multicity' || tripType === 'roundtrip') ? stops : [stops[0], stops[stops.length - 1]];
      if (locs.some((s) => !s.trim())) return 'Fill in all location fields';
      if (tripType === 'multicity' && locs.length < 3) return 'Multi City needs at least 3 stops';
      if (!costPerKm.trim() || !driverAllowance.trim()) return 'Enter driver fare per km and driver allowance';
      if (tripType === 'local') {
        const pickupCity = stops[0]?.trim().toLowerCase();
        const ok = localServiceableCities.some((c) => c.toLowerCase() === pickupCity);
        if (!ok) {
          return `Local Bookings aren't enabled for "${stops[0]}" yet. Available: ${localServiceableCities.join(', ') || 'none configured'}`;
        }
      }
    } else {
      if (!stops[0]?.trim()) return 'Enter the pickup location';
      if (!costPerHour.trim()) return 'Enter the hourly driver rate';
    }
    if ((tripType === 'roundtrip' || tripType === 'multicity') && (!endDate || !endTime)) {
      return 'Enter the return/end date and time';
    }
    if (requireCarMakeYear && !carMakeYear) return 'Select the minimum car make year, or turn that requirement off';
    if (sendTo === 'NEAR_CITY' && nearCities.length === 0) return 'Add at least one city, or switch Send To back to All';
    if (sendTo === 'DRIVER' && !allocateTarget) return 'Search and select the fleet owner/driver to allocate this booking to';
    return null;
  };

  const buildKmPayload = () => {
    const startIso = toIsoDateTime(startDate, startTime);
    const endIso = (tripType === 'roundtrip' || tripType === 'multicity') ? toIsoDateTime(endDate, endTime) : undefined;
    const tripTypeLabel = tripType === 'oneway' ? 'Oneway'
      : tripType === 'roundtrip' ? 'Round Trip'
      : tripType === 'multicity' ? 'Multy City'
      : 'Local';
    let cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(2);
    else if (cleanPhone.startsWith('0') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(1);
    const formattedPhone = `${customerCountryCode.trim()} ${cleanPhone.trim()}`;
    return {
      vendor_id: selectedVendor?.id,
      trip_type: tripTypeLabel,
      car_type: carType,
      pickup_drop_location: buildPickupDropLocation(),
      location_links: locationLinksEnabled ? locationLinks : undefined,
      start_date_time: startIso,
      end_date_time: endIso,
      customer_name: customerName.trim(),
      customer_number: formattedPhone,
      cost_per_km: Number(costPerKm) || 0,
      extra_cost_per_km: Number(extraCostPerKm) || 0,
      driver_allowance: Number(driverAllowance) || 0,
      extra_driver_allowance: Number(extraDriverAllowance) || 0,
      permit_charges: includePermit ? (Number(permitCharges) || 0) : 0,
      extra_permit_charges: includePermit ? (Number(extraPermitCharges) || 0) : 0,
      hill_charges: includeHill ? (Number(hillCharges) || 0) : 0,
      toll_charges: includeToll ? (Number(tollCharges) || 0) : 0,
      night_charges: 0,
      pickup_notes: (() => {
        const parts: string[] = [];
        if (pickupNotes.trim()) parts.push(pickupNotes.trim());
        const customReqs = customSpecialRequests
          .filter((r) => r.included && r.name.trim())
          .map((r) => `${r.name.trim()}${Number(r.allowance) > 0 ? ` (+₹${r.allowance})` : ''}`);
        if (customReqs.length > 0) parts.push(`Special Requests: ${customReqs.join(', ')}`);
        if (custPhoneRevealMode === 'instant' && customerPhone.trim()) {
          parts.push(`[Customer Mobile: ${customerCountryCode} ${customerPhone.trim()} - Instant Contact]`);
        }
        return parts.length > 0 ? parts.join(' | ') : undefined;
      })(),
      toll_charge_update: tollChargeUpdate,
      car_make_year_requirement: requireCarMakeYear ? Number(carMakeYear) : undefined,
      car_year_charge: Number(carYearCharge) || 0,
      carrier_required: carrierRequired,
      carrier_charge: Number(carrierCharge) || 0,
      non_cng: nonCng,
      non_cng_charge: Number(nonCngCharge) || 0,
      pet_friendly: petFriendly,
      pet_friendly_charge: Number(petFriendlyCharge) || 0,
      accept_by_days: Number(acceptByDays) || 0,
      priority_for_paid: priorityForPaid,
      priority_cutoff_at: priorityForPaid ? toIsoDateTime(priorityCutoffDate, priorityCutoffTime) : undefined,
      fare_type: fareType === 'STANDARD' ? 'ITEMIZED' : 'ALL_INCLUSIVE',
      charge_items: (() => {
        const items: { label: string; amount?: number; included: boolean }[] = [];
        if (includePermit) {
          const pAmt = Number(permitCharges) || 0;
          if (pAmt > 0) items.push({ label: 'State Permit Charges', amount: pAmt, included: true });
        } else {
          items.push({ label: 'State Permit Charges', included: false });
        }
        if (includeHill) {
          const hAmt = Number(hillCharges) || 0;
          if (hAmt > 0) items.push({ label: 'Hill / Ghat Charges', amount: hAmt, included: true });
        } else {
          items.push({ label: 'Hill / Ghat Charges', included: false });
        }
        if (includeToll) {
          const tAmt = Number(tollCharges) || 0;
          if (tAmt > 0 || tollChargeUpdate) items.push({ label: 'Toll Charges', amount: tAmt, included: true });
        } else {
          items.push({ label: 'Toll Charges', included: false });
        }
        customCharges.forEach((c) => {
          const cAmt = Number(c.amount) || 0;
          if (c.included) {
            if (cAmt > 0 || (c.name && c.name.trim())) items.push({ label: c.name || 'Custom Charge', amount: cAmt, included: true });
          } else {
            items.push({ label: c.name || 'Custom Charge', included: false });
          }
        });
        customSpecialRequests.forEach((r) => {
          if (r.included && r.name.trim()) {
            const rAmt = Number(r.allowance) || 0;
            items.push({ label: `Special: ${r.name.trim()}`, amount: rAmt > 0 ? rAmt : undefined, included: true });
          }
        });
        if (includeGst) items.push({ label: 'GST on KM Fare (5%)', included: true });
        return items;
      })(),
      gst_included: includeGst,
      gst_amount: includeGst ? (Number(gstAmount) || 0) : 0,
      advance_received: advanceReceived ? Number(advanceReceived) : undefined,
      total_booking_amount: fareType === 'ALL_INCLUSIVE' && totalBookingAmount ? Number(totalBookingAmount) : undefined,
      extra_amount: fareType === 'ALL_INCLUSIVE' ? (Number(extraAmount) || 0) : undefined,
      waiting_hours_included: fareType === 'ALL_INCLUSIVE' && waitingHoursIncluded ? Number(waitingHoursIncluded) : undefined,
      acceptance_deadline: toIsoDateTime(liveUntilDate, liveUntilTime),
      send_to: sendTo,
      near_city: sendTo === 'NEAR_CITY' ? nearCities : undefined,
      target_driver_id: sendTo === 'DRIVER' ? allocateTarget?.id : undefined,
      // Customer phone number visibility to driver
      data_visibility_vehicle_owner: custPhoneRevealMode === 'instant',
      is_urgent: custPhoneRevealMode === 'instant',
      customer_phone_reveal_hours: custPhoneRevealMode === '1h' ? 1 : custPhoneRevealMode === '4h' ? 4 : custPhoneRevealMode === 'default' ? 2 : 0,
      customer_phone_reveal_at: custPhoneRevealMode === 'custom' ? toIsoDateTime(custPhoneRevealDate, custPhoneRevealTime) : undefined,
      // "10% CC" toggle (2026-09-04) - always sent explicitly so an
      // unchecked toggle (false) actually reaches the backend.
      apply_commission: applyCommission,
    };
  };

  const buildHourlyPayload = () => {
    const startIso = toIsoDateTime(startDate, startTime);
    let cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(2);
    else if (cleanPhone.startsWith('0') && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(1);
    const formattedPhone = `${customerCountryCode.trim()} ${cleanPhone.trim()}`;
    return {
      vendor_id: selectedVendor?.id,
      trip_type: 'Hourly Rental',
      car_type: carType,
      pickup_drop_location: buildPickupDropLocation(),
      pick_near_city: sendTo === 'NEAR_CITY' ? nearCities : ['ALL'],
      start_date_time: startIso,
      customer_name: customerName.trim(),
      customer_number: formattedPhone,
      package_hours: HOURLY_PACKAGES[hourlyPackageIndex],
      cost_per_hour: Number(costPerHour) || 0,
      extra_cost_per_hour: Number(extraCostPerHour) || 0,
      cost_for_addon_km: Number(costForAddonKm) || 0,
      extra_cost_for_addon_km: Number(extraCostForAddonKm) || 0,
      pickup_notes: (() => {
        const parts: string[] = [];
        if (pickupNotes.trim()) parts.push(pickupNotes.trim());
        const customReqs = customSpecialRequests
          .filter((r) => r.included && r.name.trim())
          .map((r) => `${r.name.trim()}${Number(r.allowance) > 0 ? ` (+₹${r.allowance})` : ''}`);
        if (customReqs.length > 0) parts.push(`Special Requests: ${customReqs.join(', ')}`);
        if (custPhoneRevealMode === 'instant' && customerPhone.trim()) {
          parts.push(`[Customer Mobile: ${customerCountryCode} ${customerPhone.trim()} - Instant Contact]`);
        }
        return parts.length > 0 ? parts.join(' | ') : undefined;
      })(),
      toll_charge_update: tollChargeUpdate,
      data_visibility_vehicle_owner: custPhoneRevealMode === 'instant',
      is_urgent: custPhoneRevealMode === 'instant',
      customer_phone_reveal_hours: custPhoneRevealMode === '1h' ? 1 : custPhoneRevealMode === '4h' ? 4 : custPhoneRevealMode === 'default' ? 2 : 0,
    };
  };

  const handleGetQuote = async () => {
    const err = validateBeforeQuote();
    if (err) {
      Alert.alert('Missing details', err);
      return;
    }
    setQuoting(true);
    setFare(null);
    try {
      const payload = tripType === 'hourly' ? buildHourlyPayload() : buildKmPayload();
      const res = await apiService.getBookingQuote(apiTripType(tripType), payload);
      setFare(res.fare);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to calculate fare');
    } finally {
      setQuoting(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const payload = tripType === 'hourly' ? buildHourlyPayload() : buildKmPayload();
      const res = await apiService.confirmAdminBooking(apiTripType(tripType), payload);
      setCreatedOrderId(res.order_id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to confirm booking');
    } finally {
      setConfirming(false);
    }
  };

  const resetForm = () => {
    setFare(null);
    setCreatedOrderId(null);
    setCustomerName('');
    setCustomerPhone('');
    setStops(['', '']);
    setLocationLinksEnabled(false);
    setLocationLinks({});
    setStartDate(defaultPickupDate());
    setStartTime(defaultPickupTime());
    setEndDate('');
    setEndTime('');
    setPickupNotes('');
    setSelectedVendor(null);
    setVendorQuery('');
    setVendorResults([]);
    setRequireCarMakeYear(false);
    setCarMakeYear('');
    setCarrierRequired(false);
    setCustomSpecialRequests([]);
    setLiveUntilDate('');
    setLiveUntilTime('');
    setPriorityForPaid(true);
    setPriorityCutoffDate('');
    setPriorityCutoffTime('');
    setCustPhoneRevealMode('default');
    setCustPhoneRevealDate('');
    setCustPhoneRevealTime('');
    setCustPhoneRevealTouched(false);
    setSendTo('ALL');
    setNearCities([]);
    setAdvanceReceived('');
    setFareType('STANDARD');
    setChargeItems([
      { label: 'State Tax', included: false },
      { label: 'Parking', included: false },
      { label: 'Waiting', included: false },
    ]);
  };

  if (createdOrderId) {
    const handleShareWhatsApp = () => {
      const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
      const numWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const msg = `Hello ${customerName || 'Customer'}! Your Drop Cars Booking #${createdOrderId} is confirmed. Pick up: ${stops[0] || ''} at ${startDate} ${startTime}. Thank you for choosing Drop Cars!`;
      Linking.openURL(`https://wa.me/${numWithCountry}?text=${encodeURIComponent(msg)}`);
    };

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.successBox}>
          <CheckCircle2 size={48} color={colors.success} />
          <Text style={styles.successTitle}>Booking Created</Text>
          <Text style={styles.successSubtitle}>Booking #{createdOrderId} has been posted{selectedVendor ? ` under ${selectedVendor.full_name}` : ' as a platform booking'}.</Text>

          {customerPhone ? (
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#25D366', marginBottom: 10 }]} onPress={handleShareWhatsApp}>
              <Text style={styles.primaryButtonText}>📲 Send WhatsApp Confirmation to Customer</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.primaryButton} onPress={() => { resetForm(); setTripType('oneway'); }}>
            <Text style={styles.primaryButtonText}>Create Another Booking</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Text style={styles.secondaryButtonText}>Back to Bookings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isKmTrip = tripType !== 'hourly';

  const handleGoBack = () => {
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/orders');
      }
    } catch {
      router.replace('/(tabs)/orders');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity
            onPress={handleGoBack}
            accessibilityLabel="Go back"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ padding: 6, marginRight: 4 }}
          >
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.title, { color: themeColors.text }]}>Post booking</Text>
            <TouchableOpacity
              onPress={() => setShowPageInfo(true)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: themeColors.primary + '18',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: themeColors.primary + '33',
              }}
              accessibilityLabel="Page Info"
            >
              <Info size={15} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        <ThemeToggle size={20} />
      </View>

      <PageInfoModal
        visible={showPageInfo}
        title="Post booking"
        description="Dispatch manual trips directly to the Driver & Vendor network with complete control over pricing, route stops, and special requirements."
        workflowSteps={[
          'Select trip category: Oneway, Round Trip, Multi City, Local, or Hourly Rental.',
          'Enter customer details and pickup/drop locations with optional Google Maps links.',
          'Specify start date/time, vehicle model requirement, and optional carrier needs.',
          'Select Itemized (per-km rate) or All-Inclusive (fixed total fare) pricing.',
          'Post trip to auto-broadcast to all eligible fleet owners and drivers instantly.',
        ]}
        tips={[
          'Toll Update at End: Enable this if toll charges should be computed after trip completion.',
          'Vendor Network Dispatch: Orders posted here appear in real-time across Vendor & Driver App feeds.',
        ]}
        onClose={() => setShowPageInfo(false)}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: fare ? 100 : 60 }} keyboardShouldPersistTaps="handled">
        {/* 1. Vendor Assignment (optional, admin-only) */}
        <View style={[styles.sectionCard, cardShell]}>
          {selectedVendor ? (
            <View style={styles.selectedVendorCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedVendorName}>{selectedVendor.full_name}</Text>
                <Text style={styles.selectedVendorSub}>{selectedVendor.primary_number}{selectedVendor.reg_id ? ` · #${selectedVendor.reg_id}` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedVendor(null)} accessibilityLabel="Remove selected vendor">
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* No real vendor picked yet - the booking is still going out
                  under the platform's own name, not "nobody", so say that
                  plainly instead of leaving this section looking empty/unset.
                  Purely a display default: vendor_id is still sent as null
                  for a genuinely vendor-less booking, exactly as before. */}
              <View style={[styles.selectedVendorCard, { opacity: 0.9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedVendorName}>Drop Cars</Text>
                  <Text style={styles.selectedVendorSub}>Platform booking (default)</Text>
                </View>
                <TouchableOpacity
                  style={[styles.editPillButton, pillShell]}
                  onPress={() => setShowVendorSearch((prev) => !prev)}
                >
                  <Text style={[styles.editPillText, { color: themeColors.primary }]}>
                    {showVendorSearch ? 'Close' : 'Change'}
                  </Text>
                </TouchableOpacity>
              </View>
              {showVendorSearch && (
                <>
                  <View style={[styles.searchRow, { marginTop: 10 }]}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search vendor by name or phone"
                      value={vendorQuery}
                      onChangeText={setVendorQuery}
                      onSubmitEditing={searchVendor}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity style={styles.searchBtn} onPress={searchVendor} disabled={searchingVendor} accessibilityLabel="Search vendor">
                      {searchingVendor ? <ActivityIndicator size="small" color="white" /> : <Search size={16} color="white" />}
                    </TouchableOpacity>
                  </View>
                  {vendorResults.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={styles.vendorResultRow}
                      onPress={() => {
                        setSelectedVendor(v);
                        setVendorResults([]);
                        setShowVendorSearch(false);
                        if (isVendorAsCustomer) {
                          fillVendorAsCustomer(v);
                        }
                      }}
                    >
                      <Text style={styles.vendorResultName}>{v.full_name}</Text>
                      <Text style={styles.vendorResultSub}>{v.primary_number}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </View>

        {/* 2. Trip Type */}
        <View style={[styles.sectionCard, cardShell]}>
          <TouchableOpacity style={[styles.summaryCardTouchable, summaryShell]} onPress={() => setShowTripTypePicker(true)} activeOpacity={0.8}>
            <View style={styles.summaryCardLeft}>
              <View style={[styles.summaryIconCircle, badgeShell]}>
                <Route size={20} color={themeColors.primary} />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={[styles.summaryTitle, { color: themeColors.text }]}>{TRIP_TYPES.find((t) => t.value === tripType)?.label}</Text>
                <Text style={[styles.summarySubtitle, { color: themeColors.textSecondary }]}>{TRIP_TYPE_SUBTITLES[tripType]}</Text>
              </View>
            </View>
            <View style={[styles.editPillButton, pillShell]}>
              <Text style={[styles.editPillText, { color: themeColors.primary }]}>Change</Text>
              <ChevronRight size={14} color={themeColors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 4. Car & Vehicle Preferences */}
        <View style={[styles.sectionCard, cardShell]}>
          <TouchableOpacity style={[styles.summaryCardTouchable, summaryShell]} onPress={() => setShowCarTypePicker(true)} activeOpacity={0.8}>
            <View style={styles.summaryCardLeft}>
              <View style={[styles.summaryIconCircle, badgeShell]}>
                <Car size={20} color={themeColors.primary} />
              </View>
              <View style={styles.summaryTextContent}>
                <Text style={[styles.summaryTitle, { color: themeColors.text }]}>
                  {CAR_TYPES.find((c) => c.value === carType)?.label || 'Select car type'}
                </Text>
                <Text style={[styles.summarySubtitle, { color: themeColors.textSecondary }]}>Matched to backend fleet categories for driver assignment.</Text>
              </View>
            </View>
            <View style={[styles.editPillButton, pillShell]}>
              <Text style={[styles.editPillText, { color: themeColors.primary }]}>Change</Text>
              <ChevronRight size={14} color={themeColors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. Locations & Schedule */}
        <View style={[styles.sectionCard, cardShell]}>

          {tripType === 'hourly' ? (
            <>
              <Text style={styles.fieldLabel}>City / Pickup Location *</Text>
              <TouchableOpacity
                style={[styles.input, { justifyContent: 'center', paddingVertical: 12, backgroundColor: themeColors.surface }]}
                onPress={() => openLocationPicker(0)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, color: stops[0] ? themeColors.text : colors.textMuted, fontWeight: stops[0] ? '600' : '400' }}>
                    {stops[0] || 'Tap to select pickup city/location'}
                  </Text>
                  <MapPin size={18} color={themeColors.primary} />
                </View>
              </TouchableOpacity>

              <Text style={[styles.cardGroupLabel, { color: themeColors.textSecondary }]}>Package</Text>
              <View style={styles.chipRow}>
                {HOURLY_PACKAGES.map((p, idx) => (
                  <TouchableOpacity key={idx} style={[styles.chip, hourlyPackageIndex === idx && styles.chipActive]} onPress={() => setHourlyPackageIndex(idx)}>
                    <Text style={[styles.chipText, hourlyPackageIndex === idx && styles.chipTextActive]}>{p.hours}h / {p.km_range}km</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.cardGroupLabel, { color: themeColors.textSecondary, marginTop: 0 }]}>{tripType === 'multicity' ? 'Stops' : 'Locations'}</Text>
              {tripType === 'local' && (
                <Text style={styles.hint}>Serviceable cities: {localServiceableCities.join(', ') || 'loading...'}</Text>
              )}
              {stops.map((s, idx) => {
                const label = idx === 0 ? 'Pickup Location' : idx === stops.length - 1 ? (tripType === 'roundtrip' ? 'Return to Pickup' : 'Drop Location') : `Stop ${idx}`;
                const isItemDragging = draggingIndex === idx;
                const isItemDragOver = dragOverIndex === idx && draggingIndex !== null && draggingIndex !== idx;

                return (
                  <React.Fragment key={idx}>
                    <View
                      {...({
                        onDragOver: (e: any) => {
                          e.preventDefault();
                          if (e.dataTransfer) {
                            e.dataTransfer.dropEffect = 'move';
                          }
                          if (dragOverIndex !== idx) {
                            setDragOverIndex(idx);
                          }
                        },
                        onDragEnter: (e: any) => {
                          e.preventDefault();
                          if (dragOverIndex !== idx) {
                            setDragOverIndex(idx);
                          }
                        },
                        onDragLeave: (e: any) => {
                          if (e.currentTarget && (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget))) {
                            setDragOverIndex(null);
                          }
                        },
                        onDrop: (e: any) => {
                          e.preventDefault();
                          const fromStr = e.dataTransfer?.getData('text/plain');
                          const from = fromStr !== undefined && fromStr !== '' ? parseInt(fromStr, 10) : draggingIndex;
                          if (from !== null && from !== undefined && !isNaN(from) && from !== idx) {
                            reorderStops(from, idx);
                          }
                          setDraggingIndex(null);
                          setDragOverIndex(null);
                        },
                      } as any)}
                      style={[
                        {
                          marginBottom: 8,
                          padding: 6,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: isItemDragOver ? colors.primary : 'transparent',
                          backgroundColor: isItemDragOver ? (isDark ? 'rgba(37, 99, 235, 0.16)' : 'rgba(37, 99, 235, 0.07)') : 'transparent',
                          borderStyle: isItemDragOver ? 'dashed' : 'solid',
                        },
                        isItemDragging && {
                          opacity: 0.4,
                        },
                      ]}
                    >
                      {isItemDragOver && (
                        <View style={{
                          alignSelf: 'center',
                          backgroundColor: colors.primary,
                          paddingVertical: 3,
                          paddingHorizontal: 10,
                          borderRadius: 6,
                          marginBottom: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <ArrowUpDown size={11} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Drop here to swap / reorder</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {/* Drag & Reorder Handle on the Left Edge */}
                        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 18 }}>
                          {idx > 0 && (
                            <TouchableOpacity
                              onPress={() => moveStopUp(idx)}
                              style={{ padding: 2 }}
                              hitSlop={6}
                              accessibilityLabel={`Move ${label} up`}
                            >
                              <ChevronUp size={16} color={themeColors.primary} />
                            </TouchableOpacity>
                          )}
                          <View
                            {...({
                              draggable: true,
                              onDragStart: (e: any) => {
                                if (e.dataTransfer) {
                                  e.dataTransfer.setData('text/plain', String(idx));
                                  e.dataTransfer.effectAllowed = 'move';
                                }
                                setDraggingIndex(idx);
                              },
                              onDragEnd: () => {
                                setDraggingIndex(null);
                                setDragOverIndex(null);
                              },
                              onClick: () => {
                                if (stops.length === 2) {
                                  swapPickupAndDrop();
                                } else if (idx > 0) {
                                  moveStopUp(idx);
                                } else {
                                  moveStopDown(idx);
                                }
                              },
                              title: 'Drag or click to reorder location',
                            } as any)}
                            style={[
                              {
                                paddingHorizontal: 7,
                                paddingVertical: 10,
                                borderRadius: 6,
                                backgroundColor: isDark ? (isItemDragging ? '#334155' : '#1E293B') : (isItemDragging ? '#E2E8F0' : '#F1F5F9'),
                                borderWidth: 1,
                                borderColor: isItemDragging ? colors.primary : (isDark ? '#334155' : '#CBD5E1'),
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: isItemDragging ? 'grabbing' : 'grab',
                                userSelect: 'none',
                              } as any,
                            ]}
                            accessibilityLabel={`Drag or click to reorder ${label}`}
                          >
                            <GripVertical size={18} color={isItemDragging ? colors.primary : themeColors.textSecondary} />
                          </View>
                          {idx < stops.length - 1 && (
                            <TouchableOpacity
                              onPress={() => moveStopDown(idx)}
                              style={{ padding: 2 }}
                              hitSlop={6}
                              accessibilityLabel={`Move ${label} down`}
                            >
                              <ChevronDown size={16} color={themeColors.primary} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Location Picker Field */}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={styles.fieldLabel}>{label} *</Text>
                            {idx === 0 ? (
                              <TouchableOpacity
                                onPress={() => setLocationLinksEnabled((v) => !v)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                activeOpacity={0.8}
                              >
                                <View style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 4,
                                  borderWidth: 1.5,
                                  borderColor: locationLinksEnabled ? colors.primary : themeColors.textMuted,
                                  backgroundColor: locationLinksEnabled ? colors.primary : 'transparent',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  {locationLinksEnabled && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: locationLinksEnabled ? themeColors.primary : themeColors.textSecondary }}>
                                  Address / Maps link
                                </Text>
                              </TouchableOpacity>
                            ) : (tripType === 'multicity' || (tripType === 'roundtrip' && idx > 0 && idx < stops.length - 1)) && stops.length > 2 ? (
                              <TouchableOpacity onPress={() => removeStop(idx)} accessibilityLabel="Remove stop">
                                <Text style={{ fontSize: 12, color: colors.error, fontWeight: '600' }}>Remove</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          <TouchableOpacity
                            style={[styles.input, { justifyContent: 'center', paddingVertical: 12, backgroundColor: themeColors.surface, marginBottom: 0 }]}
                            onPress={() => openLocationPicker(idx)}
                            activeOpacity={0.8}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                <View style={{
                                  width: 22, height: 22, borderRadius: 11,
                                  backgroundColor: idx === 0 ? '#22C55E22' : idx === stops.length - 1 ? '#EF444422' : '#F59E0B22',
                                  alignItems: 'center', justifyContent: 'center'
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: idx === 0 ? '#16A34A' : idx === stops.length - 1 ? '#DC2626' : '#D97706' }}>
                                    {idx + 1}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 14, color: s ? themeColors.text : colors.textMuted, fontWeight: s ? '600' : '400' }} numberOfLines={1}>
                                  {s || `Tap to select ${label.toLowerCase()}`}
                                </Text>
                              </View>
                              <MapPin size={18} color={idx === 0 ? '#16A34A' : idx === stops.length - 1 ? '#DC2626' : themeColors.primary} />
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Optional address / maps link input when checkbox is checked */}
                      {locationLinksEnabled && (
                        <View style={{ marginLeft: 34, marginTop: 6 }}>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }]}
                            placeholder={`Address or Google Maps link for ${label.toLowerCase()} (optional)`}
                            value={locationLinks[String(idx)] ?? ''}
                            onChangeText={(v) => setLocationLinks((prev) => ({ ...prev, [String(idx)]: v }))}
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
              {(tripType === 'multicity' || tripType === 'roundtrip') && (
                <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                  <Plus size={14} color={colors.primary} />
                  <Text style={styles.addStopBtnText}>Add Stop</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <Text style={[styles.cardGroupLabel, { color: themeColors.textSecondary }]}>Pickup Schedule</Text>
          <DateTimeField
            dateLabel="Pickup Date"
            timeLabel="Pickup Time"
            dateValue={startDate}
            timeValue={startTime}
            onDateChange={setStartDate}
            onTimeChange={setStartTime}
          />

          {(tripType === 'roundtrip' || tripType === 'multicity') && (
            <>
              <Text style={[styles.cardGroupLabel, { color: themeColors.textSecondary }]}>{tripType === 'roundtrip' ? 'Return Schedule' : 'Drop Schedule'}</Text>
              <DateTimeField
                dateLabel={tripType === 'roundtrip' ? 'Return Date' : 'Drop Date'}
                timeLabel={tripType === 'roundtrip' ? 'Return Time' : 'Drop Time'}
                dateValue={endDate}
                timeValue={endTime}
                onDateChange={setEndDate}
                onTimeChange={setEndTime}
                datePlaceholder="Auto (pickup day)"
                timePlaceholder="Auto (9:30 PM)"
              />
              <Text style={styles.hint}>Default: pickup day, 9:30 PM. Multi-day trips scale per-day driver allowance & min km.</Text>
            </>
          )}
        </View>

        {/* 6. Customer Details */}
        <View style={[styles.sectionCard, cardShell]}>
          <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.iconBadge, badgeShell]}>
                <User size={18} color={themeColors.primary} />
              </View>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Customer Details</Text>
            </View>

            {/* Vendor Checkbox on Right */}
            <TouchableOpacity
              onPress={handleToggleVendorAsCustomer}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: isVendorAsCustomer ? (isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF') : 'transparent',
                borderWidth: 1,
                borderColor: isVendorAsCustomer ? colors.primary : (isDark ? '#334155' : '#E2E8F0'),
              }}
              activeOpacity={0.7}
              accessibilityLabel="Auto-fill Vendor details as Customer"
            >
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: isVendorAsCustomer ? colors.primary : (isDark ? '#64748B' : '#94A3B8'),
                backgroundColor: isVendorAsCustomer ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isVendorAsCustomer && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={{
                fontSize: 12.5,
                fontWeight: isVendorAsCustomer ? '700' : '500',
                color: isVendorAsCustomer ? colors.primary : themeColors.textSecondary,
              }}>
                Vendor
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.responsiveGridRow}>
            <View style={styles.responsiveGridCol}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <TextInput style={styles.input} placeholder="Customer name" value={customerName} onChangeText={setCustomerName} placeholderTextColor={colors.textMuted} />
            </View>
            <View style={styles.responsiveGridCol}>
              <Text style={styles.fieldLabel}>Customer Phone *</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { width: 68, textAlign: 'center', fontWeight: '700', paddingHorizontal: 4 }]}
                  placeholder="+91"
                  value={customerCountryCode}
                  onChangeText={(v) => setCustomerCountryCode(v.startsWith('+') ? v : `+${v}`)}
                  onBlur={() => {
                    if (!customerCountryCode || customerCountryCode.trim() === '+' || customerCountryCode.trim() === '') {
                      setCustomerCountryCode('+91');
                    }
                  }}
                  keyboardType="phone-pad"
                  maxLength={5}
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={customerCountryCode === '+91' ? 'Enter 10-digit number' : 'Enter mobile number'}
                  value={customerPhone}
                  onChangeText={handleCustomerPhoneChange}
                  keyboardType="phone-pad"
                  maxLength={15}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          </View>
        </View>



        {/* 10. Pricing Details with Top Fare Type & Extra Charges */}
        <View style={[styles.sectionCard, cardShell]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, badgeShell]}>
              <IndianRupee size={18} color={themeColors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Pricing Details</Text>
          </View>

          {isKmTrip && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(['STANDARD', 'ALL_INCLUSIVE'] as const).map((ft) => {
                const isActive = fareType === ft;
                return (
                  <TouchableOpacity
                    key={ft}
                    style={[
                      styles.fareTypeChip,
                      isActive && styles.fareTypeChipActive,
                      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }
                    ]}
                    onPress={() => setFareType(ft)}
                  >
                    <Text style={[styles.fareTypeChipText, isActive && styles.fareTypeChipTextActive]}>
                      {ft === 'ALL_INCLUSIVE' ? 'All Inclusive' : 'Standard'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {tripType === 'hourly' ? (
            <View style={styles.priceGrid}>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Driver rate /hr</Text>
                <TextInput style={styles.priceInput} value={costPerHour} onChangeText={setCostPerHour} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Vendor extra /hr</Text>
                <TextInput style={styles.priceInput} value={extraCostPerHour} onChangeText={setExtraCostPerHour} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Addon km rate</Text>
                <TextInput style={styles.priceInput} value={costForAddonKm} onChangeText={setCostForAddonKm} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceLabel}>Vendor extra addon km</Text>
                <TextInput style={styles.priceInput} value={extraCostForAddonKm} onChangeText={setExtraCostForAddonKm} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
              </View>
            </View>
          ) : (
            <>
              {fareType === 'ALL_INCLUSIVE' ? (
                <View>
                  <View style={styles.priceGrid}>
                    {/* Row 1: Driver Share & Vendor Extra (Markup) */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Driver Amount (₹) *</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={driverAllowance}
                        onChangeText={(v) => setDriverAllowance(stripLeadingZero(v))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Vendor extra / markup (₹)</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={extraAmount}
                        onChangeText={(v) => setExtraAmount(stripLeadingZero(v))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>

                    {/* Row 2: Total Booking Amount (Auto) & Advance Received */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Total Booking Amount (Auto)</Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                            fontWeight: '800',
                            color: colors.primary,
                            borderColor: isDark ? '#3B82F6' : '#93C5FD',
                          },
                        ]}
                        value={String((parseFloat(driverAllowance) || 0) + (parseFloat(extraAmount) || 0))}
                        editable={false}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Advance received (₹)</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={advanceReceived}
                        onChangeText={(v) => setAdvanceReceived(stripLeadingZero(v))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>

                    {/* Row 3: Waiting hours included */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Waiting hours included</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={waitingHoursIncluded}
                        onChangeText={setWaitingHoursIncluded}
                        keyboardType="numeric"
                        placeholder="e.g. 2"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View>
                  {/* Trip Distance & Allowance Rule Banner */}
                  <View style={{
                    backgroundColor: isDark ? '#1E1B4B40' : '#EEF2FF',
                    borderWidth: 1,
                    borderColor: isDark ? '#4338CA60' : '#C7D2FE',
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 12,
                  }}>
                    {tripType === 'oneway' ? (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        🛣️ Oneway Rule: Minimum 130 km billable coverage floor applied
                      </Text>
                    ) : (tripType === 'roundtrip' || tripType === 'multicity') ? (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        🗓️ {tripDays} Days Trip · Min coverage: {250 * tripDays} km (250 km/day) · Driver Bata: ₹{(Number(driverAllowance) || 0) * tripDays}
                      </Text>
                    ) : null}
                  </View>

                  {/* Standard Base Rates & Charges Grid */}
                  <View style={styles.priceGrid}>
                    {/* Row 1: Driver fare /km & Vendor extra /km */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Driver fare /km</Text>
                      <TextInput style={styles.priceInput} value={costPerKm} onChangeText={setCostPerKm} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Vendor extra /km</Text>
                      <TextInput style={styles.priceInput} value={extraCostPerKm} onChangeText={setExtraCostPerKm} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>

                    {/* Row 2: Driver Bata & Vendor Extra Bata */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>
                        Driver Bata {tripDays > 1 ? `(₹${driverAllowance}/d × ${tripDays}d)` : '/day'}
                      </Text>
                      <TextInput style={styles.priceInput} value={driverAllowance} onChangeText={setDriverAllowance} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>
                        Vendor Extra Bata {tripDays > 1 ? `(₹${extraDriverAllowance}/d × ${tripDays}d)` : '/day'}
                      </Text>
                      <TextInput style={styles.priceInput} value={extraDriverAllowance} onChangeText={setExtraDriverAllowance} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>

                    {/* Row 3: Permit charges & Hill charges */}
                    <View style={styles.priceCell}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}
                        onPress={() => setIncludePermit(!includePermit)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: includePermit ? colors.primary : '#94A3B8', backgroundColor: includePermit ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {includePermit && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.priceLabel}>Permit charges</Text>
                      </TouchableOpacity>
                      <TextInput style={[styles.priceInput, !includePermit && { opacity: 0.5 }]} value={permitCharges} onChangeText={setPermitCharges} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} editable={includePermit} />
                    </View>

                    <View style={styles.priceCell}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}
                        onPress={() => setIncludeHill(!includeHill)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: includeHill ? colors.primary : '#94A3B8', backgroundColor: includeHill ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {includeHill && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.priceLabel}>Hill / Ghat charges</Text>
                      </TouchableOpacity>
                      <TextInput style={[styles.priceInput, !includeHill && { opacity: 0.5 }]} value={hillCharges} onChangeText={setHillCharges} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} editable={includeHill} />
                    </View>

                    {/* Row 4: GST 5% (KM Fare) & Toll charges */}
                    <View style={styles.priceCell}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}
                        onPress={() => setIncludeGst(!includeGst)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: includeGst ? '#0284C7' : '#94A3B8', backgroundColor: includeGst ? '#0284C7' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {includeGst && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.priceLabel}>GST 5% (KM Fare)</Text>
                      </TouchableOpacity>
                      <TextInput style={[styles.priceInput, !includeGst && { opacity: 0.5 }]} value={gstAmount} onChangeText={setGstAmount} keyboardType="numeric" placeholder="Auto 5%" placeholderTextColor={colors.textMuted} editable={includeGst} />
                    </View>

                    <View style={styles.priceCell}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}
                        onPress={() => setIncludeToll(!includeToll)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: includeToll ? colors.primary : '#94A3B8', backgroundColor: includeToll ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {includeToll && <Check size={11} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.priceLabel}>Toll charges {includeToll ? '(Included)' : '(Excluded)'}</Text>
                      </TouchableOpacity>
                      <TextInput style={[styles.priceInput, !includeToll && { opacity: 0.5 }]} value={tollCharges} onChangeText={setTollCharges} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} editable={includeToll} />
                    </View>

                    {/* Row 5: Vendor Extra Margin & Advance received */}
                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Vendor Extra Margin</Text>
                      <TextInput style={styles.priceInput} value={extraPermitCharges} onChangeText={setExtraPermitCharges} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>

                    <View style={styles.priceCell}>
                      <Text style={styles.priceLabel}>Advance received</Text>
                      <TextInput style={styles.priceInput} value={advanceReceived} onChangeText={setAdvanceReceived} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} />
                    </View>
                  </View>

                  {/* Dynamic Inline Custom Charges List & + Add Custom Charge Button */}
                  <View style={{ marginTop: 12 }}>
                    {customCharges.map((item) => (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, backgroundColor: themeColors.surface, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border }}>
                        <TouchableOpacity
                          onPress={() => {
                            setCustomCharges(customCharges.map((c) => (c.id === item.id ? { ...c, included: !c.included } : c)));
                          }}
                        >
                          <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: item.included ? colors.primary : '#94A3B8', backgroundColor: item.included ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {item.included && <Check size={12} color="#FFFFFF" />}
                          </View>
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.priceInput, { flex: 1, height: 38, marginBottom: 0 }]}
                          placeholder="Charge name (e.g. Parking / Waiting)"
                          value={item.name}
                          onChangeText={(text) => {
                            setCustomCharges(customCharges.map((c) => (c.id === item.id ? { ...c, name: text } : c)));
                          }}
                          placeholderTextColor={colors.textMuted}
                        />
                        <TextInput
                          style={[styles.priceInput, { width: 90, height: 38, marginBottom: 0 }]}
                          placeholder="Amount ₹"
                          value={item.amount}
                          onChangeText={(text) => {
                            setCustomCharges(customCharges.map((c) => (c.id === item.id ? { ...c, amount: text } : c)));
                          }}
                          keyboardType="numeric"
                          placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity
                          onPress={() => setCustomCharges(customCharges.filter((c) => c.id !== item.id))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <X size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: colors.primary,
                      }}
                      onPress={() => {
                        setCustomCharges([
                          ...customCharges,
                          { id: String(Date.now()), name: '', amount: '0', included: true },
                        ]);
                      }}
                      activeOpacity={0.8}
                    >
                      <Plus size={16} color={colors.primary} />
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary }}>
                        + Add Custom Charge (e.g. Parking / Waiting)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 10% Platform Commission Checkbox Card (Vendor App Style) */}
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#E2E8F0' }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: applyCommission
                      ? (isDark ? '#1E1B4B' : '#F0F9FF')
                      : (isDark ? '#1E293B' : '#FEF2F2'),
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: applyCommission
                      ? (isDark ? '#6366F1' : '#0284C7')
                      : (isDark ? '#EF4444' : '#FCA5A5'),
                  }}
                  onPress={() => {
                    if (applyCommission) {
                      setShowWaiveCommissionModal(true);
                    } else {
                      setApplyCommission(true);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 }}>
                    {/* Interactive Checkbox Icon */}
                    <View style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: applyCommission ? colors.primary : themeColors.textMuted,
                      backgroundColor: applyCommission ? colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {applyCommission && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Percent size={14} color={applyCommission ? colors.primary : themeColors.textMuted} />
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: themeColors.text }}>
                          10% Platform Commission (CC)
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11.5, color: applyCommission ? (isDark ? '#93C5FD' : '#0369A1') : (isDark ? '#FCA5A5' : '#DC2626'), marginTop: 2, fontWeight: '600' }}>
                        {applyCommission ? 'Active · 10% platform commission retained' : 'Waived · Commission-free booking'}
                      </Text>
                    </View>
                  </View>

                  {/* Active / Waived Status Badge */}
                  <View style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: applyCommission ? '#DCFCE7' : '#FEE2E2',
                    borderWidth: 1,
                    borderColor: applyCommission ? '#86EFAC' : '#FCA5A5',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: applyCommission ? '#166534' : '#991B1B' }}>
                      {applyCommission ? 'Active' : 'Waived'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* 12. Pickup Notes / Driver Instructions */}
        <View style={[styles.sectionCard, cardShell]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBadge, badgeShell]}>
              <StickyNote size={18} color={themeColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Pickup Notes & Driver Instructions</Text>
              <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 1 }}>
                Prominently displayed to drivers on the booking card before accepting
              </Text>
            </View>
          </View>
          <TextInput
            style={[styles.input, { minHeight: 65, textAlignVertical: 'top', marginBottom: 8 }]}
            placeholder="e.g. Call customer 30 mins before arrival, Terminal 2 Gate 4 pickup"
            value={pickupNotes}
            onChangeText={setPickupNotes}
            multiline
            placeholderTextColor={colors.textMuted}
          />
          {/* Quick preset suggestion chips */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[
              '📞 Call before arrival',
              '✈️ Airport pickup / Flight',
              '👴 Elderly passenger - drive gently',
              '⏱️ Urgent / Sharp on-time pickup',
            ].map((preset) => (
              <TouchableOpacity
                key={preset}
                onPress={() => {
                  if (!pickupNotes.trim()) {
                    setPickupNotes(preset);
                  } else if (!pickupNotes.includes(preset)) {
                    setPickupNotes(`${pickupNotes.trim()}, ${preset}`);
                  }
                }}
                style={{
                  backgroundColor: pickupNotes.includes(preset) ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#1E293B' : '#F1F5F9'),
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: pickupNotes.includes(preset) ? colors.primary : themeColors.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: pickupNotes.includes(preset) ? colors.primary : themeColors.textSecondary }}>
                  + {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Special Requests & Priority – shown after Pickup Notes */}
        {isKmTrip && (
          <>
            {/* Special Requests */}
            <View style={[styles.sectionCard, cardShell]}>
              <TouchableOpacity style={[styles.summaryCardTouchable, summaryShell]} onPress={() => setShowSpecialRequestsModal(true)} activeOpacity={0.8}>
                <View style={styles.summaryCardLeft}>
                  <View style={[styles.summaryIconCircle, badgeShell]}>
                    <Sliders size={20} color={themeColors.primary} />
                  </View>
                  <View style={styles.summaryTextContent}>
                    <Text style={[styles.summaryTitle, { color: themeColors.text }]}>
                      {(() => {
                        const reqs: string[] = [];
                        if (requireCarMakeYear) reqs.push(`Year ${carMakeYear || '2020'}+`);
                        if (carrierRequired) reqs.push('Carrier');
                        if (nonCng) reqs.push('Non CNG');
                        if (petFriendly) reqs.push('Pet Friendly');
                        customSpecialRequests.filter((r) => r.included && r.name.trim()).forEach((r) => reqs.push(r.name.trim()));
                        return reqs.length === 0 ? 'No Special Requests' : reqs.join(', ');
                      })()}
                    </Text>
                    <Text style={[styles.summarySubtitle, { color: themeColors.textSecondary }]}>
                      {(() => {
                        const stdCount = [requireCarMakeYear, carrierRequired, nonCng, petFriendly].filter(Boolean).length;
                        const customCount = customSpecialRequests.filter((r) => r.included && r.name.trim()).length;
                        const count = stdCount + customCount;
                        return count === 0 ? 'Tap to select vehicle requirements' : `${count} active request${count > 1 ? 's' : ''}`;
                      })()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.editPillButton, pillShell]}>
                  <Text style={[styles.editPillText, { color: themeColors.primary }]}>Edit</Text>
                  <ChevronRight size={14} color={themeColors.primary} />
                </View>
              </TouchableOpacity>

              {/* Dynamic Inline Custom Special Requests List & + Add Custom Request Button */}
              <View style={{ marginTop: 12 }}>
                {customSpecialRequests.map((item) => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, backgroundColor: themeColors.surface, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border }}>
                    <TouchableOpacity
                      onPress={() => {
                        setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, included: !c.included } : c)));
                      }}
                    >
                      <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: item.included ? colors.primary : '#94A3B8', backgroundColor: item.included ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {item.included && <Check size={12} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.priceInput, { flex: 1, height: 38, marginBottom: 0 }]}
                      placeholder="Request (e.g. Baby Seat, English Driver)"
                      value={item.name}
                      onChangeText={(text) => {
                        setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, name: text } : c)));
                      }}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                      style={[styles.priceInput, { width: 95, height: 38, marginBottom: 0 }]}
                      placeholder="Allowance ₹"
                      value={item.allowance}
                      onChangeText={(text) => {
                        setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, allowance: stripLeadingZero(text) } : c)));
                      }}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      onPress={() => setCustomSpecialRequests(customSpecialRequests.filter((c) => c.id !== item.id))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.primary,
                  }}
                  onPress={() => {
                    setCustomSpecialRequests([
                      ...customSpecialRequests,
                      { id: String(Date.now()), name: '', allowance: '0', included: true },
                    ]);
                  }}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color={colors.primary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary }}>
                    + Add Custom Request (e.g. Baby Seat / English Driver)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Customer number to driver - inline, auto-filled, editable */}
            <View style={[styles.sectionCard, cardShell]}>
              <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Show customer number to driver</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode === 'instant' && { backgroundColor: '#10B981', borderColor: '#059669' }]}
                  onPress={() => setCustPhoneRevealMode('instant')}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === 'instant' && { color: '#FFFFFF', fontWeight: '800' }]}>⚡ Instant on accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode !== 'instant' && styles.chipActive]}
                  onPress={() => { setCustPhoneRevealTouched(false); setCustPhoneRevealMode('custom'); }}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode !== 'instant' && styles.chipTextActive]}>Scheduled</Text>
                </TouchableOpacity>
              </View>
              {custPhoneRevealMode !== 'instant' && (
                <View style={{ marginTop: 8 }}>
                  {custPhoneRevealMode === '1h' || custPhoneRevealMode === '4h' ? (
                    <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
                      {custPhoneRevealMode === '1h' ? '1 hr' : '4 hrs'} before pickup (set in Configure)
                    </Text>
                  ) : (
                    <>
                      <DateTimeField
                        dateLabel="Reveal date"
                        timeLabel="Reveal time"
                        dateValue={custPhoneRevealDate}
                        timeValue={custPhoneRevealTime}
                        onDateChange={(v) => { setCustPhoneRevealTouched(true); setCustPhoneRevealMode('custom'); setCustPhoneRevealDate(v); }}
                        onTimeChange={(v) => { setCustPhoneRevealTouched(true); setCustPhoneRevealMode('custom'); setCustPhoneRevealTime(v); }}
                      />
                      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
                        {custPhoneRevealTouched ? 'Custom time set.' : 'Auto-set to 2 hrs before pickup - follows the pickup time. Change it if needed.'}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {/* Priority & Configurations */}
            <View style={[styles.sectionCard, cardShell]}>
              <TouchableOpacity
                style={[styles.summaryCardTouchable, summaryShell]}
                onPress={() => setShowBookingConfigModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.summaryCardLeft}>
                  <View style={[styles.summaryIconCircle, badgeShell]}>
                    <Clock size={20} color={themeColors.primary} />
                  </View>
                  <View style={styles.summaryTextContent}>
                    <Text style={[styles.summaryTitle, { color: themeColors.text }]}>
                      {custPhoneRevealMode === 'instant'
                        ? 'Customer Phone: ⚡ Instantly upon accept'
                        : custPhoneRevealMode === '1h'
                          ? 'Customer Phone: 1 hr before pickup'
                          : custPhoneRevealMode === '4h'
                            ? 'Customer Phone: 4 hrs before pickup'
                            : custPhoneRevealMode === 'custom' && custPhoneRevealTime
                              ? `Customer Phone: Reveal at ${custPhoneRevealDate || ''} ${custPhoneRevealTime}`
                              : 'Customer Phone: 2 hrs before pickup (Default)'}
                    </Text>
                    <Text style={[styles.summarySubtitle, { color: themeColors.textSecondary }]}>
                      {(() => {
                        const parts: string[] = [];
                        if (priorityForPaid) {
                          parts.push(priorityCutoffTime ? `⭐ Trusted First until ${priorityCutoffDate || ''} ${priorityCutoffTime}` : '⭐ Trusted Partners First');
                        } else {
                          parts.push('Open to Everyone');
                        }
                        if (liveUntilDate || liveUntilTime) parts.push(`Live until ${[liveUntilDate, liveUntilTime].filter(Boolean).join(' ')}`);
                        else parts.push('Standard auto-cancel timer');
                        parts.push('Tap to edit priority, visibility & timers');
                        return parts.join(' · ');
                      })()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.editPillButton, pillShell]}>
                  <Text style={[styles.editPillText, { color: themeColors.primary }]}>Configure</Text>
                  <ChevronRight size={14} color={themeColors.primary} />
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {fare && (
          <View style={{ marginTop: 18, gap: 12 }}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, fontSize: 16, fontWeight: '800' }]}>
              📊 Quote Review & Fare Breakdown
            </Text>

            {/* Cash to Collect from Customer Banner - shown only after quote calculation */}
            {(() => {
              const custTotal = Number(fare.customer_amount || fare.total_amount || 0);
              const adv = parseFloat(advanceReceived) || 0;
              const cashToCollect = Math.max(0, custTotal - adv);
              return (
                <View style={{
                  backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                  borderColor: '#3B82F6',
                  borderWidth: 1.5,
                  borderRadius: 6,
                  padding: 14,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    💵 Cash to Collect from Customer
                  </Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#1E40AF', marginTop: 4 }}>
                    ₹{cashToCollect.toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#3B82F6', marginTop: 2 }}>
                    (Fare: ₹{custTotal.toLocaleString('en-IN')} - Advance Received: ₹{adv.toLocaleString('en-IN')})
                  </Text>
                </View>
              );
            })()}

            {/* Customer / Vendor Pricing Card */}
            <View style={[styles.fareCard, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#3B82F6' }]}>
              <Text style={[styles.fareTitle, { color: '#2563EB' }]}>💵 Customer / Vendor Pricing</Text>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: themeColors.text }]}>Total Customer Fare</Text>
                <Text style={[styles.fareValueEmphasis, { color: '#2563EB', fontSize: 18 }]}>
                  ₹{Number(fare.customer_amount || fare.total_amount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              {fare.total_km != null && (
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: themeColors.textSecondary }]}>Distance & Est. Time</Text>
                  <Text style={[styles.fareValue, { color: themeColors.text }]}>
                    {tripType === 'oneway' && Number(fare.total_km) <= 130 ? '130 km (Min billable)' : `${fare.total_km} km`} · {fare.trip_time || 'N/A'}
                  </Text>
                </View>
              )}
              {tripType === 'roundtrip' && (
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: themeColors.textSecondary }]}>Trip Duration & Min Km</Text>
                  <Text style={[styles.fareValue, { color: colors.primary, fontWeight: '700' }]}>
                    {tripDays} Day{tripDays > 1 ? 's' : ''} (Min {250 * tripDays} km)
                  </Text>
                </View>
              )}
            </View>

            {/* Driver Pricing Card */}
            <View style={[styles.fareCard, { backgroundColor: isDark ? '#1E293B' : '#F5F3FF', borderColor: '#8B5CF6' }]}>
              <Text style={[styles.fareTitle, { color: '#7C3AED' }]}>🚗 Driver Pricing</Text>
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: themeColors.text }]}>Est. Driver Net Amount</Text>
                <Text style={[styles.fareValueEmphasis, { color: '#7C3AED', fontSize: 18 }]}>
                  ₹{Number(fare.driver_amount || fare.estimate_price || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              {fare.driver_allowance != null && Number(fare.driver_allowance) > 0 && (
                <View style={styles.fareRow}>
                  <Text style={[styles.fareLabel, { color: themeColors.textSecondary }]}>Driver Allowance</Text>
                  <Text style={[styles.fareValue, { color: themeColors.text }]}>₹{fare.driver_allowance}</Text>
                </View>
              )}
            </View>

            {/* Admin / Platform Earnings Card */}
            {(() => {
              const custTotal = Number(fare.customer_amount || fare.total_amount || 0);
              const drvTotal = Number(fare.driver_amount || fare.estimate_price || 0);
              const baseKm = Number(fare.base_km_amount || 0);
              const comm = applyCommission ? Math.round(baseKm * 0.10) : 0;
              const extraMarkup = Math.max(0, custTotal - drvTotal);
              const totalEarnings = comm + extraMarkup;
              return (
                <View style={[styles.fareCard, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: '#10B981' }]}>
                  <Text style={[styles.fareTitle, { color: '#059669' }]}>📈 Platform / Admin Earnings</Text>
                  <View style={styles.fareRow}>
                    <Text style={[styles.fareLabel, { color: themeColors.text }]}>10% Commission</Text>
                    <Text style={[styles.fareValue, { color: themeColors.text }]}>₹{comm}</Text>
                  </View>
                  {extraMarkup > 0 && (
                    <View style={styles.fareRow}>
                      <Text style={[styles.fareLabel, { color: themeColors.text }]}>Vendor Extra / Markup</Text>
                      <Text style={[styles.fareValue, { color: themeColors.text }]}>₹{extraMarkup}</Text>
                    </View>
                  )}
                  <View style={[styles.fareRow, { borderTopWidth: 1, borderTopColor: '#A7F3D0', paddingTop: 6, marginTop: 4 }]}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }}>Total Admin Profit</Text>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#059669' }}>₹{totalEarnings}</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* Broadcast To (admin-only broadcast targeting - Redesigned Premium Style) */}
        <View style={[styles.sectionCard, cardShell, { marginTop: 14 }, showNearCitySuggestions && { zIndex: 30, elevation: 30 }]}>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: sendTo === 'ALL' ? colors.primary : themeColors.border,
                backgroundColor: sendTo === 'ALL' ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#1E293B' : '#F8FAFC'),
              }}
              onPress={() => setSendTo('ALL')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: sendTo === 'ALL' ? colors.primary : (isDark ? '#334155' : '#CBD5E1'), alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={14} color="#FFFFFF" />
                </View>
                {sendTo === 'ALL' && <CheckCircle2 size={16} color={colors.primary} />}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>All Drivers Network</Text>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>All drivers & fleet owners</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: sendTo === 'NEAR_CITY' ? colors.primary : themeColors.border,
                backgroundColor: sendTo === 'NEAR_CITY' ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#1E293B' : '#F8FAFC'),
              }}
              onPress={() => setSendTo('NEAR_CITY')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: sendTo === 'NEAR_CITY' ? colors.primary : (isDark ? '#334155' : '#CBD5E1'), alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={14} color="#FFFFFF" />
                </View>
                {sendTo === 'NEAR_CITY' && <CheckCircle2 size={16} color={colors.primary} />}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>Near City Target</Text>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>Selected pickup hubs only</Text>
            </TouchableOpacity>
          </View>

          {/* Allocate manually - hand this booking directly to one driver
              instead of broadcasting it (backend: send_to "DRIVER" +
              target_driver_id, already supported end to end). */}
          <TouchableOpacity
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: sendTo === 'DRIVER' ? colors.primary : themeColors.border,
              backgroundColor: sendTo === 'DRIVER' ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#1E293B' : '#F8FAFC'),
            }}
            onPress={() => setSendTo(sendTo === 'DRIVER' ? 'ALL' : 'DRIVER')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: sendTo === 'DRIVER' ? colors.primary : (isDark ? '#334155' : '#CBD5E1'), alignItems: 'center', justifyContent: 'center' }}>
                <Send size={14} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>Allocate manually</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>Give it directly to one fleet driver</Text>
              </View>
              {sendTo === 'DRIVER' && <CheckCircle2 size={16} color={colors.primary} />}
            </View>
          </TouchableOpacity>

          {sendTo === 'DRIVER' && (
            <View style={{ marginTop: 12 }}>
              {!allocateTarget ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? '#0F172A' : '#F9FAFB', borderWidth: 1, borderColor: themeColors.border, borderRadius: 6, paddingHorizontal: 10, height: 42 }}>
                    <Search size={16} color={themeColors.textMuted} />
                    <TextInput
                      style={{ flex: 1, fontSize: 13, color: themeColors.text }}
                      placeholder="Driver name or phone number"
                      placeholderTextColor={themeColors.textMuted}
                      value={allocateQuery}
                      onChangeText={setAllocateQuery}
                    />
                  </View>
                  {allocateSearching && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
                  {!allocateSearching && allocateQuery.trim().length >= 3 && allocateResults.length === 0 && (
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 8, fontStyle: 'italic' }}>No driver found. Keep typing, or try their phone number.</Text>
                  )}
                  {allocateResults.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                      onPress={() => { setAllocateTarget(d); setAllocateResults([]); setAllocateQuery(''); }}
                    >
                      <View>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>{d.name}</Text>
                        {!!d.primary_number && <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>{d.primary_number}</Text>}
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: d.account_status === 'active' ? colors.success : themeColors.textMuted, textTransform: 'capitalize' }}>{d.account_status}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderWidth: 1, borderColor: colors.primary, borderRadius: 6, padding: 12 }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>{allocateTarget.name}</Text>
                    {!!allocateTarget.primary_number && <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>{allocateTarget.primary_number}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => { setAllocateTarget(null); setAllocateQuery(''); }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {sendTo === 'NEAR_CITY' && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.textSecondary }}>
                    Target Cities ({nearCities.length} selected):
                  </Text>
                  {nearCities.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setNearCities([])}
                      style={{
                        backgroundColor: isDark ? '#7F1D1D35' : '#FEE2E2',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#EF4444',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444' }}>
                        Clear All
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => setShowTargetCityModal(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}
                  activeOpacity={0.8}
                >
                  <Plus size={13} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    + Add / Edit Cities
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected Target Cities Pills */}
              {nearCities.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                  {nearCities.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
                        borderColor: colors.primary,
                        borderWidth: 1,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                      }}
                      onPress={() => removeNearCity(c)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{c}</Text>
                      <X size={13} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.error, fontStyle: 'italic', marginTop: 2 }}>
                  ⚠️ Please select at least one target city for Near City broadcast.
                </Text>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.primaryButton, quoting && { opacity: 0.6 }]} onPress={handleGetQuote} disabled={quoting}>
          {quoting ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryButtonText}>{fare ? 'Re-Calculate Fare' : 'Calculate Fare / Get Quote'}</Text>}
        </TouchableOpacity>

        {fare && (
          <TouchableOpacity style={[styles.confirmButton, confirming && { opacity: 0.6 }]} onPress={handleConfirm} disabled={confirming}>
            {confirming ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryButtonText}>Confirm & Post Booking</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Sticky Quote Review bar - once a fare is calculated, keep the total
          and a Confirm button always reachable without scrolling back down
          through the whole form (the pattern the Vendor App's dedicated
          Quote Review step gives; kept as a lightweight addition here rather
          than a separate screen, so nothing about how the form itself works
          changes - the button below just calls the same handleConfirm()
          as the one inside the scroll). Sits outside the ScrollView so it
          never moves. */}
      {fare && !confirming && (
        <View style={[styles.stickyReviewBar, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stickyReviewLabel, { color: themeColors.textSecondary }]}>Customer fare</Text>
            <Text style={[styles.stickyReviewAmount, { color: themeColors.text }]}>
              ₹{Number(fare.customer_amount || fare.total_amount || 0).toLocaleString('en-IN')}
            </Text>
          </View>
          <TouchableOpacity style={styles.stickyReviewBtn} onPress={handleConfirm} disabled={confirming}>
            <Text style={styles.primaryButtonText}>Confirm & Post</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Modal Confirmation Dialog for Waiving 10% Platform Commission */}
      <Modal
        visible={showWaiveCommissionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWaiveCommissionModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 440,
            backgroundColor: themeColors.surface,
            borderRadius: 10,
            padding: 24,
            borderWidth: 1,
            borderColor: themeColors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 25,
            alignItems: 'center',
          }}>
            {/* Warning Icon Badge */}
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#FEF3C7',
              borderWidth: 2,
              borderColor: '#FCD34D',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <AlertCircle size={30} color="#D97706" />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '900', color: themeColors.text, textAlign: 'center', marginBottom: 8 }}>
              Waive 10% Platform Commission?
            </Text>

            <Text style={{ fontSize: 13.5, color: themeColors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              Disabling this waives the 10% platform commission fee for this booking. Platform commission will <Text style={{ fontWeight: '800', color: colors.primary }}>NOT</Text> be collected at trip completion.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: isDark ? '#1E293B' : '#F3F4F6',
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#E5E7EB',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setShowWaiveCommissionModal(false)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: themeColors.text }}>
                  Keep Active (10%)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: '#DC2626',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 3,
                }}
                onPress={() => {
                  setApplyCommission(false);
                  setShowWaiveCommissionModal(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }}>
                  Yes, Waive Commission
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCarTypePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCarTypePicker(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Car size={20} color={colors.primary} />
              <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Select Vehicle Category</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCarTypePicker(false)} accessibilityLabel="Close">
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            {VEHICLE_CATEGORIES.map((cat) => {
              const isBaseActive = cat.baseValue === carType || (cat.subTiers && cat.subTiers.some(st => st.value === carType));
              return (
                <View
                  key={cat.id}
                  style={{
                    backgroundColor: themeColors.surface,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: isBaseActive ? colors.primary : themeColors.border,
                    marginBottom: 12,
                    padding: 14,
                  }}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    onPress={() => {
                      setCarType(cat.baseValue);
                      if (!cat.subTiers) setShowCarTypePicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={{
                        width: 38,
                        height: 38,
                        borderRadius: 6,
                        backgroundColor: isBaseActive ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#1E293B' : '#F1F5F9'),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Car size={20} color={isBaseActive ? colors.primary : themeColors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>{cat.name}</Text>
                        <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 2 }}>{cat.models}</Text>
                      </View>
                    </View>
                    {isBaseActive && <CheckCircle2 size={20} color={colors.primary} />}
                  </TouchableOpacity>

                  {/* Sub-Tier Chips (Customer App Style) for SUV, Innova, Innova Crysta */}
                  {cat.subTiers && (
                    <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {cat.subTiers.map((sub) => {
                          const isSubActive = carType === sub.value;
                          return (
                            <TouchableOpacity
                              key={sub.value}
                              style={{
                                flex: 1,
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 6,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isSubActive ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                                borderWidth: 1,
                                borderColor: isSubActive ? colors.primary : themeColors.border,
                              }}
                              onPress={() => {
                                setCarType(sub.value);
                                setShowCarTypePicker(false);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={{
                                fontSize: 12,
                                fontWeight: isSubActive ? '800' : '600',
                                color: isSubActive ? '#FFFFFF' : themeColors.text,
                              }}>
                                {sub.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

            {/* Trip Extras & Surcharges Modal */}
      <Modal
        visible={showExtrasModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExtrasModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={20} color={colors.primary} />
              <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Trip Extras & Surcharges</Text>
            </View>
            <TouchableOpacity onPress={() => setShowExtrasModal(false)} accessibilityLabel="Close">
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Select charges collected extra from customer and specify amounts. These will be added to the total quoted fare.
            </Text>

            {/* Toll Charges */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includeToll ? colors.primary : themeColors.border, marginBottom: 10 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludeToll((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includeToll ? colors.primary : '#94A3B8', backgroundColor: includeToll ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includeToll && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>🛣️ Toll Charges</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{includeToll ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includeToll && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>Toll Amount:</Text>
                  <TextInput style={[styles.priceInput, { width: 140, height: 38 }]} placeholder="Amount ₹" value={tollCharges} onChangeText={setTollCharges} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>

            {/* State Permit */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includePermit ? colors.primary : themeColors.border, marginBottom: 10 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludePermit((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includePermit ? colors.primary : '#94A3B8', backgroundColor: includePermit ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includePermit && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>📄 State Permit</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{includePermit ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includePermit && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '600', marginBottom: 2 }}>Permit Amount (₹):</Text>
                    <TextInput style={[styles.priceInput, { height: 38 }]} placeholder="0" value={permitCharges} onChangeText={setPermitCharges} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '600', marginBottom: 2 }}>Vendor Extra Permit (₹):</Text>
                    <TextInput style={[styles.priceInput, { height: 38 }]} placeholder="0" value={extraPermitCharges} onChangeText={setExtraPermitCharges} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                  </View>
                </View>
              )}
            </View>

            {/* Hill Charges */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includeHill ? colors.primary : themeColors.border, marginBottom: 10 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludeHill((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includeHill ? colors.primary : '#94A3B8', backgroundColor: includeHill ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includeHill && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>⛰️ Hill / Ghat Charges</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{includeHill ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includeHill && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>Hill Amount:</Text>
                  <TextInput style={[styles.priceInput, { width: 140, height: 38 }]} placeholder="Amount ₹" value={hillCharges} onChangeText={setHillCharges} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Night Driving Allowance */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includeNight ? colors.primary : themeColors.border, marginBottom: 10 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludeNight((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includeNight ? colors.primary : '#94A3B8', backgroundColor: includeNight ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includeNight && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>🌙 Night Driving Charges</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{includeNight ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includeNight && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>Night Amount:</Text>
                  <TextInput style={[styles.priceInput, { width: 140, height: 38 }]} placeholder="Amount ₹" value={nightCharges} onChangeText={setNightCharges} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Custom Surcharge */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includeCustomCharge ? colors.primary : themeColors.border, marginBottom: 16 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludeCustomCharge((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includeCustomCharge ? colors.primary : '#94A3B8', backgroundColor: includeCustomCharge ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includeCustomCharge && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>⚙️ Custom Surcharge</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>{includeCustomCharge ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includeCustomCharge && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.priceInput, { flex: 1, height: 38 }]} placeholder="Charge name (e.g. Parking)" value={customChargeName} onChangeText={setCustomChargeName} placeholderTextColor={colors.textMuted} />
                  <TextInput style={[styles.priceInput, { width: 100, height: 38 }]} placeholder="Amount ₹" value={customChargeAmount} onChangeText={setCustomChargeAmount} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>

            {/* GST (5% on Pure KM Running Fare) */}
            <View style={{ backgroundColor: themeColors.surface, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: includeGst ? '#0284C7' : themeColors.border, marginBottom: 16 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setIncludeGst((v) => !v)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: includeGst ? '#0284C7' : '#94A3B8', backgroundColor: includeGst ? '#0284C7' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {includeGst && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.text }}>🧾 GST (5% on KM Running Fare)</Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>Pure KM fare only · Excludes driver bata & tolls</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#0284C7', fontWeight: '700' }}>{includeGst ? 'Included' : 'Not Included'}</Text>
              </TouchableOpacity>
              {includeGst && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '600' }}>GST Amount (₹):</Text>
                  <TextInput style={[styles.priceInput, { width: 140, height: 38 }]} placeholder="Auto (5%)" value={gstAmount} onChangeText={setGstAmount} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Done & Apply Button */}
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 13,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 30,
              }}
              onPress={() => setShowExtrasModal(false)}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                Save & Apply Extras (+₹{getExtrasTotalAmount()})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showTripTypePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTripTypePicker(false)}
      >
        <SafeAreaView style={styles.pickerModalContainer}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.pickerModalTitle}>Select Trip Type</Text>
            <TouchableOpacity onPress={() => setShowTripTypePicker(false)} accessibilityLabel="Close">
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            {TRIP_TYPES.map((t) => {
              const isActive = tripType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.pickerModalOption, isActive && styles.pickerModalOptionActive]}
                  onPress={() => {
                    setTripType(t.value);
                    setFare(null);
                    setShowTripTypePicker(false);
                  }}
                >
                  <Route size={18} color={isActive ? colors.primary : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerModalOptionText, isActive && styles.pickerModalOptionTextActive]}>
                      {t.label}
                    </Text>
                    <Text style={styles.pickerModalOptionSubtext}>{TRIP_TYPE_SUBTITLES[t.value]}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Special Requests Modal */}
      <Modal
        visible={showSpecialRequestsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSpecialRequestsModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Special Requests</Text>
            <TouchableOpacity onPress={() => setShowSpecialRequestsModal(false)} accessibilityLabel="Close">
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.hint, { marginBottom: 10 }]}>Select vehicle requirements and optional driver allowances</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.chip, requireCarMakeYear && styles.chipActive]}
                onPress={() => setRequireCarMakeYear(!requireCarMakeYear)}
              >
                <Text style={[styles.chipText, requireCarMakeYear && styles.chipTextActive]}>
                  📅 Year From {requireCarMakeYear && carMakeYear ? `(${carMakeYear}+)` : ''}
                </Text>
                {requireCarMakeYear && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, carrierRequired && styles.chipActive]}
                onPress={() => setCarrierRequired(!carrierRequired)}
              >
                <Text style={[styles.chipText, carrierRequired && styles.chipTextActive]}>🧳 Carrier</Text>
                {carrierRequired && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, nonCng && styles.chipActive]}
                onPress={() => setNonCng(!nonCng)}
              >
                <Text style={[styles.chipText, nonCng && styles.chipTextActive]}>⚡ Non CNG</Text>
                {nonCng && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, petFriendly && styles.chipActive]}
                onPress={() => setPetFriendly(!petFriendly)}
              >
                <Text style={[styles.chipText, petFriendly && styles.chipTextActive]}>🐾 Pet Friendly</Text>
                {petFriendly && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            </View>

            {requireCarMakeYear && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldSubLabel}>Minimum Year (e.g. 2020)</Text>
                <TextInput style={styles.input} placeholder="e.g. 2020" value={carMakeYear} onChangeText={setCarMakeYear} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                <Text style={styles.fieldSubLabel}>Year Requirement Driver Allowance (₹)</Text>
                <TextInput style={styles.input} placeholder="0" value={carYearCharge} onChangeText={(v) => setCarYearCharge(stripLeadingZero(v))} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                {(parseFloat(carYearCharge || '0') || 0) > 0 && (
                  <Text style={styles.hint}>₹{parseFloat(carYearCharge)} allowance included</Text>
                )}
              </View>
            )}
            {carrierRequired && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldSubLabel}>Carrier Driver Allowance (₹)</Text>
                <TextInput style={styles.input} placeholder="0" value={carrierCharge} onChangeText={(v) => setCarrierCharge(stripLeadingZero(v))} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                {(parseFloat(carrierCharge || '0') || 0) > 0 && (
                  <Text style={styles.hint}>₹{parseFloat(carrierCharge)} allowance included</Text>
                )}
              </View>
            )}
            {nonCng && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldSubLabel}>Non CNG Driver Allowance (₹)</Text>
                <TextInput style={styles.input} placeholder="0" value={nonCngCharge} onChangeText={(v) => setNonCngCharge(stripLeadingZero(v))} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                {(parseFloat(nonCngCharge || '0') || 0) > 0 && (
                  <Text style={styles.hint}>₹{parseFloat(nonCngCharge)} allowance included</Text>
                )}
              </View>
            )}
            {petFriendly && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.fieldSubLabel}>Pet Friendly Driver Allowance (₹)</Text>
                <TextInput style={styles.input} placeholder="0" value={petFriendlyCharge} onChangeText={(v) => setPetFriendlyCharge(stripLeadingZero(v))} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                {(parseFloat(petFriendlyCharge || '0') || 0) > 0 && (
                  <Text style={styles.hint}>₹{parseFloat(petFriendlyCharge)} allowance included</Text>
                )}
              </View>
            )}

            {/* Custom Special Requests Section in Modal */}
            <View style={{ marginTop: 16, marginBottom: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: themeColors.border }}>
              <Text style={[styles.fieldSubLabel, { marginBottom: 8, fontWeight: '700' }]}>Custom Special Requests (Manual)</Text>
              {customSpecialRequests.map((item) => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border }}>
                  <TouchableOpacity
                    onPress={() => {
                      setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, included: !c.included } : c)));
                    }}
                  >
                    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: item.included ? colors.primary : '#94A3B8', backgroundColor: item.included ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {item.included && <Check size={12} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { flex: 1, height: 38, marginBottom: 0 }]}
                    placeholder="Request (e.g. Baby Seat, English Driver)"
                    value={item.name}
                    onChangeText={(text) => {
                      setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, name: text } : c)));
                    }}
                    placeholderTextColor={colors.textMuted}
                  />
                  <TextInput
                    style={[styles.input, { width: 95, height: 38, marginBottom: 0 }]}
                    placeholder="Allowance ₹"
                    value={item.allowance}
                    onChangeText={(text) => {
                      setCustomSpecialRequests(customSpecialRequests.map((c) => (c.id === item.id ? { ...c, allowance: stripLeadingZero(text) } : c)));
                    }}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity
                    onPress={() => setCustomSpecialRequests(customSpecialRequests.filter((c) => c.id !== item.id))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.primary,
                  marginTop: customSpecialRequests.length > 0 ? 4 : 0,
                }}
                onPress={() => {
                  setCustomSpecialRequests([
                    ...customSpecialRequests,
                    { id: String(Date.now()), name: '', allowance: '0', included: true },
                  ]);
                }}
                activeOpacity={0.8}
              >
                <Plus size={16} color={colors.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary }}>
                  + Add Custom Request (e.g. Baby Seat / Roof Rack)
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalSaveButton, { marginTop: 8, marginBottom: 24 }]}
              onPress={() => setShowSpecialRequestsModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>Save Special Requests</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Trusted Partners Priority Modal */}
      <Modal
        visible={showTrustedPartnersModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTrustedPartnersModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Trusted Partners Priority</Text>
            <TouchableOpacity onPress={() => setShowTrustedPartnersModal(false)} accessibilityLabel="Close">
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, !priorityForPaid && styles.chipActive]} onPress={() => setPriorityForPaid(false)}>
                <Text style={[styles.chipText, !priorityForPaid && styles.chipTextActive]}>Open to Everyone</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, priorityForPaid && styles.chipActive]} onPress={() => setPriorityForPaid(true)}>
                <Text style={[styles.chipText, priorityForPaid && styles.chipTextActive]}>Trusted Partners First</Text>
              </TouchableOpacity>
            </View>
            {priorityForPaid && (
              <>
                <Text style={[styles.hint, { marginTop: 10 }]}>Only Trusted Partners can accept until the cutoff below; Standard Partners after. Leave blank for a server-computed default.</Text>
                <View style={{ marginTop: 8 }}>
                  <DateTimeField
                    dateLabel="Cutoff Date"
                    timeLabel="Cutoff Time"
                    dateValue={priorityCutoffDate}
                    timeValue={priorityCutoffTime}
                    onDateChange={setPriorityCutoffDate}
                    onTimeChange={setPriorityCutoffTime}
                    datePlaceholder="Auto"
                    timePlaceholder="Auto"
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.modalSaveButton, { marginTop: 16, marginBottom: 24 }]}
              onPress={() => setShowTrustedPartnersModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>Save</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Booking Configuration & Timers Modal */}
      <Modal
        visible={showBookingConfigModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBookingConfigModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Booking rules</Text>
            <TouchableOpacity onPress={() => setShowBookingConfigModal(false)} accessibilityLabel="Close">
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            {/* Trusted Partners Priority Section */}
            <View style={{ marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
              <Text style={[styles.fieldLabel, { fontSize: 14, fontWeight: '700', color: themeColors.text, marginBottom: 4 }]}>
                Trusted Partners Priority & Cutoff Timeline
              </Text>
              <Text style={[styles.hint, { marginBottom: 10, lineHeight: 17 }]}>
                Controls whether Trusted Partners get exclusive priority to accept this booking before Standard Partners.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    !priorityForPaid && styles.chipActive,
                  ]}
                  onPress={() => setPriorityForPaid(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, !priorityForPaid && styles.chipTextActive]}>
                    Open to Everyone
                  </Text>
                  {!priorityForPaid && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.chip,
                    priorityForPaid && styles.chipActive,
                  ]}
                  onPress={() => setPriorityForPaid(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, priorityForPaid && styles.chipTextActive]}>
                    ⭐ Trusted Partners First
                  </Text>
                  {priorityForPaid && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              </View>

              {priorityForPaid && (
                <View style={{ marginTop: 6 }}>
                  <Text style={[styles.hint, { marginBottom: 8 }]}>
                    Only Trusted Partners can accept until the cutoff below; Standard Partners after. Leave blank for server-computed default.
                  </Text>
                  <DateTimeField
                    dateLabel="Priority Cutoff Date"
                    timeLabel="Priority Cutoff Time"
                    dateValue={priorityCutoffDate}
                    timeValue={priorityCutoffTime}
                    onDateChange={setPriorityCutoffDate}
                    onTimeChange={setPriorityCutoffTime}
                    datePlaceholder="Auto (YYYY-MM-DD)"
                    timePlaceholder="Auto (HH:MM)"
                  />
                </View>
              )}
            </View>

            {/* Customer Number Visibility to Driver Section */}
            <View style={{ marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
              <Text style={[styles.fieldLabel, { fontSize: 14, fontWeight: '700', color: themeColors.text, marginBottom: 4 }]}>
                Customer Number Visibility to Driver
              </Text>
              <Text style={[styles.hint, { marginBottom: 10, lineHeight: 17 }]}>
                Controls when the assigned driver is allowed to view and call the customer's phone number. Standard platform rule: <Text style={{ fontWeight: '700', color: themeColors.text }}>2 Hours before pickup</Text>.
              </Text>

              {/* Timing Options */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    custPhoneRevealMode === 'instant' && { backgroundColor: '#10B981', borderColor: '#059669' },
                  ]}
                  onPress={() => setCustPhoneRevealMode('instant')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === 'instant' && { color: '#FFFFFF', fontWeight: '800' }]}>
                    ⚡ Instantly (Upon Accept)
                  </Text>
                  {custPhoneRevealMode === 'instant' && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode === 'default' && styles.chipActive]}
                  onPress={() => setCustPhoneRevealMode('default')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === 'default' && styles.chipTextActive]}>
                    🕒 2 hrs before (Default Rule)
                  </Text>
                  {custPhoneRevealMode === 'default' && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode === '1h' && styles.chipActive]}
                  onPress={() => setCustPhoneRevealMode('1h')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === '1h' && styles.chipTextActive]}>
                    ⏱️ 1 hr before
                  </Text>
                  {custPhoneRevealMode === '1h' && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode === '4h' && styles.chipActive]}
                  onPress={() => setCustPhoneRevealMode('4h')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === '4h' && styles.chipTextActive]}>
                    ⏱️ 4 hrs before
                  </Text>
                  {custPhoneRevealMode === '4h' && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, custPhoneRevealMode === 'custom' && styles.chipActive]}
                  onPress={() => setCustPhoneRevealMode('custom')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, custPhoneRevealMode === 'custom' && styles.chipTextActive]}>
                    📅 Custom Date/Time
                  </Text>
                  {custPhoneRevealMode === 'custom' && <Check size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              </View>

              {custPhoneRevealMode === 'instant' && (
                <View style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#10B981', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: '#059669', fontWeight: '800' }}>
                    ✓ Instant Reveal Enabled
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2, lineHeight: 16 }}>
                    Customer number will be visible to the driver and call button unlocked immediately upon accepting the booking in the Driver App.
                  </Text>
                </View>
              )}

              {custPhoneRevealMode === 'custom' && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.fieldSubLabel}>Specify Exact Date & Time to Reveal Customer Number</Text>
                  <DateTimeField
                    dateLabel="Reveal Date"
                    timeLabel="Reveal Time"
                    dateValue={custPhoneRevealDate}
                    timeValue={custPhoneRevealTime}
                    onDateChange={(v) => { setCustPhoneRevealTouched(true); setCustPhoneRevealDate(v); }}
                    onTimeChange={(v) => { setCustPhoneRevealTouched(true); setCustPhoneRevealTime(v); }}
                    datePlaceholder="Auto (YYYY-MM-DD)"
                    timePlaceholder="Auto (HH:MM)"
                  />
                </View>
              )}
            </View>

            <Text style={styles.fieldLabel}>Keep Booking Live Until (optional)</Text>
            <Text style={[styles.hint, { marginBottom: 8 }]}>Auto-cancels if unaccepted by this time. Leave blank to use the automatic default: pickup time + 15 minutes.</Text>
            <DateTimeField
              dateLabel="Live Until Date"
              timeLabel="Live Until Time"
              dateValue={liveUntilDate}
              timeValue={liveUntilTime}
              onDateChange={setLiveUntilDate}
              onTimeChange={setLiveUntilTime}
              datePlaceholder="Auto"
              timePlaceholder="Auto"
            />

            <TouchableOpacity
              style={[styles.modalSaveButton, { marginTop: 24, marginBottom: 24 }]}
              onPress={() => setShowBookingConfigModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>Save Configuration</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fare Type & Charges Modal */}
      <Modal
        visible={showFareChargesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFareChargesModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Bundled Charges</Text>
            <TouchableOpacity onPress={() => setShowFareChargesModal(false)} accessibilityLabel="Close">
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.hint, { marginBottom: 10 }]}>Mark which charges are bundled into the total vs. collected extra. Shown to the driver before they accept.</Text>

            <View style={{ gap: 6 }}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Toll charges may be updated during trip</Text>
                <Switch value={tollChargeUpdate} onValueChange={setTollChargeUpdate} trackColor={{ false: colors.border, true: colors.success }} />
              </View>
              {chargeItems.map((item, index) => (
                <View style={styles.toggleRow} key={item.label}>
                  <Text style={styles.toggleLabel}>{item.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Switch
                      value={item.included}
                      onValueChange={(value) => {
                        const updated = [...chargeItems];
                        updated[index] = { ...updated[index], included: value };
                        setChargeItems(updated);
                      }}
                      trackColor={{ false: colors.border, true: colors.success }}
                    />
                    {index >= 3 && (
                      <TouchableOpacity onPress={() => setChargeItems(chargeItems.filter((_, i) => i !== index))} hitSlop={8} accessibilityLabel="Remove charge">
                        <X size={16} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Add a custom charge (e.g. State Border Fee)"
                value={newChargeLabel}
                onChangeText={setNewChargeLabel}
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => {
                  const label = newChargeLabel.trim();
                  if (!label) return;
                  setChargeItems([...chargeItems, { label, included: false }]);
                  setNewChargeLabel('');
                }}
                accessibilityLabel="Add charge"
              >
                <Plus size={16} color="white" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalSaveButton, { marginTop: 16, marginBottom: 24 }]}
              onPress={() => setShowFareChargesModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>Save Charges</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={showLocationPickerModal}
        onClose={() => setShowLocationPickerModal(false)}
        onLocationSelect={handleLocationSelectModal}
        title={locationPickerTitle}
        initialValue={activeLocationIndex !== null ? (stops[activeLocationIndex] || '') : ''}
      />

      {/* Target City Selection Modal */}
      <Modal
        visible={showTargetCityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTargetCityModal(false)}
      >
        <SafeAreaView style={[styles.pickerModalContainer, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.pickerModalHeader, { borderBottomColor: themeColors.border }]}>
            <View>
              <Text style={[styles.pickerModalTitle, { color: themeColors.text }]}>Select Target Cities</Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                {nearCities.length} cities selected for targeted broadcast
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {nearCities.length > 0 && (
                <TouchableOpacity
                  onPress={() => setNearCities([])}
                  style={{
                    backgroundColor: isDark ? '#7F1D1D35' : '#FEE2E2',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: '#EF4444',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#EF4444' }}>Clear All</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowTargetCityModal(false)} accessibilityLabel="Close">
                <X size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
            <View style={[styles.searchRow, { marginBottom: 4 }]}>
              <Search size={16} color={themeColors.textSecondary} style={{ marginLeft: 10 }} />
              <TextInput
                style={[styles.searchInput, { backgroundColor: themeColors.background, color: themeColors.text }]}
                placeholder="Search city (e.g. Chennai, Madurai, Coimbatore)..."
                value={targetCitySearch}
                onChangeText={setTargetCitySearch}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              {targetCitySearch.length > 0 && (
                <TouchableOpacity
                  style={{ justifyContent: 'center', paddingHorizontal: 8 }}
                  onPress={() => setTargetCitySearch('')}
                >
                  <X size={18} color={themeColors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView style={styles.pickerModalContent} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
            {/* Quick Popular Chips inside Modal */}
            <Text style={[styles.fieldSubLabel, { marginTop: 4, marginBottom: 8 }]}>Popular Hubs</Text>
            <View style={[styles.chipRow, { marginBottom: 16 }]}>
              {['Chennai', 'Bengaluru', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Munnar', 'Ooty', 'Hosur', 'Pondicherry'].map((city) => {
                const isSelected = nearCities.includes(city);
                return (
                  <TouchableOpacity
                    key={city}
                    style={[styles.chip, isSelected && styles.chipActive, { paddingVertical: 6, paddingHorizontal: 12 }]}
                    onPress={() => {
                      if (isSelected) removeNearCity(city);
                      else addNearCity(city);
                    }}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive, { fontSize: 12.5 }]}>
                      {isSelected ? `✓ ${city}` : `+ ${city}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldSubLabel, { marginBottom: 8 }]}>All Serviceable Cities ({cityOptions.length})</Text>
            {(() => {
              const q = targetCitySearch.trim().toLowerCase();
              const filtered = cityOptions.filter((c) => c.toLowerCase().includes(q));
              if (filtered.length === 0) {
                return (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: themeColors.textSecondary }}>No cities match "{targetCitySearch}"</Text>
                    {targetCitySearch.trim().length > 0 && (
                      <TouchableOpacity
                        style={[styles.primaryButton, { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8 }]}
                        onPress={() => {
                          addNearCity(targetCitySearch.trim());
                          setTargetCitySearch('');
                        }}
                      >
                        <Text style={styles.primaryButtonText}>+ Add "{targetCitySearch.trim()}" as custom city</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }

              return (
                <>
                  {filtered.map((city) => {
                    const isSelected = nearCities.includes(city);
                    return (
                      <TouchableOpacity
                        key={city}
                        style={[
                          styles.pickerModalOption,
                          isSelected && styles.pickerModalOptionActive,
                          { justifyContent: 'space-between', paddingVertical: 12 }
                        ]}
                        onPress={() => {
                          if (isSelected) removeNearCity(city);
                          else addNearCity(city);
                        }}
                      >
                        <Text style={[styles.pickerModalOptionText, isSelected && styles.pickerModalOptionTextActive]}>
                          {city}
                        </Text>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : themeColors.textMuted,
                          backgroundColor: isSelected ? colors.primary : 'transparent',
                          alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}
            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: themeColors.border, backgroundColor: themeColors.surface }}>
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => setShowTargetCityModal(false)}
            >
              <Text style={styles.modalSaveButtonText}>
                Done ({nearCities.length} {nearCities.length === 1 ? 'City' : 'Cities'} Selected)
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const localDropdownStyles = StyleSheet.create({
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    maxHeight: 240, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  row: { paddingHorizontal: 14, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { fontSize: 14, fontWeight: '600', color: colors.text },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 18, marginBottom: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 6 },
  fieldSubLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  responsiveGridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  responsiveGridCol: { flex: 1, minWidth: 200 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: 'white', fontWeight: '800' },
  modalSaveButton: {
    backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 14, alignItems: 'center',
  },
  modalSaveButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 10,
  },
  pickerButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  pickerButtonText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  pickerModalContainer: { flex: 1, backgroundColor: colors.surface },
  pickerModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerModalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  pickerModalContent: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  pickerModalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 6, marginBottom: 8,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  pickerModalOptionActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  pickerModalOptionText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  pickerModalOptionTextActive: { color: colors.primary, fontWeight: '800' },
  pickerModalOptionSubtext: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  rowGap: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  // Card-section pattern (matches Vendor App's create-order.tsx layout) -
  // layout-only here; background/border/text colors are applied inline
  // from `themeColors` at each usage site so they stay reactive across the
  // light/dark toggle (values captured here in StyleSheet.create are
  // frozen at module load and would not update otherwise).
  sectionCard: {
    borderRadius: 8, padding: 18, marginTop: 14, borderWidth: 1,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconBadge: {
    width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center',
    marginRight: 10, borderWidth: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardGroupLabel: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  summaryCardTouchable: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 8, padding: 14, borderWidth: 1,
  },
  summaryCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  summaryIconCircle: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    marginRight: 12, borderWidth: 1,
  },
  summaryTextContent: { flex: 1 },
  summaryTitle: { fontSize: 14.5, fontWeight: '700', marginBottom: 2 },
  summarySubtitle: { fontSize: 12, lineHeight: 16 },
  editPillButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1,
  },
  editPillText: { fontSize: 12, fontWeight: '600' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  priceCell: { width: '47.5%' },
  priceLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  priceInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.text,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeStopBtn: { padding: 8 },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.primary + '14',
    marginBottom: 8,
    marginTop: 6,
  },
  addStopBtnText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  linkToggleText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text,
  },
  searchBtn: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  vendorResultRow: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    padding: 12, marginBottom: 6,
  },
  vendorResultName: { fontSize: 14, fontWeight: '700', color: colors.text },
  vendorResultSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  selectedVendorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primary, borderRadius: 6, padding: 12,
  },
  selectedVendorName: { fontSize: 14, fontWeight: '800', color: colors.text },
  selectedVendorSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 11.5, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleLabel: { fontSize: 13, color: colors.text, flex: 1, marginRight: 10 },
  fareTypeChip: {
    flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  fareTypeChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  fareTypeChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  fareTypeChipTextActive: { color: colors.primary },
  fareCard: {
    backgroundColor: colors.successTint, borderWidth: 1, borderColor: colors.success, borderRadius: 6,
    padding: 14, marginTop: 18,
  },
  fareTitle: { fontSize: 13, fontWeight: '800', color: colors.success, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  fareLabel: { fontSize: 13, color: colors.text },
  fareValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  fareValueEmphasis: { fontSize: 15, fontWeight: '800', color: colors.success },
  primaryButton: {
    backgroundColor: colors.primary, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 20,
  },
  primaryButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
  confirmButton: {
    backgroundColor: colors.success, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 10,
  },
  stickyReviewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10, paddingBottom: 14,
    borderTopWidth: 1,
  },
  stickyReviewLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  stickyReviewAmount: { fontSize: 18, fontWeight: '800', marginTop: 1 },
  stickyReviewBtn: {
    backgroundColor: colors.success, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12,
  },
  secondaryButton: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  secondaryButtonText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 },
  successTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 8 },
  successSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
});
