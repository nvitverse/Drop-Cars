import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  Switch,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  FileText,
  Download,
  Plus,
  Search,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Receipt,
  Building,
  ShieldCheck,
  TrendingUp,
  Edit2,
  Settings,
  Sparkles,
  Car,
  User,
  Phone,
  Mail,
  MapPin,
  Send,
  Printer,
  MessageCircle,
  Check,
  ChevronRight,
  Info,
  Navigation,
  CreditCard,
  Globe,
  Sliders,
  Save,
  Briefcase,
  Share2,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { colors } from '@/constants/theme';
import Toast, { useToast } from '@/components/Toast';
import {
  printOrDownloadInvoice,
  InvoiceData,
  INVOICE_TEMPLATES,
  getStoredBusinessProfile,
  saveStoredBusinessProfile,
  BusinessProfileSettings,
  DEFAULT_BUSINESS_PROFILE,
} from '@/utils/invoiceGenerator';
import { sendWhatsAppMessage } from '@/utils/whatsappTemplates';

interface BookingOrder {
  id: number | string;
  status?: string;
  customer_name?: string;
  customer_number?: string;
  customer_email?: string;
  pickup_drop_location?: any;
  start_date_time?: string;
  trip_type?: string;
  car_type?: string;
  trip_distance?: number;
  estimated_price?: number;
  vendor_price?: number;
  closed_vendor_price?: number;
  toll_charges?: number;
  driver_allowance?: number;
  advance_received?: number;
  assigned_driver?: any;
  assignments?: any[];
}

const TRIP_TYPES = ['One Way', 'Round Trip', 'Local / Hourly', 'Multi-City'];
const VEHICLE_CATEGORIES = [
  'Sedan (Dzire / Etios)',
  'SUV (Ertiga / Lodgy)',
  'Innova Crysta',
  'Hatchback (WagonR)',
  'Tempo Traveller (12+)',
];
const PAYMENT_MODES = [
  'Cash / UPI',
  'Online Advance Paid',
  'Credit Card / POS',
  'B2B Corporate Credit',
];

export default function GstInvoicesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  // Active Screen Tab (4 Tabs)
  const [activeTab, setActiveTab] = useState<'issued' | 'completed' | 'generate' | 'settings'>('issued');

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<string>('Staff');
  const isOwner = adminRole === 'Owner';
  const [invoices, setInvoices] = useState<any[]>([]);
  const [seqStatus, setSeqStatus] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Business Profile Settings & Themes State
  const [bizSettings, setBizSettings] = useState<BusinessProfileSettings>(DEFAULT_BUSINESS_PROFILE);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('dropcars_neon');
  const [savingSettings, setSavingSettings] = useState(false);

  // Completed Bookings State
  const [completedOrders, setCompletedOrders] = useState<BookingOrder[]>([]);
  const [completedSearchQuery, setCompletedSearchQuery] = useState('');

  // Edit Counter Modal (Owner Only)
  const [showSeqModal, setShowSeqModal] = useState(false);
  const [newSeqNumber, setNewSeqNumber] = useState('');
  const [submittingSeq, setSubmittingSeq] = useState(false);

  // Autofill from Bookings Modal
  const [showAutofillModal, setShowAutofillModal] = useState(false);
  const [recentOrders, setRecentOrders] = useState<BookingOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // ══════════════════════════════════════════════
  // INVOICE GENERATOR / BUILDER FORM STATES
  // ══════════════════════════════════════════════
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');

  const [pickup, setPickup] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  const [travelDate, setTravelDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [travelTime, setTravelTime] = useState('09:00 AM');
  const [tripType, setTripType] = useState('One Way');
  const [vehicleType, setVehicleType] = useState('Sedan (Dzire / Etios)');

  const [cabNumber, setCabNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [startingKm, setStartingKm] = useState('');
  const [closingKm, setClosingKm] = useState('');

  const [distanceKm, setDistanceKm] = useState('150');
  const [ratePerKm, setRatePerKm] = useState('14');
  const [driverBata, setDriverBata] = useState('300');
  const [tollCharges, setTollCharges] = useState('0');
  const [permitCharges, setPermitCharges] = useState('0');
  const [parkingCharges, setParkingCharges] = useState('0');
  const [hillsCharges, setHillsCharges] = useState('0');
  const [waitingCharges, setWaitingCharges] = useState('0');
  const [nightCharges, setNightCharges] = useState('0');
  const [extraCharges, setExtraCharges] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [advancePaid, setAdvancePaid] = useState('0');
  const [paymentMode, setPaymentMode] = useState('Cash / UPI');

  const [includeGst, setIncludeGst] = useState(true);
  const [isInterstate, setIsInterstate] = useState(false);
  const [notes, setNotes] = useState('');
  const [bookingId, setBookingId] = useState('');

  const [submittingOfficial, setSubmittingOfficial] = useState(false);

  // Initialize or Autofill from URL params if arrived from quote estimator or orders
  useEffect(() => {
    if (params.tab === 'generate' || params.name || params.pickup) {
      setActiveTab('generate');
      if (params.name) setCustomerName(String(params.name));
      if (params.phone) setCustomerPhone(String(params.phone));
      if (params.email) setCustomerEmail(String(params.email));
      if (params.pickup) setPickup(String(params.pickup));
      if (params.drop) setDropLocation(String(params.drop));
      if (params.distance) setDistanceKm(String(params.distance));
      if (params.rate) setRatePerKm(String(params.rate));
      if (params.trip_type) setTripType(String(params.trip_type));
      if (params.vehicle_type) setVehicleType(String(params.vehicle_type));
      if (params.bata) setDriverBata(String(params.bata));
      if (params.toll) setTollCharges(String(params.toll));
    } else if (params.tab === 'completed') {
      setActiveTab('completed');
    } else if (params.tab === 'settings') {
      setActiveTab('settings');
    }
  }, [params]);

  // Load Invoices, Sequence Status, Business Profile & Completed Bookings
  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, seq, role, profile, ordersRes] = await Promise.all([
        apiService.getTaxInvoices({ limit: 100 }).catch(() => []),
        apiService.getTaxSequenceStatus().catch(() => null),
        apiService.getCachedAdminRole().catch(() => 'Staff'),
        getStoredBusinessProfile().catch(() => DEFAULT_BUSINESS_PROFILE),
        apiService.getOrders(0, 100).catch(() => ({ orders: [] })),
      ]);
      setInvoices(invList || []);
      setSeqStatus(seq);
      setAdminRole(role || 'Staff');
      if (seq?.last_number != null) {
        setNewSeqNumber(String(seq.last_number));
      }
      if (profile) {
        setBizSettings(profile);
        setSelectedTemplateId(profile.defaultTemplateId || 'dropcars_neon');
      }
      const rawOrders: BookingOrder[] = ordersRes?.orders || [];
      const completed = rawOrders.filter((o: any) => {
        const s = (o.status || '').toUpperCase();
        return (
          s === 'COMPLETED' ||
          s === 'TRIP_COMPLETED' ||
          s === 'CLOSED' ||
          Number(o.closed_vendor_price) > 0 ||
          Number(o.vendor_price) > 0
        );
      });
      setCompletedOrders(completed.length > 0 ? completed : rawOrders.slice(0, 30));
    } catch (e: any) {
      showToast(e?.message || 'Failed to load tax invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch recent orders for autofill
  const loadRecentOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiService.getOrders(0, 40);
      setRecentOrders(res?.orders || []);
    } catch (e) {
      console.warn('Failed to load recent orders for autofill:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOpenAutofill = () => {
    setShowAutofillModal(true);
    loadRecentOrders();
  };

  // Extract pickup and drop addresses cleanly from order
  const getOrderAddresses = (order: BookingOrder) => {
    const loc = order.pickup_drop_location;
    let fromCity = '';
    let toCity = '';
    if (loc && typeof loc === 'object' && !('pickup' in loc)) {
      const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
      fromCity = (loc as any)['0'] || '';
      toCity = (loc as any)[keys[keys.length - 1]] || '';
    } else if (loc) {
      const s = loc as any;
      fromCity = s.pickup?.address || s.pickup?.city || s['0'] || '';
      toCity = s.drop?.address || s.drop?.city || s['1'] || '';
    }
    return { fromCity, toCity };
  };

  // Populate form from selected booking
  const handleSelectBookingForAutofill = (order: BookingOrder) => {
    const { fromCity, toCity } = getOrderAddresses(order);
    const assigned: any = order.assigned_driver || (order.assignments && order.assignments[0]);

    setCustomerName(order.customer_name || '');
    setCustomerPhone(order.customer_number || '');
    if ((order as any).customer_email) setCustomerEmail((order as any).customer_email);
    setPickup(fromCity || '');
    setDropLocation(toCity || '');
    setBookingId(String(order.id || ''));

    if (order.start_date_time) {
      try {
        const dt = new Date(order.start_date_time);
        setTravelDate(dt.toISOString().split('T')[0]);
        setTravelTime(dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
      } catch {}
    }

    if (order.trip_type) {
      const tt = order.trip_type.toLowerCase();
      if (tt.includes('round')) setTripType('Round Trip');
      else if (tt.includes('local') || tt.includes('hourly')) setTripType('Local / Hourly');
      else if (tt.includes('multi')) setTripType('Multi-City');
      else setTripType('One Way');
    }

    if (order.car_type) {
      const ct = order.car_type.toLowerCase();
      if (ct.includes('crysta')) setVehicleType('Innova Crysta');
      else if (ct.includes('suv') || ct.includes('ertiga')) setVehicleType('SUV (Ertiga / Lodgy)');
      else if (ct.includes('hatch')) setVehicleType('Hatchback (WagonR)');
      else if (ct.includes('tempo')) setVehicleType('Tempo Traveller (12+)');
      else setVehicleType('Sedan (Dzire / Etios)');
    }

    if (assigned) {
      setDriverName(assigned.driver_name || (assigned as any).full_name || '');
      setDriverPhone(assigned.driver_number || (assigned as any).primary_number || '');
      setCabNumber(assigned.vehicle_number || (assigned as any).reg_id || '');
    }

    if (order.trip_distance) {
      setDistanceKm(String(order.trip_distance));
    }

    const fare = Number(order.closed_vendor_price || order.vendor_price || order.estimated_price || 0);
    const dist = Number(order.trip_distance) || 150;
    if (fare > 0 && dist > 0) {
      setRatePerKm(String(Math.max(12, Math.round(fare / dist))));
    }

    if ((order as any).toll_charges) setTollCharges(String((order as any).toll_charges));
    if ((order as any).driver_allowance) setDriverBata(String((order as any).driver_allowance));
    if ((order as any).advance_received) setAdvancePaid(String((order as any).advance_received));

    setShowAutofillModal(false);
    showToast(`Autofilled details from Booking #${order.id}!`, 'success');
  };

  // Smart Odometer Auto-calculation: when starting and closing KM change
  const handleStartingKmChange = (val: string) => {
    setStartingKm(val);
    const s = parseFloat(val);
    const c = parseFloat(closingKm);
    if (!isNaN(s) && !isNaN(c) && c > s) {
      setDistanceKm(String(Math.round(c - s)));
    }
  };

  const handleClosingKmChange = (val: string) => {
    setClosingKm(val);
    const s = parseFloat(startingKm);
    const c = parseFloat(val);
    if (!isNaN(s) && !isNaN(c) && c > s) {
      setDistanceKm(String(Math.round(c - s)));
    }
  };

  // Live Pure KM SAC 9964 Financial Calculations
  const kmDist = parseFloat(distanceKm) || 0;
  const kmRate = parseFloat(ratePerKm) || 0;
  const pureKmFare = Math.round(kmDist * kmRate);
  const gstCalculated = includeGst ? Math.round(pureKmFare * 0.05) : 0;
  const bataVal = parseFloat(driverBata) || 0;
  const tollVal = parseFloat(tollCharges) || 0;
  const permitVal = parseFloat(permitCharges) || 0;
  const parkingVal = parseFloat(parkingCharges) || 0;
  const hillsVal = parseFloat(hillsCharges) || 0;
  const waitingVal = parseFloat(waitingCharges) || 0;
  const nightVal = parseFloat(nightCharges) || 0;
  const extraVal = parseFloat(extraCharges) || 0;
  const discountVal = parseFloat(discountAmount) || 0;
  const advanceVal = parseFloat(advancePaid) || 0;

  const nonTaxableSubtotal = bataVal + tollVal + permitVal + parkingVal + hillsVal + waitingVal + nightVal + extraVal;
  const grandTotal = Math.max(0, pureKmFare + gstCalculated + nonTaxableSubtotal - discountVal);
  const balanceDue = Math.max(0, grandTotal - advanceVal);

  // Build Invoice Data Object for Print / WhatsApp / Preview
  const assembleInvoiceData = (customNumber?: string): InvoiceData => ({
    invoiceNumber: customNumber || (bookingId ? `DC-${bookingId}` : (seqStatus?.next_invoice_number || 'INV-031')),
    date: travelDate,
    templateId: selectedTemplateId,
    companyLegalName: bizSettings.companyLegalName,
    brandName: bizSettings.brandDisplayName,
    brandPhone: bizSettings.primaryPhone,
    customerCareNumber: bizSettings.customerCareNumber,
    whatsappNumber: bizSettings.whatsappNumber,
    companyEmail: bizSettings.emailId,
    domainName: bizSettings.domainName,
    companyAddress: bizSettings.officeAddress,
    panNumber: bizSettings.panNumber,
    gstNumber: bizSettings.gstin,
    hsnSacCode: bizSettings.hsnSacCode,
    bankAccountName: bizSettings.bankAccountName,
    bankName: bizSettings.bankName,
    bankAccountNumber: bizSettings.bankAccountNumber,
    bankIfsc: bizSettings.bankIfsc,
    bankBranch: bizSettings.bankBranch,
    upiId: bizSettings.upiId,
    termsAndConditions: bizSettings.termsAndConditions,
    customerName: customerName.trim() || 'Valued Customer',
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail.trim() || undefined,
    customerGstin: customerGstin.trim() || undefined,
    customerCompany: customerCompany.trim() || undefined,
    pickup: pickup.trim() || 'Pickup Location',
    dropLocation: dropLocation.trim() || 'Drop Location',
    pickupDate: travelDate,
    pickupTime: travelTime,
    travelDate,
    vehicleType,
    tripType,
    cabNumber: cabNumber.trim() || undefined,
    driverName: driverName.trim() || undefined,
    driverPhone: driverPhone.trim() || undefined,
    distanceKm: kmDist,
    ratePerKm: kmRate,
    baseFare: pureKmFare,
    driverBata: bataVal,
    tollCharges: tollVal,
    permitCharges: permitVal,
    parkingCharges: parkingVal,
    hillsCharges: hillsVal,
    waitingCharges: waitingVal,
    nightCharges: nightVal,
    extraCharges: extraVal,
    discountAmount: discountVal,
    advancePaid: advanceVal,
    includeGst,
    isInterstate,
    gstPercent: 5,
    gstAmount: gstCalculated,
    startingKm: startingKm || undefined,
    closingKm: closingKm || undefined,
    paymentMode,
    notes: notes.trim() || undefined,
    isCompleted: true,
  });

  // Action from Completed Bookings Tab: 1-Tap Generate GST Tax Invoice
  const handleGenerateInvoiceFromCompleted = (order: BookingOrder, withGst: boolean = true) => {
    handleSelectBookingForAutofill(order);
    setIncludeGst(withGst);
    setActiveTab('generate');
  };

  // Action from Completed Bookings Tab: 1-Tap Print / Preview HTML Receipt
  const handlePrintCompletedOrder = (order: BookingOrder, withGst: boolean = false) => {
    const { fromCity, toCity } = getOrderAddresses(order);
    const assigned: any = order.assigned_driver || (order.assignments && order.assignments[0]);
    const fare = Number(order.closed_vendor_price || order.vendor_price || order.estimated_price || 0);
    const dist = Number(order.trip_distance) || 150;
    const rate = Math.max(12, Math.round(fare / (dist || 1)));
    const advance = Number(order.advance_received) || 0;

    const invoicePayload: InvoiceData = {
      invoiceNumber: `DC-${order.id}`,
      date: order.start_date_time ? new Date(order.start_date_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      templateId: selectedTemplateId,
      companyLegalName: bizSettings.companyLegalName,
      brandName: bizSettings.brandDisplayName,
      brandPhone: bizSettings.primaryPhone,
      customerCareNumber: bizSettings.customerCareNumber,
      whatsappNumber: bizSettings.whatsappNumber,
      companyEmail: bizSettings.emailId,
      domainName: bizSettings.domainName,
      companyAddress: bizSettings.officeAddress,
      panNumber: bizSettings.panNumber,
      gstNumber: bizSettings.gstin,
      hsnSacCode: bizSettings.hsnSacCode,
      bankAccountName: bizSettings.bankAccountName,
      bankName: bizSettings.bankName,
      bankAccountNumber: bizSettings.bankAccountNumber,
      bankIfsc: bizSettings.bankIfsc,
      bankBranch: bizSettings.bankBranch,
      upiId: bizSettings.upiId,
      termsAndConditions: bizSettings.termsAndConditions,
      customerName: order.customer_name || 'Valued Customer',
      customerPhone: order.customer_number || '',
      customerEmail: order.customer_email || undefined,
      pickup: fromCity || 'Pickup Location',
      dropLocation: toCity || 'Drop Location',
      travelDate: order.start_date_time ? new Date(order.start_date_time).toISOString().split('T')[0] : undefined,
      vehicleType: order.car_type || 'Sedan',
      tripType: order.trip_type || 'One Way',
      cabNumber: assigned?.vehicle_number || (assigned as any)?.reg_id || undefined,
      driverName: assigned?.driver_name || (assigned as any)?.full_name || undefined,
      driverPhone: assigned?.driver_number || (assigned as any)?.primary_number || undefined,
      distanceKm: dist,
      ratePerKm: rate,
      baseFare: fare,
      tollCharges: Number(order.toll_charges) || 0,
      driverBata: Number(order.driver_allowance) || 0,
      advancePaid: advance,
      includeGst: withGst,
      gstPercent: 5,
      gstAmount: withGst ? Math.round(fare * 0.05) : 0,
      isCompleted: true,
    };

    printOrDownloadInvoice(invoicePayload);
  };

  // Action from Completed Bookings Tab: 1-Tap WhatsApp Receipt
  const handleWhatsAppCompletedOrder = async (order: BookingOrder) => {
    if (!order.customer_number) {
      Alert.alert('Phone Required', 'Customer phone number is missing for WhatsApp sharing.');
      return;
    }
    const { fromCity, toCity } = getOrderAddresses(order);
    const fare = Number(order.closed_vendor_price || order.vendor_price || order.estimated_price || 0);
    const advance = Number(order.advance_received) || 0;
    const balance = Math.max(0, fare - advance);

    await sendWhatsAppMessage('trip_completed', {
      bookingId: `DC-${order.id}`,
      customerName: order.customer_name || 'Customer',
      customerPhone: order.customer_number,
      pickupLocation: fromCity || 'Pickup',
      totalFare: fare,
      finalFare: fare,
      balancePaid: balance,
      carName: order.car_type || 'Sedan',
      driverName: order.assigned_driver?.driver_name || 'Drop Cars Fleet Chauffeur',
      brandName: bizSettings.brandDisplayName || 'Drop Cars',
      brandPhone: bizSettings.primaryPhone || '7200217986',
    });
  };

  // Action: Save Business Profile Settings
  const handleSaveBusinessSettings = async () => {
    setSavingSettings(true);
    try {
      const payload: BusinessProfileSettings = {
        ...bizSettings,
        defaultTemplateId: selectedTemplateId,
      };
      const updated = await saveStoredBusinessProfile(payload);
      setBizSettings(updated);
      showToast('Business & Invoicing Settings Saved Successfully!', 'success');
    } catch (e: any) {
      Alert.alert('Save Error', e?.message || 'Failed to save business settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Action: Print / PDF Preview
  const handlePrintPreview = () => {
    if (!pickup.trim() || !dropLocation.trim()) {
      Alert.alert('Route Required', 'Please enter pickup and drop locations to format the invoice.');
      return;
    }
    const data = assembleInvoiceData();
    printOrDownloadInvoice(data);
  };

  // Action: Share via WhatsApp
  const handleShareWhatsApp = async () => {
    if (!customerPhone.trim()) {
      Alert.alert('Phone Required', 'Please enter customer WhatsApp phone number.');
      return;
    }
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

  // Action: Issue and Register Official GST Tax Invoice on Backend
  const handleRegisterOfficialGst = async () => {
    // Validation
    const missing: string[] = [];
    if (!customerName.trim()) missing.push('Customer Name');
    if (!customerPhone.trim()) missing.push('Customer Phone');
    if (!pickup.trim()) missing.push('Pickup Location');
    if (!dropLocation.trim()) missing.push('Drop Location');

    if (missing.length > 0) {
      Alert.alert(
        'Required Fields Missing',
        `Please complete the following required fields before issuing the tax invoice:\n• ${missing.join('\n• ')}`
      );
      return;
    }

    if (pureKmFare <= 0 && grandTotal <= 0) {
      Alert.alert('Fare Required', 'Please enter a valid distance and rate per km.');
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
        distance_km: kmDist,
        rate_per_km: kmRate,
        driver_bata: bataVal,
        toll_charges: tollVal,
        permit_charges: permitVal,
        parking_charges: parkingVal,
        hills_charges: hillsVal,
        waiting_charges: waitingVal,
        night_charges: nightVal,
        extra_charges: extraVal,
        discount_amount: discountVal,
        advance_paid: advanceVal,
        is_interstate: isInterstate,
        starting_km: startingKm || undefined,
        closing_km: closingKm || undefined,
        payment_mode: paymentMode,
        notes: notes.trim() || undefined,
        booking_id: bookingId.trim() || undefined,
      });

      showToast(`Official Tax Invoice #${res.invoice_number} created & registered!`, 'success');

      // Auto download PDF
      if (res.id && res.invoice_number) {
        apiService.downloadTaxInvoicePdf(res.id, res.invoice_number).catch(() => null);
      }

      // Reload invoices ledger & switch to issued tab
      loadData();
      setActiveTab('issued');

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerGstin('');
      setCustomerCompany('');
      setPickup('');
      setDropLocation('');
      setCabNumber('');
      setDriverName('');
      setDriverPhone('');
      setStartingKm('');
      setClosingKm('');
      setBookingId('');
      setNotes('');
    } catch (e: any) {
      Alert.alert('Registration Error', e?.message || 'Failed to issue manual tax invoice');
    } finally {
      setSubmittingOfficial(false);
    }
  };

  // Action: Download PDF from ledger
  const handleDownloadPdf = async (inv: any) => {
    setDownloadingId(inv.id);
    try {
      await apiService.downloadTaxInvoicePdf(inv.id, inv.invoice_number);
      showToast(`Downloaded invoice ${inv.invoice_number}`, 'success');
    } catch (e: any) {
      Alert.alert('Download Error', e?.message || 'Could not download invoice PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  // Action: Export GSTR-1 CSV
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const now = new Date();
      await apiService.exportTaxInvoicesCsv(now.getFullYear(), now.getMonth() + 1);
      showToast('GSTR-1 CSV exported successfully!', 'success');
    } catch (e: any) {
      Alert.alert('Export Error', e?.message || 'Failed to export GSTR-1 CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  // Action: Update Continuous Counter (Owner Only)
  const handleUpdateSeqCounter = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the System Owner can adjust the invoice counter.');
      return;
    }
    const num = parseInt(newSeqNumber.trim(), 10);
    if (isNaN(num) || num < 0) {
      Alert.alert('Invalid Number', 'Please enter a valid count (0 or higher).');
      return;
    }
    setSubmittingSeq(true);
    try {
      const updatedSeq = await apiService.updateTaxSequenceCounter(num);
      setSeqStatus(updatedSeq);
      showToast(`Sequence counter set to ${num}. Next invoice: ${updatedSeq.next_invoice_number}`, 'success');
      setShowSeqModal(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Update Error', e?.message || 'Failed to update invoice sequence counter');
    } finally {
      setSubmittingSeq(false);
    }
  };

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (sourceFilter === 'manual' && inv.source_type !== 'manual') return false;
      if (sourceFilter === 'auto' && inv.source_type === 'manual') return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const num = (inv.invoice_number || '').toLowerCase();
      const name = (inv.customer_name_snapshot || '').toLowerCase();
      const phone = (inv.customer_number_snapshot || '').toLowerCase();
      const p = (inv.line_items?.pickup || '').toLowerCase();
      const d = (inv.line_items?.drop || '').toLowerCase();
      return num.includes(q) || name.includes(q) || phone.includes(q) || p.includes(q) || d.includes(q);
    });
  }, [invoices, searchQuery, sourceFilter]);

  const totalTaxable = invoices.reduce((acc, cur) => acc + (parseFloat(cur.taxable_value) || 0), 0);
  const totalGst = invoices.reduce((acc, cur) => acc + (parseFloat(cur.total_gst_amount) || 0), 0);
  const totalAmount = invoices.reduce((acc, cur) => acc + (parseFloat(cur.total_amount) || 0), 0);

  // Filtered orders for autofill modal
  const filteredOrders = useMemo(() => {
    if (!orderSearchQuery) return recentOrders;
    const q = orderSearchQuery.toLowerCase();
    return recentOrders.filter((o) => {
      const idMatch = String(o.id).includes(q);
      const nameMatch = (o.customer_name || '').toLowerCase().includes(q);
      const phoneMatch = (o.customer_number || '').toLowerCase().includes(q);
      return idMatch || nameMatch || phoneMatch;
    });
  }, [recentOrders, orderSearchQuery]);

  // Filtered completed bookings
  const filteredCompletedOrders = useMemo(() => {
    if (!completedSearchQuery) return completedOrders;
    const q = completedSearchQuery.toLowerCase();
    return completedOrders.filter((o) => {
      const idMatch = String(o.id).includes(q);
      const nameMatch = (o.customer_name || '').toLowerCase().includes(q);
      const phoneMatch = (o.customer_number || '').toLowerCase().includes(q);
      const { fromCity, toCity } = getOrderAddresses(o);
      const routeMatch = (fromCity || '').toLowerCase().includes(q) || (toCity || '').toLowerCase().includes(q);
      return idMatch || nameMatch || phoneMatch || routeMatch;
    });
  }, [completedOrders, completedSearchQuery]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Toast Notification */}
      {toast && <Toast visible={toast.visible} message={toast.message} type={toast.type} />}

      {/* Top Navigation Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
            <ArrowLeft size={20} color={themeColors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>GST Invoicing & Billing Hub</Text>
            <Text style={[styles.headerSub, { color: themeColors.textSecondary }]} numberOfLines={1}>
              SAC 9964 (5% Pure KM) · 10 Custom Visual Themes · Auto-Fill Trips
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={loadData} style={styles.refreshBtn} accessibilityLabel="Refresh">
          <RefreshCw size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Top Segmented Tabs: [Issued] vs [Completed Trips] vs [Invoice Studio] vs [Settings] */}
      <View style={[styles.tabBarContainer, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScroll}>
          <TouchableOpacity
            style={[styles.tabItemPill, activeTab === 'issued' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setActiveTab('issued')}
            activeOpacity={0.8}
          >
            <Receipt size={15} color={activeTab === 'issued' ? '#FFFFFF' : themeColors.textSecondary} />
            <Text style={[styles.tabTextPill, { color: activeTab === 'issued' ? '#FFFFFF' : themeColors.textSecondary }]}>
              Issued Invoices ({invoices.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemPill, activeTab === 'completed' && { backgroundColor: '#10B981', borderColor: '#10B981' }]}
            onPress={() => setActiveTab('completed')}
            activeOpacity={0.8}
          >
            <Car size={15} color={activeTab === 'completed' ? '#FFFFFF' : themeColors.textSecondary} />
            <Text style={[styles.tabTextPill, { color: activeTab === 'completed' ? '#FFFFFF' : themeColors.textSecondary }]}>
              Completed Trips ({completedOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemPill, activeTab === 'generate' && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
            onPress={() => setActiveTab('generate')}
            activeOpacity={0.8}
          >
            <Plus size={15} color={activeTab === 'generate' ? '#FFFFFF' : themeColors.textSecondary} />
            <Text style={[styles.tabTextPill, { color: activeTab === 'generate' ? '#FFFFFF' : themeColors.textSecondary }]}>
              ⚡ Invoice Builder
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemPill, activeTab === 'settings' && { backgroundColor: '#0284C7', borderColor: '#0284C7' }]}
            onPress={() => setActiveTab('settings')}
            activeOpacity={0.8}
          >
            <Settings size={15} color={activeTab === 'settings' ? '#FFFFFF' : themeColors.textSecondary} />
            <Text style={[styles.tabTextPill, { color: activeTab === 'settings' ? '#FFFFFF' : themeColors.textSecondary }]}>
              ⚙️ Business & Branding
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════
          TAB 1: ISSUED TAX INVOICES LEDGER
          ══════════════════════════════════════════════════════ */}
      {activeTab === 'issued' && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Continuous Invoice Sequence Banner */}
          <View style={[styles.seqBanner, { backgroundColor: isDark ? '#082F49' : '#F0F9FF', borderColor: '#0284C7' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 190 }}>
                <Receipt size={18} color="#0284C7" />
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: isDark ? '#38BDF8' : '#0369A1', flexShrink: 1 }}>
                  Continuous Sequence ({seqStatus?.financial_year || 'FY 26-27'})
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <View style={styles.seqBadge}>
                  <Text style={styles.seqBadgeText}>Series: {seqStatus?.series || 'RIDE'}</Text>
                </View>

                {isOwner && (
                  <TouchableOpacity
                    style={styles.editCounterBtn}
                    onPress={() => {
                      setNewSeqNumber(String(seqStatus?.last_number ?? 30));
                      setShowSeqModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Edit2 size={12} color="#0284C7" />
                    <Text style={styles.editCounterBtnText}>Set Counter</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.seqStatsRow}>
              <View style={styles.seqStatCol}>
                <Text style={[styles.seqStatLabel, { color: themeColors.textSecondary }]}>Invoices Issued (FY)</Text>
                <Text style={[styles.seqStatValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  {seqStatus?.last_number != null ? seqStatus.last_number : '30'}
                </Text>
              </View>
              <View style={styles.seqStatDivider} />
              <View style={styles.seqStatCol}>
                <Text style={[styles.seqStatLabel, { color: themeColors.textSecondary }]}>Next Invoice #</Text>
                <Text style={[styles.seqStatValue, { color: '#0284C7' }]}>
                  {seqStatus?.next_invoice_number || 'DC/26-27/INV-031'}
                </Text>
              </View>
            </View>
          </View>

          {/* Overview Financial Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.statCardLabel, { color: themeColors.textSecondary }]}>Total Invoices</Text>
              <Text style={[styles.statCardVal, { color: themeColors.text }]}>{invoices.length}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.statCardLabel, { color: themeColors.textSecondary }]}>Taxable Pure KM</Text>
              <Text style={[styles.statCardVal, { color: themeColors.text }]}>
                ₹{Math.round(totalTaxable).toLocaleString('en-IN')}
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.statCardLabel, { color: themeColors.textSecondary }]}>GST (5%)</Text>
              <Text style={[styles.statCardVal, { color: '#0284C7' }]}>
                ₹{Math.round(totalGst).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          {/* Quick Actions Row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab('generate')}
              activeOpacity={0.85}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Issue New Tax Invoice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryActionBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={handleExportCsv}
              disabled={exportingCsv}
              activeOpacity={0.85}
            >
              {exportingCsv ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <FileSpreadsheet size={16} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: themeColors.text }]}>Export GSTR-1</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Search Bar & Source Filter Chips */}
          <View style={[styles.searchWrap, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Search size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Search by invoice #, customer name, phone, or route..."
              placeholderTextColor={themeColors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterChipsRow}>
            {(['all', 'manual', 'auto'] as const).map((filterKey) => {
              const active = sourceFilter === filterKey;
              const label = filterKey === 'all' ? 'All Invoices' : filterKey === 'manual' ? 'Manual Issued' : 'Auto-Synced GST';
              return (
                <TouchableOpacity
                  key={filterKey}
                  onPress={() => setSourceFilter(filterKey)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? (isDark ? '#082F49' : '#E0F2FE') : themeColors.surface,
                      borderColor: active ? colors.primary : themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? colors.primary : themeColors.textSecondary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Invoices List */}
          <View style={styles.listSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                Issued Tax Invoices ({filteredInvoices.length})
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Sparkles size={12} color={colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>GSTR-1 Ready</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Loading tax invoices...</Text>
              </View>
            ) : filteredInvoices.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <FileText size={32} color={themeColors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Tax Invoices Found</Text>
                <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                  {searchQuery ? 'No invoices match your search.' : 'Bookings confirmed with GST or manual invoices will appear here automatically.'}
                </Text>
              </View>
            ) : (
              filteredInvoices.map((inv) => {
                const items = inv.line_items || {};
                const isDownloading = downloadingId === inv.id;
                const dateStr = inv.created_at
                  ? new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '';
                const isManual = inv.source_type === 'manual';

                return (
                  <View
                    key={inv.id}
                    style={[styles.invoiceCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                  >
                    <View style={styles.invCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.invNumber, { color: colors.primary }]}>{inv.invoice_number}</Text>
                          <View style={[styles.sourceBadge, { backgroundColor: isManual ? '#F59E0B20' : '#10B98120' }]}>
                            <Text style={[styles.sourceBadgeText, { color: isManual ? '#D97706' : '#059669' }]}>
                              {isManual ? 'MANUAL' : 'AUTO-SYNCED GST'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.invDate, { color: themeColors.textSecondary }]}>{dateStr}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.downloadBtn, isDownloading && { opacity: 0.6 }]}
                          onPress={() => handleDownloadPdf(inv)}
                          disabled={isDownloading}
                          activeOpacity={0.8}
                        >
                          {isDownloading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Download size={13} color="#FFFFFF" />
                              <Text style={styles.downloadBtnText}>PDF</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Route & Customer Details */}
                    <View style={styles.invDetailsRow}>
                      <Text style={[styles.invRoute, { color: themeColors.text }]}>
                        {items.pickup || 'Pickup'} &rarr; {items.drop || 'Drop'}
                      </Text>
                      <Text style={[styles.invCustomer, { color: themeColors.textSecondary }]}>
                        {inv.customer_name_snapshot || 'Customer'} · {inv.customer_number_snapshot || ''}
                        {items.booking_id ? ` · Booking #${items.booking_id}` : ''}
                      </Text>
                    </View>

                    {/* Financial Breakdown */}
                    <View style={[styles.invMathBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                      <View style={styles.mathCol}>
                        <Text style={[styles.mathLabel, { color: themeColors.textSecondary }]}>Taxable Pure KM</Text>
                        <Text style={[styles.mathVal, { color: themeColors.text }]}>
                          ₹{Math.round(inv.taxable_value || inv.base_fare || 0).toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <View style={styles.mathCol}>
                        <Text style={[styles.mathLabel, { color: themeColors.textSecondary }]}>GST (5%)</Text>
                        <Text style={[styles.mathVal, { color: colors.primary }]}>
                          ₹{(inv.total_gst_amount || 0).toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <View style={styles.mathCol}>
                        <Text style={[styles.mathLabel, { color: themeColors.textSecondary }]}>Grand Total</Text>
                        <Text style={[styles.mathValBold, { color: '#059669' }]}>
                          ₹{Math.round(inv.total_amount || 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2: COMPLETED TRIPS & INSTANT INVOICE GENERATOR
          ══════════════════════════════════════════════════════ */}
      {activeTab === 'completed' && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header Stats Banner */}
          <View style={[styles.seqBanner, { backgroundColor: isDark ? '#064E3B20' : '#ECFDF5', borderColor: '#10B981' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Car size={18} color="#10B981" />
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>
                  Completed Bookings ({completedOrders.length} Trips)
                </Text>
              </View>
              <View style={[styles.seqBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.seqBadgeText}>1-Tap Invoice Ready</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 4 }}>
              All trips marked completed or executed. Generate official SAC 9964 GST tax invoices, non-GST bills, or WhatsApp receipts instantly!
            </Text>
          </View>

          {/* Search Bar for Completed Trips */}
          <View style={[styles.searchWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, marginBottom: 14 }]}>
            <Search size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Search by customer, phone, route, or booking #..."
              placeholderTextColor={themeColors.textSecondary}
              value={completedSearchQuery}
              onChangeText={setCompletedSearchQuery}
            />
            {completedSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setCompletedSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* List of Completed Bookings */}
          {filteredCompletedOrders.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Car size={32} color={themeColors.textSecondary} style={{ opacity: 0.5, marginBottom: 8 }} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Completed Trips Found</Text>
              <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
                {completedSearchQuery ? 'No trips match your search.' : 'Completed bookings will appear here for instant 1-tap invoice generation.'}
              </Text>
            </View>
          ) : (
            filteredCompletedOrders.map((order) => {
              const { fromCity, toCity } = getOrderAddresses(order);
              const assigned: any = order.assigned_driver || (order.assignments && order.assignments[0]);
              const fare = Number(order.closed_vendor_price || order.vendor_price || order.estimated_price || 0);
              const advance = Number(order.advance_received) || 0;
              const dateStr = order.start_date_time
                ? new Date(order.start_date_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Recent Trip';

              return (
                <View
                  key={String(order.id)}
                  style={[styles.completedTripCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                >
                  {/* Card Header */}
                  <View style={styles.completedTripHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.tripTypeTag, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <Text style={[styles.tripTypeTagText, { color: themeColors.text }]}>
                          #{order.id} · {order.trip_type || 'One Way'}
                        </Text>
                      </View>
                      <View style={styles.completedBadgePill}>
                        <CheckCircle2 size={11} color="#059669" />
                        <Text style={styles.completedBadgeText}>COMPLETED</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontWeight: '600' }}>
                      {dateStr}
                    </Text>
                  </View>

                  {/* Route & Customer Details */}
                  <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={[styles.completedRouteText, { color: themeColors.text }]}>
                      {fromCity || 'Pickup'} <Text style={{ color: colors.primary }}>➔</Text> {toCity || 'Destination'}
                    </Text>

                    <View style={styles.completedMetaRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1.2 }}>
                        <User size={13} color={themeColors.textSecondary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                          {order.customer_name || 'Valued Customer'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                        <Phone size={13} color="#10B981" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>
                          {order.customer_number || 'N/A'}
                        </Text>
                      </View>
                    </View>

                    {assigned && (
                      <View style={[styles.completedMetaRow, { marginTop: 4 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1.2 }}>
                          <Car size={13} color="#8B5CF6" />
                          <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }} numberOfLines={1}>
                            {order.car_type || 'Sedan'} · {assigned.vehicle_number || assigned.reg_id || ''}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <User size={13} color={themeColors.textSecondary} />
                          <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }} numberOfLines={1}>
                            {assigned.driver_name || assigned.full_name || 'Chauffeur'}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Fare Summary Box */}
                    <View style={[styles.completedFareBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                      <View>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600' }}>TOTAL FARE</Text>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#10B981' }}>
                          ₹{fare.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      {advance > 0 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600' }}>ADVANCE PAID</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>
                            ₹{advance.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* 1-Tap Action Buttons */}
                    <View style={styles.completedActionsRow}>
                      <TouchableOpacity
                        style={[styles.completedBtnPrimary, { backgroundColor: '#0284C7' }]}
                        onPress={() => handleGenerateInvoiceFromCompleted(order, true)}
                        activeOpacity={0.8}
                      >
                        <Sparkles size={13} color="#FFFFFF" />
                        <Text style={styles.completedBtnPrimaryText}>⚡ Tax Invoice (GST)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.completedBtnSecondary, { borderColor: themeColors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
                        onPress={() => handlePrintCompletedOrder(order, false)}
                        activeOpacity={0.8}
                      >
                        <FileText size={13} color={themeColors.text} />
                        <Text style={[styles.completedBtnSecondaryText, { color: themeColors.text }]}>Travel Bill</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.completedBtnIcon, { backgroundColor: '#25D366' }]}
                        onPress={() => handleWhatsAppCompletedOrder(order)}
                        activeOpacity={0.8}
                        accessibilityLabel="WhatsApp Receipt"
                      >
                        <MessageCircle size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 3: GENERATE TAX INVOICE & BILL STUDIO
          ══════════════════════════════════════════════════════ */}
      {activeTab === 'generate' && (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 10 Theme Models Selector */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, marginBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                  Invoice Visual Theme (10 Models)
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                {INVOICE_TEMPLATES.find(t => t.id === selectedTemplateId)?.name}
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {INVOICE_TEMPLATES.map((t) => {
                const isSelected = selectedTemplateId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTemplateId(t.id)}
                    activeOpacity={0.8}
                    style={[
                      styles.templateChip,
                      {
                        borderColor: isSelected ? t.primaryColor : (isDark ? '#334155' : '#E2E8F0'),
                        backgroundColor: isSelected ? (isDark ? '#1E293B' : '#F0F9FF') : (isDark ? '#0F172A' : '#FFFFFF'),
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.primaryColor }} />
                    <Text style={{ fontSize: 11.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? (isDark ? '#FFFFFF' : '#0F172A') : themeColors.textSecondary }}>
                      {t.name.replace(/^[0-9]+\.\s*/, '')}
                    </Text>
                    {isSelected && <CheckCircle2 size={12} color={t.primaryColor} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Top Quick Autofill Banner */}
          <TouchableOpacity
            style={[styles.autofillBanner, { backgroundColor: isDark ? '#082F49' : '#F0F9FF', borderColor: '#0284C7' }]}
            onPress={handleOpenAutofill}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Sparkles size={20} color="#0284C7" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0284C7' }}>
                  ⚡ Autofill from Existing Booking / Trip
                </Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                  Tap to search and prefill customer, route, car, driver, and fares with 1 tap!
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color="#0284C7" />
          </TouchableOpacity>

          {/* CARD 1: 👤 Customer & Business Particulars */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <User size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                1. Customer & Corporate Details
              </Text>
            </View>

            {/* Customer Name */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Customer Name *</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <User size={16} color={themeColors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={themeColors.textSecondary}
                  value={customerName}
                  onChangeText={setCustomerName}
                />
              </View>
            </View>

            {/* Customer Phone */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Customer Mobile / WhatsApp *</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <Phone size={16} color="#10B981" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />
              </View>
            </View>

            {/* Customer Email */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email Address (Receives Official PDF)</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <Mail size={16} color="#3B82F6" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="customer@email.com"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                />
              </View>
            </View>

            {/* B2B Company & GSTIN */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Company Name (B2B)</Text>
                <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Building size={16} color={themeColors.textSecondary} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                    placeholder="e.g. TCS / Infosys"
                    placeholderTextColor={themeColors.textSecondary}
                    value={customerCompany}
                    onChangeText={setCustomerCompany}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Customer GSTIN (ITC)</Text>
                <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <ShieldCheck size={16} color="#10B981" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                    placeholder="33AAACM9876A1Z4"
                    placeholderTextColor={themeColors.textSecondary}
                    autoCapitalize="characters"
                    value={customerGstin}
                    onChangeText={setCustomerGstin}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* CARD 2: 📍 Trip Route & Schedule */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MapPin size={18} color="#10B981" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                2. Journey Route & Schedule
              </Text>
            </View>

            {/* Pickup */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Pickup Location *</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <MapPin size={16} color="#10B981" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="e.g. Chennai Central / Airport"
                  placeholderTextColor={themeColors.textSecondary}
                  value={pickup}
                  onChangeText={setPickup}
                />
              </View>
            </View>

            {/* Drop */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Drop Destination *</Text>
              <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                <MapPin size={16} color="#EF4444" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.inputField, { color: themeColors.text }]}
                  placeholder="e.g. Bangalore City / Mysore"
                  placeholderTextColor={themeColors.textSecondary}
                  value={dropLocation}
                  onChangeText={setDropLocation}
                />
              </View>
            </View>

            {/* Date & Time */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Travel Date (YYYY-MM-DD)</Text>
                <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Calendar size={15} color={colors.primary} style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                    value={travelDate}
                    onChangeText={setTravelDate}
                    placeholder="2026-09-27"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Pickup Time</Text>
                <View style={[styles.inputWithIcon, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Clock size={15} color="#8B5CF6" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.inputField, { color: themeColors.text, fontSize: 12 }]}
                    value={travelTime}
                    onChangeText={setTravelTime}
                    placeholder="09:00 AM"
                    placeholderTextColor={themeColors.textSecondary}
                  />
                </View>
              </View>
            </View>

            {/* Trip Type Selector Chips */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Trip Type</Text>
              <View style={styles.chipsRow}>
                {TRIP_TYPES.map((t) => {
                  const active = tripType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setTripType(t)}
                      style={[
                        styles.chipBtn,
                        {
                          backgroundColor: active ? colors.primary : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: active ? colors.primary : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chipBtnText, { color: active ? '#FFFFFF' : themeColors.text }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Vehicle Category Selector Chips */}
            <View>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Vehicle Category</Text>
              <View style={styles.chipsRow}>
                {VEHICLE_CATEGORIES.map((v) => {
                  const active = vehicleType === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setVehicleType(v)}
                      style={[
                        styles.chipBtn,
                        {
                          backgroundColor: active ? colors.primary : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: active ? colors.primary : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chipBtnText, { color: active ? '#FFFFFF' : themeColors.text }]}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* CARD 3: 🚗 Vehicle & Driver Details */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Car size={18} color="#8B5CF6" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                3. Vehicle, Driver & Odometer
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Cab Reg Number</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="TN 01 AB 1234"
                  placeholderTextColor={themeColors.textSecondary}
                  autoCapitalize="characters"
                  value={cabNumber}
                  onChangeText={setCabNumber}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Booking ID Ref</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="e.g. 1042"
                  placeholderTextColor={themeColors.textSecondary}
                  value={bookingId}
                  onChangeText={setBookingId}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Name</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="Driver Full Name"
                  placeholderTextColor={themeColors.textSecondary}
                  value={driverName}
                  onChangeText={setDriverName}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Phone</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="Driver Phone"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="phone-pad"
                  value={driverPhone}
                  onChangeText={setDriverPhone}
                />
              </View>
            </View>

            {/* Starting & Closing KM (Auto-computes distance) */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Starting Odometer KM</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="e.g. 45200"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={startingKm}
                  onChangeText={handleStartingKmChange}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Closing Odometer KM</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="e.g. 45480"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={closingKm}
                  onChangeText={handleClosingKmChange}
                />
              </View>
            </View>
          </View>

          {/* CARD 4: 💰 Itemized Charges (SAC 9964 Pure KM Rules) */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Receipt size={18} color="#059669" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                4. Rates & Itemized Fares (SAC 9964)
              </Text>
            </View>

            {/* Pure KM Distance and Rate */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Distance (KM) *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text, fontWeight: '700' }]}
                  placeholder="150"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Rate / KM (₹) *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text, fontWeight: '700' }]}
                  placeholder="14"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={ratePerKm}
                  onChangeText={setRatePerKm}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Driver Bata (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="300"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={driverBata}
                  onChangeText={setDriverBata}
                />
              </View>
            </View>

            {/* Toll, Permit, Parking */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Tolls (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={tollCharges}
                  onChangeText={setTollCharges}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Permit (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={permitCharges}
                  onChangeText={setPermitCharges}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Parking (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={parkingCharges}
                  onChangeText={setParkingCharges}
                />
              </View>
            </View>

            {/* Hills, Waiting, Night */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Hill Station (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={hillsCharges}
                  onChangeText={setHillsCharges}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Waiting (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={waitingCharges}
                  onChangeText={setWaitingCharges}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Night Bata (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="0"
                  placeholderTextColor={themeColors.textSecondary}
                  keyboardType="numeric"
                  value={nightCharges}
                  onChangeText={setNightCharges}
                />
              </View>
            </View>

            {/* Discount & Advance Paid */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: '#DC2626' }]}>Discount (-₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#FEF2F2', borderColor: '#FCA5A5', color: '#DC2626', fontWeight: '700' }]}
                  placeholder="0"
                  placeholderTextColor="#FCA5A5"
                  keyboardType="numeric"
                  value={discountAmount}
                  onChangeText={setDiscountAmount}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: '#059669' }]}>Advance Paid (₹)</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#ECFDF5', borderColor: '#6EE7B7', color: '#059669', fontWeight: '700' }]}
                  placeholder="0"
                  placeholderTextColor="#6EE7B7"
                  keyboardType="numeric"
                  value={advancePaid}
                  onChangeText={setAdvancePaid}
                />
              </View>
            </View>

            {/* Payment Mode Selector */}
            <View>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Payment Mode</Text>
              <View style={styles.chipsRow}>
                {PAYMENT_MODES.map((mode) => {
                  const active = paymentMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setPaymentMode(mode)}
                      style={[
                        styles.chipBtn,
                        {
                          backgroundColor: active ? (isDark ? '#082F49' : '#E0F2FE') : isDark ? '#1E293B' : '#F1F5F9',
                          borderColor: active ? colors.primary : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chipBtnText, { color: active ? colors.primary : themeColors.text }]}>{mode}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* CARD 5: ⚖️ Tax, Compliance & Notes */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={18} color="#0284C7" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                5. Statutory Tax & Compliance
              </Text>
            </View>

            {/* Include 5% GST Switch */}
            <View style={[styles.toggleRow, { borderColor: themeColors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: themeColors.text }]}>Apply 5% GST (SAC 9964)</Text>
                <Text style={[styles.toggleSub, { color: themeColors.textSecondary }]}>
                  Pure KM transport fare subject to 5% GST without ITC claim
                </Text>
              </View>
              <Switch
                value={includeGst}
                onValueChange={setIncludeGst}
                trackColor={{ false: '#767577', true: colors.primary }}
              />
            </View>

            {/* Interstate IGST Switch */}
            {includeGst && (
              <View style={[styles.toggleRow, { borderColor: themeColors.border, marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleTitle, { color: themeColors.text }]}>Interstate Trip (5% IGST)</Text>
                  <Text style={[styles.toggleSub, { color: themeColors.textSecondary }]}>
                    Enable for trips crossing state boundaries (5% IGST instead of 2.5% CGST + 2.5% SGST)
                  </Text>
                </View>
                <Switch
                  value={isInterstate}
                  onValueChange={setIsInterstate}
                  trackColor={{ false: '#767577', true: '#0284C7' }}
                />
              </View>
            )}

            {/* Remarks / Notes */}
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Remarks / Special Terms (Printed on Invoice)</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text, height: 60 }]}
                placeholder="e.g. AC switched off on ghat road as per safety norms."
                placeholderTextColor={themeColors.textSecondary}
                multiline
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          {/* CARD 6: 🧾 Live Calculation Summary Banner */}
          <View style={[styles.calcBannerCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: '#0284C7' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Receipt size={18} color="#0284C7" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0284C7' }}>
                  INVOICE CALCULATION SUMMARY
                </Text>
              </View>
              <View style={styles.seqBadgeSmall}>
                <Text style={styles.seqBadgeSmallText}>SAC 9964 PURE KM</Text>
              </View>
            </View>

            <View style={styles.summaryItemRow}>
              <Text style={{ fontSize: 12, color: themeColors.text }}>Pure KM Running Fare ({kmDist} KM × ₹{kmRate}):</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>₹{pureKmFare.toLocaleString('en-IN')}</Text>
            </View>

            {includeGst && (
              <View style={styles.summaryItemRow}>
                <Text style={{ fontSize: 12, color: '#0284C7', fontWeight: '600' }}>
                  GST (5% {isInterstate ? 'IGST' : '2.5% CGST + 2.5% SGST'}):
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284C7' }}>+₹{gstCalculated.toLocaleString('en-IN')}</Text>
              </View>
            )}

            {nonTaxableSubtotal > 0 && (
              <View style={styles.summaryItemRow}>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  Non-taxable Additions (Bata, Tolls, Permits):
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>+₹{nonTaxableSubtotal.toLocaleString('en-IN')}</Text>
              </View>
            )}

            {discountVal > 0 && (
              <View style={styles.summaryItemRow}>
                <Text style={{ fontSize: 12, color: '#DC2626' }}>Special Discount Applied:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>-₹{discountVal.toLocaleString('en-IN')}</Text>
              </View>
            )}

            {advanceVal > 0 && (
              <View style={styles.summaryItemRow}>
                <Text style={{ fontSize: 12, color: '#059669' }}>Advance Paid by Customer:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>-₹{advanceVal.toLocaleString('en-IN')}</Text>
              </View>
            )}

            <View style={[styles.summaryGrandRow, { borderTopColor: '#0284C740' }]}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>Total Invoice Amount:</Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#0284C7' }}>₹{grandTotal.toLocaleString('en-IN')}</Text>
            </View>

            {/* Balance Due Pill */}
            <View style={[styles.balancePill, balanceDue > 0 ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#ECFDF5' }]}>
              <Text style={[styles.balancePillText, balanceDue > 0 ? { color: '#B45309' } : { color: '#059669' }]}>
                {balanceDue === 0 ? '✓ PAID IN FULL' : `BALANCE DUE: ₹${balanceDue.toLocaleString('en-IN')}`}
              </Text>
            </View>
          </View>

          {/* Action Bar */}
          <View style={styles.generatorActionRow}>
            {/* Print / Preview Button */}
            <TouchableOpacity
              style={[styles.genSecondaryBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={handlePrintPreview}
              activeOpacity={0.8}
            >
              <Printer size={16} color={themeColors.text} />
              <Text style={[styles.genSecondaryBtnText, { color: themeColors.text }]}>Print / PDF</Text>
            </TouchableOpacity>

            {/* WhatsApp Share Button */}
            <TouchableOpacity
              style={[styles.genSecondaryBtn, { backgroundColor: '#25D366', borderColor: '#25D366' }]}
              onPress={handleShareWhatsApp}
              activeOpacity={0.8}
            >
              <MessageCircle size={16} color="#FFFFFF" />
              <Text style={[styles.genSecondaryBtnText, { color: '#FFFFFF' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Submit Button */}
          <TouchableOpacity
            style={[styles.registerOfficialBtn, submittingOfficial && { opacity: 0.6 }]}
            onPress={handleRegisterOfficialGst}
            disabled={submittingOfficial}
            activeOpacity={0.85}
          >
            {submittingOfficial ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <ShieldCheck size={18} color="#FFFFFF" />
                <Text style={styles.registerOfficialBtnText}>
                  Issue & Register Official GST Tax Invoice
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 4: ⚙️ BUSINESS PROFILE & INVOICING SETTINGS
          ══════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Settings Hub Banner */}
          <View style={[styles.seqBanner, { backgroundColor: isDark ? '#082F49' : '#F0F9FF', borderColor: '#0284C7' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Settings size={18} color="#0284C7" />
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: isDark ? '#38BDF8' : '#0369A1' }}>
                Business Profile & Invoicing Settings Hub
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 4 }}>
              These branding particulars, GST/PAN credentials, helpline contacts, and bank remittance info automatically appear on all generated Invoices, Quotations, and PDF receipts.
            </Text>
          </View>

          {/* SECTION 1: Default Visual Theme */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                  Default Invoice Visual Model (10 Themes)
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                {INVOICE_TEMPLATES.find(t => t.id === selectedTemplateId)?.name}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              {INVOICE_TEMPLATES.map((t) => {
                const isSelected = selectedTemplateId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTemplateId(t.id)}
                    activeOpacity={0.8}
                    style={[
                      styles.templateRowCard,
                      {
                        borderColor: isSelected ? t.primaryColor : (isDark ? '#334155' : '#E2E8F0'),
                        backgroundColor: isSelected ? (isDark ? '#1E293B' : '#F0F9FF') : (isDark ? '#0F172A' : '#FFFFFF'),
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: t.primaryColor }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: isSelected ? '800' : '700', color: themeColors.text }}>
                        {t.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        {t.subtitle}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={[styles.selectedCheckBadge, { backgroundColor: t.primaryColor }]}>
                        <Check size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* SECTION 2: Company Identity & Online Presence */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Building size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                1. Company & Brand Identity
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Company Full Legal Name *</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                value={bizSettings.companyLegalName}
                onChangeText={(val) => setBizSettings({ ...bizSettings, companyLegalName: val })}
                placeholder="e.g. Drop Cars Private Limited"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Brand Display Name *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.brandDisplayName}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, brandDisplayName: val })}
                  placeholder="Drop Cars"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Website Domain *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.domainName}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, domainName: val })}
                  placeholder="dropcars.in"
                  autoCapitalize="none"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Brand Tagline</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                value={bizSettings.tagline}
                onChangeText={(val) => setBizSettings({ ...bizSettings, tagline: val })}
                placeholder="Premium Outstation & One-Way Taxi Network"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>

            <View>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Registered Office Address *</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text, height: 64 }]}
                value={bizSettings.officeAddress}
                onChangeText={(val) => setBizSettings({ ...bizSettings, officeAddress: val })}
                placeholder="No. 12, GST Road, Guindy, Chennai, Tamil Nadu - 600032"
                placeholderTextColor={themeColors.textSecondary}
                multiline
              />
            </View>
          </View>

          {/* SECTION 3: Contact Numbers & Communication */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Phone size={18} color="#10B981" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                2. Helpline, WhatsApp & Support
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Primary Phone *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.primaryPhone}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, primaryPhone: val })}
                  keyboardType="phone-pad"
                  placeholder="7200217986"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Customer Care Helpline</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.customerCareNumber}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, customerCareNumber: val })}
                  keyboardType="phone-pad"
                  placeholder="044-4800-9999"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: '#10B981' }]}>Official WhatsApp Number *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.whatsappNumber}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, whatsappNumber: val })}
                  keyboardType="phone-pad"
                  placeholder="917200217986"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Official Support Email</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.emailId}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, emailId: val })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="support@dropcars.in"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>
          </View>

          {/* SECTION 4: Tax & Legal Compliance */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={18} color="#0284C7" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                3. Tax, GSTIN & SAC Code
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Company GSTIN Number *</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                value={bizSettings.gstin}
                onChangeText={(val) => setBizSettings({ ...bizSettings, gstin: val })}
                autoCapitalize="characters"
                placeholder="GSTIN: 33AAACM9876A1Z4"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Company PAN</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.panNumber}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, panNumber: val })}
                  autoCapitalize="characters"
                  placeholder="AAACM9876A"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Default HSN / SAC Code</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.hsnSacCode}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, hsnSacCode: val })}
                  placeholder="9964"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>
          </View>

          {/* SECTION 5: Bank Remittance & UPI Payments */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CreditCard size={18} color="#8B5CF6" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                4. Bank Account & Remittance Particulars
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Beneficiary Account Name *</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                value={bizSettings.bankAccountName}
                onChangeText={(val) => setBizSettings({ ...bizSettings, bankAccountName: val })}
                placeholder="DROP CARS PRIVATE LIMITED"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Bank Name *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.bankName}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, bankName: val })}
                  placeholder="Axis Bank Ltd"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>Account Number *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.bankAccountNumber}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, bankAccountNumber: val })}
                  keyboardType="numeric"
                  placeholder="924020012345678"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>IFSC Code *</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.bankIfsc}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, bankIfsc: val })}
                  autoCapitalize="characters"
                  placeholder="UTIB0001234"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Branch Name</Text>
                <TextInput
                  style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                  value={bizSettings.bankBranch}
                  onChangeText={(val) => setBizSettings({ ...bizSettings, bankBranch: val })}
                  placeholder="Guindy Chennai"
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
            </View>

            <View>
              <Text style={[styles.inputLabel, { color: '#8B5CF6' }]}>Official UPI Payment ID *</Text>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text }]}
                value={bizSettings.upiId}
                onChangeText={(val) => setBizSettings({ ...bizSettings, upiId: val })}
                autoCapitalize="none"
                placeholder="7200217986-1@okbizaxis"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>
          </View>

          {/* SECTION 6: Terms & Conditions */}
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FileText size={18} color="#EA580C" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
                5. Custom Terms & Conditions (Multi-Line)
              </Text>
            </View>
            <TextInput
              style={[styles.inputBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, color: themeColors.text, height: 120 }]}
              value={bizSettings.termsAndConditions}
              onChangeText={(val) => setBizSettings({ ...bizSettings, termsAndConditions: val })}
              placeholder="Enter standard terms (one per line)..."
              placeholderTextColor={themeColors.textSecondary}
              multiline
            />
          </View>

          {/* Save Settings Button */}
          <TouchableOpacity
            style={[styles.saveSettingsBtn, savingSettings && { opacity: 0.6 }]}
            onPress={handleSaveBusinessSettings}
            disabled={savingSettings}
            activeOpacity={0.85}
          >
            {savingSettings ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={18} color="#FFFFFF" />
                <Text style={styles.saveSettingsBtnText}>
                  Save Business & Invoicing Settings
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL: AUTOFILL FROM RECENT BOOKINGS
          ══════════════════════════════════════════════════════ */}
      <Modal
        visible={showAutofillModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAutofillModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.autofillModalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.autofillModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#0284C7" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Select Booking to Autofill</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAutofillModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search filter for orders */}
            <View style={[styles.searchWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: themeColors.border, marginBottom: 12 }]}>
              <Search size={15} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Search by customer name, phone, or booking #..."
                placeholderTextColor={themeColors.textSecondary}
                value={orderSearchQuery}
                onChangeText={setOrderSearchQuery}
              />
            </View>

            {loadingOrders ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0284C7" />
                <Text style={{ marginTop: 10, color: themeColors.textSecondary }}>Fetching recent bookings...</Text>
              </View>
            ) : filteredOrders.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: themeColors.textSecondary }}>No bookings found.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredOrders}
                keyExtractor={(item) => String(item.id)}
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => {
                  const { fromCity, toCity } = getOrderAddresses(item);
                  const fare = item.closed_vendor_price || item.vendor_price || item.estimated_price || 0;
                  return (
                    <TouchableOpacity
                      style={[styles.orderSelectItem, { borderColor: themeColors.border }]}
                      onPress={() => handleSelectBookingForAutofill(item)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>
                            Booking #{item.id}
                          </Text>
                          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>· {item.trip_type || 'One Way'}</Text>
                        </View>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text, marginTop: 2 }}>
                          {item.customer_name || 'Customer'} · {item.customer_number || ''}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 1 }}>
                          {fromCity || 'Pickup'} ➔ {toCity || 'Drop'}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#059669' }}>
                          ₹{Number(fare).toLocaleString('en-IN')}
                        </Text>
                        <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Tap to Fill</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          MODAL: EDIT SEQUENCE COUNTER (OWNER ONLY)
          ══════════════════════════════════════════════════════ */}
      <Modal
        visible={showSeqModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSeqModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.seqModalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.seqModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Settings size={20} color="#0284C7" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Adjust Invoice Counter</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSeqModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Set the number of invoices issued for FY 26-27. The next issued invoice will automatically take the number following this value.
            </Text>

            <Text style={styles.inputLabel}>Invoices Issued Count (FY 26-27)</Text>
            <TextInput
              style={[styles.inputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, fontSize: 16, fontWeight: '700' }]}
              value={newSeqNumber}
              onChangeText={setNewSeqNumber}
              keyboardType="number-pad"
              placeholder="e.g. 30"
              placeholderTextColor={themeColors.textSecondary}
            />

            <View style={[styles.calcBanner, { backgroundColor: isDark ? '#082F49' : '#F0F9FF', borderColor: '#0284C7', marginTop: 14 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>PREVIEW NEXT INVOICE NUMBER</Text>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0284C7', marginTop: 2 }}>
                DC/26-27/INV-{String((parseInt(newSeqNumber, 10) || 0) + 1).padStart(3, '0')}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                onPress={() => setShowSeqModal(false)}
              >
                <Text style={{ color: themeColors.text, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveSeqBtn, submittingSeq && { opacity: 0.6 }]}
                onPress={handleUpdateSeqCounter}
                disabled={submittingSeq}
              >
                {submittingSeq ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveSeqText}>Save Counter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  refreshBtn: {
    padding: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
  },
  seqBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  seqBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  seqBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  editCounterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C715',
    borderWidth: 1,
    borderColor: '#0284C740',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  editCounterBtnText: {
    color: '#0284C7',
    fontSize: 10.5,
    fontWeight: '800',
  },
  seqStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  seqStatCol: {
    flex: 1,
  },
  seqStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#0284C730',
    marginHorizontal: 16,
  },
  seqStatLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  seqStatValue: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  statCardLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  statCardVal: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  primaryActionBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  invoiceCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  invCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invNumber: {
    fontSize: 14,
    fontWeight: '900',
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  invDate: {
    fontSize: 11,
    marginTop: 1,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  invDetailsRow: {
    marginBottom: 10,
  },
  invRoute: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  invCustomer: {
    fontSize: 11.5,
    marginTop: 2,
  },
  invMathBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  mathCol: {
    alignItems: 'center',
  },
  mathLabel: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  mathVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  mathValBold: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },

  // Generator View Styles
  autofillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  inputBox: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  toggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  toggleSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  calcBannerCard: {
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  seqBadgeSmall: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  seqBadgeSmallText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2.5,
  },
  summaryGrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
  balancePill: {
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  balancePillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  generatorActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  genSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  genSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  registerOfficialBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  registerOfficialBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  autofillModalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  autofillModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  orderSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  seqModalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  seqModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  saveSeqBtn: {
    flex: 1,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveSeqText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  calcBanner: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },

  // Segmented Pill Tabs
  tabBarContainer: {
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  tabBarScroll: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabTextPill: {
    fontSize: 12,
    fontWeight: '700',
  },

  // 10 Theme Models Selector
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  templateRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
  },
  selectedCheckBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Completed Bookings Tab Styles
  completedTripCard: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  completedTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F020',
  },
  tripTypeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tripTypeTagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  completedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#10B98120',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  completedBadgeText: {
    color: '#059669',
    fontSize: 9.5,
    fontWeight: '800',
  },
  completedRouteText: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  completedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  completedFareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 10,
  },
  completedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedBtnPrimary: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 6,
  },
  completedBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  completedBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  completedBtnSecondaryText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  completedBtnIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  // Settings Tab Styles
  saveSettingsBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  saveSettingsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
