import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Modal,
  Image,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Car,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  ExternalLink,
  X,
  ChevronRight,
  RefreshCw,
  Printer,
  ShieldCheck,
  Send,
  MessageCircle,
  Receipt,
  Plus,
  Building2,
  ChevronDown,
  Navigation,
  Users,
  Search,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DateTimeField from '@/components/DateTimeField';
import { colors, shadows } from '@/constants/theme';
import { enquiriesApi } from '@/services/enquiriesApi';
import { generateEstimationHtml, InvoiceData } from '@/utils/invoiceGenerator';

export interface BrandInfo {
  id: string;
  name: string;
  domain: string;
  phone: string;
  primaryColor: string;
  tagline: string;
  badge: string;
}

export const BRAND_CONFIGS: BrandInfo[] = [
  {
    id: 'dropcars',
    name: 'Drop Cars',
    domain: 'dropcars.in',
    phone: '9043990439',
    primaryColor: '#0EA5E9',
    tagline: 'Standard & Premium Taxis',
    badge: 'FLAGSHIP',
  },
  {
    id: '24droptaxi',
    name: '24 Drop Taxi',
    domain: '24drop-taxi.in',
    phone: '9043990439',
    primaryColor: '#3B82F6',
    tagline: 'One Way & Outstation Cabs',
    badge: '24x7 ONE WAY',
  },
  {
    id: 'tatataxi',
    name: 'Tata Taxi',
    domain: 'tatataxi.in',
    phone: '9043990439',
    primaryColor: '#F59E0B',
    tagline: 'Reliable Outstation Fleet',
    badge: 'POPULAR',
  },
  {
    id: 'tatacalltaxi',
    name: 'Tata Call Taxi',
    domain: 'tatacalltaxi.in',
    phone: '9043990439',
    primaryColor: '#10B981',
    tagline: 'City & Outstation Cabs',
    badge: 'LOCAL & DROP',
  },
  {
    id: 'mukiltravels',
    name: 'Mukil Travels',
    domain: 'mukiltravels.in',
    phone: '9043990439',
    primaryColor: '#EC4899',
    tagline: 'Versatile Tour & Travel Packages',
    badge: 'TOUR PACKAGES',
  },
  {
    id: 'yellowboard',
    name: 'Yellow Board',
    domain: 'yellowboard.in',
    phone: '9043990439',
    primaryColor: '#EAB308',
    tagline: 'Commercial Fleet Cabs',
    badge: 'COMMERCIAL',
  },
  {
    id: 'arunachala',
    name: 'Arunachala Travels',
    domain: 'arunachalatravels.in',
    phone: '9043990439',
    primaryColor: '#8B5CF6',
    tagline: 'Tempo Traveller & Force Urbania Specialist',
    badge: 'BUS & TT',
  },
];

export interface VehicleOption {
  id: string;
  name: string;
  model: string;
  seats: string;
  luggage: string;
  ratePerKmOneway: number;
  ratePerKmRoundtrip: number;
  minKmOneway: number;
  minKmRoundtrip: number;
  driverBataOneway: number;
  driverBataRoundtrip: number;
  tag?: string;
  tagColor?: string;
  color: string;
  acType: string;
}

// Exact Tariffs matching Drop Cars Business Rules
export const STANDARD_VEHICLES: VehicleOption[] = [
  {
    id: 'sedan',
    name: 'Sedan',
    model: 'Swift Dzire, Toyota Etios, Aura',
    seats: '4 + 1 Seats',
    luggage: '2 Large Bags',
    ratePerKmOneway: 15,
    ratePerKmRoundtrip: 14,
    minKmOneway: 130,
    minKmRoundtrip: 250,
    driverBataOneway: 400,
    driverBataRoundtrip: 400,
    tag: 'POPULAR',
    tagColor: '#3B82F6',
    color: '#3B82F6',
    acType: 'AC Guaranteed',
  },
  {
    id: 'hatchback',
    name: 'Hatchback',
    model: 'WagonR, Swift, Tiago',
    seats: '4 + 1 Seats',
    luggage: '1 Large Bag',
    ratePerKmOneway: 14,
    ratePerKmRoundtrip: 13,
    minKmOneway: 130,
    minKmRoundtrip: 250,
    driverBataOneway: 400,
    driverBataRoundtrip: 400,
    tag: 'BUDGET',
    tagColor: '#10B981',
    color: '#10B981',
    acType: 'AC Economy',
  },
  {
    id: 'suv',
    name: 'SUV',
    model: 'Maruti Ertiga, Triber, Carens',
    seats: '6 + 1 Seats',
    luggage: '3 Large Bags',
    ratePerKmOneway: 20,
    ratePerKmRoundtrip: 19,
    minKmOneway: 150,
    minKmRoundtrip: 300,
    driverBataOneway: 500,
    driverBataRoundtrip: 500,
    tag: 'FAMILY',
    tagColor: '#8B5CF6',
    color: '#8B5CF6',
    acType: 'Dual AC',
  },
  {
    id: 'innova',
    name: 'Innova Premium',
    model: 'Toyota Innova (Comfort 7+1)',
    seats: '7 + 1 Seats',
    luggage: '4 Large Bags',
    ratePerKmOneway: 21,
    ratePerKmRoundtrip: 20,
    minKmOneway: 180,
    minKmRoundtrip: 300,
    driverBataOneway: 500,
    driverBataRoundtrip: 500,
    tag: 'COMFORT',
    tagColor: '#F59E0B',
    color: '#F59E0B',
    acType: 'Rear AC Vents',
  },
  {
    id: 'crysta',
    name: 'Innova Crysta',
    model: 'Toyota Innova Crysta Luxury',
    seats: '7 + 1 Seats',
    luggage: '4 Large Bags',
    ratePerKmOneway: 24,
    ratePerKmRoundtrip: 22,
    minKmOneway: 200,
    minKmRoundtrip: 300,
    driverBataOneway: 500,
    driverBataRoundtrip: 500,
    tag: 'LUXURY',
    tagColor: '#EC4899',
    color: '#EC4899',
    acType: 'Automatic Climate Control',
  },
];

// Fleet for Arunachala Travels (Tempo Traveller Specialist)
export const ARUNACHALA_VEHICLES: VehicleOption[] = [
  {
    id: 'tt_12',
    name: 'Tempo Traveller 12 Seater (TT 12)',
    model: 'Force Tempo Traveller AC (12+1)',
    seats: '12 + 1 Seats',
    luggage: '8 Large Bags',
    ratePerKmOneway: 24,
    ratePerKmRoundtrip: 22,
    minKmOneway: 250,
    minKmRoundtrip: 250,
    driverBataOneway: 600,
    driverBataRoundtrip: 600,
    tag: 'POPULAR',
    tagColor: '#8B5CF6',
    color: '#8B5CF6',
    acType: 'Roof AC + Pushback Seats',
  },
  {
    id: 'tt_18',
    name: 'Tempo Traveller 18 Seater (TT 18)',
    model: 'Force Tempo Traveller AC (18+1)',
    seats: '18 + 1 Seats',
    luggage: '12 Large Bags',
    ratePerKmOneway: 28,
    ratePerKmRoundtrip: 26,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBataOneway: 700,
    driverBataRoundtrip: 700,
    tag: 'LARGE GROUP',
    tagColor: '#6366F1',
    color: '#6366F1',
    acType: 'High Roof Luxury AC',
  },
  {
    id: 'urbania_12',
    name: 'Force Urbania (12 str)',
    model: 'Next-Gen Luxury Urbania (12+1)',
    seats: '12 + 1 Luxury Recliners',
    luggage: '8 Bags',
    ratePerKmOneway: 32,
    ratePerKmRoundtrip: 30,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBataOneway: 800,
    driverBataRoundtrip: 800,
    tag: 'LUXURY',
    tagColor: '#EC4899',
    color: '#EC4899',
    acType: 'Individual AC Vents + Ambient Lights',
  },
];

const POPULAR_CITIES = [
  'Chennai',
  'Bangalore',
  'Madurai',
  'Coimbatore',
  'Trichy',
  'Salem',
  'Pondicherry',
  'Tirunelveli',
  'Vellore',
  'Tirupati',
  'Kanyakumari',
  'Rameshwaram',
  'Ooty',
  'Kodaikanal',
  'Thanjavur',
  'Erode',
  'Tiruppur',
  'Hosur',
  'Dindigul',
  'Kanchipuram',
];

const DISTANCE_MATRIX: Record<string, Record<string, number>> = {
  chennai: {
    bangalore: 350,
    madurai: 460,
    coimbatore: 510,
    trichy: 330,
    salem: 345,
    pondicherry: 160,
    tirunelveli: 620,
    vellore: 140,
    tirupati: 145,
    kanyakumari: 700,
    rameshwaram: 560,
  },
  bangalore: {
    chennai: 350,
    coimbatore: 365,
    mysore: 150,
    madurai: 435,
    salem: 205,
    trichy: 340,
    pondicherry: 310,
    vellore: 215,
  },
  coimbatore: {
    chennai: 510,
    bangalore: 365,
    madurai: 215,
    salem: 165,
    trichy: 220,
    ooty: 85,
    kochi: 190,
  },
  madurai: {
    chennai: 460,
    bangalore: 435,
    coimbatore: 215,
    trichy: 135,
    tirunelveli: 160,
    kanyakumari: 245,
    rameshwaram: 175,
  },
  trichy: {
    chennai: 330,
    madurai: 135,
    coimbatore: 220,
    salem: 145,
    thanjavur: 60,
    bangalore: 340,
  },
};

function getCityEstimatedDistance(fromCity: string, toCity: string): number {
  const norm = (c: string) => c.trim().toLowerCase().split(',')[0].replace(/[^a-z]/g, '');
  const f = norm(fromCity);
  const t = norm(toCity);
  if (DISTANCE_MATRIX[f] && DISTANCE_MATRIX[f][t]) {
    return DISTANCE_MATRIX[f][t];
  }
  if (DISTANCE_MATRIX[t] && DISTANCE_MATRIX[t][f]) {
    return DISTANCE_MATRIX[t][f];
  }
  if (f && t && f !== t) return 250;
  return 150;
}

function generateEnquiryRefId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randSeq = String(Math.floor(10 + Math.random() * 89));
  return `E${yy}${mm}${dd}${randSeq}`;
}

export default function QuoteEstimateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();

  // Step 1 = Form, Step 2 = Estimate Result
  const [currentStep, setCurrentStep] = useState<'form' | 'result'>('form');

  // Brand Selector
  const [selectedBrand, setSelectedBrand] = useState<BrandInfo>(BRAND_CONFIGS[0]);
  const [showBrandPickerModal, setShowBrandPickerModal] = useState(false);

  const isArunachala = selectedBrand.id === 'arunachala' || selectedBrand.domain.includes('arunachala');

  // Trip Types: oneway, roundtrip, local, multicity
  const [tripType, setTripType] = useState<string>('oneway');
  const isRound = tripType === 'roundtrip';

  // Vehicles list
  const vehicleList = isArunachala ? ARUNACHALA_VEHICLES : STANDARD_VEHICLES;
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption>(STANDARD_VEHICLES[0]);

  // SUV Seating Option (6+1 vs 7+1)
  const [suvSeats, setSuvSeats] = useState<'6+1' | '7+1'>('6+1');

  // When brand changes, reset tripType & vehicle to brand defaults
  useEffect(() => {
    if (isArunachala) {
      if (tripType === 'oneway' || tripType === 'multicity') {
        setTripType('droptrip');
      }
      setSelectedVehicle(ARUNACHALA_VEHICLES[0]);
    } else {
      if (tripType === 'droptrip') {
        setTripType('oneway');
      }
      setSelectedVehicle(STANDARD_VEHICLES[0]);
    }
  }, [selectedBrand.id]);

  // Route & Stops
  const [pickupCity, setPickupCity] = useState('Chennai');
  const [dropCity, setDropCity] = useState('Madurai');
  const [stops, setStops] = useState<string[]>([]);

  // City Search Modal State
  const [citySearchModal, setCitySearchModal] = useState<{
    visible: boolean;
    target: 'pickup' | 'drop' | number;
    query: string;
  }>({
    visible: false,
    target: 'pickup',
    query: '',
  });

  // Date & Time
  const [travelDate, setTravelDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [travelTime, setTravelTime] = useState('09:00');
  const [distanceKmInput, setDistanceKmInput] = useState('460');

  // Customer Contact
  const [customerName, setCustomerName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isWhatsAppSame, setIsWhatsAppSame] = useState(true);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Add to Leads Checkbox (checked by default)
  const [addToLeads, setAddToLeads] = useState(true);

  // Rate Overrides
  const [showRateOverride, setShowRateOverride] = useState(false);
  const [customRatePerKm, setCustomRatePerKm] = useState('');
  const [customDriverBata, setCustomDriverBata] = useState('');

  // Generated Estimate State
  const [generatedRefId, setGeneratedRefId] = useState('');
  const [syncingToWebsite, setSyncingToWebsite] = useState(false);
  const [calculationBreakdown, setCalculationBreakdown] = useState<{
    distanceKm: number;
    baseFare: number;
    driverBata: number;
    tollEstimate: number;
    totalFare: number;
    advanceAmount: number;
    balancePayable: number;
    billableKm: number;
    ratePerKm: number;
  } | null>(null);

  // PDF & Share Modal State
  const [showSharePdfModal, setShowSharePdfModal] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Auto calculate estimated distance
  const recalculateDistance = (pCity: string, dCity: string, currentStops: string[]) => {
    let base = getCityEstimatedDistance(pCity, dCity);
    if (currentStops.length > 0) {
      const validStops = currentStops.filter((s) => s.trim().length > 0);
      base += validStops.length * 60;
    }
    setDistanceKmInput(String(base));
  };

  const handleSelectCity = (cityName: string) => {
    const { target } = citySearchModal;
    setCitySearchModal({ visible: false, target: 'pickup', query: '' });

    if (target === 'pickup') {
      setPickupCity(cityName);
      recalculateDistance(cityName, dropCity, stops);
    } else if (target === 'drop') {
      setDropCity(cityName);
      recalculateDistance(pickupCity, cityName, stops);
    } else if (typeof target === 'number') {
      const updated = [...stops];
      updated[target] = cityName;
      setStops(updated);
      recalculateDistance(pickupCity, dropCity, updated);
    }
  };

  const handleAddStop = () => {
    if (stops.length >= 6) {
      Alert.alert('Limit Reached', 'Maximum 6 intermediate stops allowed.');
      return;
    }
    const updated = [...stops, ''];
    setStops(updated);
  };

  const handleRemoveStop = (idx: number) => {
    const updated = stops.filter((_, i) => i !== idx);
    setStops(updated);
    recalculateDistance(pickupCity, dropCity, updated);
  };

  const handleToggleNoteTag = (tag: string) => {
    if (specialNotes.includes(tag)) {
      setSpecialNotes(specialNotes.replace(tag, '').replace(/,\s*,/g, ',').trim());
    } else {
      setSpecialNotes(specialNotes ? `${specialNotes}, ${tag}` : tag);
    }
  };

  // Active Rate and Bata depending on 1-way vs 2-way
  const activeRatePerKm = isRound ? selectedVehicle.ratePerKmRoundtrip : selectedVehicle.ratePerKmOneway;
  const activeDriverBata = isRound ? selectedVehicle.driverBataRoundtrip : selectedVehicle.driverBataOneway;

  // Calculate & Save
  const handleGenerateEstimate = async () => {
    if (!pickupCity.trim()) {
      Alert.alert('Pickup Required', 'Please enter or select a pickup city.');
      return;
    }
    if (!dropCity.trim()) {
      Alert.alert('Drop Required', 'Please enter or select a destination drop city.');
      return;
    }

    const effectiveCustomerName = customerName.trim() || 'Valued Customer';
    const cleanDigits = customerPhone.replace(/\D/g, '');

    const dist = parseInt(distanceKmInput || '0', 10) || getCityEstimatedDistance(pickupCity, dropCity);
    const effectiveKm = isRound ? dist * 2 : dist;
    const minKm = isRound ? selectedVehicle.minKmRoundtrip : selectedVehicle.minKmOneway;
    const billableKm = Math.max(effectiveKm, minKm);

    const effectiveRate = parseFloat(customRatePerKm) || activeRatePerKm;
    const effectiveBata = parseFloat(customDriverBata) || activeDriverBata;

    const baseFare = billableKm * effectiveRate;
    const driverBata = isRound ? effectiveBata * 2 : effectiveBata;

    // Toll estimation based on distance
    let tollEstimate = 0;
    if (dist >= 350) tollEstimate = isRound ? 1100 : 550;
    else if (dist >= 200) tollEstimate = isRound ? 760 : 380;
    else if (dist >= 100) tollEstimate = isRound ? 440 : 220;

    const totalFare = baseFare + driverBata + tollEstimate;
    const advanceAmount = Math.round(totalFare * 0.20);
    const balancePayable = totalFare - advanceAmount;

    const refId = generateEnquiryRefId();
    setGeneratedRefId(refId);

    setCalculationBreakdown({
      distanceKm: dist,
      billableKm,
      ratePerKm: effectiveRate,
      baseFare,
      driverBata,
      tollEstimate,
      totalFare,
      advanceAmount,
      balancePayable,
    });

    // If "Add to leads" is checked, automatically sync/save to Website CRM Leads
    if (addToLeads && (cleanDigits.length >= 10 || customerName.trim())) {
      setSyncingToWebsite(true);
      try {
        const stopsNote = stops.filter((s) => s.trim()).length > 0 ? `Via Stops: ${stops.filter((s) => s.trim()).join(', ')}` : '';
        const tripLabel =
          tripType === 'droptrip'
            ? 'Drop Trip (With Stops)'
            : tripType === 'roundtrip'
            ? 'Round Trip'
            : tripType === 'local'
            ? 'Local Rental'
            : tripType === 'multicity'
            ? 'Multi City'
            : 'One Way';

        const finalWhatsAppNum = isWhatsAppSame ? cleanDigits : (whatsAppPhone.replace(/\D/g, '') || cleanDigits);

        await enquiriesApi.createLead({
          name: effectiveCustomerName,
          phone: cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '9000000000',
          pickup: pickupCity.trim(),
          drop_location: dropCity.trim(),
          trip_type: tripLabel,
          vehicle_type: selectedVehicle.id === 'suv' ? `SUV (${suvSeats})` : selectedVehicle.name,
          travel_date: travelDate,
          travel_time: travelTime,
          fare_estimate: totalFare,
          advance_requested: advanceAmount,
          notes: `[Ref: ${refId}] WhatsApp: ${finalWhatsAppNum} | ${stopsNote ? stopsNote + ' | ' : ''}${specialNotes ? specialNotes + ' | ' : ''}Quoted via ${selectedBrand.name}`,
          website: selectedBrand.name,
        });
      } catch (err) {
        console.warn('Auto CRM sync notice:', err);
      } finally {
        setSyncingToWebsite(false);
      }
    }

    setCurrentStep('result');
  };

  // Direct Online Confirmation Link
  const confirmationUrl = `https://${selectedBrand.domain}/confirm?ref=${generatedRefId}&phone=${encodeURIComponent(customerPhone)}`;

  // Formatted WhatsApp Message
  const getWhatsAppMessage = () => {
    if (!calculationBreakdown) return '';
    const brandName = selectedBrand.name.toUpperCase();
    const tripLabel =
      tripType === 'droptrip'
        ? 'Drop Trip'
        : tripType === 'roundtrip'
        ? 'Round Trip'
        : tripType === 'local'
        ? 'Local Rental / Hourly'
        : tripType === 'multicity'
        ? 'Multi City Trip'
        : 'One Way Trip';

    const stopsText = stops.filter((s) => s.trim()).length > 0 ? `\n• Via Stops: ${stops.filter((s) => s.trim()).join(' ➔ ')}` : '';
    const vehicleName = selectedVehicle.id === 'suv' ? `SUV (${suvSeats})` : selectedVehicle.name;

    return `🚗 *${brandName} - TRIP ESTIMATION & QUOTE*
Reference ID: *${generatedRefId}*
Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}

Hello *${customerName || 'Valued Customer'}*, greetings from *${selectedBrand.name}*!
Here is your requested trip quotation:

📍 *Journey Route & Plan:*
• Route: ${pickupCity} ➔ ${dropCity}${stopsText}
• Trip Type: ${tripLabel}
• Vehicle: ${vehicleName} (${selectedVehicle.model})
• Travel Date: ${travelDate} at ${travelTime}
• Estimated Distance: ~${calculationBreakdown.distanceKm} KM (Billable: ${calculationBreakdown.billableKm} KM)

💰 *Fare Breakdown:*
• Base Ride Fare (${calculationBreakdown.billableKm} km × ₹${calculationBreakdown.ratePerKm}): ₹${calculationBreakdown.baseFare.toLocaleString('en-IN')}
• Driver Allowance (Bata): ₹${calculationBreakdown.driverBata.toLocaleString('en-IN')}
${calculationBreakdown.tollEstimate > 0 ? `• Standard Toll Allowance: ₹${calculationBreakdown.tollEstimate.toLocaleString('en-IN')}\n` : ''}----------------------------------------
*TOTAL ESTIMATED FARE: ₹${calculationBreakdown.totalFare.toLocaleString('en-IN')}*
• 20% Booking Advance: ₹${calculationBreakdown.advanceAmount.toLocaleString('en-IN')}
• Balance on Trip Completion: ₹${calculationBreakdown.balancePayable.toLocaleString('en-IN')}

🔗 *Instant Online Booking & Confirmation:*
${confirmationUrl}

📞 For 24x7 bookings & support: *${selectedBrand.phone}*
Website: https://${selectedBrand.domain}`;
  };

  const handleShareWhatsApp = async () => {
    const text = getWhatsAppMessage();
    const finalWhatsAppNum = isWhatsAppSame ? customerPhone.replace(/\D/g, '') : (whatsAppPhone.replace(/\D/g, '') || customerPhone.replace(/\D/g, ''));
    const targetPhone = finalWhatsAppNum.length === 10 ? `91${finalWhatsAppNum}` : finalWhatsAppNum;
    const url = targetPhone
      ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen || Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp Error', 'WhatsApp is not installed on this device.');
      }
    } catch {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Alert.alert('Share Error', 'Could not open WhatsApp.');
      }
    }
  };

  const copyToClipboard = (text: string, isRef: boolean) => {
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    if (isRef) {
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const filteredCities = POPULAR_CITIES.filter((c) =>
    c.toLowerCase().includes(citySearchModal.query.toLowerCase().trim())
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, flex: 1 }]}>
      <StatusBar style="light" />
      {/* ── Signature Curved Operations-Grade Header ── */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B'] : ['#2A2665', '#1B1446']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerBanner, { paddingTop: topPadding + 8 }]}
      >
        <View style={styles.headerTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                if (currentStep === 'result') {
                  setCurrentStep('form');
                } else {
                  router.back();
                }
              }}
              style={styles.backBtn}
              activeOpacity={0.8}
            >
              <ArrowLeft size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerBannerTitle}>Trip Quotation & Estimate</Text>
              <Text style={styles.headerBannerSub}>
                {currentStep === 'form' ? `Branded for ${selectedBrand.name}` : `Ref: ${generatedRefId}`}
              </Text>
            </View>
          </View>

          {/* Right: Brand Selector Pill & Theme Toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowBrandPickerModal(true)}
              style={styles.brandSelectorPill}
              activeOpacity={0.8}
            >
              <Building2 size={13} color="#F8FAFC" />
              <Text style={styles.brandSelectorPillText}>{selectedBrand.name}</Text>
              <ChevronDown size={13} color="#94A3B8" />
            </TouchableOpacity>
            <ThemeToggle size={18} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
      >
        {currentStep === 'form' ? (
          /* ══════════════════════════════════════════════
             STEP 1: BOOKING & ESTIMATION INPUT FORM
             ══════════════════════════════════════════════ */
          <View style={{ gap: 14 }}>
            {/* 1. Trip Type Selector */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Select Trip Type</Text>
              </View>

              <View style={styles.tripTypeRow}>
                {[
                  { id: 'oneway', label: 'One Way Drop' },
                  { id: 'roundtrip', label: 'Round Trip' },
                  { id: 'local', label: 'Local Rental' },
                ].map((t) => {
                  const active = tripType === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.tripTypeBtn,
                        active && { backgroundColor: selectedBrand.primaryColor, borderColor: selectedBrand.primaryColor },
                        !active && { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border },
                      ]}
                      onPress={() => setTripType(t.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.tripTypeText, active && { color: '#FFFFFF', fontWeight: '800' }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Route & Cities */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                  <Text style={styles.stepNumText}>2</Text>
                </View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Journey Route & Schedule</Text>
              </View>

              {/* Pickup City */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Pickup City / Location *</Text>
                <TouchableOpacity
                  style={[styles.citySelectInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}
                  onPress={() => setCitySearchModal({ visible: true, target: 'pickup', query: '' })}
                  activeOpacity={0.8}
                >
                  <MapPin size={16} color="#10B981" />
                  <Text style={[styles.citySelectText, { color: pickupCity ? themeColors.text : '#64748B' }]}>
                    {pickupCity || 'Search or select pickup city'}
                  </Text>
                  <Search size={15} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Intermediate Stops */}
              {stops.map((stop, idx) => (
                <View key={idx} style={styles.formGroup}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Stop #{idx + 1}</Text>
                  <View style={styles.stopInputRow}>
                    <TouchableOpacity
                      style={[styles.citySelectInput, { flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}
                      onPress={() => setCitySearchModal({ visible: true, target: idx, query: '' })}
                      activeOpacity={0.8}
                    >
                      <MapPin size={15} color="#F59E0B" />
                      <Text style={[styles.citySelectText, { color: stop ? themeColors.text : '#64748B' }]}>
                        {stop || `Select stop #${idx + 1}`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRemoveStop(idx)} style={styles.removeStopBtn}>
                      <X size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.addStopBtn} onPress={handleAddStop} activeOpacity={0.7}>
                <Plus size={14} color={selectedBrand.primaryColor} />
                <Text style={[styles.addStopBtnText, { color: selectedBrand.primaryColor }]}>+ Add Via Stop</Text>
              </TouchableOpacity>

              {/* Drop City */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Destination Drop City *</Text>
                <TouchableOpacity
                  style={[styles.citySelectInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}
                  onPress={() => setCitySearchModal({ visible: true, target: 'drop', query: '' })}
                  activeOpacity={0.8}
                >
                  <Navigation size={16} color="#EF4444" />
                  <Text style={[styles.citySelectText, { color: dropCity ? themeColors.text : '#64748B' }]}>
                    {dropCity || 'Search or select drop city'}
                  </Text>
                  <Search size={15} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Date, Time & Estimated Distance */}
              <View style={{ marginBottom: 10 }}>
                <DateTimeField
                  dateLabel="Travel Date *"
                  timeLabel="Pickup Time *"
                  dateValue={travelDate}
                  timeValue={travelTime}
                  onDateChange={setTravelDate}
                  onTimeChange={setTravelTime}
                />
              </View>

              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.label, { color: themeColors.text }]}>Estimated Distance (KM)</Text>
                  <TouchableOpacity
                    onPress={() => recalculateDistance(pickupCity, dropCity, stops)}
                    style={styles.autoCalcBadge}
                  >
                    <RefreshCw size={11} color="#6366F1" />
                    <Text style={styles.autoCalcText}>Auto-Calc</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  keyboardType="number-pad"
                  value={distanceKmInput}
                  onChangeText={setDistanceKmInput}
                />
              </View>
            </View>

            {/* 3. Customer Contact (With WhatsApp Toggle) */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                  <Text style={styles.stepNumText}>3</Text>
                </View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Customer Contact Details</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Customer Full Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="e.g. Anand Kumar"
                  placeholderTextColor="#64748B"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
              </View>

              {/* Primary Mobile with Country Code */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Mobile Number *</Text>
                <View style={styles.phoneInputRow}>
                  <View style={[styles.countryCodeBox, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                    <Text style={[styles.countryCodeText, { color: themeColors.text }]}>🇮🇳 {countryCode}</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#64748B"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                  />
                </View>
              </View>

              {/* WhatsApp Same Checkbox */}
              <TouchableOpacity
                style={styles.whatsAppCheckboxRow}
                onPress={() => setIsWhatsAppSame((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkboxBox, isWhatsAppSame && { backgroundColor: '#10B981', borderColor: '#10B981' }]}>
                  {isWhatsAppSame ? <Check size={12} color="#FFFFFF" /> : null}
                </View>
                <Text style={[styles.whatsAppCheckboxLabel, { color: themeColors.text }]}>
                  WhatsApp number is same as primary mobile number
                </Text>
              </TouchableOpacity>

              {/* Separate WhatsApp number input if different */}
              {!isWhatsAppSame && (
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: themeColors.text }]}>WhatsApp Number</Text>
                  <View style={styles.phoneInputRow}>
                    <View style={[styles.countryCodeBox, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                      <Text style={[styles.countryCodeText, { color: themeColors.text }]}>🇮🇳 {countryCode}</Text>
                    </View>
                    <TextInput
                      style={[styles.phoneInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="WhatsApp mobile number"
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                      maxLength={10}
                      value={whatsAppPhone}
                      onChangeText={setWhatsAppPhone}
                    />
                  </View>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Email Address (For PDF Quote)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="customer@email.com"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                />
              </View>

              {/* Quick Tags */}
              <View style={styles.quickTagsWrap}>
                {['Carrier Required', 'AC On Full Trip', 'Family with Kids', 'Urgent Pickup'].map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.quickTagChip,
                      specialNotes.includes(tag) && styles.quickTagChipActive,
                    ]}
                    onPress={() => handleToggleNoteTag(tag)}
                  >
                    <Text style={[styles.quickTagText, specialNotes.includes(tag) && styles.quickTagTextActive]}>
                      + {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 4. Choose Vehicle Category */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                  <Text style={styles.stepNumText}>4</Text>
                </View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Choose Vehicle Category</Text>
              </View>

              <View style={{ gap: 10 }}>
                {vehicleList.map((v) => {
                  const isSel = selectedVehicle.id === v.id;
                  const rate = isRound ? v.ratePerKmRoundtrip : v.ratePerKmOneway;
                  const bata = isRound ? v.driverBataRoundtrip : v.driverBataOneway;

                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.vehicleCard,
                        { borderColor: isSel ? '#10B981' : themeColors.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' },
                        isSel && { borderWidth: 2, backgroundColor: isDark ? '#064E3B20' : '#ECFDF5' },
                      ]}
                      onPress={() => setSelectedVehicle(v)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.vehicleCardTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View style={[styles.vehicleIconBox, { backgroundColor: v.color + '20' }]}>
                            <Car size={20} color={v.color} />
                          </View>
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.vehicleName, { color: themeColors.text }]}>{v.name}</Text>
                              {v.tag ? (
                                <View style={[styles.tagBadge, { backgroundColor: v.tagColor || '#6366F1' }]}>
                                  <Text style={styles.tagBadgeText}>{v.tag}</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.vehicleModel}>{v.model}</Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.vehicleRateText, { color: '#0EA5E9' }]}>
                            ₹{rate}<Text style={{ fontSize: 11, color: '#64748B' }}>/km</Text>
                          </Text>
                          <Text style={styles.vehicleBataText}>Bata: ₹{bata}/day</Text>
                        </View>
                      </View>

                      {/* Seating & Features */}
                      <View style={styles.vehicleCardBottom}>
                        <Text style={styles.featureText}>👥 {v.id === 'suv' ? `${suvSeats} Seats` : v.seats}</Text>
                        <Text style={styles.featureText}>🧳 {v.luggage}</Text>
                        <Text style={styles.featureText}>⚡ {v.acType}</Text>
                      </View>

                      {/* SUV Specific Seating Switcher */}
                      {v.id === 'suv' && isSel && (
                        <View style={styles.suvSeatingRow}>
                          <Text style={styles.suvSeatingLabel}>Select Seating Capacity:</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {(['6+1', '7+1'] as const).map((seatOpt) => (
                              <TouchableOpacity
                                key={seatOpt}
                                style={[
                                  styles.seatOptChip,
                                  suvSeats === seatOpt && styles.seatOptChipActive,
                                ]}
                                onPress={() => setSuvSeats(seatOpt)}
                              >
                                <Text
                                  style={[
                                    styles.seatOptText,
                                    suvSeats === seatOpt && styles.seatOptTextActive,
                                  ]}
                                >
                                  {seatOpt} Seats
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 5. Action Button */}
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={handleGenerateEstimate}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#4F46E5', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.generateBtnGradient}
              >
                <Sparkles size={18} color="#FFFFFF" />
                <Text style={styles.generateBtnText}>Calculate & Generate Quotation</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          /* ══════════════════════════════════════════════
             STEP 2: ESTIMATE RESULT & SHARE SCREEN
             ══════════════════════════════════════════════ */
          <View style={{ gap: 14 }}>
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: '#10B981', borderWidth: 1.5 }]}>
              <View style={styles.resultHeader}>
                <View style={styles.resultSuccessIcon}>
                  <CheckCircle2 size={32} color="#10B981" />
                </View>
                <Text style={[styles.resultTitle, { color: themeColors.text }]}>Quotation Generated!</Text>
                <Text style={styles.resultRefText}>Reference ID: #{generatedRefId}</Text>
              </View>

              {/* Breakdown */}
              {calculationBreakdown && (
                <View style={styles.breakdownTable}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Route:</Text>
                    <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                      {pickupCity} ➔ {dropCity}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Trip Category:</Text>
                    <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                      {tripType === 'roundtrip' ? 'Round Trip' : 'One Way Drop'}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Selected Vehicle:</Text>
                    <Text style={[styles.breakdownVal, { color: '#0EA5E9' }]}>
                      {selectedVehicle.id === 'suv' ? `SUV (${suvSeats})` : selectedVehicle.name} (₹{calculationBreakdown.ratePerKm}/km)
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Billable Distance:</Text>
                    <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                      {calculationBreakdown.billableKm} KM
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Base Ride Fare:</Text>
                    <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                      ₹{calculationBreakdown.baseFare.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Driver Bata:</Text>
                    <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                      ₹{calculationBreakdown.driverBata.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {calculationBreakdown.tollEstimate > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Standard Toll Allowance:</Text>
                      <Text style={[styles.breakdownVal, { color: themeColors.text }]}>
                        ₹{calculationBreakdown.tollEstimate.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.breakdownTotalRow}>
                    <Text style={styles.totalFareLabel}>Total Estimated Fare:</Text>
                    <Text style={styles.totalFareVal}>
                      ₹{calculationBreakdown.totalFare.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              )}

              {/* Direct Actions */}
              <View style={{ gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={styles.whatsAppShareBtn}
                  onPress={handleShareWhatsApp}
                  activeOpacity={0.85}
                >
                  <MessageCircle size={18} color="#FFFFFF" />
                  <Text style={styles.whatsAppShareBtnText}>Share via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.copyTextBtn}
                  onPress={() => copyToClipboard(getWhatsAppMessage(), true)}
                  activeOpacity={0.8}
                >
                  <Copy size={16} color="#6366F1" />
                  <Text style={styles.copyTextBtnText}>
                    {copiedRef ? 'Copied to Clipboard!' : 'Copy Full Quotation Text'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setCurrentStep('form')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.editBtnText, { color: themeColors.textSecondary }]}>
                    ← Edit Quotation Details
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── City Search Modal ── */}
      <Modal
        visible={citySearchModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setCitySearchModal((s) => ({ ...s, visible: false }))}
      >
        <View style={styles.cityModalOverlay}>
          <View style={[styles.cityModalCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
            <View style={styles.cityModalHeader}>
              <Text style={[styles.cityModalTitle, { color: themeColors.text }]}>
                Select {citySearchModal.target === 'pickup' ? 'Pickup City' : 'Destination City'}
              </Text>
              <TouchableOpacity
                onPress={() => setCitySearchModal((s) => ({ ...s, visible: false }))}
                style={styles.cityModalCloseBtn}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={[styles.citySearchInputWrap, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={[styles.citySearchTextInput, { color: themeColors.text }]}
                placeholder="Type city name (e.g. Chennai, Bangalore)..."
                placeholderTextColor="#64748B"
                value={citySearchModal.query}
                onChangeText={(q) => setCitySearchModal((s) => ({ ...s, query: q }))}
                autoFocus
              />
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {filteredCities.map((cityName) => (
                <TouchableOpacity
                  key={cityName}
                  style={[styles.cityOptionRow, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                  onPress={() => handleSelectCity(cityName)}
                >
                  <MapPin size={15} color="#6366F1" />
                  <Text style={[styles.cityOptionText, { color: themeColors.text }]}>{cityName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Brand Picker Modal ── */}
      <Modal
        visible={showBrandPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBrandPickerModal(false)}
      >
        <View style={styles.cityModalOverlay}>
          <View style={[styles.cityModalCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
            <View style={styles.cityModalHeader}>
              <Text style={[styles.cityModalTitle, { color: themeColors.text }]}>Select Brand Template</Text>
              <TouchableOpacity
                onPress={() => setShowBrandPickerModal(false)}
                style={styles.cityModalCloseBtn}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {BRAND_CONFIGS.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.brandPickerOption,
                    { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' },
                    selectedBrand.id === b.id && { backgroundColor: b.primaryColor + '15' },
                  ]}
                  onPress={() => {
                    setSelectedBrand(b);
                    setShowBrandPickerModal(false);
                  }}
                >
                  <View style={[styles.brandIconCircle, { backgroundColor: b.primaryColor }]}>
                    <Building2 size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.brandOptionName, { color: themeColors.text }]}>{b.name}</Text>
                    <Text style={styles.brandOptionTagline}>{b.domain} • {b.tagline}</Text>
                  </View>
                  {selectedBrand.id === b.id && <Check size={16} color={b.primaryColor} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerBannerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  brandSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  brandSelectorPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stepNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  tripTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tripTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  formGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  citySelectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  citySelectText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  stopInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeStopBtn: {
    padding: 8,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: 8,
  },
  addStopBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  autoCalcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#6366F120',
  },
  autoCalcText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366F1',
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeBox: {
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
  },
  whatsAppCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsAppCheckboxLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  quickTagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickTagChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#818CF8',
  },
  quickTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  quickTagTextActive: {
    color: '#FFFFFF',
  },
  vehicleCard: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  vehicleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  vehicleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  tagBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  vehicleModel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  vehicleRateText: {
    fontSize: 15,
    fontWeight: '900',
  },
  vehicleBataText: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '700',
  },
  vehicleCardBottom: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#33415530',
    paddingTop: 6,
    marginTop: 4,
  },
  featureText: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  suvSeatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#10B98140',
  },
  suvSeatingLabel: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  seatOptChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  seatOptChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  seatOptText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  seatOptTextActive: {
    color: '#FFFFFF',
  },
  generateBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },
  generateBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  resultSuccessIcon: {
    marginBottom: 6,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  resultRefText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 2,
  },
  breakdownTable: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#33415540',
    paddingTop: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  breakdownVal: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  breakdownTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    marginTop: 6,
  },
  totalFareLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  totalFareVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#10B981',
  },
  whatsAppShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
  },
  whatsAppShareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  copyTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  copyTextBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
  },
  editBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cityModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cityModalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cityModalCloseBtn: {
    padding: 4,
  },
  citySearchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  citySearchTextInput: {
    flex: 1,
    fontSize: 13,
  },
  cityOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cityOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  brandPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
  },
  brandIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandOptionName: {
    fontSize: 13,
    fontWeight: '800',
  },
  brandOptionTagline: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
});
