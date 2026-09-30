import React, { useState } from 'react';
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
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LocationPickerModal from '@/components/LocationPickerModal';
import { colors } from '@/constants/theme';
import { enquiriesApi } from '@/services/enquiriesApi';
import { generateEstimationHtml, InvoiceData } from '@/utils/invoiceGenerator';

type TripType = 'oneway' | 'roundtrip' | 'local' | 'multicity';

interface VehicleOption {
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
  color: string;
}

const VEHICLES: VehicleOption[] = [
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
    color: '#3B82F6',
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
    color: '#10B981',
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
    color: '#8B5CF6',
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
    color: '#F59E0B',
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
    color: '#EC4899',
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
];

// Distance lookup table for key South India hub pairs
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
  // Default regional estimate if both are non-empty
  if (f && t && f !== t) return 250;
  return 150;
}

// Generates reference Enquiry ID in format: E + YYMMDD + 2-digit serial/random (e.g. E26092202)
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

  // Form States
  const [tripType, setTripType] = useState<TripType>('oneway');
  const [pickupCity, setPickupCity] = useState('Chennai');
  const [dropCity, setDropCity] = useState('Madurai');
  const [travelDate, setTravelDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [travelTime, setTravelTime] = useState('09:00 AM');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption>(VEHICLES[0]);
  const [distanceKmInput, setDistanceKmInput] = useState('460');

  // Customer Contact
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Location Picker Modal
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<'pickup' | 'drop'>('pickup');

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
  } | null>(null);

  // PDF & Share Modal State
  const [showSharePdfModal, setShowSharePdfModal] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Auto update distance when cities change
  const handleSelectPickup = (city: string) => {
    setPickupCity(city);
    const d = getCityEstimatedDistance(city, dropCity);
    setDistanceKmInput(String(d));
  };

  const handleSelectDrop = (city: string) => {
    setDropCity(city);
    const d = getCityEstimatedDistance(pickupCity, city);
    setDistanceKmInput(String(d));
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
    // Allow estimating fare without blocking if customer name is empty
    const effectiveCustomerName = customerName.trim() || 'Valued Customer';
    const cleanDigits = customerPhone.replace(/\D/g, '');

    const dist = parseInt(distanceKmInput || '0', 10) || getCityEstimatedDistance(pickupCity, dropCity);
    const effectiveKm = tripType === 'roundtrip' ? dist * 2 : dist;
    const minKm = tripType === 'roundtrip' ? selectedVehicle.minKmRoundtrip : selectedVehicle.minKmOneway;
    const billableKm = Math.max(effectiveKm, minKm);

    const baseFare = billableKm * selectedVehicle.ratePerKm;
    const driverBata = tripType === 'roundtrip' ? selectedVehicle.driverBata * 2 : selectedVehicle.driverBata;
    
    // Toll estimation based on distance
    let tollEstimate = 0;
    if (dist >= 350) tollEstimate = 550;
    else if (dist >= 200) tollEstimate = 380;
    else if (dist >= 100) tollEstimate = 220;

    const totalFare = baseFare + driverBata + tollEstimate;
    const advanceAmount = Math.round(totalFare * 0.20);
    const balancePayable = totalFare - advanceAmount;

    const refId = generateEnquiryRefId();
    setGeneratedRefId(refId);

    setCalculationBreakdown({
      distanceKm: dist,
      baseFare,
      driverBata,
      tollEstimate,
      totalFare,
      advanceAmount,
      balancePayable,
    });

    // Automatically Sync/Preserve to Website CRM Enquiries if phone/name provided
    if (cleanDigits.length >= 10 || customerName.trim()) {
      setSyncingToWebsite(true);
      try {
        const res = await enquiriesApi.createLead({
          name: effectiveCustomerName,
          phone: cleanDigits.length >= 10 ? cleanDigits.slice(-10) : '9000000000',
          pickup: pickupCity.trim(),
          drop_location: dropCity.trim(),
          trip_type: tripType === 'roundtrip' ? 'Round Trip' : tripType === 'local' ? 'Local / Hourly' : 'One Way',
          vehicle_type: selectedVehicle.name,
          travel_date: travelDate,
          travel_time: travelTime,
          fare_estimate: totalFare,
          advance_requested: advanceAmount,
          notes: `[Ref: ${refId}] ${specialNotes ? specialNotes + ' | ' : ''}Auto-synced from Admin App Quote Builder`,
          website: 'Drop Cars',
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
  const confirmationUrl = `https://dropcars.in/confirm?ref=${generatedRefId}&phone=${encodeURIComponent(customerPhone)}`;

  // Formatted WhatsApp Message
  const getWhatsAppMessage = () => {
    if (!calculationBreakdown) return '';
    return `🚗 *DROP CARS - TRIP ESTIMATION & QUOTE*
Reference ID: *${generatedRefId}*
Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}

Hello *${customerName || 'Valued Customer'}*, greetings from Drop Cars!
Here is your requested taxi quotation:

📍 *Journey Details:*
• Route: ${pickupCity} ➔ ${dropCity}
• Trip Type: ${tripType === 'roundtrip' ? 'Round Trip' : tripType === 'local' ? 'Local / Hourly' : 'One Way Trip'}
• Vehicle: ${selectedVehicle.name} (${selectedVehicle.model})
• Travel Date: ${travelDate} at ${travelTime}
• Estimated Distance: ~${calculationBreakdown.distanceKm} KM

💰 *Fare Breakdown:*
• Base Ride Fare: ₹${calculationBreakdown.baseFare.toLocaleString('en-IN')}
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
*(You can click the link above to view quotation & confirm online, or sign in with your phone number on our website)*

📞 24x7 Customer Support: 7200217986 | Drop Cars Mobility
Thank you for choosing Drop Cars!`;
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
      const subject = `Drop Cars Fare Estimation Ref #${generatedRefId} - ${pickupCity} to ${dropCity}`;
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
      customerName,
      customerPhone,
      customerEmail,
      pickup: pickupCity,
      dropLocation: dropCity,
      travelDate,
      vehicleType: selectedVehicle.name,
      tripType: tripType === 'roundtrip' ? 'Round Trip' : 'One Way',
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
              {currentStep === 'form' ? 'Auto-syncs to Website CRM Enquiries' : `Ref: ${generatedRefId} · Ready to Share`}
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
            {/* 1. Trip Type Selector */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>1. Select Trip Type</Text>
              <View style={styles.tripTypeRow}>
                {(
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
                          backgroundColor: active ? colors.primary : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: active ? colors.primary : themeColors.border,
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

            {/* 2. Route & Location Details */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>2. Journey Route</Text>

              {/* Pickup City */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Pickup City / Area *</Text>
                <View style={[styles.inputWithAction, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <MapPin size={18} color="#10B981" style={{ marginRight: 8 }} />
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
                    style={styles.pickLocationBtn}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Drop City */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Destination / Drop City *</Text>
                <View style={[styles.inputWithAction, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <MapPin size={18} color="#EF4444" style={{ marginRight: 8 }} />
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
                    style={styles.pickLocationBtn}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Popular Cities */}
              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary, marginBottom: 6 }}>
                  Quick Hubs:
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

              {/* Date, Time & Distance Row */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1.2 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Date (YYYY-MM-DD)</Text>
                  <View style={[styles.smallInputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                    <Calendar size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                      value={travelDate}
                      onChangeText={setTravelDate}
                      placeholder="2026-09-22"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Pickup Time</Text>
                  <View style={[styles.smallInputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                    <Clock size={15} color="#8B5CF6" style={{ marginRight: 6 }} />
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                      value={travelTime}
                      onChangeText={setTravelTime}
                      placeholder="09:00 AM"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Dist (~KM)</Text>
                  <View style={[styles.smallInputWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text, fontSize: 12, fontWeight: '700' }]}
                      keyboardType="numeric"
                      value={distanceKmInput}
                      onChangeText={setDistanceKmInput}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* 3. Customer Contact Details */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>3. Customer Details</Text>
                <View style={[styles.tagPill, { backgroundColor: isDark ? '#1E293B' : '#E0F2FE' }]}>
                  <Text style={[styles.tagPillText, { color: colors.primary }]}>Quick Autofill / WhatsApp</Text>
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
                    placeholder="e.g. Need vehicle with carrier, AC on full trip"
                    placeholderTextColor="#94A3B8"
                    value={specialNotes}
                    onChangeText={setSpecialNotes}
                  />
                </View>
              </View>
            </View>

            {/* 4. Vehicle Category Selection */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>4. Choose Vehicle Category</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {VEHICLES.map((v) => {
                  const isSelected = selectedVehicle.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setSelectedVehicle(v)}
                      style={[
                        styles.vehicleCard,
                        {
                          backgroundColor: isSelected ? (isDark ? '#1E293B' : '#F0FDF4') : (isDark ? '#0F172A' : '#FFFFFF'),
                          borderColor: isSelected ? '#10B981' : themeColors.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={[styles.vehicleIconCircle, { backgroundColor: v.color + '20' }]}>
                          <Car size={20} color={v.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.vehicleName, { color: themeColors.text }]}>{v.name}</Text>
                            {v.tag && (
                              <View style={[styles.tagPill, { backgroundColor: v.color }]}>
                                <Text style={styles.tagPillText}>{v.tag}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.vehicleModel, { color: themeColors.textSecondary }]}>{v.model}</Text>
                          <Text style={[styles.vehicleSpecs, { color: themeColors.textSecondary }]}>
                            {v.seats} · {v.luggage}
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary }}>
                          ₹{v.ratePerKm}/km
                        </Text>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                          Bata: ₹{v.driverBata}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Calculate Button */}
            <TouchableOpacity
              onPress={handleGenerateEstimate}
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Sparkles size={18} color="#FFFFFF" />
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
                  backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
                  borderColor: '#10B981',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={20} color="#10B981" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#A7F3D0' : '#065F46' }}>
                    Quotation Auto-Saved to Website CRM
                  </Text>
                </View>
                {syncingToWebsite && <ActivityIndicator size="small" color="#10B981" />}
              </View>

              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, color: isDark ? '#D1FAE5' : '#047857' }}>
                    Enquiry Reference Number:
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#FFFFFF' : '#064E3B', letterSpacing: 0.5 }}>
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
                💡 Customer can log in with their phone number ({customerPhone}) on the website to view this quotation in their recent searches.
              </Text>
            </View>

            {/* Trip Details Card */}
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                  Journey Overview
                </Text>
                <View style={[styles.tagPill, { backgroundColor: colors.primary }]}>
                  <Text style={styles.tagPillText}>
                    {tripType === 'roundtrip' ? 'Round Trip' : tripType === 'local' ? 'Local' : 'One Way'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Car size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>
                    {pickupCity} ➔ {dropCity}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 1 }}>
                    {travelDate} at {travelTime} · ~{calculationBreakdown?.distanceKm} KM
                  </Text>
                </View>
              </View>

              <View style={[styles.metaPillsRow, { borderColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Vehicle</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                    {selectedVehicle.name} ({selectedVehicle.seats})
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Customer</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                    {customerName}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Contact</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                    {customerPhone}
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
                      Base Ride Fare ({calculationBreakdown.distanceKm} km × ₹{selectedVehicle.ratePerKm})
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                      ₹{calculationBreakdown.baseFare.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.fareRow}>
                    <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                      Driver Allowance (Bata)
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                      ₹{calculationBreakdown.driverBata.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  {calculationBreakdown.tollEstimate > 0 && (
                    <View style={styles.fareRow}>
                      <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                        Standard Toll Allowance
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                        ₹{calculationBreakdown.tollEstimate.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.fareDivider, { backgroundColor: themeColors.border }]} />

                  <View style={styles.fareRow}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: themeColors.text }}>
                      TOTAL ESTIMATED FARE
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primary }}>
                      ₹{calculationBreakdown.totalFare.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.advanceHighlightBox, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: isDark ? '#D97706' : '#FDE68A' }]}>
                    <View style={styles.fareRow}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>
                        20% Online Confirmation Advance:
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#D97706' }}>
                        ₹{calculationBreakdown.advanceAmount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={[styles.fareRow, { marginTop: 4 }]}>
                      <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>
                        Balance Payable to Driver on Trip:
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
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
                  Customer can scan using GPay / PhonePe / Paytm to instantly pay ₹{calculationBreakdown.advanceAmount} advance to confirm ride:
                </Text>

                <View style={{ alignItems: 'center', marginVertical: 6 }}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        `upi://pay?pa=7200217986-1@okbizaxis&pn=DropCars&am=${calculationBreakdown.advanceAmount}&cu=INR&tn=AdvanceRef_${generatedRefId}`
                      )}`,
                    }}
                    style={{ width: 160, height: 160, borderRadius: 8, backgroundColor: '#FFFFFF' }}
                    resizeMode="contain"
                  />
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: isDark ? '#1E293B' : '#EEF2FF', paddingVertical: 8, borderRadius: 6, alignItems: 'center', borderColor: '#10B981', borderWidth: 1 }}
                  onPress={() => {
                    const upiUri = `upi://pay?pa=7200217986-1@okbizaxis&pn=DropCars&am=${calculationBreakdown.advanceAmount}&cu=INR&tn=AdvanceRef_${generatedRefId}`;
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
                <Text style={{ fontSize: 11, color: colors.primary, flex: 1 }} numberOfLines={1}>
                  {confirmationUrl}
                </Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(confirmationUrl, false)}
                  style={styles.copyLinkBtn}
                >
                  {copiedLink ? <Check size={14} color="#10B981" /> : <Copy size={14} color={colors.primary} />}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
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
                    Sends formatted quotation & confirmation link to {customerPhone}
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
                      trip_type: tripType === 'roundtrip' ? 'Round Trip' : tripType === 'local' ? 'Local / Hourly' : 'One Way',
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
                  style={[styles.outlineBtn, { borderColor: colors.primary, flex: 1, backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                    + New Quotation
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Location Picker Modal ── */}
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={(loc) => {
          if (locationPickerTarget === 'pickup') {
            handleSelectPickup(loc);
          } else {
            handleSelectDrop(loc);
          }
          setShowLocationPicker(false);
        }}
        title={locationPickerTarget === 'pickup' ? 'Select Pickup City / Location' : 'Select Destination City / Location'}
        initialValue={locationPickerTarget === 'pickup' ? pickupCity : dropCity}
      />

      {/* ── Share as PDF Modal (Email vs WhatsApp) ── */}
      <Modal
        visible={showSharePdfModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSharePdfModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSharePdfModal(false)}
        >
          <TouchableOpacity
            style={[styles.shareModalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Printer size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Share Quotation / PDF</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSharePdfModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 16 }}>
              Select how you would like to dispatch the formal estimation document to {customerName || 'customer'}:
            </Text>

            {/* Option 1: Send via Email (SMTP) */}
            <TouchableOpacity
              onPress={handleShareEmailSmtp}
              style={[styles.shareOptionRow, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}
              activeOpacity={0.85}
              disabled={sendingEmail}
            >
              <View style={[styles.shareOptionIconWrap, { backgroundColor: '#EEF2FF' }]}>
                <Mail size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareOptionTitle, { color: themeColors.text }]}>Share via Email</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                  Sends branded HTML quotation & confirmation link to {customerEmail || '(Enter email)'}
                </Text>
              </View>
              {sendingEmail ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Send size={16} color={colors.primary} />
              )}
            </TouchableOpacity>

            {/* Option 2: Share via WhatsApp / PDF */}
            <TouchableOpacity
              onPress={() => {
                setShowSharePdfModal(false);
                handleOpenPrintablePdf();
                setTimeout(() => {
                  handleShareWhatsApp();
                }, 600);
              }}
              style={[styles.shareOptionRow, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: '#10B981', marginTop: 10 }]}
              activeOpacity={0.85}
            >
              <View style={[styles.shareOptionIconWrap, { backgroundColor: '#DCFCE7' }]}>
                <MessageCircle size={20} color="#15803D" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareOptionTitle, { color: themeColors.text }]}>Share via WhatsApp</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                  Opens printable PDF view and triggers WhatsApp message with direct confirmation link
                </Text>
              </View>
              <ExternalLink size={16} color="#15803D" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSharePdfModal(false)}
              style={[styles.modalCancelBtn, { borderColor: themeColors.border, marginTop: 16 }]}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
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
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  tripTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tripTypeChip: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
  },
  tripTypeChipText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  pickLocationBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  hubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 6,
  },
  vehicleIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 13,
    fontWeight: '800',
  },
  vehicleModel: {
    fontSize: 11,
    marginTop: 1,
  },
  vehicleSpecs: {
    fontSize: 10,
    marginTop: 1,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tagPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    elevation: 3,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  syncBanner: {
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 12,
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  metaPillsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
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
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    marginTop: 6,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  whatsappActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 13,
    borderRadius: 8,
    elevation: 3,
  },
  whatsappActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  secondaryActionBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  outlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  shareModalCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  shareOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  shareOptionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOptionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  modalCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
});
