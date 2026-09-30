import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Printer,
  Send,
  Calculator,
  Receipt,
  FileText,
  IndianRupee,
  ChevronDown,
  Building,
  User,
  Phone,
  Car,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react-native';
import {
  InvoiceData,
  printOrDownloadInvoice,
  generateInvoiceHtml,
} from '@/utils/invoiceGenerator';
import { sendWhatsAppMessage } from '@/utils/whatsappTemplates';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface InvoiceCustomizerModalProps {
  visible: boolean;
  onClose: () => void;
  initialData: Partial<InvoiceData>;
}

export default function InvoiceCustomizerModal({
  visible,
  onClose,
  initialData,
}: InvoiceCustomizerModalProps) {
  const { themeColors, isDark } = useTheme();

  // Customer & Business Particulars
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');

  // Trip, Vehicle & Driver Particulars
  const [pickup, setPickup] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [tripType, setTripType] = useState('One Way');
  const [vehicleType, setVehicleType] = useState('Sedan');
  const [cabNumber, setCabNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [startingKm, setStartingKm] = useState('');
  const [closingKm, setClosingKm] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash / UPI');

  // Rates & Itemized Charges
  const [distanceKm, setDistanceKm] = useState('');
  const [ratePerKm, setRatePerKm] = useState('');
  const [baseFare, setBaseFare] = useState('');
  const [bata, setBata] = useState('');
  const [toll, setToll] = useState('');
  const [permit, setPermit] = useState('');
  const [parking, setParking] = useState('');
  const [waiting, setWaiting] = useState('');
  const [hills, setHills] = useState('');
  const [night, setNight] = useState('');
  const [extra, setExtra] = useState('');
  const [discount, setDiscount] = useState('');
  const [advance, setAdvance] = useState('');

  // Tax & Compliance
  const [includeGst, setIncludeGst] = useState(false);
  const [isInterstate, setIsInterstate] = useState(false);
  const [gstin, setGstin] = useState('GSTIN: 33AAACM9876A1Z4');
  const [notes, setNotes] = useState('');

  // Submission State
  const [submittingOfficial, setSubmittingOfficial] = useState(false);
  const [officialInvoiceNumber, setOfficialInvoiceNumber] = useState<string | null>(null);

  useEffect(() => {
    if (visible && initialData) {
      setCustomerName(initialData.customerName || '');
      setCustomerPhone(initialData.customerPhone || '');
      setCustomerEmail(initialData.customerEmail || '');
      setCustomerGstin(initialData.customerGstin || '');
      setCustomerCompany(initialData.customerCompany || '');

      setPickup(initialData.pickup || '');
      setDropLocation(initialData.dropLocation || '');
      setTripType(initialData.tripType || 'One Way');
      setVehicleType(initialData.vehicleType || initialData.cabName || 'Sedan');
      setCabNumber(initialData.cabNumber || '');
      setDriverName(initialData.driverName || '');
      setDriverPhone(initialData.driverPhone || '');
      setStartingKm(String(initialData.startingKm || ''));
      setClosingKm(String(initialData.closingKm || ''));
      setPaymentMode(initialData.paymentMode || 'Cash / UPI');

      setDistanceKm(String(initialData.distanceKm || ''));
      setRatePerKm(String(initialData.ratePerKm || ''));
      setBaseFare(String(initialData.baseFare || ''));
      setBata(String(initialData.driverBata || ''));
      setToll(String(initialData.tollCharges || ''));
      setPermit(String(initialData.permitCharges || initialData.stateTax || ''));
      setParking(String(initialData.parkingCharges || ''));
      setWaiting(String(initialData.waitingCharges || ''));
      setHills(String(initialData.hillsCharges || ''));
      setNight(String(initialData.nightCharges || ''));
      setExtra(String(initialData.extraCharges || ''));
      setDiscount(String(initialData.discountAmount || ''));
      setAdvance(String(initialData.advancePaid || ''));

      setIncludeGst(Boolean(initialData.includeGst));
      setIsInterstate(Boolean(initialData.isInterstate));
      if (initialData.gstNumber) setGstin(initialData.gstNumber);
      setNotes(initialData.notes || '');
      setOfficialInvoiceNumber(null);
    }
  }, [visible, initialData]);

  // Auto-calculate base fare when distance or rate changes (if user wants)
  const handleAutoCalcBase = () => {
    const d = parseFloat(distanceKm) || 0;
    const r = parseFloat(ratePerKm) || 0;
    if (d > 0 && r > 0) {
      setBaseFare(String(Math.round(d * r)));
    }
  };

  const numBase = Number(baseFare) || 0;
  const numBata = Number(bata) || 0;
  const numToll = Number(toll) || 0;
  const numPermit = Number(permit) || 0;
  const numParking = Number(parking) || 0;
  const numWaiting = Number(waiting) || 0;
  const numHills = Number(hills) || 0;
  const numNight = Number(night) || 0;
  const numExtra = Number(extra) || 0;
  const numDiscount = Number(discount) || 0;
  const numAdvance = Number(advance) || 0;

  const subtotalBeforeGst = Math.max(
    0,
    numBase + numBata + numToll + numPermit + numParking + numWaiting + numHills + numNight + numExtra - numDiscount
  );

  const gstRate = 5;
  const gstAmount = includeGst ? Math.round(numBase * 0.05 * 100) / 100 : 0;
  const grandTotal = Math.round(subtotalBeforeGst + gstAmount);
  const balanceDue = Math.max(0, grandTotal - numAdvance);

  const assembleInvoiceData = (): InvoiceData => ({
    invoiceNumber: officialInvoiceNumber || String(initialData.invoiceNumber || '1001'),
    date: initialData.date,
    brandName: initialData.brandName || 'Drop Cars',
    brandPhone: initialData.brandPhone || '7200217986',
    gstNumber: gstin,
    customerName: customerName || 'Valued Customer',
    customerPhone: customerPhone || '',
    customerEmail: customerEmail || undefined,
    customerGstin: customerGstin || undefined,
    customerCompany: customerCompany || undefined,
    driverName: driverName || undefined,
    driverPhone: driverPhone || undefined,
    cabName: vehicleType,
    cabNumber: cabNumber || undefined,
    pickup: pickup || 'Pickup Location',
    dropLocation: dropLocation || 'Drop Location',
    pickupDate: initialData.pickupDate,
    pickupTime: initialData.pickupTime,
    travelDate: initialData.travelDate,
    vehicleType,
    tripType,
    distanceKm: distanceKm || initialData.distanceKm,
    ratePerKm: ratePerKm || undefined,
    baseFare: numBase,
    driverBata: numBata,
    tollCharges: numToll,
    permitCharges: numPermit,
    parkingCharges: numParking,
    waitingCharges: numWaiting,
    hillsCharges: numHills,
    nightCharges: numNight,
    extraCharges: numExtra,
    discountAmount: numDiscount,
    advancePaid: numAdvance,
    includeGst,
    isInterstate,
    gstPercent: gstRate,
    gstAmount,
    startingKm: startingKm || undefined,
    closingKm: closingKm || undefined,
    paymentMode,
    notes: notes || undefined,
    isCompleted: initialData.isCompleted ?? true,
    reviewToken: initialData.reviewToken,
  });

  const handlePrint = () => {
    const data = assembleInvoiceData();
    printOrDownloadInvoice(data);
  };

  const handleRegisterOfficialGst = async () => {
    if (!pickup.trim() || !dropLocation.trim() || !customerName.trim() || !customerPhone.trim()) {
      Alert.alert('Required Fields', 'Please ensure customer name, phone, pickup, and drop location are filled.');
      return;
    }
    setSubmittingOfficial(true);
    try {
      const res = await apiService.issueManualTaxInvoice({
        customer_name: customerName.trim(),
        customer_number: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        customer_gstin: customerGstin.trim() || undefined,
        customer_company: customerCompany.trim() || undefined,
        pickup: pickup.trim(),
        drop: dropLocation.trim(),
        trip_type: tripType,
        vehicle_type: vehicleType,
        cab_number: cabNumber.trim() || undefined,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        distance_km: parseFloat(distanceKm) || 0,
        rate_per_km: parseFloat(ratePerKm) || (numBase > 0 && parseFloat(distanceKm) > 0 ? Math.round(numBase / parseFloat(distanceKm)) : 0),
        driver_bata: numBata,
        toll_charges: numToll,
        permit_charges: numPermit,
        parking_charges: numParking,
        hills_charges: numHills,
        waiting_charges: numWaiting,
        night_charges: numNight,
        extra_charges: numExtra,
        discount_amount: numDiscount,
        advance_paid: numAdvance,
        is_interstate: isInterstate,
        starting_km: startingKm || undefined,
        closing_km: closingKm || undefined,
        payment_mode: paymentMode,
        notes: notes || undefined,
        booking_id: String(initialData.invoiceNumber || ''),
      });

      setOfficialInvoiceNumber(res.invoice_number);
      Alert.alert(
        'Official Invoice Issued',
        `GST Invoice #${res.invoice_number} has been generated and saved! ${res.emailed ? 'A copy was emailed to the customer.' : ''}`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Registration Error', e?.message || 'Could not register official GST invoice');
    } finally {
      setSubmittingOfficial(false);
    }
  };

  const handleShareWhatsAppInvoice = async () => {
    const data = assembleInvoiceData();
    await sendWhatsAppMessage('trip_completed', {
      ...data,
      bookingId: data.invoiceNumber,
      pickupLocation: data.pickup,
      totalFare: grandTotal,
      finalFare: grandTotal,
      balancePaid: balanceDue,
    });
  };

  const handleShareWhatsAppQuote = async () => {
    const data = assembleInvoiceData();
    await sendWhatsAppMessage('fare_estimation', {
      ...data,
      bookingId: data.invoiceNumber,
      pickupLocation: data.pickup,
      totalFare: grandTotal,
      advanceAmount: numAdvance,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Receipt size={18} color={themeColors.primary} />
                <Text style={[styles.title, { color: themeColors.text }]}>GST Tax Invoice & Quotation</Text>
                {officialInvoiceNumber && (
                  <View style={styles.officialBadge}>
                    <CheckCircle2 size={12} color="#059669" />
                    <Text style={styles.officialBadgeText}>{officialInvoiceNumber}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                Ref #{initialData.invoiceNumber} · {pickup || 'Pickup'} ➔ {dropLocation || 'Drop'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} accessibilityLabel="Close">
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Live Calculation Summary Banner */}
            <View style={[styles.summaryCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeColors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Running Pure KM Fare:</Text>
                <Text style={[styles.summaryVal, { color: themeColors.text }]}>₹{numBase.toLocaleString('en-IN')}</Text>
              </View>
              {includeGst && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: '#0284C7' }]}>
                    GST ({isInterstate ? '5% IGST Interstate' : '2.5% CGST + 2.5% SGST'}):
                  </Text>
                  <Text style={[styles.summaryVal, { color: '#0284C7' }]}>+₹{gstAmount.toLocaleString('en-IN')}</Text>
                </View>
              )}
              {numAdvance > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Advance Paid:</Text>
                  <Text style={[styles.summaryVal, { color: '#10B981' }]}>-₹{numAdvance.toLocaleString('en-IN')}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.grandRow, { borderTopColor: themeColors.border }]}>
                <Text style={[styles.grandLabel, { color: themeColors.text }]}>Total Billable Amount:</Text>
                <Text style={styles.grandVal}>₹{grandTotal.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.balanceTag, balanceDue > 0 ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.balanceText, balanceDue > 0 ? { color: '#B45309' } : { color: '#059669' }]}>
                  {balanceDue === 0 ? '✓ PAID IN FULL' : `BALANCE DUE: ₹${balanceDue.toLocaleString('en-IN')}`}
                </Text>
              </View>
            </View>

            {/* Customer Details Section */}
            <Text style={[styles.sectionHeading, { color: themeColors.primary, marginTop: 12 }]}>
              👤 Customer & Corporate Info
            </Text>
            <View style={styles.grid}>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Customer Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Customer Phone *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                  placeholder="9876543210"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email (PDF Receipt)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  keyboardType="email-address"
                  placeholder="client@mail.com"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Company Name (B2B)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={customerCompany}
                  onChangeText={setCustomerCompany}
                  placeholder="e.g. Infosys Ltd"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={[styles.inputWrap, { width: '100%' }]}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Customer GSTIN (for ITC credit)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={customerGstin}
                  onChangeText={setCustomerGstin}
                  placeholder="33AAACM9876A1Z4"
                  autoCapitalize="characters"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
            </View>

            {/* Trip Itinerary Section */}
            <Text style={[styles.sectionHeading, { color: themeColors.primary, marginTop: 14 }]}>
              📍 Route & Trip Details
            </Text>
            <View style={styles.grid}>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Pickup Location</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={pickup}
                  onChangeText={setPickup}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Drop Location</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={dropLocation}
                  onChangeText={setDropLocation}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Trip Type</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={tripType}
                  onChangeText={setTripType}
                  placeholder="One Way / Round Trip"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Vehicle Category</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={vehicleType}
                  onChangeText={setVehicleType}
                  placeholder="Sedan / SUV / Innova"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
            </View>

            {/* Driver & Cab Details */}
            <Text style={[styles.sectionHeading, { color: themeColors.primary, marginTop: 14 }]}>
              🚗 Driver & Vehicle Info
            </Text>
            <View style={styles.grid}>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Cab Reg Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={cabNumber}
                  onChangeText={setCabNumber}
                  placeholder="TN 01 AB 1234"
                  autoCapitalize="characters"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={driverName}
                  onChangeText={setDriverName}
                  placeholder="Driver Full Name"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Phone</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={driverPhone}
                  onChangeText={setDriverPhone}
                  keyboardType="phone-pad"
                  placeholder="Driver Phone"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Payment Mode</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={paymentMode}
                  onChangeText={setPaymentMode}
                  placeholder="Cash / UPI / Card"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Starting Odometer (KM)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={startingKm}
                  onChangeText={setStartingKm}
                  keyboardType="numeric"
                  placeholder="e.g. 45200"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Closing Odometer (KM)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={closingKm}
                  onChangeText={setClosingKm}
                  keyboardType="numeric"
                  placeholder="e.g. 45480"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
            </View>

            {/* Distance & Rate Breakdown */}
            <Text style={[styles.sectionHeading, { color: themeColors.primary, marginTop: 14 }]}>
              💰 Fare Calculations & Charges (₹)
            </Text>
            <View style={styles.grid}>
              <View style={[styles.inputWrap, { width: '31%' }]}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Total KM</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                  keyboardType="numeric"
                  placeholder="150"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={[styles.inputWrap, { width: '31%' }]}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Rate / KM</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={ratePerKm}
                  onChangeText={setRatePerKm}
                  keyboardType="numeric"
                  placeholder="14"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={[styles.inputWrap, { width: '31%' }]}>
                <TouchableOpacity onPress={handleAutoCalcBase} style={styles.calcBtn} activeOpacity={0.8}>
                  <Calculator size={13} color="#FFFFFF" />
                  <Text style={styles.calcBtnText}>Calc Fare</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Base Running Fare *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={baseFare}
                  onChangeText={setBaseFare}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Bata (₹)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={bata}
                  onChangeText={setBata}
                  keyboardType="numeric"
                  placeholder="300"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Toll Plaza (Fastag)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={toll}
                  onChangeText={setToll}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>State Entry Permit</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={permit}
                  onChangeText={setPermit}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Parking / Airport</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={parking}
                  onChangeText={setParking}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Hill Station Allowance</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={hills}
                  onChangeText={setHills}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Waiting Charges</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={waiting}
                  onChangeText={setWaiting}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Night Allowance</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={night}
                  onChangeText={setNight}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Extra KM / Time</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                  value={extra}
                  onChangeText={setExtra}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: '#DC2626' }]}>Promo Discount (-₹)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: '#DC2626', borderColor: '#FCA5A5' }]}
                  value={discount}
                  onChangeText={setDiscount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
              <View style={[styles.inputWrap, { width: '100%' }]}>
                <Text style={[styles.inputLabel, { color: '#10B981' }]}>Advance Received (-₹)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: '#10B981', borderColor: '#6EE7B7' }]}
                  value={advance}
                  onChangeText={setAdvance}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                />
              </View>
            </View>

            {/* Compliance & GST Toggles */}
            <Text style={[styles.sectionHeading, { color: themeColors.primary, marginTop: 14 }]}>
              ⚖️ GST & Compliance Options
            </Text>
            <View style={[styles.toggleRow, { borderColor: themeColors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Apply 5% GST (SAC 9964 / 9966)</Text>
                <Text style={[styles.toggleSub, { color: themeColors.textSecondary }]}>
                  Passenger transport service without ITC
                </Text>
              </View>
              <Switch
                value={includeGst}
                onValueChange={setIncludeGst}
                trackColor={{ false: '#767577', true: '#10B981' }}
              />
            </View>

            {includeGst && (
              <View style={[styles.toggleRow, { borderColor: themeColors.border, marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Interstate Trip (IGST 5.0%)</Text>
                  <Text style={[styles.toggleSub, { color: themeColors.textSecondary }]}>
                    Switch between 5% IGST vs 2.5% CGST + 2.5% SGST
                  </Text>
                </View>
                <Switch
                  value={isInterstate}
                  onValueChange={setIsInterstate}
                  trackColor={{ false: '#767577', true: '#0284C7' }}
                />
              </View>
            )}

            <View style={[styles.inputWrap, { width: '100%', marginTop: 10 }]}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Company GSTIN Header</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border }]}
                value={gstin}
                onChangeText={setGstin}
                placeholder="GSTIN: ..."
                placeholderTextColor={themeColors.textMuted}
              />
            </View>

            <View style={[styles.inputWrap, { width: '100%', marginTop: 8 }]}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Notes / Remarks (Printed on Invoice)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#FFFFFF', color: themeColors.text, borderColor: themeColors.border, height: 60 }]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                placeholder="e.g. AC will be switched off on ghat road."
                placeholderTextColor={themeColors.textMuted}
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Action Buttons Footer */}
          <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={styles.actionBtnOfficial}
              onPress={handleRegisterOfficialGst}
              activeOpacity={0.8}
              disabled={submittingOfficial}
            >
              {submittingOfficial ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <ShieldCheck size={16} color="#FFFFFF" />
                  <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Register & Email GST</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnPrint} onPress={handlePrint} activeOpacity={0.8}>
              <Printer size={16} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>PDF / Print</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnWhatsApp} onPress={handleShareWhatsAppInvoice} activeOpacity={0.8}>
              <Send size={15} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  officialBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  body: {
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingVertical: 12,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  grandRow: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
  },
  grandLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  grandVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#059669',
  },
  balanceTag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 4,
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inputWrap: {
    width: '48%',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  calcBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 9,
    borderRadius: 6,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  calcBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionBtnOfficial: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#059669',
  },
  actionBtnPrint: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  actionBtnWhatsApp: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#25D366',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
