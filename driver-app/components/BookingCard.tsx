import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapPin, Clock, IndianRupee, User, Phone, Car, AlertCircle, X, FileText, ChevronDown, ChevronUp, ExternalLink, Tag, Sparkles, HelpCircle, Lock, TrendingUp, Info, ShieldCheck, Wallet, MessageCircle, CheckCircle } from 'lucide-react-native';
import { formatBookingId, formatKmLimitAndHours } from '@/utils/format';
import { useVehicleRequest } from '@/services/vehicle/vehicleRequestService';
import TripRulesModal from './TripRulesModal';
import StartDutyModal from './StartDutyModal';
import PartnerBadge from './PartnerBadge';
import { IncreaseFareModal } from './IncreaseFareModal';
import TrustedPartnerPriorityModal from './TrustedPartnerPriorityModal';

interface Booking {
  order_id: number;
  pickup: string;
  drop: string;
  customer_name: string;
  customer_number: string;
  estimated_price: number;
  trip_distance?: number;
  fare_per_km?: number;
  cost_per_km?: number;
  commission_waived?: boolean;
  car_type?: string;
  trip_type?: string;
  pick_near_city?: string;
  start_date_time?: string;
  // Round Trip "return" date+time / Multi City "drop" date+time. Not sent
  // for Oneway/Hourly bookings. Added to the order-confirm payload on the
  // Vendor/backend side; optional here so older responses without it still
  // work fine.
  end_date_time?: string;
  trip_time?: string;
  created_at?: string;
  max_time_to_assign_order?: string;
  expires_at?: string;
  charges_to_deduct?: number;
  driver_net?: number | null;
  platform_fee?: number | null;
  poster_cc?: number | null;
  platform_fee_pct?: number | null;
  commission_class?: string | null;
  pickup_notes?: string;
  pickup_drop_location?: any; // Add this to access raw location data
  // Per-stop address/maps link, keyed like pickup_drop_location. Shown in a
  // dropdown BEFORE the driver accepts. Only real Google Maps URLs are
  // tappable; anything else renders as plain text.
  location_links?: any;
  // Fare breakdown (shown BEFORE accepting so the driver sees the full money picture)
  driver_allowance?: number;
  permit_charges?: number;
  hill_charges?: number;
  toll_charges?: number;
  // Special requirements the vendor opted into (both off/null by default =
  // no special requirement). Shown as a red warning before AND at accept.
  car_make_year_requirement?: number | null;
  car_year_charge?: number;
  carrier_required?: boolean;
  carrier_charge?: number;
  non_cng?: boolean;
  non_cng_charge?: number;
  pet_friendly?: boolean;
  pet_friendly_charge?: number;
  // Priority window: while true and before priority_cutoff_at, only
  // Preferred-tier owners can accept.
  priority_for_paid?: boolean;
  priority_cutoff_at?: string | null;
  // Fare transparency: display-only, doesn't change any charge calculation -
  // the real amounts still come from the fare-breakdown fields above.
  fare_type?: 'ALL_INCLUSIVE' | 'ITEMIZED';
  charge_items?: { label: string; included: boolean }[] | null;
  advance_received?: number;
  gst_included?: boolean;
  gst_amount?: number;
}

interface BookingCardProps {
  booking: Booking;
  onAccept: (booking: Booking) => void;
  disabled?: boolean;
  loading?: boolean;
  buttonText?: string; // Custom button text (e.g., "Accept Booking", "Insufficient Balance", "Add ₹X to Accept the Booking")
  /** When user taps "Add ₹X to accept booking", call this with the amount and do not open accept modal. */
  onAddMoneyPress?: (amount: number) => void;
  /** Set only while this Standard-tier driver is blocked by the Trusted-
   * Partners-only priority window (parent's getOrderButtonStatus). Drives a
   * real lock+countdown instead of the plain grey disabled treatment, and
   * gates BOTH Accept buttons below from firing the real accept flow while
   * still tappable - tapping shows an upgrade prompt instead of a no-op. */
  priorityBlockedUntil?: string | null;
  /** Wallet shortfall amount if available balance is below required security hold */
  amountNeeded?: number;
  /** Show Increase Fare action button on card */
  showIncreaseFare?: boolean;
  /** Callback after successfully increasing fare */
  onIncreaseFareSuccess?: (newFare: number) => void;
  /** Whether fleet has a vehicle matching this booking's car type */
  hasMatchingCar?: boolean;
  /** Callback to trigger VehicleMismatchModal */
  onVehicleMismatch?: (requiredCarType: string) => void;
}

function getCategoryBadgeInfo(tripTypeStr: string, isMulticity: boolean = false) {
  const t = String(tripTypeStr || '').toLowerCase();
  if (t.includes('one') || t.includes('drop') || t.includes('multi')) {
    const label = isMulticity ? 'ONE WAY (Multi City)' : 'ONE WAY';
    return { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8', icon: '', label };
  }
  if (t.includes('round') || t.includes('two')) {
    return { bg: '#F3E8FF', border: '#C084FC', text: '#7E22CE', icon: '🔁', label: 'ROUND TRIP' };
  }
  if (t.includes('local') || t.includes('hourly') || t.includes('package')) {
    return { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', icon: '⏱️', label: 'LOCAL' };
  }
  if (t.includes('empty') || t.includes('pool') || t.includes('return')) {
    return { bg: '#ECFDF5', border: '#6EE7B7', text: '#047857', icon: '🚖', label: 'DROP CONNECT' };
  }
  return { bg: '#EEF2FF', border: '#A5B4FC', text: '#4338CA', icon: '', label: isMulticity ? `${tripTypeStr.toUpperCase()} (Multi City)` : tripTypeStr.toUpperCase() };
}

export default function BookingCard({
  booking,
  onAccept,
  disabled,
  loading,
  buttonText,
  onAddMoneyPress,
  priorityBlockedUntil,
  amountNeeded,
  showIncreaseFare,
  onIncreaseFareSuccess,
  hasMatchingCar = true,
  onVehicleMismatch,
}: BookingCardProps) {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const [showTariffAccordion, setShowTariffAccordion] = useState(false);
  const [showIncreaseFareModal, setShowIncreaseFareModal] = useState(false);
  const [showRechargeHoldModal, setShowRechargeHoldModal] = useState(false);
  const [showPriorityExplanationModal, setShowPriorityExplanationModal] = useState(false);
  // Stop addresses, fare breakdown and pickup notes are now one combined
  // "View More Details" expandable section (previously two separate
  // toggles for stops and breakdown).
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acknowledgeInterest, setAcknowledgeInterest] = useState(false);

  const orderKey = booking.order_id || (booking as any).id;
  const vehicleReq = useVehicleRequest(orderKey);
  const isVehiclePending = vehicleReq?.status === 'PENDING';
  const isVehicleApproved = vehicleReq?.status === 'APPROVED';
  const effectiveHasMatchingCar = isVehicleApproved ? true : hasMatchingCar;

  const toNumber = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const safePickLoc = (v: any): Record<string, string> => {
    if (!v) return {};
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return {}; }
    }
    return v;
  };

  // Derive fields robustly in case parent passes raw VO pending order
  // Priority: use booking.pickup_drop_location if available, otherwise parse from booking props
  const rawLocation = booking.pickup_drop_location || (booking as any).pickup_drop_location;
  const loc = safePickLoc(rawLocation);
  
  // Parse all cities for multicity trips - extract ALL numeric keys (0, 1, 2, 3, etc.)
  const getAllCities = (): string[] => {
    const cities: string[] = [];
    
    // First, try to get from pickup_drop_location object
    if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
      // Extract all numeric keys (0, 1, 2, 3, etc.) and sort them
      const allKeys = Object.keys(loc);
      const numericKeys = allKeys
        .filter(k => {
          const num = Number(k);
          return !isNaN(num) && isFinite(num) && num >= 0;
        })
        .map(k => Number(k))
        .sort((a, b) => a - b);
      
      if (numericKeys.length > 0) {
        // Add cities in order based on numeric keys (preserve duplicates for proper ordering)
        numericKeys.forEach(key => {
          const cityValue = loc[String(key)];
          const city = cityValue ? String(cityValue).trim() : '';
          if (city) {
            cities.push(city);
          }
        });
        
        if (cities.length > 0) {
          return cities;
        }
      }
      
      // Fallback to named keys
      if (loc.pickup) cities.push(String(loc.pickup));
      if (loc.drop && loc.drop !== loc.pickup) cities.push(String(loc.drop));
      if (cities.length > 0) return cities;
    }
    
    // Final fallback: use booking pickup/drop props
    const pickup = booking.pickup || '';
    const drop = booking.drop || '';
    if (pickup) cities.push(pickup);
    if (drop && drop !== pickup) cities.push(drop);
    
    return cities;
  };
  
  const allCities = getAllCities();
  const isMulticity = allCities.length > 2;
  const startCity = allCities[0] || booking.pickup || '';
  const endCity = allCities.length > 1 ? allCities[allCities.length - 1] : (booking.drop || '');
  const middleCities = allCities.length > 2 ? allCities.slice(1, -1) : [];

  // Per-stop address/maps links - shown in a dropdown BEFORE the driver
  // accepts. Only real Google Maps URLs are tappable; anything else (a
  // plain address, or just the prefilled city name) renders as plain text.
  const safeLinks = safePickLoc(booking.location_links);
  const getStopEntries = (): { label: string; city: string; link: string }[] => {
    const entries: { label: string; city: string; link: string }[] = [];
    if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
      const allKeys = Object.keys(loc);
      const numericKeys = allKeys
        .filter(k => {
          const num = Number(k);
          return !isNaN(num) && isFinite(num) && num >= 0;
        })
        .map(k => Number(k))
        .sort((a, b) => a - b);
      numericKeys.forEach((key, idx) => {
        const cityValue = loc[String(key)];
        const city = cityValue ? String(cityValue).trim() : '';
        if (!city) return;
        const label = idx === 0 ? 'From' : (idx === numericKeys.length - 1 ? 'To' : `Stop ${idx + 1}`);
        const rawLink = safeLinks[String(key)];
        entries.push({ label, city, link: rawLink ? String(rawLink).trim() : '' });
      });
    }
    if (entries.length === 0) {
      if (startCity) entries.push({ label: 'From', city: startCity, link: safeLinks['pickup'] || safeLinks['0'] || '' });
      if (endCity && endCity !== startCity) entries.push({ label: 'To', city: endCity, link: safeLinks['drop'] || safeLinks['1'] || '' });
    }
    return entries;
  };
  const stopEntries = getStopEntries();
  // A link only counts as "real" (tappable) if it's an actual Google Maps
  // URL - not just the prefilled city name or a plain address.
  const isGoogleMapsLink = (value: string): boolean => {
    if (!value) return false;
    const v = value.toLowerCase().trim();
    return v.startsWith('http://') || v.startsWith('https://');
  };
  // Only show the dropdown when there's at least one stop with a distinct,
  // non-city link worth surfacing.
  const hasStopLinkDetails = stopEntries.some(e => e.link && e.link !== e.city);
  
  // For display, use parsed cities or fallback to props
  const pickup = startCity;
  const drop = endCity;

  const displayPrice = toNumber((booking as any).estimated_price ?? (booking as any).vendor_price ?? (booking as any).total_fare);
  const customerNumber = (booking as any).customer_number || (booking as any).customer_mobile || '';
  const carType = (booking as any).car_type || booking.car_type || '';
  const tripType = (booking as any).trip_type || booking.trip_type || '';
  const nearCity = (booking as any).pick_near_city || (booking as any).near_city || '';
  const startDateTime = (booking as any).start_date_time || '';
  const estimatedTime = (booking as any).trip_time || booking.trip_time || '';
  const chargesToDeduct = Number(booking.charges_to_deduct || 0);
  const isHourlyRental = String(tripType || '').toLowerCase().includes('hour');
  const createdAt = booking.created_at || '';
  const maxTimeToAssign = booking.max_time_to_assign_order || '';
  const expiresAt = booking.expires_at || '';
  const hasSpecialRequirements = !!(
    booking.car_make_year_requirement ||
    booking.carrier_required ||
    (booking as any).non_cng ||
    (booking as any).pet_friendly
  );
  const [rulesModalVisible, setRulesModalVisible] = useState(false);
  const [startDutyModalVisible, setStartDutyModalVisible] = useState(false);

  // Fare transparency - display-only, the real amounts are still the
  // fare-breakdown fields above; this just states what's bundled vs extra.
  const isAllInclusive = booking.fare_type === 'ALL_INCLUSIVE';
  const extraCharges = (booking.charge_items || []).filter((c) => !c.included).map((c) => c.label);
  const fareTypeSummary = isAllInclusive
    ? (extraCharges.length > 0 ? `All Inclusive · ${extraCharges.join(', ')} extra` : 'All Inclusive')
    : null; // Itemized is the existing default behavior - no new summary line needed

  // Parse date and time from start_date_time
  const getPickupDate = (): string => {
    if (!startDateTime) return '';
    try {
      const date = new Date(startDateTime);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };
  
  const getPickupTime = (): string => {
    if (!startDateTime) return '';
    try {
      const date = new Date(startDateTime);
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };
  
  const pickupDate = getPickupDate();
  const pickupTime = getPickupTime();

  // End Date/Time - only meaningful for Round Trip (return) and Multi City
  // (final drop) bookings; Oneway/Hourly never send this.
  const endDateTimeRaw = (booking as any).end_date_time || booking.end_date_time || '';
  const tripTypeLower = String(tripType || '').toLowerCase();
  const isRoundTripOrMulticity = tripTypeLower.includes('round') || tripTypeLower.includes('multi') || tripTypeLower.includes('multy');
  const getFormattedDate = (raw: string): string => {
    if (!raw) return '';
    try {
      return new Date(raw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };
  const getFormattedTime = (raw: string): string => {
    if (!raw) return '';
    try {
      return new Date(raw).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };
  const endDate = getFormattedDate(endDateTimeRaw);
  const endTime = getFormattedTime(endDateTimeRaw);

  const tripDistance = toNumber((booking as any).trip_distance || 0);

  const formatRoundedDuration = (raw: string): string => {
    if (!raw) return '';
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
      const roundedHours = Math.round(totalMinutes / 60);
      return roundedHours > 0 ? `${roundedHours} hrs` : '0 hrs';
    } catch {
      return raw;
    }
  };

  const rawPickupNotes = (booking as any).pickup_notes || (booking as any).notes || '';
  const cleanPickupNotes = typeof rawPickupNotes === 'string' ? rawPickupNotes.trim() : String(rawPickupNotes || '').trim();
  const hasPickupNotes = Boolean(
    cleanPickupNotes &&
    cleanPickupNotes.toUpperCase() !== 'NILL' &&
    cleanPickupNotes.toLowerCase() !== 'null' &&
    cleanPickupNotes !== 'undefined'
  );

  // Helper function to format car type for display
  const formatCarType = (carType: string | null | undefined): string => {
    if (!carType) return '';
    
    const type = String(carType).trim();
    
    // Pattern 1: X_PLUS_Y (e.g., SUV_6_PLUS_1, INNOVA_7_PLUS_1, 7_PLUS_1)
    // Match any text before _PLUS_ or just numbers before _PLUS_
    const plusPattern1 = /^(.+?)_(\d+)_PLUS_(\d+)$/i;
    const plusMatch1 = type.match(plusPattern1);
    
    if (plusMatch1) {
      const base = plusMatch1[1].replace(/_/g, ' ');
      const first = plusMatch1[2];
      const second = plusMatch1[3];
      // If base is just a number or empty, show only the (X+Y) format
      if (base.trim() === '' || /^\d+$/.test(base.trim())) {
        return `(${first}+${second})`;
      }
      return `${base} (${first}+${second})`;
    }
    
    // Pattern 2: X_PLUS_Y with any case variations (PLUS, plus, Plus)
    const plusPattern2 = /^(.+?)_(\d+)_(PLUS|plus|Plus)_(\d+)$/i;
    const plusMatch2 = type.match(plusPattern2);
    
    if (plusMatch2) {
      const base = plusMatch2[1].replace(/_/g, ' ');
      const first = plusMatch2[2];
      const second = plusMatch2[4];
      if (base.trim() === '' || /^\d+$/.test(base.trim())) {
        return `(${first}+${second})`;
      }
      return `${base} (${first}+${second})`;
    }
    
    // Pattern 3: Just numbers with PLUS (e.g., 7_PLUS_1 -> (7+1))
    const justNumbersPattern = /^(\d+)_PLUS_(\d+)$/i;
    const justNumbersMatch = type.match(justNumbersPattern);
    if (justNumbersMatch) {
      return `(${justNumbersMatch[1]}+${justNumbersMatch[2]})`;
    }
    
    // Pattern: NEW_SEDAN_2022_MODEL or similar
    if (type.toUpperCase().includes('NEW_SEDAN_2022_MODEL') || type.toUpperCase().includes('NEW SEDAN 2022 MODEL')) {
      return 'Prime Sedan';
    }
    
    // For other cases, replace underscores with spaces and check for "plus" patterns
    let formatted = type.replace(/_/g, ' ');
    // Try to find "plus" patterns in the formatted string (e.g., "7 Plus 1" -> "(7+1)")
    const plusTextPattern = /(\d+)\s+(?:plus|PLUS|Plus)\s+(\d+)/gi;
    formatted = formatted.replace(plusTextPattern, '($1+$2)');
    formatted = formatted.replace(/\s*\b\d{4}\s*MODEL\b/gi, '');
    
    return formatted.trim();
  };
  
  const computeDeadline = (): string => {
    try {
      console.log('🕐 Computing deadline:', { 
        createdAt, 
        maxTimeToAssign, 
        expiresAt,
        bookingData: booking 
      });
      
      // If expires_at is provided, use it directly
      if (expiresAt) {
        const d = new Date(expiresAt);
        const deadline = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        console.log('🕐 Using expires_at deadline:', deadline);
        return deadline;
      }
      // If max_time_to_assign_order is provided as a timestamp, use it directly
      if (maxTimeToAssign) {
        const d = new Date(maxTimeToAssign);
        const deadline = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        console.log('🕐 Using max_time_to_assign_order deadline:', deadline);
        return deadline;
      }
      
      console.log('🕐 No deadline data available');
    } catch (error) {
      console.error('Error computing deadline:', error);
    }
    return '';
  };
  const deadlineTime = computeDeadline();

  // Calculate maximum assignment window duration
  const getAssignmentWindowDuration = (): string => {
    try {
      if (!createdAt || !maxTimeToAssign) {
        return '';
      }

      const createdDate = new Date(createdAt);
      const maxAssignDate = new Date(maxTimeToAssign);
      const diffMs = maxAssignDate.getTime() - createdDate.getTime();
      
      if (diffMs <= 0) return '';
      
      const minutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      
      if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`;
      } else {
        return `${minutes}m`;
      }
    } catch (error) {
      console.error('Error calculating assignment window:', error);
      return '';
    }
  };

  const assignmentWindowDuration = getAssignmentWindowDuration();

  // Wallet-shortfall text/amount: the parent (app/(tabs)/index.tsx,
  // getOrderButtonStatus) already computes whether the driver's available
  // balance (wallet minus amounts frozen for other accepted-but-unassigned
  // orders) covers this booking's charges_to_deduct, and hands us the
  // shortfall pre-baked into buttonText as "Add ₹X to Accept the Booking".
  // Reused here rather than recomputing - this file has no access to the
  // driver's wallet balance/frozen totals, and doesn't need it.
  const isAddMoneyState = !!(disabled && buttonText && buttonText.includes('Add ₹'));
  const addMoneyAmount = isAddMoneyState ? parseInt(buttonText!.match(/₹(\d+)/)?.[1] || '0', 10) : 0;
  // Any other parent-supplied blocking reason (e.g. "Max 3 Bookings Reached",
  // "Only for Preferred Partners") is shown verbatim, same as before.
  const isOtherBlockedState = !!(disabled && buttonText && !isAddMoneyState && buttonText !== 'Accept Booking');

  const vendorPrice = displayPrice;
  const advanceReceived = toNumber(booking.advance_received || (booking as any).advance_received || 0);
  const requiredSecurityHold = Math.max(500, chargesToDeduct);
  const remainingToCollect = Math.max(0, vendorPrice - advanceReceived);
  const driverAllowanceAmt = toNumber(booking.driver_allowance) || 400;
  const permitAmt = toNumber(booking.permit_charges);
  const tollAmt = toNumber(booking.toll_charges);
  const hillAmt = toNumber(booking.hill_charges);
  const nonCommissionableExtras = driverAllowanceAmt + permitAmt + tollAmt + hillAmt;

  const kmBaseFromRate = (tripDistance > 0 && toNumber(booking.fare_per_km) > 0)
    ? (tripDistance * toNumber(booking.fare_per_km))
    : Math.max(0, vendorPrice - nonCommissionableExtras);

  const commissionableKmBase = kmBaseFromRate > 0 ? kmBaseFromRate : Math.max(0, vendorPrice - nonCommissionableExtras);
  // Platform Commission is 10% on the KM Base Fare ONLY (Driver Allowance, Toll & Permit are passed through 100% untouched)
  const totalCommission = Math.round(commissionableKmBase * 0.10);
  // Vendor-less bookings (driver-posted / website / admin): the server sends what the driver really earns, worked out
  // with the same maths trip close settles with - no more guessing a flat 10% here.
  const hasServerSplit = (booking as any).driver_net != null;
  const serverPosterCc = Number((booking as any).poster_cc || 0);
  const serverPlatformFee = Number((booking as any).platform_fee || 0);
  const driverNet = hasServerSplit
    ? Math.max(0, Math.round(Number((booking as any).driver_net)))
    : Math.max(0, Math.round(vendorPrice - totalCommission));
  // Inclusions / exclusions come from the booking's own charge list when it has one
  const chargeItems: any[] = Array.isArray((booking as any).charge_items) ? (booking as any).charge_items : [];
  const hasChargeItems = isAllInclusive && chargeItems.length > 0;
  const includedItems = chargeItems.filter((c) => c && c.included !== false);
  const excludedItems = chargeItems.filter((c) => c && c.included === false);
  const fareRowsJsx = hasServerSplit && isAllInclusive ? (
    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 6, lineHeight: 18 }}>
      All-inclusive booking - you see only what you earn. The exact amount to collect from the customer is shown once you accept.
    </Text>
  ) : hasServerSplit ? (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Medium', color: colors.text }}>Your fare:</Text>
        <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>₹{vendorPrice}</Text>
      </View>
      {serverPosterCc > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: '#D97706' }}>Commission on KM fare:</Text>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#D97706' }}>-₹{serverPosterCc}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: '#D97706' }}>Platform fee ({(booking as any).platform_fee_pct ?? 2}%):</Text>
        <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#D97706' }}>-₹{serverPlatformFee}</Text>
      </View>
      <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginBottom: 6 }}>
        * Final amounts follow the actual KM driven. Tolls, permits and other excluded items are collected separately.
      </Text>
    </>
  ) : (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Medium', color: colors.text }}>Total Vendor Price:</Text>
        <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>₹{vendorPrice}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: '#D97706' }}>Platform Commission (Est. 10%):</Text>
        <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#D97706' }}>-₹{totalCommission}</Text>
      </View>
      <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginBottom: 6 }}>
        * Final wallet hold may adjust at trip completion based on actual KM driven, extra waiting hours, or toll updates.
      </Text>
    </>
  );

  // Live countdown to when the Trusted-Partners-only priority window ends.
  const priorityCutoff = priorityBlockedUntil || (booking.priority_for_paid && booking.priority_cutoff_at ? booking.priority_cutoff_at : null);

  const [priorityRemainingMs, setPriorityRemainingMs] = useState(() =>
    priorityCutoff ? Math.max(0, new Date(priorityCutoff).getTime() - Date.now()) : 0
  );
  useEffect(() => {
    if (!priorityCutoff) {
      setPriorityRemainingMs(0);
      return;
    }
    const update = () => setPriorityRemainingMs(Math.max(0, new Date(priorityCutoff).getTime() - Date.now()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [priorityCutoff]);

  const isPriorityActive = !!priorityCutoff && priorityRemainingMs > 0;
  const isPriorityLocked = isPriorityActive && !!priorityBlockedUntil;

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const formatCutoffDate = (cutoffStr: string | null) => {
    if (!cutoffStr) return '';
    try {
      const d = new Date(cutoffStr);
      if (isNaN(d.getTime())) return '';
      const day = d.getDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[d.getMonth()];
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${day} ${month}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return '';
    }
  };

  const getPricingTag = () => {
    const isDropBid = (booking as any).is_drop_bid || (booking as any).source === 'DROP_BID' || String(booking.trip_type || '').toLowerCase().includes('bid') || (booking as any).is_bidding || (booking as any).booking_type === 'BIDDING';
    const isAllInc = booking.fare_type === 'ALL_INCLUSIVE';
    const isCommissionOff = !!(booking as any).commission_waived || (booking as any).apply_commission === false || ((booking as any).poster_cc === 0 && (booking as any).commission_class !== 'STANDARD');

    if (isDropBid) {
      return {
        label: 'Drop Bid',
        bg: isDarkMode ? 'rgba(168, 85, 247, 0.18)' : '#FAF5FF',
        border: isDarkMode ? '#9333EA' : '#D8B4FE',
        text: isDarkMode ? '#D8B4FE' : '#7E22CE',
      };
    }

    if (isAllInc) {
      return {
        label: 'All Inclusive',
        bg: isDarkMode ? 'rgba(234, 179, 8, 0.18)' : '#FEFCE8',
        border: isDarkMode ? '#CA8A04' : '#FDE047',
        text: isDarkMode ? '#FDE047' : '#854D0E',
      };
    }

    if (isCommissionOff) {
      return {
        label: 'Without CC',
        bg: isDarkMode ? 'rgba(34, 197, 94, 0.18)' : '#ECFDF5',
        border: isDarkMode ? '#16A34A' : '#6EE7B7',
        text: isDarkMode ? '#4ADE80' : '#047857',
      };
    }

    // Standard with commission (10% CC/KM)
    const ccPercent = Number((booking as any).platform_fees_percent || 10);
    return {
      label: `${ccPercent}% CC/KM`,
      bg: isDarkMode ? 'rgba(245, 158, 11, 0.18)' : '#FFFBEB',
      border: isDarkMode ? '#D97706' : '#FCD34D',
      text: isDarkMode ? '#FBBF24' : '#B45309',
    };
  };

  const getBookingCategoryBadge = () => {
    const isCorporate = (booking as any).is_corporate || (booking as any).booking_type === 'CORPORATE';
    if (isCorporate) {
      return {
        label: 'CORPORATE',
        bg: '#F0F9FF',
        border: '#7DD3FC',
        text: '#0369A1',
        title: 'Corporate Booking',
        desc: 'Verified business travel trip with fixed corporate rates and guaranteed payment terms.'
      };
    }
    return null;
  };

  const handlePriorityLockedPress = () => {
    setShowPriorityExplanationModal(true);
  };

  const handleAcceptPress = () => {
    if (isPriorityLocked) {
      handlePriorityLockedPress();
      return;
    }
    if (effectiveHasMatchingCar === false) {
      if (onVehicleMismatch) {
        onVehicleMismatch(booking.car_type || '');
      } else {
        setShowMoreDetails(true);
      }
      return;
    }
    if (isAddMoneyState && addMoneyAmount > 0) {
      setShowRechargeHoldModal(true);
      return;
    }
    setShowMoreDetails(true);
  };
  
  const [isAccepting, setIsAccepting] = useState(false);

  const handleConfirmAccept = async () => {
    if (acknowledgeInterest && !isAccepting && !loading) {
      setIsAccepting(true);
      try {
        await onAccept(booking);
      } catch (e) {
        console.error('Error accepting booking:', e);
      } finally {
        setIsAccepting(false);
        setShowMoreDetails(false);
        setAcknowledgeInterest(false);
      }
    }
  };

  const dynamicStyles = StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 10,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    disabledCard: {
      backgroundColor: colors.background ?? '#F3F4F6',
      opacity: 0.95,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    bookingId: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    tripTypeText: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: '#EF4444', // Red color
    },
    specialReqBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 6,
      gap: 4,
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
    },
    specialReqBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter-SemiBold',
      color: '#EF4444',
    },
    routeContainer: {
      marginBottom: 6,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 2,
    },
    routeText: {
      marginLeft: 6,
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      flex: 1,
    },
    routeTextGreen: {
      color: '#10B981', // Green for start
    },
    routeTextRed: {
      color: '#EF4444', // Red for end
    },
    routeTextBlue: {
      color: '#3B82F6', // Blue for middle cities
    },
    routeLine: {
      width: 1,
      height: 8,
      backgroundColor: colors.border,
      marginLeft: 7,
      marginVertical: 1,
    },
    detailsContainer: {
      marginBottom: 4,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    detailLabel: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: colors.textSecondary,
      minWidth: 120,
    },
    detailValue: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      flex: 1,
    },
    // Compact variants for the pre-accept LIST CARD only (the accept-detail
    // modal below keeps using detailRow/detailLabel/detailValue at full
    // size - it is a separate, more spacious view and stays untouched).
    detailRowSm: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    detailLabelSm: {
      fontSize: 12.5,
      fontFamily: 'Inter-Bold',
      color: colors.textSecondary,
      minWidth: 100,
    },
    detailValueSm: {
      fontSize: 12.5,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      flex: 1,
    },
    // Trip duration gets its own bold+green treatment within the
    // Distance & Duration row, distinct from the plain distance text.
    detailValueDuration: {
      fontSize: 12.5,
      fontFamily: 'Inter-Bold',
      color: '#10B981',
    },
    fareContainer: {
      backgroundColor: '#D1FAE5',
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 5,
      marginBottom: 6,
      alignItems: 'center',
    },
    fareLabel: {
      fontSize: 12,
      fontFamily: 'Inter-SemiBold',
      color: '#065F46',
      marginBottom: 2,
    },
    totalFare: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: '#065F46',
    },
    acceptButton: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingVertical: 10,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    acceptButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-Bold',
    },
    disabledButton: {
      backgroundColor: '#9CA3AF',
    },
    disabledButtonText: {
      color: '#1F2937', // Dark gray for high contrast on light gray button
      fontSize: 16,
      fontFamily: 'Inter-Bold',
    },
    amountTextGreen: {
      color: '#ffffff', 
      fontFamily: 'Inter-Bold',
    },
    loadingButton: {
      backgroundColor: colors.primary,
      opacity: 0.8,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      width: '100%',
      maxWidth: 400,
      maxHeight: '90%',
    },
    // Bottom-sheet variants for the Accept-confirmation modal only (the
    // Terms modal keeps the original centered/fade modalOverlay+modalContent
    // above). The old shared "centered overlay + slide animation" combo made
    // the modal look like it slid up from the bottom and then jumped/settled
    // into the vertical center of the screen - a double-motion effect. There
    // was no extra Animated-API transform involved (none exists in this
    // file); it was purely this layout. Anchoring to the bottom with only
    // the top corners rounded gives animationType="slide" a single, clean
    // bottom-sheet slide-up instead.
    bottomSheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    bottomSheetContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      width: '100%',
      maxHeight: '90%',
      paddingBottom: 16,
    },
    modalHeader: {
      backgroundColor: colors.primary,
      padding: 16,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    // no `flex: 1` here: the title sits in a column, where flex:1 collapsed its height and let the next
    // line (vendor / car) draw over it
    modalHeaderText: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
    },
    modalCloseButton: {
      padding: 8,
      marginLeft: 4,
    },
    modalBody: {
      padding: 14,
    },
    modalSection: {
      marginBottom: 8,
    },
    modalLabel: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    modalValue: {
      fontSize: 15,
      fontFamily: 'Inter-Medium',
      color: colors.text,
      marginBottom: 6,
    },
    infoTable: {
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoRowLast: {
      borderBottomWidth: 0,
    },
    infoCellLabel: {
      flex: 1,
      paddingRight: 10,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    infoCellValue: {
      flex: 1,
      paddingLeft: 10,
      backgroundColor: colors.background,
    },
    infoLabel: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
    },
    infoValue: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      textAlign: 'left',
    },
    infoValuePositive: {
      color: '#22c55e',
    },
    cityStart: {
      color: '#22c55e',
      fontFamily: 'Inter-Bold',
    },
    cityEnd: {
      color: '#3b82f6',
      fontFamily: 'Inter-Bold',
    },
    cityEndRed: {
      color: '#EF4444',
      fontFamily: 'Inter-Bold',
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 4,
      marginRight: 12,
      marginTop: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
    },
    checkboxText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter-Regular',
      color: colors.text,
      lineHeight: 18,
    },
    link: {
      textDecorationLine: 'underline',
      color: colors.primary,
    },
    modalButtons: {
      flexDirection: 'row',
      marginTop: 6,
      justifyContent: 'space-between',
      paddingBottom: 0,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 15,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    confirmButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingVertical: 12,
      alignItems: 'center',
    },
    confirmButtonText: {
      fontSize: 15,
      fontFamily: 'Inter-SemiBold',
      color: '#FFFFFF',
    },
    confirmButtonDisabled: {
      opacity: 0.5,
    },
  });
  return (
    <>
      {/* COMPACT & RICH BOOKING CARD */}
      {/* Whole card opens the full details; inner buttons (Accept etc.) keep their own taps */}
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => setShowMoreDetails(true)}
        style={[dynamicStyles.card, disabled && dynamicStyles.disabledCard]}
      >
        {/* Top Bar: Booking ID & Badges on Left, Pricing/Commission on Right Edge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
          {/* Left Side: Booking ID + Trip Type Badge + Vehicle Type Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, marginRight: 6 }}>
            <Text style={dynamicStyles.bookingId}>
              {formatBookingId(booking.order_id || (booking as any).id, booking.start_date_time || (booking as any).created_at)}
            </Text>
            {tripType && (() => {
              const badge = getCategoryBadgeInfo(tripType, isMulticity);
              return (
                <View style={{
                  backgroundColor: badge.bg,
                  borderColor: badge.border,
                  borderWidth: 1,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}>
                  <Text style={{ fontSize: 9.5 }}>{badge.icon}</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: badge.text }}>
                    {badge.label}
                  </Text>
                </View>
              );
            })()}
            {/* Bold, Vibrant Vehicle Type Badge in Header */}
            <View style={{
              backgroundColor: isDarkMode ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
              borderColor: '#818CF8',
              borderWidth: 1,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
            }}>
              <Car size={10} color="#4F46E5" />
              <Text style={{ fontSize: 9.5, fontFamily: 'Inter-Bold', color: '#3730A3' }}>
                {(formatCarType(carType) || 'SEDAN').toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Right Edge: Pricing & Commission Badge (Directly opposite to Booking ID) */}
          {(() => {
            const pricing = getPricingTag();
            if (!pricing) return null;
            return (
              <View style={{
                backgroundColor: pricing.bg,
                borderColor: pricing.border,
                borderWidth: 1,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', color: pricing.text }}>
                  {pricing.label}
                </Text>
              </View>
            );
          })()}
        </View>

        {/* When the customer's number opens - so drivers know and don't call asking */}
        {!!(booking as any).customer_number_notice && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: `${colors.primary}12` }}>
            <Lock size={13} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter-Medium', color: colors.text }}>
              {(booking as any).customer_number_notice}
            </Text>
          </View>
        )}

        {/* Special requirements badge */}
        {hasSpecialRequirements && (
          <View style={dynamicStyles.specialReqBadge}>
            <AlertCircle size={12} color="#EF4444" />
            <Text style={dynamicStyles.specialReqBadgeText}>
              {[
                booking.car_make_year_requirement
                  ? `${booking.car_make_year_requirement}+ model${toNumber((booking as any).car_year_charge) > 0 ? ` (+₹${toNumber((booking as any).car_year_charge)})` : ''}`
                  : null,
                booking.carrier_required
                  ? `Carrier required${toNumber((booking as any).carrier_charge) > 0 ? ` (+₹${toNumber((booking as any).carrier_charge)})` : ''}`
                  : null,
                (booking as any).non_cng
                  ? `Non-CNG${toNumber((booking as any).non_cng_charge) > 0 ? ` (+₹${toNumber((booking as any).non_cng_charge)})` : ''}`
                  : null,
                (booking as any).pet_friendly
                  ? `Pet Friendly${toNumber((booking as any).pet_friendly_charge) > 0 ? ` (+₹${toNumber((booking as any).pet_friendly_charge)})` : ''}`
                  : null,
              ].filter(Boolean).join(' • ')}
            </Text>
          </View>
        )}

        {/* Route: From -> To (Clean Layout with Details button & KM Limit & Travel Hours on Right) */}
        <View style={{ backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC', borderRadius: 6, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#E2E8F0' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={dynamicStyles.routeRow}>
                <MapPin color="#10B981" size={14} />
                <Text style={[dynamicStyles.routeText, dynamicStyles.routeTextGreen]} numberOfLines={1}>
                  From: {startCity}
                </Text>
              </View>

              {allCities.length > 1 && (
                <>
                  <View style={dynamicStyles.routeLine} />
                  <View style={dynamicStyles.routeRow}>
                    <MapPin color="#EF4444" size={14} />
                    <Text style={[dynamicStyles.routeText, dynamicStyles.routeTextRed]} numberOfLines={1}>
                      To: {endCity}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Right Side: Details Info Button + KM Limit & Travel Hours Box */}
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <View style={{
                backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                borderColor: '#10B981',
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 5,
                alignItems: 'flex-end'
              }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#059669' }}>
                  {formatKmLimitAndHours(tripDistance, estimatedTime).kmText || `${tripDistance} KM Limit`}
                </Text>
                {!!formatKmLimitAndHours(tripDistance, estimatedTime).hrsText && (
                  <Text style={{ fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: '#047857', marginTop: 2 }}>
                    • {formatKmLimitAndHours(tripDistance, estimatedTime).hrsText}
                  </Text>
                )}
              </View>

              {allCities.length > 2 && (
                <TouchableOpacity
                  onPress={() => setShowMoreDetails(true)}
                  style={{
                    backgroundColor: colors.primary + '15',
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.primary + '40',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    marginTop: 4
                  }}
                >
                  <Info size={11} color={colors.primary} />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', color: colors.primary }}>
                    +{allCities.length - 2} Stops
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Pickup Date & Time Strip (Centered, Eye-Catching Banner) */}
        {!!(pickupDate || pickupTime) && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
            borderRadius: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: isDarkMode ? '#B45309' : '#FCD34D',
            gap: 6,
          }}>
            <Clock size={14} color="#D97706" />
            <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#B45309', textAlign: 'center' }}>
              Pickup: {pickupDate} • {pickupTime}
            </Text>
          </View>
        )}

        {/* Priority Window Live Info Line (Compact, Clean, No Box) */}
        {isPriorityActive && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 2,
            marginBottom: 4,
            gap: 4,
          }}>
            <Sparkles size={11} color={isPriorityLocked ? '#6366F1' : '#10B981'} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontSize: 11,
                fontFamily: 'Inter-SemiBold',
                color: isPriorityLocked
                  ? (isDarkMode ? '#A5B4FC' : '#4F46E5')
                  : (isDarkMode ? '#34D399' : '#059669'),
                textAlign: 'center',
              }}
            >
              {isPriorityLocked
                ? `Trusted Partners Only${priorityCutoff ? ` • Until ${formatCutoffDate(priorityCutoff)}` : ''}`
                : `Reserved for Trusted Partners${priorityCutoff ? ` • Until ${formatCutoffDate(priorityCutoff)}` : ''}`}
            </Text>
          </View>
        )}

        {/* Prominent Pickup Notes / Driver Instructions Banner (Always visible on card before taking/accepting) */}
        {hasPickupNotes && (
          <View style={{
            backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
            borderColor: isDarkMode ? '#EF444450' : '#FCA5A5',
            borderWidth: 1.5,
            borderRadius: 6,
            paddingHorizontal: 12,
            paddingVertical: 9,
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <FileText size={15} color="#EF4444" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Pickup Note / Instructions:
              </Text>
              <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: isDarkMode ? '#FCA5A5' : '#991B1B', marginTop: 2, lineHeight: 18 }}>
                {cleanPickupNotes}
              </Text>
            </View>
          </View>
        )}

        {/* Price & Action Row (Bottom details button removed so Accept button gets full width) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {/* Increase Fare Button */}
          {showIncreaseFare && (
            <TouchableOpacity
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 6,
                backgroundColor: '#F59E0B',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
              onPress={() => {
                if (isAllInclusive) {
                  setShowIncreaseFareModal(true);
                } else {
                  router.push(`/create-booking?edit=true&orderId=${booking.order_id || (booking as any).id}` as any);
                }
              }}
              activeOpacity={0.85}
            >
              <TrendingUp size={14} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 12 }}>
                Increase Fare
              </Text>
            </TouchableOpacity>
          )}

          {isVehicleApproved && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: isDarkMode ? '#064E3B' : '#ECFDF5',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: isDarkMode ? '#059669' : '#A7F3D0',
            }}>
              <CheckCircle size={14} color="#10B981" />
              <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: isDarkMode ? '#6EE7B7' : '#047857' }}>
                Vehicle Approved by Vendor ({vehicleReq?.carType || 'SUV'})
              </Text>
            </View>
          )}

          {/* Accept Button / Upgrade Button / Vehicle Request State */}
          {isVehiclePending ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7',
                  borderColor: isDarkMode ? '#334155' : '#F59E0B',
                  borderWidth: 1.5,
                  borderRadius: 6,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
                activeOpacity={0.8}
                onPress={() => {
                  if (onVehicleMismatch) {
                    onVehicleMismatch(booking.car_type || '');
                  }
                }}
              >
                <Clock size={16} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: '#B45309' }} numberOfLines={1}>
                    Requested for {vehicleReq?.carType || formatCarType(booking.car_type || 'SUV')}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter-Medium', color: isDarkMode ? '#FDE047' : '#92400E' }}>
                    Please wait for approval
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  paddingVertical: 11,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                activeOpacity={0.85}
                onPress={() => {
                  router.push({
                    pathname: `/chat/${orderKey}` as any,
                    params: {
                      orderId: String(orderKey),
                      type: 'vehicle_request',
                      carType: vehicleReq?.carType || booking.car_type || 'SUV',
                      carName: vehicleReq?.carName || '',
                    },
                  });
                }}
              >
                <MessageCircle size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold' }}>
                  Chat
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                dynamicStyles.acceptButton,
                { flex: 1, paddingVertical: 10, borderRadius: 6 },
                isPriorityLocked
                  ? { backgroundColor: '#7C3AED' }
                  : effectiveHasMatchingCar === false
                  ? { backgroundColor: '#F59E0B' }
                  : (disabled && !isAddMoneyState && dynamicStyles.disabledButton),
                loading && dynamicStyles.loadingButton
              ]}
              onPress={handleAcceptPress}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[dynamicStyles.acceptButtonText, { fontSize: 14 }]}>Accepting...</Text>
                </>
              ) : isPriorityLocked ? (
                <>
                  <Sparkles size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[dynamicStyles.acceptButtonText, { fontSize: 13, color: '#FFFFFF' }]}>
                    Upgrade to Accept or Wait ({formatCountdown(priorityRemainingMs)})
                  </Text>
                </>
              ) : effectiveHasMatchingCar === false ? (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[dynamicStyles.acceptButtonText, { fontSize: 13.5 }]}>
                    Needs {formatCarType(booking.car_type)}
                  </Text>
                  <Text style={{ color: '#FEF08A', fontSize: 10, fontFamily: 'Inter-SemiBold', marginTop: 1 }}>
                    View Vehicle Options
                  </Text>
                </View>
              ) : isAddMoneyState ? (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[dynamicStyles.acceptButtonText, { fontSize: 13.5 }]}>
                    Accept for ₹{vendorPrice}
                  </Text>
                  <Text style={{ color: '#FEF08A', fontSize: 10, fontFamily: 'Inter-SemiBold', marginTop: 1 }}>
                    Add ₹{addMoneyAmount} to Wallet to Accept
                  </Text>
                </View>
              ) : isOtherBlockedState ? (
                <Text style={[dynamicStyles.acceptButtonText, { fontSize: 13 }, disabled && dynamicStyles.disabledButtonText]}>
                  {buttonText}
                </Text>
              ) : (
                <Text style={[dynamicStyles.acceptButtonText, { fontSize: 14 }]}>
                  Accept for ₹{vendorPrice}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* FULL DETAILS POP-UP MODAL */}
      <Modal
        visible={showMoreDetails}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMoreDetails(false)}
      >
        <View style={dynamicStyles.bottomSheetOverlay}>
          <View style={[dynamicStyles.bottomSheetContent, { maxHeight: '92%' }]}>
            {/* Modal Header */}
            <View style={dynamicStyles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={dynamicStyles.modalHeaderText}>
                  Booking Details {formatBookingId(booking.order_id || (booking as any).id)}
                </Text>
                <Text style={{ fontSize: 11.5, color: '#E2E8F0', fontFamily: 'Inter-Medium', marginTop: 2 }}>
                  {(booking as any).vendor_name || 'Drop Cars'} • {formatCarType(carType)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowMoreDetails(false)}
                style={dynamicStyles.modalCloseButton}
              >
                <X color="#FFFFFF" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={dynamicStyles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Tariff / Booking Type Banner */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: isAllInclusive
                  ? (isDarkMode ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB')
                  : (booking as any).fare_type === 'DROP_BID'
                  ? (isDarkMode ? 'rgba(147, 51, 234, 0.15)' : '#F3E8FF')
                  : (booking as any).fare_type === 'CORPORATE'
                  ? (isDarkMode ? 'rgba(13, 148, 136, 0.15)' : '#CCFBF1')
                  : (isDarkMode ? 'rgba(99, 102, 241, 0.15)' : '#EFF6FF'),
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: isAllInclusive
                  ? '#D97706'
                  : (booking as any).fare_type === 'DROP_BID'
                  ? '#9333EA'
                  : (booking as any).fare_type === 'CORPORATE'
                  ? '#0D9488'
                  : colors.primary,
              }}>
                <Tag size={18} color={isAllInclusive ? '#D97706' : (booking as any).fare_type === 'DROP_BID' ? '#9333EA' : (booking as any).fare_type === 'CORPORATE' ? '#0D9488' : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 13.5,
                    fontFamily: 'Inter-Bold',
                    color: isAllInclusive ? '#D97706' : (booking as any).fare_type === 'DROP_BID' ? '#9333EA' : (booking as any).fare_type === 'CORPORATE' ? '#0D9488' : colors.primary,
                  }}>
                    {isAllInclusive
                      ? 'All Inclusive Fare Booking'
                      : (booking as any).fare_type === 'DROP_BID'
                      ? 'Drop Bid Fare Booking'
                      : (booking as any).fare_type === 'CORPORATE'
                      ? 'Corporate Fare Booking'
                      : 'Standard Tariff Booking'}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 1 }}>
                    {isAllInclusive
                      ? 'Tolls, Permits & Driver Bata are included in total vendor price'
                      : (booking as any).fare_type === 'DROP_BID'
                      ? 'Vendor bid price model'
                      : (booking as any).fare_type === 'CORPORATE'
                      ? 'Corporate contracted booking rates'
                      : 'Standard per-KM tariff • Tolls, Parking & Driver Bata extra as actuals'}
                  </Text>
                </View>
              </View>

              {/* Pickup & Return Schedule Banner */}
              {!!(pickupDate || pickupTime) && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isDarkMode ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
                  borderRadius: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isDarkMode ? '#B45309' : '#FCD34D',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color="#D97706" />
                    <View>
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, textTransform: 'uppercase' }}>
                        Pickup Schedule
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: isDarkMode ? '#FBBF24' : '#B45309' }}>
                        {pickupDate}{pickupTime ? ` • ${pickupTime}` : ''}
                      </Text>
                    </View>
                  </View>
                  {isRoundTripOrMulticity && !!(endDate || endTime) && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: colors.textSecondary, textTransform: 'uppercase' }}>
                        Return Schedule
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#7E22CE' }}>
                        {endDate}{endTime ? ` • ${endTime}` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Route & Google Maps Link */}
              <View style={dynamicStyles.modalSection}>
                <View style={{ backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC', borderRadius: 6, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>
                    ROUTE DETAILS
                  </Text>

                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MapPin color="#10B981" size={16} />
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                        From: {startCity}
                      </Text>
                    </View>

                    {allCities.length > 2 && middleCities.map((city, idx) => (
                      <View key={`modal-mid-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 }}>
                        <MapPin color="#3B82F6" size={16} />
                        <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#3B82F6' }}>
                          Stop {idx + 1}: {city}
                        </Text>
                      </View>
                    ))}

                    {allCities.length > 1 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MapPin color="#EF4444" size={16} />
                        <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#EF4444' }}>
                          To: {endCity}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Route & Distance Link in Google Maps */}
                  {!!startCity && (
                    <TouchableOpacity
                      onPress={() => {
                        const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startCity)}&destination=${encodeURIComponent(endCity || startCity)}`;
                        Linking.openURL(routeUrl);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.primary + '15',
                        borderWidth: 1,
                        borderColor: colors.primary,
                        borderRadius: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        marginTop: 10,
                        gap: 6,
                      }}
                    >
                      <ExternalLink size={14} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 12 }}>
                        View Route & Distance in Google Maps
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Trip Fare & Booking Security */}
              <View style={dynamicStyles.modalSection}>
                <View style={{ backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF4', borderWidth: 1.5, borderColor: '#10B981', borderRadius: 8, padding: 14 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#065F46', letterSpacing: 0.5, marginBottom: 10 }}>
                    TRIP FARE & BOOKING SECURITY
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13.5, fontFamily: 'Inter-Medium', color: colors.text }}>Total Trip Booking Fare:</Text>
                    <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: '#059669' }}>₹{vendorPrice}</Text>
                  </View>

                  {advanceReceived > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Customer Advance Paid:</Text>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#3B82F6' }}>₹{advanceReceived}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Cash to Collect from Customer:</Text>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>₹{remainingToCollect}</Text>
                      </View>
                    </>
                  )}

                  <View style={{ height: 1, backgroundColor: '#10B981', opacity: 0.25, marginVertical: 6 }} />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>Required Security Hold:</Text>
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            'Wallet Security Hold',
                            `₹${requiredSecurityHold} is held from your wallet when you accept (minimum ₹500, or your commission with extras if that is more). When the trip completes the commission is deducted and the rest is refunded to your wallet. If the booking is cancelled the full amount comes back.`
                          )
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <HelpCircle size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: '#D97706' }}>₹{requiredSecurityHold}</Text>
                  </View>

                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter-Regular', fontStyle: 'italic', lineHeight: 16 }}>
                    * Collect {advanceReceived > 0 ? `remaining ₹${remainingToCollect}` : `full ₹${vendorPrice}`} directly from customer. ₹{requiredSecurityHold} is held in your wallet; after the trip the commission is deducted and the rest is refunded.
                  </Text>
                </View>
              </View>

              {/* Collapsible Tariff Breakdown & Trip Inclusions Accordion */}
              <TouchableOpacity
                onPress={() => setShowTariffAccordion(!showTariffAccordion)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
                  borderRadius: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color={colors.primary} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: colors.text }}>
                    Tariff Breakdown & Inclusions
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.primary }}>
                    {showTariffAccordion ? 'Hide' : 'View Details'}
                  </Text>
                  {showTariffAccordion ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
                </View>
              </TouchableOpacity>

              {showTariffAccordion && (
                <View style={{ marginBottom: 10, gap: 10 }}>
                  {/* Detailed Itemized Charges (Zero values filtered out) */}
                  <View style={dynamicStyles.infoTable}>
                    <View style={dynamicStyles.infoRow}>
                      <View style={dynamicStyles.infoCellLabel}>
                        <Text style={dynamicStyles.infoLabel}>KM & Hours Package</Text>
                      </View>
                      <View style={dynamicStyles.infoCellValue}>
                        <Text style={[dynamicStyles.infoValue, { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
                          {formatKmLimitAndHours(booking.trip_distance || (booking as any).distance_km || (booking as any).distance || 0, booking.trip_type).combined}
                        </Text>
                      </View>
                    </View>

                    {toNumber(booking.fare_per_km) > 0 && (
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoCellLabel}>
                          <Text style={dynamicStyles.infoLabel}>Per KM Rate</Text>
                        </View>
                        <View style={dynamicStyles.infoCellValue}>
                          <Text style={dynamicStyles.infoValue}>₹{toNumber(booking.fare_per_km)} / KM</Text>
                        </View>
                      </View>
                    )}

                    <View style={dynamicStyles.infoRow}>
                      <View style={dynamicStyles.infoCellLabel}>
                        <Text style={dynamicStyles.infoLabel}>Driver Bata (For Driver)</Text>
                      </View>
                      <View style={dynamicStyles.infoCellValue}>
                        <Text style={dynamicStyles.infoValue}>₹{toNumber(booking.driver_allowance) || 400}</Text>
                      </View>
                    </View>

                    {toNumber((booking as any).extra_driver_allowance) > 0 && (
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoCellLabel}>
                          <Text style={dynamicStyles.infoLabel}>Extra Driver Allowance (Vendor)</Text>
                        </View>
                        <View style={dynamicStyles.infoCellValue}>
                          <Text style={dynamicStyles.infoValue}>₹{toNumber((booking as any).extra_driver_allowance)}</Text>
                        </View>
                      </View>
                    )}

                    {toNumber(booking.permit_charges) > 0 && (
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoCellLabel}>
                          <Text style={dynamicStyles.infoLabel}>Permit Charges</Text>
                        </View>
                        <View style={dynamicStyles.infoCellValue}>
                          <Text style={dynamicStyles.infoValue}>₹{toNumber(booking.permit_charges)}</Text>
                        </View>
                      </View>
                    )}

                    {toNumber(booking.hill_charges) > 0 && (
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoCellLabel}>
                          <Text style={dynamicStyles.infoLabel}>Hills Charges</Text>
                        </View>
                        <View style={dynamicStyles.infoCellValue}>
                          <Text style={dynamicStyles.infoValue}>₹{toNumber(booking.hill_charges)}</Text>
                        </View>
                      </View>
                    )}

                    {toNumber(booking.toll_charges) > 0 && (
                      <View style={[dynamicStyles.infoRow, dynamicStyles.infoRowLast]}>
                        <View style={dynamicStyles.infoCellLabel}>
                          <Text style={dynamicStyles.infoLabel}>Toll Charges</Text>
                        </View>
                        <View style={dynamicStyles.infoCellValue}>
                          <Text style={dynamicStyles.infoValue}>₹{toNumber(booking.toll_charges)}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Dedicated Driver-Facing Inclusions & Exclusions Section */}
                  <View style={{ backgroundColor: colors.background, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.text, letterSpacing: 0.5, marginBottom: 8 }}>
                      TRIP INCLUSIONS & EXCLUSIONS
                    </Text>
                    
                    {/* Included */}
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#059669', marginBottom: 4 }}>
                        ✅ INCLUDED IN FARE:
                      </Text>
                      <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • {tripDistance || 355} KM Limit Included
                      </Text>
                      {hasChargeItems && includedItems.map((c, i) => (
                        <Text key={`inc-${i}`} style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • {c.label}{Number(c.amount) > 0 ? ` (₹${Number(c.amount)})` : ''} included
                        </Text>
                      ))}
                      {toNumber(booking.driver_allowance) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Driver Allowance / Bata (₹{toNumber(booking.driver_allowance)})
                        </Text>
                      )}
                      {toNumber((booking as any).car_year_charge) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Model Year Requirement Allowance (₹{toNumber((booking as any).car_year_charge)}) Included
                        </Text>
                      )}
                      {toNumber((booking as any).carrier_charge) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Roof Carrier Allowance (₹{toNumber((booking as any).carrier_charge)}) Included
                        </Text>
                      )}
                      {toNumber((booking as any).non_cng_charge) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Non-CNG Vehicle Allowance (₹{toNumber((booking as any).non_cng_charge)}) Included
                        </Text>
                      )}
                      {toNumber((booking as any).pet_friendly_charge) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Pet-Friendly Allowance (₹{toNumber((booking as any).pet_friendly_charge)}) Included
                        </Text>
                      )}
                      {((isAllInclusive && !hasChargeItems) || (!(booking as any).toll_charge_update && toNumber(booking.toll_charges) > 0)) && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Toll Charges Included {toNumber(booking.toll_charges) > 0 ? `(₹${toNumber(booking.toll_charges)})` : ''}
                        </Text>
                      )}
                      {((isAllInclusive && !hasChargeItems) || toNumber(booking.permit_charges) > 0) && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • State Permit Charges Included {toNumber(booking.permit_charges) > 0 ? `(₹${toNumber(booking.permit_charges)})` : ''}
                        </Text>
                      )}
                      {((isAllInclusive && !hasChargeItems) || toNumber(booking.hill_charges) > 0) && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Hill Charges Included {toNumber(booking.hill_charges) > 0 ? `(₹${toNumber(booking.hill_charges)})` : ''}
                        </Text>
                      )}
                      {((isAllInclusive && !hasChargeItems) || toNumber((booking as any).night_charges) > 0) && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Night Allowance Included {toNumber((booking as any).night_charges) > 0 ? `(₹${toNumber((booking as any).night_charges)})` : ''}
                        </Text>
                      )}
                      {toNumber((booking as any).waiting_hours_included) > 0 && (
                        <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Waiting Hours Included ({(booking as any).waiting_hours_included} hrs)
                        </Text>
                      )}
                      {Boolean((booking as any).gst_included || toNumber((booking as any).gst_amount) > 0) && (
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
                      {Boolean((booking as any).gst_included || toNumber((booking as any).gst_amount) > 0) && (
                        <Text style={{ fontSize: 11.5, color: '#059669', fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • GST: Already paid by company — do NOT collect GST from customer
                        </Text>
                      )}
                      {hasChargeItems && excludedItems.map((c, i) => (
                        <Text key={`exc-${i}`} style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • {c.label}: not included - collect separately from the customer
                        </Text>
                      ))}
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                        • Extra KM Rate: ₹{toNumber(booking.fare_per_km) || 15}/KM for distance driven beyond {tripDistance || 355} KM
                      </Text>
                      {!isAllInclusive && ((booking as any).toll_charge_update || !toNumber(booking.toll_charges)) && (
                        <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Toll Charges: Pay at Toll Gate / Booth
                        </Text>
                      )}
                      {!isAllInclusive && !toNumber(booking.permit_charges) && (
                        <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • State Permit Charges: Pay at Checkpost
                        </Text>
                      )}
                      {!isAllInclusive && (
                        <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginBottom: 3 }}>
                          • Parking Charges
                        </Text>
                      )}
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
                        • Extra Stop / Waiting Charges: Beyond scheduled trip route
                      </Text>
                    </View>
                  </View>

                  {/* Pickup Notes */}
                  {booking.pickup_notes && booking.pickup_notes !== 'NILL' && booking.pickup_notes !== 'null' && (
                    <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#FCA5A5' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <FileText size={14} color="#EF4444" />
                        <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12, fontFamily: 'Inter-Bold', color: '#EF4444' }}>Pickup Notes:</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, color: '#B91C1C', fontFamily: 'Inter-Medium' }}>{booking.pickup_notes}</Text>
                    </View>
                  )}

                  {/* Special Requirements */}
                  {hasSpecialRequirements && (
                    <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 6, padding: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <AlertCircle size={18} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Special Requirements</Text>
                      </View>
                      {!!booking.car_make_year_requirement && (
                        <Text style={{ color: '#B91C1C', fontSize: 13, marginBottom: 4 }}>
                          • Car must be model year {booking.car_make_year_requirement} or newer{toNumber((booking as any).car_year_charge) > 0 ? ` (+₹${toNumber((booking as any).car_year_charge)} allowance)` : ''}
                        </Text>
                      )}
                      {!!booking.carrier_required && (
                        <Text style={{ color: '#B91C1C', fontSize: 13, marginBottom: 4 }}>
                          • A roof carrier is required for this trip{toNumber((booking as any).carrier_charge) > 0 ? ` (+₹${toNumber((booking as any).carrier_charge)} allowance)` : ''}
                        </Text>
                      )}
                      {!!(booking as any).non_cng && (
                        <Text style={{ color: '#B91C1C', fontSize: 13, marginBottom: 4 }}>
                          • Non-CNG vehicle required for this trip{toNumber((booking as any).non_cng_charge) > 0 ? ` (+₹${toNumber((booking as any).non_cng_charge)} allowance)` : ''}
                        </Text>
                      )}
                      {!!(booking as any).pet_friendly && (
                        <Text style={{ color: '#B91C1C', fontSize: 13 }}>
                          • Pet-friendly driver/vehicle required for this trip{toNumber((booking as any).pet_friendly_charge) > 0 ? ` (+₹${toNumber((booking as any).pet_friendly_charge)} allowance)` : ''}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* 15m Assignment Deadline Banner */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: isDarkMode ? '#0F172A' : '#EFF6FF',
                borderRadius: 6,
                padding: 12,
                borderWidth: 1,
                borderColor: isDarkMode ? '#1E293B' : '#DBEAFE',
                marginBottom: 10,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
                  <Clock size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.text }}>
                      15m Driver & Car Assignment Time
                    </Text>
                    <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 1 }}>
                      Must assign driver & vehicle within 15 mins to avoid cancellation penalty.
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#6EE7B7' }}>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#059669' }}>
                    15 Mins
                  </Text>
                </View>
              </View>

              {/* Terms & Conditions Checkbox */}
              <View style={{ marginBottom: 10 }}>
                <View style={dynamicStyles.checkboxRow}>
                  <TouchableOpacity
                    style={[dynamicStyles.checkbox, acknowledgeInterest && dynamicStyles.checkboxChecked]}
                    onPress={() => setAcknowledgeInterest(!acknowledgeInterest)}
                  >
                    {acknowledgeInterest && <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                  </TouchableOpacity>
                  <Text
                    style={[dynamicStyles.checkboxText, dynamicStyles.link, { flex: 1 }]}
                    onPress={() => setShowTermsModal(true)}
                  >
                    I agree to the Booking Terms & Cancellation Penalty Policy
                  </Text>
                </View>
              </View>

              {/* Wallet Hold Disclaimer */}
              <Text style={{ fontSize: 11.5, color: isDarkMode ? '#FBBF24' : '#B45309', textAlign: 'center', fontFamily: 'Inter-Medium', marginBottom: 12 }}>
                ₹{requiredSecurityHold} will be held in your wallet (minimum ₹500). After the trip the commission is deducted and the rest is refunded.
              </Text>

              {/* Guidelines & Helpline Support Buttons */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: '#EFF6FF',
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                    paddingVertical: 10,
                    borderRadius: 6,
                  }}
                  onPress={() => {
                    setShowMoreDetails(false);
                    setRulesModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <FileText size={14} color="#2563EB" />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#1D4ED8' }}>
                    Trip Guidelines
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#FCA5A5',
                    paddingVertical: 10,
                    borderRadius: 6,
                  }}
                  onPress={() => {
                    Alert.alert(
                      'Need Help?',
                      'Contact Drop Cars Helpline Support for assistance with this booking.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Call Helpline (7200217986)', onPress: () => Linking.openURL('tel:7200217986') },
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <HelpCircle size={14} color="#DC2626" />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#DC2626' }}>
                    Need Help
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Prominent Pickup Notes Alert in Modal */}
              {hasPickupNotes && (
                <View style={{
                  backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                  borderColor: isDarkMode ? '#EF444460' : '#FCA5A5',
                  borderWidth: 1.5,
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  <FileText size={16} color="#EF4444" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Pickup Note / Instructions:
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: isDarkMode ? '#FCA5A5' : '#991B1B', marginTop: 2, lineHeight: 18 }}>
                      {cleanPickupNotes}
                    </Text>
                  </View>
                </View>
              )}

              {/* Vehicle Mismatch Warning Banner */}
              {hasMatchingCar === false && (
                <View style={{
                  backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7',
                  borderRadius: 6,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: isDarkMode ? '#334155' : '#FDE68A',
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <AlertCircle size={18} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#B45309' }}>
                      Vehicle Not in Your Fleet
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 1 }}>
                      This booking requires a verified {formatCarType(booking.car_type)}. Add one to your fleet or request with an eligible vehicle.
                    </Text>
                  </View>
                </View>
              )}

              {/* Unified Accept Button */}
              <TouchableOpacity
                style={[
                  dynamicStyles.acceptButton,
                  { paddingVertical: 14, borderRadius: 6, marginBottom: 14 },
                  hasMatchingCar === false && { backgroundColor: '#F59E0B' },
                  (!acknowledgeInterest || (disabled && !isAddMoneyState && hasMatchingCar !== false) || loading || isAccepting) && dynamicStyles.disabledButton,
                  (loading || isAccepting) && dynamicStyles.loadingButton
                ]}
                onPress={async () => {
                  if (isPriorityLocked) {
                    handlePriorityLockedPress();
                    return;
                  }
                  if (hasMatchingCar === false) {
                    setShowMoreDetails(false);
                    if (onVehicleMismatch) {
                      onVehicleMismatch(booking.car_type || '');
                    }
                    return;
                  }
                  if (isAddMoneyState && addMoneyAmount > 0) {
                    setShowMoreDetails(false);
                    setShowRechargeHoldModal(true);
                    return;
                  }
                  if (!acknowledgeInterest) {
                    Alert.alert('Terms & Conditions', 'Please accept the booking terms and cancellation penalty policy to proceed.');
                    return;
                  }
                  setIsAccepting(true);
                  try {
                    setShowMoreDetails(false);
                    await onAccept(booking);
                  } catch (e) {
                    console.error('Error accepting booking:', e);
                  } finally {
                    setIsAccepting(false);
                    setAcknowledgeInterest(false);
                  }
                }}
                disabled={!acknowledgeInterest || (disabled && !isAddMoneyState && effectiveHasMatchingCar !== false) || loading || isAccepting}
                activeOpacity={0.85}
              >
                {loading || isAccepting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={dynamicStyles.acceptButtonText}>Accepting...</Text>
                  </View>
                ) : isPriorityLocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Lock size={16} color="#1F2937" />
                    <Text style={[dynamicStyles.acceptButtonText, dynamicStyles.disabledButtonText]}>
                      Wait {formatCountdown(priorityRemainingMs)} to accept
                    </Text>
                  </View>
                ) : isVehiclePending ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={dynamicStyles.acceptButtonText}>
                      Requested for {vehicleReq?.carType || formatCarType(booking.car_type || 'SUV')} • Please wait
                    </Text>
                  </View>
                ) : effectiveHasMatchingCar === false ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={dynamicStyles.acceptButtonText}>
                      Needs {formatCarType(booking.car_type)} • View Vehicle Options
                    </Text>
                  </View>
                ) : isAddMoneyState ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={dynamicStyles.acceptButtonText}>
                      Accept Booking for ₹{vendorPrice}
                    </Text>
                    <Text style={{ color: '#FEF08A', fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 2 }}>
                      Add ₹{addMoneyAmount} to Wallet to Accept
                    </Text>
                  </View>
                ) : isOtherBlockedState ? (
                  <Text style={[dynamicStyles.acceptButtonText, disabled && dynamicStyles.disabledButtonText]}>
                    {buttonText}
                  </Text>
                ) : (
                  <Text style={dynamicStyles.acceptButtonText}>
                    Accept Booking for ₹{vendorPrice}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>



      {/* Terms & Conditions Modal */}
      <Modal
        visible={showTermsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContent, { maxWidth: 420 }]}> 
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalHeaderText}>Terms & Conditions</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} style={dynamicStyles.modalCloseButton}>
                <X color="#FFFFFF" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView style={dynamicStyles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={dynamicStyles.modalSection}>
                <Text style={[dynamicStyles.modalValue, { marginBottom: 8 }]}>
                  • I agree to follow all Drop Cars partner standards, rules, and guidelines.
                </Text>
                <Text style={[dynamicStyles.modalValue, { marginBottom: 8 }]}>
                  • I understand that ₹{requiredSecurityHold} will be held from my wallet for this booking. After the trip the commission is deducted and the rest is refunded to my wallet.
                </Text>
                <Text style={[dynamicStyles.modalValue, { marginBottom: 8 }]}>
                  • I agree that I must assign a verified driver and vehicle details within 15 minutes of accepting.
                </Text>
                <Text style={[dynamicStyles.modalValue, { color: '#DC2626', fontFamily: 'Inter-Bold', marginBottom: 8 }]}>
                  • Cancellation Penalty Policy: If I cancel this booking after accepting, fail to assign driver/car in time, or fail to execute the trip, the full held commission amount of ₹{requiredSecurityHold} will be forfeited as a cancellation penalty and will NOT be refunded.
                </Text>
                <Text style={dynamicStyles.modalValue}>
                  • Direct dealing or soliciting the customer outside the Drop Cars platform will result in permanent suspension of my partner account.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <TripRulesModal
        visible={rulesModalVisible}
        onClose={() => setRulesModalVisible(false)}
        tripType={tripType}
        driverAllowance={booking.driver_allowance}
        tollCharges={booking.toll_charges}
        permitCharges={booking.permit_charges}
      />

      <StartDutyModal
        visible={startDutyModalVisible}
        onClose={() => setStartDutyModalVisible(false)}
        onStartDutyConfirmed={(odometer, otp) => {
          setStartDutyModalVisible(false);
        }}
        orderId={booking.order_id}
        pickupLocation={pickup}
      />
      {/* Increase Fare Modal */}
      <IncreaseFareModal
        visible={showIncreaseFareModal}
        onClose={() => setShowIncreaseFareModal(false)}
        orderId={booking.order_id || (booking as any).id}
        currentFare={vendorPrice || booking.estimated_price || 0}
        onSuccess={(newFare) => {
          if (onIncreaseFareSuccess) {
            onIncreaseFareSuccess(newFare);
          }
        }}
      />
      {/* WALLET SECURITY HOLD / RECHARGE MODAL */}
      <Modal
        visible={showRechargeHoldModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRechargeHoldModal(false)}
      >
        <View style={dynamicStyles.bottomSheetOverlay}>
          <View style={[dynamicStyles.bottomSheetContent, { maxHeight: '85%' }]}>
            <View style={dynamicStyles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={dynamicStyles.modalHeaderText}>
                  Security Hold Required
                </Text>
                <Text style={{ fontSize: 11.5, color: '#E2E8F0', fontFamily: 'Inter-Medium', marginTop: 2 }}>
                  Booking {formatBookingId(booking.order_id || (booking as any).id)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowRechargeHoldModal(false)}
                style={dynamicStyles.modalCloseButton}
              >
                <X color="#FFFFFF" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={dynamicStyles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Shield Info Card */}
              <View style={{
                backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
                borderWidth: 1,
                borderColor: isDarkMode ? '#2563EB' : '#93C5FD',
                borderRadius: 8,
                padding: 14,
                marginBottom: 14,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'center',
              }}>
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.primary + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <ShieldCheck size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text }}>
                    Trip Security Hold
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginTop: 2, lineHeight: 17 }}>
                    ₹{requiredSecurityHold} of wallet balance is required to hold for this booking (minimum ₹500). The commission is deducted after the trip and the rest is refunded.
                  </Text>
                </View>
              </View>

              {/* Price & Deposit Summary */}
              <View style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 14,
                marginBottom: 14,
                gap: 10,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Trip Booking Fare:</Text>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>₹{vendorPrice}</Text>
                </View>
                {advanceReceived > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 12.5, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Advance Paid by Customer:</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#3B82F6' }}>₹{advanceReceived}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>Required Wallet Balance:</Text>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: '#D97706' }}>₹{requiredSecurityHold}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ flexShrink: 1, marginRight: 8, fontSize: 13.5, fontFamily: 'Inter-Bold', color: '#DC2626' }}>Shortfall in Wallet:</Text>
                  <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: '#DC2626' }}>₹{addMoneyAmount}</Text>
                </View>
              </View>

              {/* Terms note */}
              <View style={{
                backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB',
                borderWidth: 1,
                borderColor: isDarkMode ? '#D97706' : '#FCD34D',
                borderRadius: 6,
                padding: 12,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: isDarkMode ? '#FBBF24' : '#92400E', lineHeight: 17 }}>
                  💡 <Text style={{ fontFamily: 'Inter-Bold' }}>How it works:</Text> You collect the full trip fare (₹{advanceReceived > 0 ? remainingToCollect : vendorPrice}) directly from the customer. The security hold is released back to your wallet once the trip is completed.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setShowRechargeHoldModal(false)}
                >
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-SemiBold', color: colors.textSecondary }}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 2,
                    paddingVertical: 13,
                    borderRadius: 6,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                  onPress={() => {
                    setShowRechargeHoldModal(false);
                    if (onAddMoneyPress) {
                      onAddMoneyPress(addMoneyAmount);
                    } else {
                      router.push({ pathname: '/(tabs)/wallet', params: { amount: String(addMoneyAmount) } } as any);
                    }
                  }}
                >
                  <Wallet size={16} color="#FFFFFF" />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                    Add ₹{addMoneyAmount} to Wallet & Continue
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Trusted Partner Priority Explanation Sheet */}
      <TrustedPartnerPriorityModal
        visible={showPriorityExplanationModal}
        onClose={() => setShowPriorityExplanationModal(false)}
        onUpgrade={() => {
          setShowPriorityExplanationModal(false);
          router.push({ pathname: '/subscription', params: { focusBookingId: String(orderKey) } } as any);
        }}
        onSeeDetails={() => {
          setShowMoreDetails(true);
        }}
        countdownText={formatCountdown(priorityRemainingMs)}
        amountNeeded={amountNeeded != null && amountNeeded > 0 ? amountNeeded : addMoneyAmount}
        onAddMoney={() => {
          setShowPriorityExplanationModal(false);
          setShowRechargeHoldModal(true);
        }}
      />
    </>
  );
}
