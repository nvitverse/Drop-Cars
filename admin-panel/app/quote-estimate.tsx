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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  QrCode,
  Receipt,
  Plus,
  Building2,
  Layers,
  ChevronDown,
  Navigation,
  SlidersHorizontal,
  Users,
  Briefcase,
  Zap,
  Info,
  CheckCircle,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LocationPickerModal from '@/components/LocationPickerModal';
import DateTimeField from '@/components/DateTimeField';
import { colors, shadows } from '@/constants/theme';
import { enquiriesApi, WEBSITE_BRANDS } from '@/services/enquiriesApi';
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
    id: 'arunachala',
    name: 'Arunachala Travels',
    domain: 'arunachalatravels.in',
    phone: '9043990439',
    primaryColor: '#8B5CF6',
    tagline: 'Tempo Traveller & Force Urbania Specialist',
    badge: 'BUS & TT',
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
    id: 'yellowboard',
    name: 'Yellow Board',
    domain: 'yellowboard.in',
    phone: '9043990439',
    primaryColor: '#EAB308',
    tagline: 'Commercial Fleet Cabs',
    badge: 'COMMERCIAL',
  },
  {
    id: 'mukiltravels',
    name: 'Mukil Travels',
    domain: 'mukiltravels.in',
    phone: '9043990439',
    primaryColor: '#EC4899',
    tagline: 'Tour & Travel Packages',
    badge: 'TOUR PACKAGES',
  },
];

export interface VehicleOption {
  id: string;
  name: string;
  model: string;
  seats: string;
  luggage: string;
  ratePerKm: number;
  minKmOneway: number;
  minKmRoundtrip: number;
  driverBata: number;
  tag?: string;
  tagColor?: string;
  color: string;
  acType: string;
}

// Fleet for Drop Cars & Standard Taxi Brands
export const STANDARD_VEHICLES: VehicleOption[] = [
  {
    id: 'sedan',
    name: 'Sedan',
    model: 'Swift Dzire, Toyota Etios, Aura',
    seats: '4 + 1 Seats',
    luggage: '2 Large Bags',
    ratePerKm: 14,
    minKmOneway: 130,
    minKmRoundtrip: 250,
    driverBata: 400,
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
    ratePerKm: 12,
    minKmOneway: 130,
    minKmRoundtrip: 250,
    driverBata: 400,
    tag: 'BUDGET',
    tagColor: '#10B981',
    color: '#10B981',
    acType: 'AC Economy',
  },
  {
    id: 'suv',
    name: 'SUV (6+1)',
    model: 'Maruti Ertiga, Triber, Marazzo',
    seats: '6 + 1 Seats',
    luggage: '3 Large Bags',
    ratePerKm: 18,
    minKmOneway: 150,
    minKmRoundtrip: 300,
    driverBata: 500,
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
    ratePerKm: 20,
    minKmOneway: 180,
    minKmRoundtrip: 300,
    driverBata: 500,
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
    ratePerKm: 24,
    minKmOneway: 200,
    minKmRoundtrip: 300,
    driverBata: 600,
    tag: 'LUXURY',
    tagColor: '#EC4899',
    color: '#EC4899',
    acType: 'Automatic Climate Control',
  },
];

// Fleet for Arunachala Travels (Tempo Traveller & Force Urbania specialist)
export const ARUNACHALA_VEHICLES: VehicleOption[] = [
  {
    id: 'tt_12',
    name: 'Tempo Traveller 12 Seater (TT 12)',
    model: 'Force Tempo Traveller AC (12+1)',
    seats: '12 + 1 Seats',
    luggage: '8 Large Bags',
    ratePerKm: 22,
    minKmOneway: 250,
    minKmRoundtrip: 250,
    driverBata: 600,
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
    ratePerKm: 26,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBata: 700,
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
    ratePerKm: 30,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBata: 800,
    tag: 'LUXURY',
    tagColor: '#EC4899',
    color: '#EC4899',
    acType: 'Individual AC Vents + Ambient Lights',
  },
  {
    id: 'urbania_16',
    name: 'Force Urbania (16 str)',
    model: 'Next-Gen Luxury Urbania (16+1)',
    seats: '16 + 1 Luxury Recliners',
    luggage: '10 Bags',
    ratePerKm: 34,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBata: 800,
    tag: 'PREMIUM',
    tagColor: '#D946EF',
    color: '#D946EF',
    acType: 'Luxury Air Suspension + AC',
  },
  {
    id: 'urbania_18',
    name: 'Force Urbania (18 str)',
    model: 'Next-Gen VIP Urbania (18+1)',
    seats: '18 + 1 Luxury Recliners',
    luggage: '12 Bags',
    ratePerKm: 38,
    minKmOneway: 300,
    minKmRoundtrip: 300,
    driverBata: 900,
    tag: 'VIP LUXURY',
    tagColor: '#A855F7',
    color: '#A855F7',
    acType: 'VIP First-Class Cabin AC',
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
];

const QUICK_INSTRUCTION_TAGS = [
  'Carrier Required',
  'AC On Full Trip',
  'Family with Kids',
  'Urgent Pickup',
  'Non-Smoking Driver',
  'Luggage Space Extra',
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
  const { isDark, themeColors } = useTheme();

  // Step 1 = Form, Step 2 = Estimate Result
  const [currentStep, setCurrentStep] = useState<'form' | 'result'>('form');

  // Brand Selector
  const [selectedBrand, setSelectedBrand] = useState<BrandInfo>(BRAND_CONFIGS[0]);
  const [showBrandPickerModal, setShowBrandPickerModal] = useState(false);

  const isArunachala = selectedBrand.id === 'arunachala' || selectedBrand.domain.includes('arunachala');

  // Trip Types
  // Arunachala: Drop Trip (with stops), Round Trip, Local Rental
  // Others: One Way, Round Trip, Local / Hourly, Multi City
  const [tripType, setTripType] = useState<string>('oneway');

  // Vehicles list based on brand
  const vehicleList = isArunachala ? ARUNACHALA_VEHICLES : STANDARD_VEHICLES;
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption>(STANDARD_VEHICLES[0]);

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

  // Date & Time
  const [travelDate, setTravelDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [travelTime, setTravelTime] = useState('09:00');
  const [distanceKmInput, setDistanceKmInput] = useState('460');

  // Customer Contact
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Add to Leads Checkbox (checked by default as requested)
  const [addToLeads, setAddToLeads] = useState(true);

  // Rate Overrides (Optional customization on active vehicle)
  const [showRateOverride, setShowRateOverride] = useState(false);
  const [customRatePerKm, setCustomRatePerKm] = useState('');
  const [customDriverBata, setCustomDriverBata] = useState('');

  // Location Picker Modal
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<'pickup' | 'drop' | number>('pickup');

  // Generated Estimate State
  const [generatedRefId, setGeneratedRefId] = useState('');
  const [syncingToWebsite, setSyncingToWebsite] = useState(false);
  const [syncedEnquiryId, setSyncedEnquiryId] = useState<number | null>(null);
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

  const handleSelectPickup = (city: string) => {
    setPickupCity(city);
    recalculateDistance(city, dropCity, stops);
  };

  const handleSelectDrop = (city: string) => {
    setDropCity(city);
    recalculateDistance(pickupCity, city, stops);
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

  const handleUpdateStop = (idx: number, text: string) => {
    const updated = [...stops];
    updated[idx] = text;
    setStops(updated);
  };

  const handleToggleNoteTag = (tag: string) => {
    if (specialNotes.includes(tag)) {
      setSpecialNotes(specialNotes.replace(tag, '').replace(/,\s*,/g, ',').trim());
    } else {
      setSpecialNotes(specialNotes ? `${specialNotes}, ${tag}` : tag);
    }
  };

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
    const isRound = tripType === 'roundtrip';
    const effectiveKm = isRound ? dist * 2 : dist;
    const minKm = isRound ? selectedVehicle.minKmRoundtrip : selectedVehicle.minKmOneway;
    const billableKm = Math.max(effectiveKm, minKm);

    const effectiveRate = parseFloat(customRatePerKm) || selectedVehicle.ratePerKm;
    const effectiveBata = parseFloat(customDriverBata) || selectedVehicle.driverBata;

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

        const res = await enquiriesApi.createLead({
          name: effectiveCustomerName,
          phone: cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '9000000000',
          pickup: pickupCity.trim(),
          drop_location: dropCity.trim(),
          trip_type: tripLabel,
          vehicle_type: selectedVehicle.name,
          travel_date: travelDate,
          travel_time: travelTime,
          fare_estimate: totalFare,
          advance_requested: advanceAmount,
          notes: `[Ref: ${refId}] ${stopsNote ? stopsNote + ' | ' : ''}${specialNotes ? specialNotes + ' | ' : ''}Quoted via ${selectedBrand.name}`,
          website: selectedBrand.name,
        });
        if (res && res.id) {
          setSyncedEnquiryId(res.id);
        }
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

    return `🚗 *${brandName} - TRIP ESTIMATION & QUOTE*
Reference ID: *${generatedRefId}*
Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}

Hello *${customerName || 'Valued Customer'}*, greetings from *${selectedBrand.name}*!
Here is your requested trip quotation:

📍 *Journey Route & Plan:*
• Route: ${pickupCity} ➔ ${dropCity}${stopsText}
• Trip Type: ${tripLabel}
• Vehicle: ${selectedVehicle.name} (${selectedVehicle.model})
• Travel Date: ${travelDate} at ${travelTime}
• Estimated Distance: ~${calculationBreakdown.distanceKm} KM (Billable: ${calculationBreakdown.billableKm} KM)

💰 *Fare Breakdown:*
• Base Ride Fare (${calculationBreakdown.billableKm} km × ₹${calculationBreakdown.ratePerKm}): ₹${calculationBreakdown.baseFare.toLocaleString('en-IN')}
• Driver Allowance (Bata): ₹${calculationBreakdown.driverBata.toLocaleString('en-IN')}
${calculationBreakdown.tollEstimate > 0 ? `• Standard Toll Allowance: ₹${calculationBreakdown.tollEstimate.toLocaleString('en-IN')}\n` : ''}----------------------------------------
*TOTAL ESTIMATED FARE: ₹${calculationBreakdown.totalFare.toLocaleString('en-IN')}*
• 20% Booking Advance: ₹${calculationBreakdown.advanceAmount.toLocaleString('en-IN')}
• Balance Payable on Trip: ₹${calculationBreakdown.balancePayable.toLocaleString('en-IN')}
----------------------------------------

✅ *Inclusions:* Vehicle Fuel, Driver Allowance, Standard Tolls.
ℹ️ *Terms:* AC operates continuously. Clean vehicle guaranteed.

🔗 *Direct Confirmation & Advance Payment Link:*
${confirmationUrl}
*(Click the link above to view quotation & confirm online)*

📞 24x7 Support: ${selectedBrand.phone} | ${selectedBrand.name}
Thank you for choosing ${selectedBrand.name}!`;
  };

  const handleShareWhatsApp = async () => {
    const text = getWhatsAppMessage();
    const cleanDigits = customerPhone.replace(/\D/g, '').slice(-10);
    const targetPhone = cleanDigits ? `91${cleanDigits}` : '';
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

  const handleShareEmailSmtp = async () => {
    if (!customerEmail.trim()) {
      Alert.alert('Email Required', 'Please enter customer email address to send the quote.');
      return;
    }
    setSendingEmail(true);
    try {
      const subject = `${selectedBrand.name} Fare Estimation Ref #${generatedRefId} - ${pickupCity} to ${dropCity}`;
      const body = getWhatsAppMessage();
      const mailtoUrl = `mailto:${customerEmail.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen || Platform.OS === 'web') {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert('Email Client', 'Default mail client opened with pre-filled quote.');
      }
      setShowSharePdfModal(false);
    } catch {
      Alert.alert('Notice', 'Unable to launch default email app.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleOpenPrintablePdf = () => {
    if (!calculationBreakdown) return;
    const invData: InvoiceData = {
      invoiceNumber: generatedRefId,
      brandName: selectedBrand.name,
      brandPhone: selectedBrand.phone,
      customerName,
      customerPhone,
      customerEmail,
      pickup: pickupCity,
      dropLocation: dropCity,
      travelDate,
      vehicleType: selectedVehicle.name,
      tripType:
        tripType === 'droptrip'
          ? 'Drop Trip'
          : tripType === 'roundtrip'
          ? 'Round Trip'
          : tripType === 'local'
          ? 'Local Rental'
          : 'One Way',
      distanceKm: calculationBreakdown.distanceKm,
      baseFare: calculationBreakdown.baseFare,
      tollCharges: calculationBreakdown.tollEstimate,
      extraCharges: calculationBreakdown.driverBata,
      advancePaid: calculationBreakdown.advanceAmount,
    };
    const html = generateEstimationHtml(invData);

    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } else {
      Linking.openURL(confirmationUrl);
    }
    setShowSharePdfModal(false);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* ── Screen Header ── */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity
            onPress={() => {
              if (currentStep === 'result') {
                setCurrentStep('form');
              } else {
                router.back();
              }
            }}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              {currentStep === 'form' ? 'Trip Quotation & Estimate' : 'Quotation Generated'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
              {currentStep === 'form' ? `Branded for ${selectedBrand.name}` : `Ref: ${generatedRefId} · Ready to Share`}
            </Text>
          </View>
        </View>

        <ThemeToggle size={20} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
      >
        {currentStep === 'form' ? (
          /* ══════════════════════════════════════════════
             STEP 1: BOOKING & ESTIMATION INPUT FORM
             ══════════════════════════════════════════════ */
          <View style={{ gap: 14 }}>
            {/* 0. Brand Selection Header Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: selectedBrand.primaryColor,
                  borderWidth: 1.5,
                  padding: 14,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: selectedBrand.primaryColor + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Building2 size={22} color={selectedBrand.primaryColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 15.5, fontWeight: '900', color: themeColors.text }}>
                        {selectedBrand.name}
                      </Text>
                      <View style={[styles.brandTagPill, { backgroundColor: selectedBrand.primaryColor }]}>
                        <Text style={styles.brandTagPillText}>{selectedBrand.domain}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                      {selectedBrand.tagline}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setShowBrandPickerModal(true)}
                  style={[styles.switchBrandBtn, { borderColor: selectedBrand.primaryColor, backgroundColor: selectedBrand.primaryColor + '10' }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: selectedBrand.primaryColor }}>
                    Change Brand
                  </Text>
                  <ChevronDown size={14} color={selectedBrand.primaryColor} />
                </TouchableOpacity>
              </View>

              {/* Quick Brand Switcher Horizontal Scroll */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: themeColors.border }}
              >
                {BRAND_CONFIGS.map((b) => {
                  const isCur = selectedBrand.id === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => setSelectedBrand(b)}
                      style={[
                        styles.quickBrandChip,
                        {
                          backgroundColor: isCur ? b.primaryColor : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: isCur ? b.primaryColor : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isCur ? '#FFFFFF' : themeColors.text }}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 1. Trip Type Selector (Brand-Adaptive) */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                    <Text style={styles.stepNumText}>1</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Select Trip Type
                  </Text>
                </View>
                {isArunachala && (
                  <View style={[styles.tagPill, { backgroundColor: '#8B5CF6' }]}>
                    <Text style={styles.tagPillText}>Tour / Bus / Van Rates</Text>
                  </View>
                )}
              </View>

              <View style={styles.tripTypeRow}>
                {isArunachala
                  ? (
                      [
                        { id: 'droptrip', label: 'Drop Trip (With Stops)' },
                        { id: 'roundtrip', label: 'Round Trip' },
                        { id: 'local', label: 'Local Rental' },
                      ] as const
                    ).map((t) => {
                      const active = tripType === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => setTripType(t.id)}
                          style={[
                            styles.tripTypeChip,
                            {
                              backgroundColor: active ? selectedBrand.primaryColor : isDark ? '#1E293B' : '#F1F5F9',
                              borderColor: active ? selectedBrand.primaryColor : themeColors.border,
                              flex: t.id === 'droptrip' ? 1.4 : 1,
                            },
                          ]}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.tripTypeChipText,
                              { color: active ? '#FFFFFF' : themeColors.text },
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  : (
                      [
                        { id: 'oneway', label: 'One Way' },
                        { id: 'roundtrip', label: 'Round Trip' },
                        { id: 'local', label: 'Local / Hourly' },
                        { id: 'multicity', label: 'Multi City' },
                      ] as const
                    ).map((t) => {
                      const active = tripType === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => setTripType(t.id)}
                          style={[
                            styles.tripTypeChip,
                            {
                              backgroundColor: active ? selectedBrand.primaryColor : isDark ? '#1E293B' : '#F1F5F9',
                              borderColor: active ? selectedBrand.primaryColor : themeColors.border,
                            },
                          ]}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.tripTypeChipText,
                              { color: active ? '#FFFFFF' : themeColors.text },
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
              </View>
            </View>

            {/* 2. Journey Route & Stops */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                    <Text style={styles.stepNumText}>2</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Journey Route & Schedule
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleAddStop}
                  style={[styles.addStopHeaderBtn, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
                  activeOpacity={0.7}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.primary }}>
                    Add Stop
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pickup City */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Pickup City / Area *</Text>
                <View style={[styles.inputWithAction, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    placeholder="e.g. Chennai Central"
                    placeholderTextColor="#94A3B8"
                    value={pickupCity}
                    onChangeText={handleSelectPickup}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setLocationPickerTarget('pickup');
                      setShowLocationPicker(true);
                    }}
                    style={[styles.pickLocationBtn, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Intermediate Stops (Drop trip or multi-stops) */}
              {stops.map((st, idx) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[styles.inputLabel, { color: '#8B5CF6', marginBottom: 0 }]}>
                      Via Stop #{idx + 1}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveStop(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.inputWithAction, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: '#8B5CF6' }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6', marginRight: 8 }} />
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text }]}
                      placeholder={`e.g. Intermediate Stop (e.g. Vellore)`}
                      placeholderTextColor="#94A3B8"
                      value={st}
                      onChangeText={(t) => handleUpdateStop(idx, t)}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setLocationPickerTarget(idx);
                        setShowLocationPicker(true);
                      }}
                      style={[styles.pickLocationBtn, { backgroundColor: isDark ? '#3B0764' : '#F3E8FF' }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#8B5CF6' }}>Search</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Drop City */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Destination / Drop City *</Text>
                <View style={[styles.inputWithAction, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    placeholder="e.g. Madurai Mattuthavani"
                    placeholderTextColor="#94A3B8"
                    value={dropCity}
                    onChangeText={handleSelectDrop}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setLocationPickerTarget('drop');
                      setShowLocationPicker(true);
                    }}
                    style={[styles.pickLocationBtn, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Hubs */}
              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary, marginBottom: 6 }}>
                  Quick Regional Hubs:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {POPULAR_CITIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => {
                        if (!pickupCity) handleSelectPickup(c);
                        else handleSelectDrop(c);
                      }}
                      style={[styles.hubChip, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF', borderColor: isDark ? '#334155' : '#C7D2FE' }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Date & Time Picker Row */}
              <View style={{ marginTop: 14 }}>
                <DateTimeField
                  dateLabel="Travel Date *"
                  timeLabel="Pickup Time *"
                  dateValue={travelDate}
                  timeValue={travelTime}
                  onDateChange={setTravelDate}
                  onTimeChange={setTravelTime}
                  minimumDate={new Date()}
                />
              </View>

              {/* Estimated Distance Input */}
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                  Estimated Distance (KM)
                </Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Navigation size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text, fontWeight: '800' }]}
                    keyboardType="numeric"
                    placeholder="e.g. 460"
                    placeholderTextColor="#94A3B8"
                    value={distanceKmInput}
                    onChangeText={setDistanceKmInput}
                  />
                  <TouchableOpacity
                    onPress={() => recalculateDistance(pickupCity, dropCity, stops)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: isDark ? '#312E81' : '#EEF2FF' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                      Auto-Calc (~{getCityEstimatedDistance(pickupCity, dropCity)} km)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 3. Customer Contact Details */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                    <Text style={styles.stepNumText}>3</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Customer Details
                  </Text>
                </View>
                <View style={[styles.tagPill, { backgroundColor: isDark ? '#1E293B' : '#E0F2FE' }]}>
                  <Text style={[styles.tagPillText, { color: colors.primary }]}>Lead & WhatsApp</Text>
                </View>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Customer Name</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <User size={16} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    placeholder="e.g. Anand Raj (or leave blank for Guest)"
                    placeholderTextColor="#94A3B8"
                    value={customerName}
                    onChangeText={setCustomerName}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>WhatsApp / Mobile Number</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Phone size={16} color="#10B981" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    keyboardType="phone-pad"
                    placeholder="e.g. 9876543210"
                    placeholderTextColor="#94A3B8"
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email Address (For PDF/Email)</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Mail size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="e.g. customer@gmail.com"
                    placeholderTextColor="#94A3B8"
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                  />
                </View>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Special Instructions / Notes</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <FileText size={16} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text }]}
                    placeholder="e.g. Carrier required, AC continuous, etc."
                    placeholderTextColor="#94A3B8"
                    value={specialNotes}
                    onChangeText={setSpecialNotes}
                  />
                </View>

                {/* Quick Instruction Tags */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                  {QUICK_INSTRUCTION_TAGS.map((t) => {
                    const active = specialNotes.includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => handleToggleNoteTag(t)}
                        style={[
                          styles.instructionChip,
                          {
                            backgroundColor: active ? selectedBrand.primaryColor + '20' : isDark ? '#1E293B' : '#F1F5F9',
                            borderColor: active ? selectedBrand.primaryColor : themeColors.border,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: active ? selectedBrand.primaryColor : themeColors.textSecondary }}>
                          {active ? `✓ ${t}` : `+ ${t}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* 4. Luxury Vehicle Category Selection (Brand-Adaptive) */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.stepNumBadge, { backgroundColor: selectedBrand.primaryColor }]}>
                    <Text style={styles.stepNumText}>4</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                    Choose Vehicle Category
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: selectedBrand.primaryColor }}>
                  {selectedBrand.name} Fleet ({vehicleList.length})
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {vehicleList.map((v) => {
                  const isSelected = selectedVehicle.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => {
                        setSelectedVehicle(v);
                        setCustomRatePerKm('');
                        setCustomDriverBata('');
                      }}
                      style={[
                        styles.luxuryVehicleCard,
                        {
                          backgroundColor: isSelected ? (isDark ? '#064E3B20' : '#ECFDF5') : isDark ? '#0F172A' : '#FFFFFF',
                          borderColor: isSelected ? '#10B981' : themeColors.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                      activeOpacity={0.85}
                    >
                      {/* Top Header of vehicle card */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View style={[styles.vehicleIconCircle, { backgroundColor: v.color + '20' }]}>
                            <Car size={22} color={v.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={[styles.vehicleName, { color: themeColors.text }]}>{v.name}</Text>
                              {v.tag && (
                                <View style={[styles.tagPill, { backgroundColor: v.tagColor || v.color }]}>
                                  <Text style={styles.tagPillText}>{v.tag}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.vehicleModel, { color: themeColors.textSecondary }]}>
                              {v.model}
                            </Text>
                          </View>
                        </View>

                        {/* Rate & Bata on Right */}
                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: selectedBrand.primaryColor }}>
                              ₹{v.ratePerKm}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>
                              /km
                            </Text>
                          </View>
                          <View style={[styles.bataTag, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}>
                            <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#D97706' }}>
                              Bata: ₹{v.driverBata}/day
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Specs Row */}
                      <View style={[styles.vehicleSpecsRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <View style={styles.specItem}>
                          <Users size={12} color={themeColors.textSecondary} />
                          <Text style={[styles.specText, { color: themeColors.textSecondary }]}>
                            {v.seats}
                          </Text>
                        </View>
                        <View style={styles.specItem}>
                          <Briefcase size={12} color={themeColors.textSecondary} />
                          <Text style={[styles.specText, { color: themeColors.textSecondary }]}>
                            {v.luggage}
                          </Text>
                        </View>
                        <View style={styles.specItem}>
                          <Zap size={12} color="#10B981" />
                          <Text style={[styles.specText, { color: '#10B981', fontWeight: '700' }]}>
                            {v.acType}
                          </Text>
                        </View>

                        {isSelected && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                            <CheckCircle2 size={16} color="#10B981" />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>Selected</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Optional Rate Override Toggle */}
              <TouchableOpacity
                onPress={() => setShowRateOverride(!showRateOverride)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SlidersHorizontal size={14} color={selectedBrand.primaryColor} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedBrand.primaryColor }}>
                    {showRateOverride ? 'Hide Custom Rate & Bata Overrides' : 'Customize Rate / Bata for this quote (Optional)'}
                  </Text>
                </View>
                <ChevronDown size={14} color={selectedBrand.primaryColor} />
              </TouchableOpacity>

              {showRateOverride && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: themeColors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Custom Rate/KM (₹)</Text>
                    <TextInput
                      style={[styles.inputWrap, { color: themeColors.text, fontSize: 13, fontWeight: '700', backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                      keyboardType="numeric"
                      placeholder={`Default: ₹${selectedVehicle.ratePerKm}`}
                      placeholderTextColor="#94A3B8"
                      value={customRatePerKm}
                      onChangeText={setCustomRatePerKm}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Custom Driver Bata (₹)</Text>
                    <TextInput
                      style={[styles.inputWrap, { color: themeColors.text, fontSize: 13, fontWeight: '700', backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                      keyboardType="numeric"
                      placeholder={`Default: ₹${selectedVehicle.driverBata}`}
                      placeholderTextColor="#94A3B8"
                      value={customDriverBata}
                      onChangeText={setCustomDriverBata}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* ══════════════════════════════════════════════
               "ADD TO LEADS" CHECKBOX (Directly above Calculate button)
               ══════════════════════════════════════════════ */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAddToLeads(!addToLeads)}
              style={[
                styles.addToLeadsBox,
                {
                  backgroundColor: addToLeads ? (isDark ? '#064E3B20' : '#ECFDF5') : isDark ? '#1E293B' : '#F8FAFC',
                  borderColor: addToLeads ? '#10B981' : themeColors.border,
                  borderWidth: addToLeads ? 1.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.checkboxSquare,
                  {
                    backgroundColor: addToLeads ? '#10B981' : 'transparent',
                    borderColor: addToLeads ? '#10B981' : themeColors.border,
                  },
                ]}
              >
                {addToLeads && <Check size={14} color="#FFFFFF" strokeWidth={3.5} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.addToLeadsTitle, { color: themeColors.text }]}>
                    Add to leads (Website CRM)
                  </Text>
                  <View style={[styles.tagPill, { backgroundColor: addToLeads ? '#10B981' : '#94A3B8' }]}>
                    <Text style={styles.tagPillText}>{addToLeads ? 'AUTO-SYNC' : 'LOCAL ONLY'}</Text>
                  </View>
                </View>
                <Text style={[styles.addToLeadsSub, { color: themeColors.textSecondary }]}>
                  Automatically record this quotation as an active lead in Website CRM for sales follow-up
                </Text>
              </View>
            </TouchableOpacity>

            {/* Calculate Button */}
            <TouchableOpacity
              onPress={handleGenerateEstimate}
              style={[styles.primaryActionBtn, { backgroundColor: selectedBrand.primaryColor }]}
              activeOpacity={0.85}
            >
              <Sparkles size={20} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>
                Calculate & Generate Detailed Estimate
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ══════════════════════════════════════════════
             STEP 2: DETAILED ESTIMATION & SHARING HUB
             ══════════════════════════════════════════════ */
          <View style={{ gap: 14 }}>
            {/* Sync & Reference Banner */}
            <View
              style={[
                styles.syncBanner,
                {
                  backgroundColor: addToLeads ? (isDark ? '#064E3B' : '#ECFDF5') : isDark ? '#1E293B' : '#F1F5F9',
                  borderColor: addToLeads ? '#10B981' : themeColors.border,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={20} color={addToLeads ? '#10B981' : selectedBrand.primaryColor} />
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: '800',
                      color: addToLeads ? (isDark ? '#A7F3D0' : '#065F46') : themeColors.text,
                    }}
                  >
                    {addToLeads ? `Quotation Auto-Saved to ${selectedBrand.name} CRM` : 'Quotation Generated (Local Copy)'}
                  </Text>
                </View>
                {syncingToWebsite && <ActivityIndicator size="small" color="#10B981" />}
              </View>

              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, color: isDark ? '#D1FAE5' : '#047857' }}>
                    Enquiry Reference Number:
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: isDark ? '#FFFFFF' : '#064E3B', letterSpacing: 0.5 }}>
                    {generatedRefId}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => copyToClipboard(generatedRefId, true)}
                  style={[styles.copyChip, { backgroundColor: isDark ? '#065F46' : '#D1FAE5' }]}
                >
                  {copiedRef ? <Check size={14} color="#10B981" /> : <Copy size={14} color={isDark ? '#FFFFFF' : '#065F46'} />}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#FFFFFF' : '#065F46' }}>
                    {copiedRef ? 'Copied' : 'Copy Ref'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 10.5, color: isDark ? '#A7F3D0' : '#047857', marginTop: 6, lineHeight: 15 }}>
                💡 Branded for {selectedBrand.name} ({selectedBrand.domain}). Customer can view quotation online using reference.
              </Text>
            </View>

            {/* Trip Details Card */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                  Journey Overview
                </Text>
                <View style={[styles.tagPill, { backgroundColor: selectedBrand.primaryColor }]}>
                  <Text style={styles.tagPillText}>
                    {tripType === 'droptrip'
                      ? 'Drop Trip'
                      : tripType === 'roundtrip'
                      ? 'Round Trip'
                      : tripType === 'local'
                      ? 'Local Rental'
                      : tripType === 'multicity'
                      ? 'Multi City'
                      : 'One Way'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: selectedBrand.primaryColor + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Car size={22} color={selectedBrand.primaryColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>
                    {pickupCity} ➔ {dropCity}
                  </Text>
                  {stops.filter((s) => s.trim()).length > 0 && (
                    <Text style={{ fontSize: 11.5, color: '#8B5CF6', marginTop: 2, fontWeight: '700' }}>
                      Via: {stops.filter((s) => s.trim()).join(' ➔ ')}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 1 }}>
                    {travelDate} at {travelTime} · ~{calculationBreakdown?.distanceKm} KM
                  </Text>
                </View>
              </View>

              <View style={[styles.metaPillsRow, { borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Vehicle</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                    {selectedVehicle.name}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Brand</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedBrand.primaryColor }}>
                    {selectedBrand.name}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Customer</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                    {customerName || 'Valued Guest'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Detailed Pricing Breakdown Card */}
            {calculationBreakdown && (
              <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Itemized Fare Breakdown</Text>

                <View style={{ gap: 8 }}>
                  <View style={styles.fareRow}>
                    <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                      Base Ride Fare ({calculationBreakdown.billableKm} km × ₹{calculationBreakdown.ratePerKm})
                    </Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>
                      ₹{calculationBreakdown.baseFare.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.fareRow}>
                    <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                      Driver Allowance (Bata)
                    </Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>
                      ₹{calculationBreakdown.driverBata.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  {calculationBreakdown.tollEstimate > 0 && (
                    <View style={styles.fareRow}>
                      <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                        Standard Toll Allowance
                      </Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>
                        ₹{calculationBreakdown.tollEstimate.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.fareDivider, { backgroundColor: themeColors.border }]} />

                  <View style={styles.fareRow}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: themeColors.text }}>
                      TOTAL ESTIMATED FARE
                    </Text>
                    <Text style={{ fontSize: 19, fontWeight: '900', color: selectedBrand.primaryColor }}>
                      ₹{calculationBreakdown.totalFare.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.advanceHighlightBox, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: isDark ? '#D97706' : '#FDE68A' }]}>
                    <View style={styles.fareRow}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>
                        20% Online Confirmation Advance:
                      </Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#D97706' }}>
                        ₹{calculationBreakdown.advanceAmount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={[styles.fareRow, { marginTop: 4 }]}>
                      <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>
                        Balance Payable to Driver on Trip:
                      </Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text }}>
                        ₹{calculationBreakdown.balancePayable.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color="#10B981" />
                  <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>
                    Includes Fuel, Driver Allowance & Standard Tolls
                  </Text>
                </View>
              </View>
            )}

            {/* LIVE DYNAMIC UPI ADVANCE QR CODE */}
            {calculationBreakdown && (
              <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: '#10B981', borderWidth: 1.5, gap: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <QrCode size={20} color="#10B981" />
                    <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                      20% Advance UPI QR Code
                    </Text>
                  </View>
                  <View style={[styles.tagPill, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.tagPillText}>₹{calculationBreakdown.advanceAmount}</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  Customer can scan using GPay / PhonePe / Paytm to instantly pay ₹{calculationBreakdown.advanceAmount} advance:
                </Text>

                <View style={{ alignItems: 'center', marginVertical: 6 }}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        `upi://pay?pa=7200217986-1@okbizaxis&pn=${encodeURIComponent(selectedBrand.name)}&am=${calculationBreakdown.advanceAmount}&cu=INR&tn=AdvanceRef_${generatedRefId}`
                      )}`,
                    }}
                    style={{ width: 160, height: 160, borderRadius: 8, backgroundColor: '#FFFFFF' }}
                    resizeMode="contain"
                  />
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: isDark ? '#1E293B' : '#EEF2FF', paddingVertical: 8, borderRadius: 6, alignItems: 'center', borderColor: '#10B981', borderWidth: 1 }}
                  onPress={() => {
                    const upiUri = `upi://pay?pa=7200217986-1@okbizaxis&pn=${encodeURIComponent(selectedBrand.name)}&am=${calculationBreakdown.advanceAmount}&cu=INR&tn=AdvanceRef_${generatedRefId}`;
                    copyToClipboard(upiUri, false);
                    Alert.alert('UPI Link Copied', `Payment Link:\n${upiUri}`);
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                    📋 Copy Direct UPI Payment Link (₹{calculationBreakdown.advanceAmount})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Direct Confirmation Link Card */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Direct 1-Click Confirmation Link</Text>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginBottom: 8 }}>
                Share this link with customer for instant online review & booking confirmation:
              </Text>
              <View style={[styles.linkBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <Text style={{ fontSize: 11, color: selectedBrand.primaryColor, flex: 1 }} numberOfLines={1}>
                  {confirmationUrl}
                </Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(confirmationUrl, false)}
                  style={styles.copyLinkBtn}
                >
                  {copiedLink ? <Check size={14} color="#10B981" /> : <Copy size={14} color={selectedBrand.primaryColor} />}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: selectedBrand.primaryColor }}>
                    {copiedLink ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Main Action Buttons ── */}
            <View style={{ gap: 10, marginTop: 4 }}>
              {/* Green WhatsApp Share Button */}
              <TouchableOpacity
                onPress={handleShareWhatsApp}
                style={[styles.whatsappActionBtn, { backgroundColor: '#25D366' }]}
                activeOpacity={0.85}
              >
                <MessageCircle size={22} color="#FFFFFF" strokeWidth={2.5} />
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={styles.whatsappActionBtnText}>Share on WhatsApp</Text>
                  <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.9)' }}>
                    Sends {selectedBrand.name} quote & confirmation link to {customerPhone || 'Customer'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Share as a PDF Button */}
              <TouchableOpacity
                onPress={() => setShowSharePdfModal(true)}
                style={[styles.secondaryActionBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: themeColors.border }]}
                activeOpacity={0.85}
              >
                <Printer size={18} color={themeColors.text} />
                <Text style={[styles.secondaryActionBtnText, { color: themeColors.text }]}>
                  Share as a PDF / Email
                </Text>
              </TouchableOpacity>

              {/* Issue Official GST Tax Invoice Button */}
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/gst-invoices',
                    params: {
                      tab: 'generate',
                      name: customerName,
                      phone: customerPhone,
                      email: customerEmail,
                      pickup: pickupCity,
                      drop: dropCity,
                      distance: String(calculationBreakdown?.distanceKm || distanceKmInput),
                      rate: String(selectedVehicle.ratePerKm),
                      trip_type:
                        tripType === 'droptrip'
                          ? 'Drop Trip'
                          : tripType === 'roundtrip'
                          ? 'Round Trip'
                          : tripType === 'local'
                          ? 'Local Rental'
                          : 'One Way',
                      vehicle_type: selectedVehicle.name,
                      bata: String(calculationBreakdown?.driverBata || selectedVehicle.driverBata),
                      toll: String(calculationBreakdown?.tollEstimate || 0),
                    },
                  } as any);
                }}
                style={[styles.secondaryActionBtn, { backgroundColor: isDark ? '#082F49' : '#F0F9FF', borderColor: '#0284C7' }]}
                activeOpacity={0.85}
              >
                <Receipt size={18} color="#0284C7" />
                <Text style={[styles.secondaryActionBtnText, { color: '#0284C7' }]}>
                  Issue Official SAC 9964 GST Invoice
                </Text>
              </TouchableOpacity>

              {/* Modify or Create New Quote */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity
                  onPress={() => setCurrentStep('form')}
                  style={[styles.outlineBtn, { borderColor: themeColors.border, flex: 1 }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                    Edit Trip Details
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setGeneratedRefId('');
                    setCalculationBreakdown(null);
                    setCurrentStep('form');
                  }}
                  style={[styles.outlineBtn, { borderColor: selectedBrand.primaryColor, flex: 1, backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: selectedBrand.primaryColor }}>
                    + New Quotation
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Brand Picker Modal ── */}
      <Modal
        visible={showBrandPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBrandPickerModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          activeOpacity={1}
          onPress={() => setShowBrandPickerModal(false)}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: themeColors.surface,
              borderRadius: 12,
              padding: 20,
              borderWidth: 1,
              borderColor: themeColors.border,
              ...shadows.card,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Building2 size={20} color={colors.primary} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>Select Website Brand</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBrandPickerModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginBottom: 12 }}>
              Quotation terms, fleet, vehicle rates, and branding will adjust according to your selection:
            </Text>

            <View style={{ gap: 8 }}>
              {BRAND_CONFIGS.map((brand) => {
                const isSelected = selectedBrand.id === brand.id;
                return (
                  <TouchableOpacity
                    key={brand.id}
                    onPress={() => {
                      setSelectedBrand(brand);
                      setShowBrandPickerModal(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? brand.primaryColor : themeColors.border,
                      backgroundColor: isSelected ? (isDark ? '#1E293B' : '#F8FAFC') : 'transparent',
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: brand.primaryColor + '20',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Building2 size={18} color={brand.primaryColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>{brand.name}</Text>
                        <View style={[styles.brandTagPill, { backgroundColor: brand.primaryColor }]}>
                          <Text style={styles.brandTagPillText}>{brand.domain}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                        {brand.tagline}
                      </Text>
                    </View>
                    {isSelected && <CheckCircle2 size={18} color={brand.primaryColor} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Location Picker Modal ── */}
      <LocationPickerModal
        visible={showLocationPicker}
        title={
          locationPickerTarget === 'pickup'
            ? 'Select Pickup Location'
            : locationPickerTarget === 'drop'
            ? 'Select Destination Location'
            : `Select Via Stop #${(locationPickerTarget as number) + 1}`
        }
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={(loc: string) => {
          if (locationPickerTarget === 'pickup') {
            handleSelectPickup(loc);
          } else if (locationPickerTarget === 'drop') {
            handleSelectDrop(loc);
          } else if (typeof locationPickerTarget === 'number') {
            handleUpdateStop(locationPickerTarget, loc);
          }
          setShowLocationPicker(false);
        }}
        initialValue={
          locationPickerTarget === 'pickup'
            ? pickupCity
            : locationPickerTarget === 'drop'
            ? dropCity
            : typeof locationPickerTarget === 'number'
            ? stops[locationPickerTarget] || ''
            : ''
        }
      />

      {/* ── Share PDF & Email Modal ── */}
      <Modal
        visible={showSharePdfModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSharePdfModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowSharePdfModal(false)}
        >
          <View
            style={[
              styles.shareModalSheet,
              { backgroundColor: themeColors.surface, borderColor: themeColors.border },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Printer size={20} color={selectedBrand.primaryColor} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>
                  Export & Share Quotation
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSharePdfModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={handleOpenPrintablePdf}
                style={[styles.shareModalActionBtn, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF', borderColor: selectedBrand.primaryColor }]}
              >
                <Printer size={20} color={selectedBrand.primaryColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                    Print or Download PDF
                  </Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                    Generates official branded PDF invoice with terms & QR code
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShareEmailSmtp}
                style={[styles.shareModalActionBtn, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: '#10B981' }]}
              >
                <Mail size={20} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                    Send via Email Client
                  </Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                    Pre-fills quote directly to {customerEmail || 'customer email'}
                  </Text>
                </View>
                {sendingEmail ? <ActivityIndicator size="small" color="#10B981" /> : <ChevronRight size={18} color={themeColors.textSecondary} />}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  stepNumBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  brandTagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  brandTagPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  switchBrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  quickBrandChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  tripTypeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tripTypeChip: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTypeChipText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  addStopHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  pickLocationBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  hubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  instructionChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  luxuryVehicleCard: {
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  vehicleIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '800',
  },
  vehicleModel: {
    fontSize: 11.5,
    marginTop: 1,
  },
  vehicleSpecsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  specText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bataTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  addToLeadsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 10,
  },
  checkboxSquare: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  addToLeadsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  addToLeadsSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    ...shadows.card,
  },
  primaryActionBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  syncBanner: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  metaPillsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareDivider: {
    height: 1,
    marginVertical: 4,
  },
  advanceHighlightBox: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  whatsappActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  whatsappActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  outlineBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareModalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 18,
    paddingBottom: 30,
  },
  shareModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
});
