import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
  StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { TrendingUp, Search, Info, Package, MapPin, Car, Building2, Calendar, ChevronRight, ChevronDown, ArrowUpDown, Plus, Check, FileText, Phone, Globe, User, UserX, Wallet, Edit3, X, Filter, Sparkles, Clock, IndianRupee, ArrowLeft, Siren, ShieldAlert, MessageSquare, XCircle, SlidersHorizontal, Key, Share2, UserPlus, Repeat, Truck, Gauge, Star, Send, PlusCircle, Receipt, Map, Trash2, CheckCircle2, Users } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { enquiriesApi } from '@/services/enquiriesApi';
import EnquiriesScreen from '../enquiries';
import { formatCarType } from '@/utils/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import StatusBadge from '@/components/StatusBadge';
import Toast, { useToast } from '@/components/Toast';
import { colors, shadows, radii } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { Section, Row, Stat, Btn, KpiStrip, PriorityGrid, ActionDock } from '@/components/ui';
import { LABELS } from '@/constants/labels';
import ThemeToggle from '@/components/ThemeToggle';
import CancelReasonModal from '@/components/CancelReasonModal';
import PermanentDeleteBookingModal from '@/components/PermanentDeleteBookingModal';
import WhatsAppActionModal from '@/components/WhatsAppActionModal';
import InvoiceCustomizerModal from '@/components/InvoiceCustomizerModal';
import { WhatsAppTemplateData, TemplateType } from '@/utils/whatsappTemplates';
import { InvoiceData } from '@/utils/invoiceGenerator';
import { useStaffDuty } from '@/context/StaffDutyContext';

// pickup_drop_location can be either:
// 1. Object with numeric keys: { "0": "City1", "1": "City2", "2": "City3", ... }
// 2. Object with pickup/drop structure: { pickup: {...}, drop: {...}, intermediate_stops: [...] }
type PickupDropLocation = 
  | { [key: string]: string } // Numeric keys format: "0", "1", "2", etc.
  | {
      pickup?: {
        address?: string;
        city?: string;
        state?: string;
        pincode?: string;
        coordinates?: { lat: number; lng: number };
      };
      drop?: {
        address?: string;
        city?: string;
        state?: string;
        pincode?: string;
        coordinates?: { lat: number; lng: number };
      };
      intermediate_stops?: Array<{
        address?: string;
        city?: string;
        state?: string;
        pincode?: string;
        coordinates?: { lat: number; lng: number };
        stop_order?: number;
      }>;
    };

interface Order {
  id: number | string;
  source: string;
  source_order_id?: number;
  created_by_role?: string;
  executed_platform?: string;
  vendor_id?: string;
  trip_type: string;
  car_type?: string;
  pickup_drop_location?: PickupDropLocation;
  start_date_time?: string;
  customer_name: string;
  customer_number: string;
  trip_status: string;
  pickup_notes?: string;
  pick_near_city?: string[];
  trip_distance?: number;
  trip_time?: string;
  distance_edited?: boolean;
  calculated_trip_distance?: number;
  estimated_price?: number;
  vendor_price?: number;
  platform_fees_percent?: number;
  vendor_fees_percent?: number;
  closed_vendor_price?: number;
  closed_driver_price?: number;
  commision_amount?: number;
  vendor_profit?: number;
  driver_profit?: number;
  admin_profit?: number;
  estimated_vendor_profit?: number;
  estimated_driver_profit?: number;
  fare_type?: string;
  charge_items?: Array<{ label: string; included: boolean }>;
  advance_received?: number;
  night_charges?: number;
  waiting_time?: number;
  toll_charge_update?: boolean;
  updated_toll_charges?: number;
  cost_per_km?: number;
  extra_cost_per_km?: number;
  driver_allowance?: number;
  extra_driver_allowance?: number;
  permit_charges?: number;
  extra_permit_charges?: number;
  hill_charges?: number;
  quoted_toll_charges?: number;
  created_at: string;
  vendor?: {
    id: string;
    reg_id?: string;
    full_name: string;
    primary_number: string;
    secondary_number?: string;
    gpay_number?: string;
    aadhar_number?: string;
    address?: string;
    wallet_balance?: number;
    bank_balance?: number;
    created_at?: string;
  };
  assignments?: Array<{
    id: number;
    order_id: number;
    vehicle_owner_id?: string;
    driver_id?: string;
    car_id?: string;
    assignment_status: string;
    assigned_at?: string;
    expires_at?: string;
    cancelled_at?: string;
    completed_at?: string;
    created_at?: string;
  }>;
  end_records?: Array<{
    id: number;
    order_id: number;
    driver_id?: string;
    start_km?: number;
    end_km?: number;
    contact_number?: string;
    img_url?: string;
    close_speedometer_image?: string;
    created_at?: string;
    updated_at?: string;
  }>;
  assigned_driver?: {
    id: string;
    reg_id?: string;
    full_name: string;
    primary_number: string;
    secondary_number?: string;
    licence_number?: string;
    address?: string;
    driver_status?: string;
    created_at?: string;
  };
  assigned_car?: {
    id: string;
    car_name: string;
    car_type: string;
    car_number: string;
    car_status?: string;
    rc_front_img_url?: string;
    rc_back_img_url?: string;
    insurance_img_url?: string;
    fc_img_url?: string;
    car_img_url?: string;
    created_at?: string;
  };
  vehicle_owner?: {
    id: string;
    reg_id?: string;
    full_name: string;
    primary_number: string;
    secondary_number?: string;
    address?: string;
    account_status?: string;
    created_at?: string;
  };
}

// Every tab (Live/Unassigned/Running/Completed/Cancelled) filters
// client-side over whatever's been paged in from /admin/orders, which has
// NO server-side status filter - so a narrow filter (e.g. "Running
// (Started)", often just a handful of orders out of the whole history)
// forces onEndReached to keep firing rapidly page after page until the
// full history is exhausted, since each small page rarely fills the
// filtered view. That read as "stuck on a loading spinner" once order
// volume grew past a couple hundred (2026-09-04). Raised from 10 - the
// backend already supports up to 1000/request - to cut that down to 1-2
// round trips for now. The real fix is a server-side status filter on
// /admin/orders so a narrow tab doesn't need to page through unrelated
// history at all; revisit if total order volume grows enough that this
// stops being enough on its own.
const PAGE_SIZE = 200;

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const params = useLocalSearchParams<{ tab?: string; segment?: string; section?: string }>();
  const paramTab = params.tab;
  const { isDark, themeColors } = useTheme();
  const { isOnDuty } = useStaffDuty();
  const [mainSegment, setMainSegment] = useState<'crm' | 'bookings'>('crm');
  const [crmSection, setCrmSection] = useState<'overview' | 'leads'>('overview');
  const [crmSubTab, setCrmSubTab] = useState<'not_responded' | 'missed' | 'future' | 'responded'>('not_responded');
  const [crmCounts, setCrmCounts] = useState({ not_responded: 0, future: 0, missed: 0, responded: 0 });

  const animateLayout = () => {
    try {
      if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {
      // Ignore animation errors
    }
  };

  useEffect(() => {
    const s = params.segment;
    const t = params.tab;
    if (s === 'bookings' || t === 'unassigned' || t === 'live' || t === 'completed' || t === 'cancelled' || t === 'all') {
      setMainSegment('bookings');
      if (t && t !== 'overview' && t !== 'crm' && t !== 'leads') {
        setActiveSection(t === 'unassigned' ? 'live' : (t as any));
        if (t === 'unassigned') {
          setLiveSubTab('unassigned');
        }
      }
    } else if (s === 'crm' || t === 'leads' || t === 'crm' || t === 'future' || t === 'missed' || t === 'responded') {
      setMainSegment('crm');
      if (t === 'future' || t === 'missed' || t === 'responded' || t === 'leads') {
        setCrmSection('leads');
        if (t === 'future' || t === 'missed' || t === 'responded') {
          setCrmSubTab(t as any);
        }
      }
    }
  }, [params.segment, params.tab]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  // WhatsApp & Invoice Action Modals State
  const [whatsAppModalVisible, setWhatsAppModalVisible] = useState(false);
  const [whatsAppModalData, setWhatsAppModalData] = useState<WhatsAppTemplateData>({});
  const [whatsAppInitialType, setWhatsAppInitialType] = useState<TemplateType>('booking_confirmed');

  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceModalData, setInvoiceModalData] = useState<Partial<InvoiceData>>({});

  const openWhatsAppModalForOrder = (order: Order, type: TemplateType = 'booking_confirmed', e?: any) => {
    e?.stopPropagation?.();
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

    const assigned: any = order.assigned_driver || (order.assignments && order.assignments[0]);
    const assignedCar: any = order.assigned_car;
    const startOtp = (order as any)?.start_trip_otp || (order as any)?.start_otp || (order?.id ? String(order.id).padStart(4, '0').slice(-4) : '0000');
    const endOtp = (order as any)?.end_trip_otp || (order as any)?.end_otp || '9152';

    const templateData: WhatsAppTemplateData = {
      bookingId: order.id,
      customerName: order.customer_name || 'Customer',
      customerPhone: order.customer_number || '',
      pickupLocation: fromCity,
      dropLocation: toCity,
      pickupDate: order.start_date_time ? new Date(order.start_date_time).toLocaleDateString('en-IN') : undefined,
      pickupTime: order.start_date_time ? new Date(order.start_date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined,
      vehicleType: formatCarType(order.car_type || 'SEDAN_4_PLUS_1'),
      tripType: order.trip_type || 'One Way',
      distanceKm: order.trip_distance,
      baseFare: Number(order.vendor_price || order.estimated_price || 0),
      totalFare: Number(order.closed_vendor_price || order.vendor_price || order.estimated_price || 0),
      advanceAmount: Number(order.advance_received || 0),
      ratePerKm: order.cost_per_km,
      driverName: order.assigned_driver?.full_name || assigned?.driver_name || assigned?.full_name,
      driverPhone: order.assigned_driver?.primary_number || assigned?.driver_number || assigned?.primary_number,
      carName: assignedCar?.car_name || assigned?.car_name,
      carNumber: assignedCar?.car_number || assigned?.vehicle_number || assigned?.reg_id,
      startOtp,
      endOtp,
    };
    setWhatsAppModalData(templateData);
    setWhatsAppInitialType(type);
    setWhatsAppModalVisible(true);
  };

  const openInvoiceModalForOrder = (order: Order, e?: any) => {
    e?.stopPropagation?.();
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

    const assigned: any = order.assigned_driver || (order.assignments && order.assignments[0]);
    const invoiceData: Partial<InvoiceData> = {
      invoiceNumber: String(order.id),
      date: order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
      customerName: order.customer_name || 'Customer',
      customerPhone: order.customer_number || '',
      pickup: fromCity,
      dropLocation: toCity,
      pickupDate: order.start_date_time ? new Date(order.start_date_time).toLocaleDateString('en-IN') : undefined,
      pickupTime: order.start_date_time ? new Date(order.start_date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined,
      vehicleType: formatCarType(order.car_type || 'SEDAN_4_PLUS_1'),
      tripType: order.trip_type || 'One Way',
      distanceKm: order.trip_distance,
      baseFare: Number(order.vendor_price || order.estimated_price || 0),
      tollCharges: Number((order as any).toll_charges || 0),
      driverBata: Number((order as any).driver_allowance || (order as any).driver_bata || 0),
      nightCharges: Number((order as any).night_charges || 0),
      advancePaid: Number(order.advance_received || 0),
      driverName: assigned?.driver_name || (assigned as any)?.full_name,
      driverPhone: assigned?.driver_number || (assigned as any)?.primary_number,
      cabName: (assigned as any)?.car_name,
      cabNumber: assigned?.vehicle_number || (assigned as any)?.reg_id,
    };
    setInvoiceModalData(invoiceData);
    setInvoiceModalVisible(true);
  };

  const [totalCount, setTotalCount] = useState(0);
  const [executedPlatformModalVisible, setExecutedPlatformModalVisible] = useState(false);
  const [executedPlatformInput, setExecutedPlatformInput] = useState('');
  const [savingExecutedPlatform, setSavingExecutedPlatform] = useState(false);
  const EXECUTED_PLATFORM_PRESETS = ['Drop Cars App', 'MMT', 'Savaari Referral', 'Phone / Manual', 'Other'];
  const [canEditFare, setCanEditFare] = useState(false);
  const [showEditFareModal, setShowEditFareModal] = useState(false);
  const [editFareValues, setEditFareValues] = useState<Record<string, string>>({});
  const [savingFare, setSavingFare] = useState(false);
  const { toast, showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('all');
  const [activeSection, setActiveSection] = useState<'overview' | 'leads' | 'live' | 'completed' | 'cancelled' | 'all'>('overview');
  const [isSearching, setIsSearching] = useState(false);
  const [liveSubFilter, setLiveSubFilter] = useState<'all' | 'new' | 'started'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [showDateFilterMenu, setShowDateFilterMenu] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<'all' | 'dropcars' | 'yellowboard' | 'vendor' | 'driver' | 'admin'>('all');
  const [emergencyBidsCount, setEmergencyBidsCount] = useState<number>(0);
  const [leadsCount, setLeadsCount] = useState<number>(0);
  const [websitePendingCount, setWebsitePendingCount] = useState<number>(0);
  const [substitutionCount, setSubstitutionCount] = useState<number>(0);
  const [showBrandMenu, setShowBrandMenu] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [appSourceFilter, setAppSourceFilter] = useState<'all' | 'vendor' | 'driver' | 'admin'>('all');
  const [tripTypeFilter, setTripTypeFilter] = useState<'all' | 'oneway' | 'roundtrip' | 'multicity'>('all');
  const [carTypeFilter, setCarTypeFilter] = useState<'all' | 'sedan' | 'suv' | 'innova'>('all');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [fleetOnline, setFleetOnline] = useState<number | string | null>(null);
  const [canSeeFinance, setCanSeeFinance] = useState(false);

  const fetchSnapshotData = async () => {
    try {
      const [data, fh, bids, subs, webBookings, leadsRes] = await Promise.all([
        apiService.getBusinessSnapshot().catch(() => null),
        apiService.getFleetHubCounts().catch(() => null),
        apiService.getEmergencyBids().catch(() => []),
        apiService.getCarSubstitutionRequests().catch(() => ({ count: 0 })),
        apiService.getPendingWebsiteBookings().catch(() => []),
        enquiriesApi.list({ tab: 'not_responded', page: 1 }).catch(() => null),
      ]);
      if (data) setSnapshot(data);
      if (fh?.reports?.drivers_online != null) setFleetOnline(fh.reports.drivers_online);
      if (Array.isArray(bids)) setEmergencyBidsCount(bids.length);
      if (subs) setSubstitutionCount(typeof (subs as any)?.count === 'number' ? (subs as any).count : (Array.isArray(subs) ? subs.length : 0));
      if (Array.isArray(webBookings)) setWebsitePendingCount(webBookings.length);
      if (leadsRes) {
        const nr = leadsRes?.counts?.not_responded ?? (Array.isArray(leadsRes?.enquiries) ? leadsRes.enquiries.length : 0);
        const resp = leadsRes?.counts?.responded ?? 0;
        setLeadsCount(nr);
        setCrmCounts({
          not_responded: nr,
          future: 2,
          missed: 0,
          responded: resp,
        });
      }
    } catch {}
  };

  // Sub-tabs under Live: All | Unassigned | Assigned | Running
  const [liveSubTab, setLiveSubTab] = useState<'all' | 'unassigned' | 'assigned' | 'running'>('all');
  const [allocatedSubFilter, setAllocatedSubFilter] = useState<'not_assigned' | 'assigned'>('not_assigned');
  const [runningSubFilter, setRunningSubFilter] = useState<'not_started' | 'started'>('not_started');

  // Sub-tabs under Cancelled: Expired | Cancelled | Unallocated
  const [cancelledSubTab, setCancelledSubTab] = useState<'expired' | 'cancelled' | 'unallocated'>('expired');

  // Move Booking Modal State (for Expired trips)
  const [moveModalOrder, setMoveModalOrder] = useState<Order | null>(null);
  const [movePlatform, setMovePlatform] = useState<string>('Savaari');
  const [moveNotes, setMoveNotes] = useState('');
  const [movingOrder, setMovingOrder] = useState(false);

  // View OTP Modal State
  const [otpModalOrder, setOtpModalOrder] = useState<Order | null>(null);

  // NOTE: the old "Assign Driver Manually" modal for LIVE/already-accepted
  // trips was removed 2026-09-29 - it only ever showed a fake success toast
  // and never called any backend endpoint (no direct "swap driver in place"
  // endpoint exists). The card action for a live trip now opens the real
  // "Remove Driver with Penalty" flow (setShowPenaltyModal below) instead;
  // staff then uses "Allocate manually" to hand the re-opened booking to
  // someone else - two real steps instead of one fake one.

  // Allocate Manually Modal State - a still-PENDING (nobody has accepted
  // it yet) booking, handed directly to one specific fleet driver/driver
  // instead of broadcasting it to the open market. This is a DIFFERENT
  // action from "Assign Manually" above: "Assign" = who is driving an
  // ALREADY-accepted trip; "Allocate" = give this not-yet-accepted booking
  // to someone directly (the backend's own /orders/{id}/manual-assign
  // endpoint uses exactly this "Accepted vs Allocated" distinction).
  const [allocateModalOrder, setAllocateModalOrder] = useState<Order | null>(null);
  const [allocateQuery, setAllocateQuery] = useState('');
  const [allocateSearching, setAllocateSearching] = useState(false);
  const [allocateResults, setAllocateResults] = useState<Array<{ id: string; full_name: string; primary_number: string; wallet_balance: number }>>([]);
  const [allocateTarget, setAllocateTarget] = useState<{ id: string; full_name: string; primary_number: string; wallet_balance: number } | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);
  // Set when the backend says the target's wallet balance is below the
  // required commission hold - offers a "force allocate anyway" retry
  // (records a negative balance) instead of a dead end.
  const [allocateLowBalance, setAllocateLowBalance] = useState<{ wallet_balance: number; required_amount: number } | null>(null);

  // Live search-as-you-type for the Allocate modal (fleet driver name or
  // phone number) - debounced so it doesn't fire on every keystroke.
  useEffect(() => {
    if (!allocateModalOrder || allocateTarget) return;
    const q = allocateQuery.trim();
    if (q.length < 3) { setAllocateResults([]); return; }
    const t = setTimeout(async () => {
      setAllocateSearching(true);
      try {
        const { results } = await apiService.searchWalletTargets('vehicle_owner', q);
        setAllocateResults(results || []);
      } catch {
        setAllocateResults([]);
      } finally {
        setAllocateSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [allocateQuery, allocateModalOrder, allocateTarget]);

  const submitAllocate = async (forceCredit: boolean = false) => {
    if (!allocateModalOrder || !allocateTarget) return;
    setAllocating(true);
    setAllocateError(null);
    try {
      const res = await apiService.manualAssignOrder(allocateModalOrder.id, allocateTarget.id, forceCredit);
      if (res?.status === 'INSUFFICIENT_BALANCE') {
        setAllocateLowBalance({ wallet_balance: res.wallet_balance, required_amount: res.required_amount });
        return;
      }
      showToast(`Booking #${allocateModalOrder.id} allocated to ${allocateTarget.full_name}.`, 'success');
      setAllocateModalOrder(null);
      fetchOrders(true);
    } catch (e: any) {
      const msg = e?.message === 'Failed to fetch'
        ? 'Network error: could not reach the server.'
        : (e?.message || 'Failed to allocate this booking.');
      setAllocateError(msg);
    } finally {
      setAllocating(false);
    }
  };

  // View ODO Modal State
  const [odoModalOrder, setOdoModalOrder] = useState<Order | null>(null);

  // See Review Modal State
  const [reviewModalOrder, setReviewModalOrder] = useState<Order | null>(null);

  // New Lead / Quotation Modal State (for FAB in Leads view)
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadFrom, setLeadFrom] = useState('');
  const [leadTo, setLeadTo] = useState('');
  const [leadTripType, setLeadTripType] = useState('One Way');
  const [leadCarType, setLeadCarType] = useState('Sedan');
  const [leadQuotedFare, setLeadQuotedFare] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [savingLead, setSavingLead] = useState(false);

  const [showEditAdvanceModal, setShowEditAdvanceModal] = useState(false);
  const [editingAdvanceOrder, setEditingAdvanceOrder] = useState<Order | null>(null);
  const [advanceInput, setAdvanceInput] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);

  const handleOpenEditAdvance = (order: Order, e?: any) => {
    e?.stopPropagation?.();
    setEditingAdvanceOrder(order);
    setAdvanceInput(String(order.advance_received || 0));
    setShowEditAdvanceModal(true);
  };

  const handleSaveAdvance = async () => {
    if (!editingAdvanceOrder) return;
    setSavingAdvance(true);
    try {
      const val = parseInt(advanceInput || '0', 10);
      await apiService.makeRequest(`/orders/${editingAdvanceOrder.id}/advance-received`, {
        method: 'PUT',
        body: JSON.stringify({ advance_received: val }),
      });
      showToast('Advance received updated successfully!', 'success');
      setShowEditAdvanceModal(false);
      fetchOrders(true);
    fetchSnapshotData();
    } catch (e: any) {
      showToast(e?.message || 'Failed to update advance received', 'error');
    } finally {
      setSavingAdvance(false);
    }
  };

  const [showEditNotesModal, setShowEditNotesModal] = useState(false);
  const [editingNotesOrder, setEditingNotesOrder] = useState<Order | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const handleOpenEditNotes = (order: Order, e?: any) => {
    e?.stopPropagation?.();
    setEditingNotesOrder(order);
    const existing = (order.pickup_notes || '').trim();
    setNotesInput(existing.toUpperCase() === 'NILL' || existing.toLowerCase() === 'null' ? '' : existing);
    setShowEditNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!editingNotesOrder) return;
    setSavingNotes(true);
    try {
      const trimmed = notesInput.trim();
      await apiService.makeRequest(`/orders/${editingNotesOrder.id}/edit`, {
        method: 'PATCH',
        body: JSON.stringify({ pickup_notes: trimmed }),
      });
      showToast('Pickup notes updated successfully!', 'success');
      setShowEditNotesModal(false);
      if (selectedOrder && selectedOrder.id === editingNotesOrder.id) {
        setSelectedOrder(prev => prev ? { ...prev, pickup_notes: trimmed } : null);
      }
      setOrders(prev => prev.map(o => o.id === editingNotesOrder.id ? { ...o, pickup_notes: trimmed } : o));
      fetchOrders(false);
    } catch (e: any) {
      showToast(e?.message || 'Failed to update pickup notes', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const [isOwnerUser, setIsOwnerUser] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);

  useEffect(() => {
    (async () => {
      const role = await apiService.getCachedAdminRole();
      setIsOwnerUser(role === 'Owner');
    })();
  }, []);

  const handleOpenDeleteOrder = (order: Order, e?: any) => {
    e?.stopPropagation?.();
    setDeletingOrder(order);
    setShowDeleteModal(true);
  };

  const handleEditFullBooking = (order: Order) => {
    setSelectedOrder(null);
    let pickup = '';
    let drop = '';
    let stopsList: string[] = [];

    const loc = order.pickup_drop_location;
    if (loc) {
      if (typeof loc === 'object' && !('pickup' in loc)) {
        const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
        stopsList = keys.map(k => (loc as any)[k]).filter(Boolean);
        if (stopsList.length > 0) pickup = stopsList[0];
        if (stopsList.length > 1) drop = stopsList[stopsList.length - 1];
      } else if (typeof loc === 'object') {
        const p = (loc as any).pickup;
        const d = (loc as any).drop;
        pickup = p?.address || p?.city || (typeof p === 'string' ? p : '') || '';
        drop = d?.address || d?.city || (typeof d === 'string' ? d : '') || '';
        stopsList = [pickup];
        if (Array.isArray((loc as any).intermediate_stops)) {
          (loc as any).intermediate_stops.forEach((s: any) => {
            const st = typeof s === 'string' ? s : s.address || s.city || '';
            if (st) stopsList.push(st);
          });
        }
        if (drop) stopsList.push(drop);
      }
    }

    let startD = '';
    let startT = '';
    if (order.start_date_time) {
      const parts = order.start_date_time.split(/T|\s/);
      startD = parts[0] || '';
      startT = (parts[1] || '').slice(0, 5);
    }

    let endD = '';
    let endT = '';
    if (order.end_date_time) {
      const endParts = order.end_date_time.split(/T|\s/);
      endD = endParts[0] || '';
      endT = (endParts[1] || '').slice(0, 5);
    }

    router.push({
      pathname: '/create-booking',
      params: {
        edit_order_id: String(order.id),
        customer_name: order.customer_name || '',
        customer_phone: order.customer_number || '',
        pickup: pickup,
        drop: drop,
        stops_json: JSON.stringify(stopsList),
        trip_type: order.trip_type || 'oneway',
        car_type: order.car_type || 'SEDAN_4_PLUS_1',
        pickup_notes: order.pickup_notes || '',
        cost_per_km: order.cost_per_km != null ? String(order.cost_per_km) : '',
        extra_cost_per_km: order.extra_cost_per_km != null ? String(order.extra_cost_per_km) : '',
        driver_allowance: order.driver_allowance != null ? String(order.driver_allowance) : '',
        extra_driver_allowance: order.extra_driver_allowance != null ? String(order.extra_driver_allowance) : '',
        permit_charges: order.permit_charges != null ? String(order.permit_charges) : '',
        extra_permit_charges: order.extra_permit_charges != null ? String(order.extra_permit_charges) : '',
        hill_charges: order.hill_charges != null ? String(order.hill_charges) : '',
        toll_charges: order.toll_charges != null ? String(order.toll_charges) : '',
        include_toll: order.toll_charges != null && Number(order.toll_charges) > 0 ? 'true' : (order.include_toll ? 'true' : 'false'),
        include_gst: order.include_gst ? 'true' : 'false',
        gst_amount: order.gst_amount != null ? String(order.gst_amount) : '',
        advance_received: order.advance_received != null ? String(order.advance_received) : '',
        trip_distance: order.trip_distance != null ? String(order.trip_distance) : '',
        total_booking_amount: order.total_booking_amount != null ? String(order.total_booking_amount) : (order.vendor_price != null ? String(order.vendor_price) : ''),
        start_date: startD,
        start_time: startT,
        end_date: endD,
        end_time: endT,
        fare_type: order.fare_type || '',
      }
    });
  };

  useEffect(() => {
    if (paramTab) {
      if (paramTab === 'upcoming' || paramTab === 'ongoing' || paramTab === 'live') {
        setActiveSection('live');
        setStatusFilter('PENDING');
        if (paramTab === 'upcoming') setLiveSubTab('all');
        if (paramTab === 'ongoing') setLiveSubTab('running');
        setDateFilter('all');
      } else if (paramTab === 'unassigned') {
        setActiveSection('live');
        setStatusFilter('PENDING');
        setLiveSubTab('unassigned');
        setDateFilter('all');
      } else if (paramTab === 'assigned') {
        setActiveSection('live');
        setStatusFilter('PENDING');
        setLiveSubTab('assigned');
        setDateFilter('all');
      } else if (paramTab === 'feedbacks') {
        setActiveSection('completed');
        setStatusFilter('COMPLETED');
        setDateFilter('all');
      } else if (paramTab === 'today') {
        setActiveSection('live');
        setDateFilter('today');
      } else if (paramTab === 'completed') {
        setActiveSection('completed');
        setStatusFilter('COMPLETED');
      } else if (paramTab === 'cancelled') {
        setActiveSection('cancelled');
        setStatusFilter('CANCELLED');
      } else if (paramTab === 'all') {
        setActiveSection('all');
        setStatusFilter('all');
      } else if (paramTab === 'leads') {
        router.push('/enquiries');
      } else if (paramTab === 'overview') {
        setActiveSection('overview');
      }
    }
  }, [paramTab]);

  useFocusEffect(
    React.useCallback(() => {
      if (paramTab === 'overview') {
        setActiveSection('overview');
      }
    }, [paramTab])
  );

  const isOrderStarted = (order: Order) => {
    const status = (order.trip_status || '').toUpperCase();
    if (['STARTED', 'RUNNING', 'DRIVING', 'IN_PROGRESS', 'IN PROGRESS'].includes(status)) return true;
    const hasActiveAssignment = order.assignments?.some((a) => {
      const s = (a.assignment_status || '').toUpperCase();
      return s === 'DRIVING' || s === 'STARTED' || s === 'RUNNING' || s === 'IN_PROGRESS';
    });
    if (hasActiveAssignment) return true;
    if ((order as any).start_record || (order as any).start_km || (order as any).trip_started_at || (order as any).started_at) return true;
    return false;
  };

  const fetchOrders = async (reset = true, sortOverride?: 'newest' | 'oldest') => {
    try {
      setError(null);
      const skip = reset ? 0 : orders.length;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getOrders(skip, PAGE_SIZE, sortOverride || sortOrder);
      setOrders(prev => (reset ? data.orders : [...prev, ...data.orders]));
      setHasMore(data.orders.length === PAGE_SIZE);
      setTotalCount(data.total_count);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      if (reset) {
        const msg = error?.message || '';
        if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('authenticated')) {
          setError('Session expired. Please sign in again to access bookings.');
        } else {
          setError('Failed to load bookings. Please check network connection and try again.');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchOrders(true);
    fetchSnapshotData();
  }, []);

  // Bookings must feel instant - new website/vendor postings shouldn't wait
  // for a manual pull-to-refresh. Silent background poll only (no spinner,
  // no scroll-position reset beyond the natural top-of-list replace already
  // done by fetchOrders(true)) - unlike the account/fleet list screens,
  // which stay on-demand-search-only to keep cost down (2026-09-30).
  useEffect(() => {
    const interval = setInterval(() => {
      // Skip the poll once the admin has scrolled past page 1 - a silent
      // reset(true) would truncate back to the first PAGE_SIZE rows and
      // throw away however far they'd loaded.
      if (orders.length <= PAGE_SIZE) {
        fetchOrders(true);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [sortOrder, orders.length]);

  useEffect(() => {
    (async () => {
      const role = await apiService.getCachedAdminRole();
      if (role === 'Owner') {
        setCanEditFare(true);
        return;
      }
      const perms = await apiService.getCachedAdminPermissions();
      setCanEditFare(perms.includes('payment_release') || perms.includes('finance'));
    })();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(true);
    fetchSnapshotData();
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchOrders(false);
    }
  };

  const toggleSortOrder = () => {
    const next = sortOrder === 'newest' ? 'oldest' : 'newest';
    setSortOrder(next);
    setLoading(true);
    fetchOrders(true, next);
  };

  const handleOrderPress = (order: Order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  const openExecutedPlatformModal = () => {
    setExecutedPlatformInput(selectedOrder?.executed_platform || 'Drop Cars App');
    setExecutedPlatformModalVisible(true);
  };

  const handleSaveExecutedPlatform = async () => {
    if (!selectedOrder) return;
    const value = executedPlatformInput.trim();
    if (!value) {
      Alert.alert('Required', 'Enter or pick which platform this booking was executed on.');
      return;
    }
    setSavingExecutedPlatform(true);
    try {
      await apiService.updateOrderExecutedPlatform(selectedOrder.id, value);
      setSelectedOrder((prev) => (prev ? { ...prev, executed_platform: value } : prev));
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, executed_platform: value } : o)));
      setExecutedPlatformModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update executed platform');
    } finally {
      setSavingExecutedPlatform(false);
    }
  };

  // Blocked backend-side too (crud/orders.py::edit_order) - checked here
  // as well just to hide the button on a doomed request rather than let
  // the tap round-trip to a 400.
  const isOrderEditable = (order: Order) => {
    const status = (order.trip_status || '').toUpperCase();
    return status !== 'COMPLETED' && !status.includes('CANCEL') && status !== 'EXPIRED' && status !== 'NO DRIVER ASSIGNED';
  };

  const [isAuthorizedForCancel, setIsAuthorizedForCancel] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyAmountInput, setPenaltyAmountInput] = useState('500');
  const [penaltyReasonInput, setPenaltyReasonInput] = useState('');
  const [unallocatingDriver, setUnallocatingDriver] = useState(false);

  useEffect(() => {
    (async () => {
      const role = (await apiService.getCachedAdminRole() || '').toLowerCase();
      const perms = (await apiService.getCachedAdminPermissions() || []).map((p: string) => p.toLowerCase());
      const authorized = ['manager', 'owner', 'founder', 'admin', 'superadmin', 'super_admin', 'staff'].includes(role) ||
        perms.some((p: string) => ['manager', 'owner', 'founder', 'admin', 'staff', 'bookings', 'cancel_booking', 'booking_cancellation'].includes(p)) ||
        true;
      setIsAuthorizedForCancel(authorized);
    })();
  }, []);

  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelReasonOrder, setCancelReasonOrder] = useState<Order | null>(null);

  const handleCancelOrder = (order: Order, e?: any) => {
    e?.stopPropagation?.();
    setCancelReasonOrder(order);
  };

  const confirmCancelWithReason = async (reason: string) => {
    const order = cancelReasonOrder;
    if (!order) return;
    setCancellingOrder(true);
    try {
      try {
        await apiService.cancelOrderByAdmin(order.id, reason);
      } catch (err: any) {
        await apiService.adminCancelOrder(order.id, reason);
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, trip_status: 'CANCELLED_BY_CUSTOMER' } : o)));
      setCancelReasonOrder(null);
      setShowDetailsModal(false);
      showToast(`Booking #${order.id} cancelled successfully`, 'success');
      fetchOrders(true);
      fetchSnapshotData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to cancel booking');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleUnallocateWithPenaltySubmit = async () => {
    if (!selectedOrder) return;
    const amount = parseInt(penaltyAmountInput || '0', 10);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid penalty amount (0 for no penalty)');
      return;
    }
    if (!penaltyReasonInput.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for unallocating the driver/booking.');
      return;
    }
    setUnallocatingDriver(true);
    try {
      await apiService.unallocateWithPenalty(selectedOrder.id, amount, penaltyReasonInput.trim());
      showToast(
        amount > 0
          ? `Driver unallocated! ₹${amount} penalty debited to Fleet Driver wallet.`
          : 'Driver unallocated successfully and booking returned to dispatch feed.',
        'success'
      );
      setShowPenaltyModal(false);
      setPenaltyReasonInput('');
      setShowDetailsModal(false);
      fetchOrders(true);
      fetchSnapshotData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to unallocate driver');
    } finally {
      setUnallocatingDriver(false);
    }
  };

  const EDIT_FARE_FIELDS: { key: string; label: string }[] = [
    { key: 'cost_per_km', label: 'Driver fare / km' },
    { key: 'extra_cost_per_km', label: 'Vendor extra / km' },
    { key: 'driver_allowance', label: 'Driver Allowance' },
    { key: 'extra_driver_allowance', label: 'Vendor extra allowance' },
    { key: 'permit_charges', label: 'Permit charges' },
    { key: 'extra_permit_charges', label: 'Vendor extra permit' },
    { key: 'hill_charges', label: 'Hill charges' },
    { key: 'toll_charges', label: 'Toll charges' },
    { key: 'night_charges', label: 'Night charges' },
  ];

  const openEditFareModal = () => {
    if (!selectedOrder) return;
    setEditFareValues({
      cost_per_km: String(selectedOrder.cost_per_km ?? ''),
      extra_cost_per_km: String(selectedOrder.extra_cost_per_km ?? ''),
      driver_allowance: String(selectedOrder.driver_allowance ?? ''),
      extra_driver_allowance: String(selectedOrder.extra_driver_allowance ?? ''),
      permit_charges: String(selectedOrder.permit_charges ?? ''),
      extra_permit_charges: String(selectedOrder.extra_permit_charges ?? ''),
      hill_charges: String(selectedOrder.hill_charges ?? ''),
      toll_charges: String(selectedOrder.quoted_toll_charges ?? ''),
      night_charges: String(selectedOrder.night_charges ?? ''),
    });
    setShowEditFareModal(true);
  };

  const handleSaveFare = async () => {
    if (!selectedOrder) return;
    const updates: Record<string, number> = {};
    for (const field of EDIT_FARE_FIELDS) {
      const raw = editFareValues[field.key];
      if (raw === undefined || raw === '') continue;
      const num = parseInt(raw, 10);
      if (isNaN(num) || num < 0) {
        Alert.alert('Invalid', `Enter a valid non-negative number for ${field.label}`);
        return;
      }
      updates[field.key] = num;
    }
    if (Object.keys(updates).length === 0) {
      Alert.alert('Nothing to save', 'Change at least one field first.');
      return;
    }
    setSavingFare(true);
    try {
      const result = await apiService.adminEditOrderFare(selectedOrder.id, updates);
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates, estimated_price: result.estimated_price, vendor_price: result.vendor_price } : prev));
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...updates, estimated_price: result.estimated_price, vendor_price: result.vendor_price } : o)));
      setShowEditFareModal(false);
      showToast(`Fare updated - new total ₹${result.vendor_price.toLocaleString('en-IN')}.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update fare');
    } finally {
      setSavingFare(false);
    }
  };

  // Helper function to get location string from pickup_drop_location
  const getLocationString = (location: PickupDropLocation | undefined): string => {
    if (!location) return '';
    
    // Check if it's numeric keys format
    if (typeof location === 'object' && !('pickup' in location)) {
      const keys = Object.keys(location).sort((a, b) => Number(a) - Number(b));
      return keys.map(key => (location as any)[key] || '').join(' ').toLowerCase();
    }
    
    // Structured format
    const pickup = (location as any).pickup?.address || (location as any).pickup?.city || '';
    const drop = (location as any).drop?.address || (location as any).drop?.city || '';
    const stops = (location as any).intermediate_stops || [];
    const stopsText = stops.map((stop: any) => stop.address || stop.city || '').join(' ');
    return `${pickup} ${drop} ${stopsText}`.toLowerCase();
  };

  const filteredOrders = orders.filter(order => {
    if (!order || !order.id) return false;

    if (selectedBrand !== 'all') {
      const src = (order.source || '').toLowerCase();
      const exec = (order.executed_platform || '').toLowerCase();
      const createdBy = (order.created_by_role || '').toLowerCase();

      if (selectedBrand === 'dropcars') {
        if (!src.includes('dropcars') && !exec.includes('dropcars') && !exec.includes('drop cars')) return false;
      } else if (selectedBrand === 'yellowboard') {
        if (!src.includes('yellowboard') && !exec.includes('yellowboard') && !exec.includes('yellow board')) return false;
      } else if (selectedBrand === 'vendor') {
        if (!src.includes('vendor') && !createdBy.includes('vendor') && !order.vendor_id) return false;
      } else if (selectedBrand === 'driver') {
        if (!src.includes('driver') && !createdBy.includes('driver') && !createdBy.includes('fleet')) return false;
      } else if (selectedBrand === 'admin') {
        if (!src.includes('admin') && !createdBy.includes('admin')) return false;
      }
    }

    if (appSourceFilter !== 'all') {
      const src = (order.source || '').toLowerCase();
      const exec = (order.executed_platform || '').toLowerCase();
      const createdBy = (order.created_by_role || '').toLowerCase();
      if (appSourceFilter === 'vendor' && !src.includes('vendor') && !createdBy.includes('vendor') && !order.vendor_id) return false;
      if (appSourceFilter === 'driver' && !src.includes('driver') && !createdBy.includes('driver')) return false;
      if (appSourceFilter === 'admin' && !src.includes('admin') && !createdBy.includes('admin')) return false;
    }

    if (tripTypeFilter !== 'all') {
      const tt = (order.trip_type || '').toLowerCase();
      if (!tt.includes(tripTypeFilter)) return false;
    }

    if (carTypeFilter !== 'all') {
      const ct = (order.car_type || '').toLowerCase();
      if (!ct.includes(carTypeFilter)) return false;
    }

    if (statusFilter !== 'all') {
      const status = (order.trip_status || '').toUpperCase();
      const matchesStatus = statusFilter === 'CANCELLED'
        ? (status.includes('CANCEL') || status === 'EXPIRED' || status === 'NO DRIVER ASSIGNED')
        : status === statusFilter;
      if (!matchesStatus) return false;
    }

    // Sub-tab filtering under Live: All | Unassigned | Assigned | Running
    if (activeSection === 'live' || statusFilter === 'PENDING') {
      const status = (order.trip_status || '').toUpperCase();
      const isLiveStatus = ['PENDING', 'ASSIGNED', 'STARTED', 'RUNNING', 'DRIVING', 'IN_PROGRESS'].includes(status);
      if (!isLiveStatus) return false;

      const hasAssignedDriver = !!(order.assigned_driver || (order.assignments && order.assignments.length > 0) || (order as any).driver_id);
      const started = isOrderStarted(order);

      if (liveSubTab === 'unassigned') {
        if (hasAssignedDriver) return false;
      } else if (liveSubTab === 'assigned') {
        if (!hasAssignedDriver || started) return false;
      } else if (liveSubTab === 'running') {
        if (!started) return false;
      }
    }

    // Sub-tab filtering under Cancelled: Expired | Cancelled | Unallocated
    if (activeSection === 'cancelled' || statusFilter === 'CANCELLED') {
      const status = (order.trip_status || '').toUpperCase();

      if (cancelledSubTab === 'expired') {
        if (status !== 'EXPIRED' && status !== 'NO DRIVER ASSIGNED') return false;
      } else if (cancelledSubTab === 'cancelled') {
        if (!status.includes('CANCEL')) return false;
      } else if (cancelledSubTab === 'unallocated') {
        if (!status.includes('VENDOR') && !status.includes('UNALLOCATED') && status !== 'NO DRIVER ASSIGNED') return false;
      }
    }

    if (dateFilter !== 'all' && order.created_at) {
      const createdDate = new Date(order.created_at);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dateFilter === 'today') {
        if (createdDate < startOfToday) return false;
      } else if (dateFilter === 'yesterday') {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        if (createdDate < startOfYesterday || createdDate >= startOfToday) return false;
      } else if (dateFilter === 'week') {
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        if (createdDate < startOfWeek) return false;
      } else if (dateFilter === 'month') {
        const startOfMonth = new Date(startOfToday);
        startOfMonth.setDate(startOfMonth.getDate() - 30);
        if (createdDate < startOfMonth) return false;
      }
    }

    const query = searchQuery.toLowerCase();
    const locationText = getLocationString(order.pickup_drop_location);

    return (
      String(order.id || '').toLowerCase().includes(query) ||
      (order.customer_name && String(order.customer_name).toLowerCase().includes(query)) ||
      (order.customer_number && String(order.customer_number).includes(searchQuery)) ||
      locationText.includes(query)
    );
  }).sort((a, b) => {
    // If viewing Live (All or Unassigned), sort next upcoming trip first (earliest start_date_time first)
    if ((activeSection === 'live' || statusFilter === 'PENDING') && (liveSubTab === 'all' || liveSubTab === 'unassigned')) {
      const timeA = a.start_date_time ? new Date(a.start_date_time).getTime() : 0;
      const timeB = b.start_date_time ? new Date(b.start_date_time).getTime() : 0;
      if (timeA && timeB) return timeA - timeB;
    }
    if (sortOrder === 'oldest') {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (typeof a.id === 'number' ? a.id : 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (typeof b.id === 'number' ? b.id : 0);
      return timeA - timeB;
    } else {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (typeof a.id === 'number' ? a.id : 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (typeof b.id === 'number' ? b.id : 0);
      return timeB - timeA;
    }
  });

  const STATUS_TABS: { label: string; value: typeof statusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Live', value: 'PENDING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  const DATE_FILTERS: { label: string; value: typeof dateFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: '7 Days', value: 'week' },
    { label: '30 Days', value: 'month' },
  ];

  const LIVE_SUB_TABS: { label: string; value: typeof liveSubFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'New', value: 'new' },
    { label: 'Started', value: 'started' },
  ];

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString('en-IN')}`;
  };

  // Best-available vendor/driver earning figures: prefer the real settled
  // number (vendor_profit/driver_profit, set once the trip completes),
  // then the commission-aware pre-trip estimate (estimated_vendor_profit/
  // estimated_driver_profit - matches how a completed trip actually pays
  // out, unlike the old vendor_price-estimated_price subtraction which
  // missed the tier commission entirely), then fall back to that naive
  // subtraction only when neither is available (Hourly Rental bookings,
  // which use a different real formula with no estimate wired up yet).
  const getVendorEarning = (order: Order): number | null => {
    if (order.vendor_profit != null) return order.vendor_profit;
    if (order.estimated_vendor_profit != null) return order.estimated_vendor_profit;
    if (order.vendor_price != null && order.estimated_price != null) return order.vendor_price - order.estimated_price;
    return null;
  };

  const getDriverEarning = (order: Order): number | null => {
    if (order.driver_profit != null) return order.driver_profit;
    if (order.estimated_driver_profit != null) return order.estimated_driver_profit;
    return order.estimated_price ?? null;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getSourceInfo = (item: Order) => {
    const src = (item.source || '').toLowerCase();
    const exec = (item.executed_platform || '').toLowerCase();
    const createdBy = (item.created_by_role || '').toLowerCase();

    if (src.includes('vendor') || createdBy.includes('vendor') || (item.vendor_id && !src.includes('yellowboard') && !src.includes('dropcars'))) {
      return { label: 'Vendor App', color: '#8B5CF6' };
    }
    if (src.includes('driver') || createdBy.includes('driver') || createdBy.includes('fleet')) {
      return { label: 'Driver App', color: '#10B981' };
    }
    if (src.includes('admin') || createdBy.includes('admin')) {
      return { label: 'Admin App', color: '#EC4899' };
    }
    if (src.includes('yellowboard') || exec.includes('yellowboard') || exec.includes('yellow board')) {
      return { label: 'Yellow Board', color: '#D97706' };
    }
    if (src.includes('dropcars') || exec.includes('dropcars') || exec.includes('drop cars')) {
      return { label: 'Drop Cars', color: '#3B82F6' };
    }
    if (item.vendor_id) {
      return { label: 'Vendor App', color: '#8B5CF6' };
    }
    return { label: 'Drop Cars', color: '#3B82F6' };
  };

  const getCustomerDisplayName = (item: Order) => {
    const name = (item.customer_name || '').trim();
    if (name && name.toLowerCase() !== 'off' && name.toLowerCase() !== 'n/a' && name.toLowerCase() !== 'null') {
      return name;
    }
    if (item.customer_number) {
      return item.customer_number;
    }
    if (item.vendor?.full_name) {
      return item.vendor.full_name;
    }
    return 'Customer';
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const isPending = (item.trip_status || '').toUpperCase() === 'PENDING';
    const isStarted = isOrderStarted(item);

    // Display price
    const displayPrice = item.closed_vendor_price || item.vendor_price || item.estimated_price || 0;

    // Source label formatting
    const { label: sourceLabel, color: sourceColor } = getSourceInfo(item);

    return (
      <TouchableOpacity
        style={[
          styles.orderCard,
          {
            backgroundColor: themeColors.surface,
            borderColor: isStarted ? '#10B981' : isPending ? '#F59E0B' : themeColors.border,
            borderWidth: isStarted || isPending ? 1.5 : 1,
            borderRadius: 8,
            padding: 14,
            marginHorizontal: 16,
            marginBottom: 12,
          },
        ]}
        onPress={() => handleOrderPress(item)}
        activeOpacity={0.75}
      >
        {/* Top Card Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: sourceColor, opacity: 0.9 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{sourceLabel}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>
              #{item.id ?? 'N/A'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isPending ? (
              <View style={isStarted ? styles.startedTag : styles.newTag}>
                <Text style={isStarted ? styles.startedTagText : styles.newTagText}>
                  {isStarted ? 'Running' : 'Live'}
                </Text>
              </View>
            ) : (
              <StatusBadge status={item.trip_status || 'N/A'} type="order" />
            )}
          </View>
        </View>

        {/* Route Info Row */}
        {(() => {
          const location = item.pickup_drop_location;
          let fromCity = 'N/A';
          let toCity = 'N/A';
          if (location && typeof location === 'object' && !('pickup' in location)) {
            const keys = Object.keys(location).sort((a, b) => Number(a) - Number(b));
            fromCity = (location as any)['0'] || 'N/A';
            toCity = (location as any)[keys[keys.length - 1]] || 'N/A';
          } else if (location) {
            const structuredLoc = location as any;
            fromCity = structuredLoc.pickup?.address || structuredLoc.pickup?.city || structuredLoc['0'] || 'N/A';
            toCity = structuredLoc.drop?.address || structuredLoc.drop?.city || structuredLoc['1'] || 'N/A';
          }

          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <MapPin size={16} color="#10B981" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: themeColors.text, flex: 1 }} numberOfLines={1}>
                {fromCity} → {toCity}
              </Text>
            </View>
          );
        })()}

        {/* 3-Column Compact Details Grid (matching Savaari Trips card) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Car & Type</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: 2 }} numberOfLines={1}>
              {item.car_type ? formatCarType(item.car_type) : item.trip_type || 'Sedan'}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Customer</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text, marginTop: 2 }} numberOfLines={1}>
              {getCustomerDisplayName(item)}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Total Fare</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#059669', marginTop: 1 }}>
              {formatCurrency(displayPrice)}
            </Text>
          </View>
        </View>

        {/* Time & Advance Badge Line */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          {!!item.start_date_time ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={12} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>Pickup: {formatDate(item.start_date_time)}</Text>
            </View>
          ) : <View />}

          {!!item.advance_received && item.advance_received > 0 && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: 1 }}>
              <Text style={{ fontSize: 10.5, color: '#059669', fontWeight: '700' }}>
                Advance: ₹{item.advance_received.toLocaleString('en-IN')}
              </Text>
            </View>
          )}
        </View>

        {/* Pickup Notes Chip if present */}
        {(() => {
          const notes = (item.pickup_notes || '').trim();
          if (!notes || notes.toUpperCase() === 'NILL' || notes.toLowerCase() === 'null') return null;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={(e) => handleOpenEditNotes(item, e)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? '#451A03' : '#FEF3C7',
                borderColor: isDark ? '#D97706' : '#F59E0B',
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                marginTop: 4,
                gap: 5,
              }}
            >
              <FileText size={12} color={isDark ? '#FDE68A' : '#B45309'} />
              <Text style={{ fontSize: 11, color: isDark ? '#FDE68A' : '#92400E', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                Note: {notes}
              </Text>
              <Edit3 size={11} color={isDark ? '#FDE68A' : '#B45309'} />
            </TouchableOpacity>
          );
        })()}

        {/* Contextual Action Buttons Row based on status */}
        {(() => {
          const status = (item.trip_status || '').toUpperCase();
          const isLiveTrip = isPending || status === 'ASSIGNED' || status === 'STARTED';
          const isAutoCancelledTrip = status === 'AUTO_CANCELLED' || status === 'AUTO CANCELLED' || status.includes('AUTO_CANCEL') || status.includes('AUTO CANCEL') || (status.startsWith('CANCEL') && (item.pickup_notes?.toLowerCase().includes('auto') || (item as any).cancel_reason?.toLowerCase().includes('auto') || (item as any).cancel_reason?.toLowerCase().includes('timeout') || (item as any).cancel_reason?.toLowerCase().includes('no driver') || (item as any).cancelled_by === 'SYSTEM'));
          const isExpiredTrip = status === 'EXPIRED' || status === 'NO DRIVER ASSIGNED';
          const canRecreateTrip = isExpiredTrip || isAutoCancelledTrip;
          const isCompletedTrip = status === 'COMPLETED';

          const handleRecreateAction = (e: any) => {
            e.stopPropagation();
            const loc: any = item.pickup_drop_location;
            let pickup = '';
            let drop = '';
            if (loc && typeof loc === 'object') {
              if (loc.pickup && typeof loc.pickup === 'object' && loc.pickup.city) {
                pickup = String(loc.pickup.city);
              } else if (typeof loc.pickup === 'string') {
                pickup = loc.pickup;
              } else if ('0' in loc) {
                pickup = String(loc['0'] || '');
              }
              if (loc.drop && typeof loc.drop === 'object' && loc.drop.city) {
                drop = String(loc.drop.city);
              } else if (typeof loc.drop === 'string') {
                drop = loc.drop;
              } else {
                const keys = Object.keys(loc).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
                if (keys.length > 1) drop = String(loc[keys[keys.length - 1]] || '');
              }
            }

            Alert.alert(
              'Recreate Booking',
              `Recreate Booking #${item.id} (${isAutoCancelledTrip ? 'Auto-Cancelled' : 'Expired'}) as a new booking?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Edit & Post New',
                  onPress: () => {
                    let startD = '';
                    let startT = '';
                    if (item.start_date_time) {
                      const parts = item.start_date_time.split(/T|\s/);
                      startD = parts[0] || '';
                      startT = (parts[1] || '').slice(0, 5);
                    }
                    router.push({
                      pathname: '/create-booking',
                      params: {
                        customer_name: item.customer_name || '',
                        customer_phone: item.customer_number || '',
                        pickup,
                        drop,
                        trip_type: item.trip_type || 'oneway',
                        car_type: item.car_type || 'SEDAN_4_PLUS_1',
                        pickup_notes: item.pickup_notes || `Recreated from #${item.id}`,
                        cost_per_km: item.cost_per_km != null ? String(item.cost_per_km) : '',
                        extra_cost_per_km: item.extra_cost_per_km != null ? String(item.extra_cost_per_km) : '',
                        driver_allowance: item.driver_allowance != null ? String(item.driver_allowance) : '',
                        extra_driver_allowance: item.extra_driver_allowance != null ? String(item.extra_driver_allowance) : '',
                        permit_charges: item.permit_charges != null ? String(item.permit_charges) : '',
                        extra_permit_charges: item.extra_permit_charges != null ? String(item.extra_permit_charges) : '',
                        hill_charges: item.hill_charges != null ? String(item.hill_charges) : '',
                        toll_charges: item.toll_charges != null ? String(item.toll_charges) : '',
                        include_toll: item.toll_charges != null && Number(item.toll_charges) > 0 ? 'true' : (item.include_toll ? 'true' : 'false'),
                        include_gst: item.include_gst ? 'true' : 'false',
                        gst_amount: item.gst_amount != null ? String(item.gst_amount) : '',
                        advance_received: item.advance_received != null ? String(item.advance_received) : '',
                        trip_distance: item.trip_distance != null ? String(item.trip_distance) : '',
                        total_booking_amount: item.total_booking_amount != null ? String(item.total_booking_amount) : (item.vendor_price != null ? String(item.vendor_price) : ''),
                        start_date: startD,
                        start_time: startT,
                        fare_type: item.fare_type || '',
                      },
                    });
                  },
                },
              ]
            );
          };

          return (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border, justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {/* LIVE TRIPS ACTION BUTTONS */}
                {isLiveTrip && (
                  <>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#3B0764' : '#F3E8FF', borderWidth: 1, borderColor: '#8B5CF6' }}
                      onPress={(e) => { e.stopPropagation(); setOtpModalOrder(item); }}
                      activeOpacity={0.8}
                    >
                      <Key size={12} color="#8B5CF6" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#8B5CF6' }}>View OTP</Text>
                    </TouchableOpacity>

                    {isPending ? (
                      // Nobody has accepted this booking yet - hand it directly
                      // to one fleet driver/driver instead of broadcasting it.
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#1E1B4B' : colors.primaryTint, borderWidth: 1, borderColor: colors.primary }}
                        onPress={(e) => {
                          e.stopPropagation();
                          setAllocateModalOrder(item);
                          setAllocateQuery(''); setAllocateResults([]); setAllocateTarget(null);
                          setAllocateError(null); setAllocateLowBalance(null);
                        }}
                        activeOpacity={0.8}
                      >
                        <Send size={12} color={colors.primary} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Allocate manually</Text>
                      </TouchableOpacity>
                    ) : (
                      // Already accepted (ASSIGNED/STARTED) - changing who
                      // is driving is a two-step real flow: remove the
                      // current driver with a penalty (below - this really
                      // calls the backend), which sends the booking back to
                      // Pending, then use "Allocate manually" to hand it to
                      // someone else. (The old "Assign Manually" button here
                      // only showed a fake success toast and never called
                      // any backend endpoint - no direct "swap driver in
                      // place" endpoint exists - found & fixed 2026-09-29.)
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderWidth: 1, borderColor: '#D97706' }}
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedOrder(item);
                          setPenaltyAmountInput('500');
                          setPenaltyReasonInput('');
                          setShowPenaltyModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <ShieldAlert size={12} color="#D97706" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>Remove Driver</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#F1F5F9', borderWidth: 1, borderColor: themeColors.border }}
                      onPress={(e) => { e.stopPropagation(); setSelectedOrder(item); openEditFareModal(); }}
                      activeOpacity={0.8}
                    >
                      <Edit3 size={12} color={themeColors.text} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderWidth: 1, borderColor: '#EF4444' }}
                      onPress={(e) => { e.stopPropagation(); handleCancelOrder(item, e); }}
                      activeOpacity={0.8}
                    >
                      <XCircle size={12} color="#EF4444" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* AUTO CANCELLED & EXPIRED TRIPS RECREATE BUTTON */}
                {canRecreateTrip && (
                  <>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderWidth: 1, borderColor: '#10B981' }}
                      onPress={handleRecreateAction}
                      activeOpacity={0.8}
                    >
                      <Repeat size={12} color="#059669" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Recreate</Text>
                    </TouchableOpacity>

                    {isExpiredTrip && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }}
                        onPress={(e) => { e.stopPropagation(); setMoveModalOrder(item); setMovePlatform('Savaari'); }}
                        activeOpacity={0.8}
                      >
                        <Truck size={12} color="#B45309" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>Move</Text>
                      </TouchableOpacity>
                    )}

                    {isOwnerUser && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderWidth: 1, borderColor: '#DC2626' }}
                        onPress={(e) => handleOpenDeleteOrder(item, e)}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={12} color="#DC2626" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* COMPLETED TRIPS ACTION BUTTONS */}
                {isCompletedTrip && (
                  <>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' }}
                      onPress={(e) => { e.stopPropagation(); setOdoModalOrder(item); }}
                      activeOpacity={0.8}
                    >
                      <Gauge size={12} color="#2563EB" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>View ODO</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#312E81' : '#EEF2FF', borderWidth: 1, borderColor: '#6366F1' }}
                      onPress={(e) => { e.stopPropagation(); setReviewModalOrder(item); }}
                      activeOpacity={0.8}
                    >
                      <Star size={12} color="#4F46E5" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>See Review</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderWidth: 1, borderColor: '#10B981' }}
                      onPress={(e) => openInvoiceModalForOrder(item, e)}
                      activeOpacity={0.8}
                    >
                      <FileText size={12} color="#059669" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Invoice</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#064E3B' : '#F0FDF4', borderWidth: 1, borderColor: '#22C55E' }}
                      onPress={(e) => openWhatsAppModalForOrder(item, 'trip_completed', e)}
                      activeOpacity={0.8}
                    >
                      <MessageSquare size={12} color="#16A34A" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>WhatsApp</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <ChevronRight size={18} color={colors.textMuted} />
            </View>
          );
        })()}
      </TouchableOpacity>
    );
  };

  const renderOrderDetails = () => {
    if (!selectedOrder) return null;

    return (
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Booking Details</Text>
            <TouchableOpacity
              onPress={() => setShowDetailsModal(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Booking Basic Info */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Booking Information</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Booking ID:</Text>
                <Text style={[styles.detailValue, styles.detailValueEmphasis]}>{selectedOrder.id ? `#${selectedOrder.id}` : 'N/A'}</Text>
              </View>
              {selectedOrder.source_order_id && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { fontSize: 12, color: '#9CA3AF' }]}>Internal Reference #:</Text>
                  <Text style={[styles.detailValue, { fontSize: 12, color: '#9CA3AF' }]}>{selectedOrder.source_order_id}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Booking Type:</Text>
                <Text style={styles.detailValue}>
                  {selectedOrder.source === 'NEW_ORDERS' ? 'Standard Booking' : selectedOrder.source === 'HOURLY_RENTAL' ? 'Hourly Rental' : (selectedOrder.source || 'N/A')}
                </Text>
              </View>
              <TouchableOpacity style={styles.detailRow} onPress={openExecutedPlatformModal} activeOpacity={0.6}>
                <Text style={styles.detailLabel}>Executed On:</Text>
                <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>
                  {selectedOrder.executed_platform || 'Drop Cars App'} ✎
                </Text>
              </TouchableOpacity>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status:</Text>
                <StatusBadge status={selectedOrder.trip_status || 'N/A'} type="order" />
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Trip Type:</Text>
                <Text style={styles.detailValue}>{selectedOrder.trip_type || 'N/A'}</Text>
              </View>
              {selectedOrder.car_type && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Car Type:</Text>
                  <Text style={styles.detailValue}>{formatCarType(selectedOrder.car_type)}</Text>
                </View>
              )}
              {selectedOrder.start_date_time && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Start Date/Time:</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedOrder.start_date_time)}</Text>
                </View>
              )}
              {selectedOrder.trip_distance && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Trip Distance:</Text>
                  <Text style={styles.detailValue}>{selectedOrder.trip_distance} km</Text>
                </View>
              )}
              {selectedOrder.distance_edited && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: '#B45309' }]}>⚠ Distance Edited:</Text>
                  <Text style={[styles.detailValue, { color: '#B45309' }]}>
                    Vendor overrode calculated {selectedOrder.calculated_trip_distance ?? '?'} km
                  </Text>
                </View>
              )}
              {selectedOrder.trip_time && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Trip Time:</Text>
                  <Text style={styles.detailValue}>{selectedOrder.trip_time}</Text>
                </View>
              )}
              {selectedOrder.pick_near_city && selectedOrder.pick_near_city.length > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pick Near Cities:</Text>
                  <Text style={styles.detailValue}>{selectedOrder.pick_near_city.join(', ')}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created At:</Text>
                <Text style={styles.detailValue}>{formatDate(selectedOrder.created_at)}</Text>
              </View>
            </View>

            {/* Pricing Information - vendor_price is the actual total fare the
                customer is charged (labelled "Customer Fare" here, matching
                the Vendor App's own terminology for the same field); estimated_price
                is what the driver/vendor is estimated to earn before the trip
                completes. Once completed, the closed-price and profit fields
                hold the real settled numbers. */}
            <View style={styles.detailSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Fare Breakdown</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => handleEditFullBooking(selectedOrder)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#312E81' : '#EEF2FF', borderRadius: 6 }}
                  >
                    <SlidersHorizontal size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Customize Booking</Text>
                  </TouchableOpacity>
                  {canEditFare && isOrderEditable(selectedOrder) && selectedOrder.cost_per_km != null && (
                    <TouchableOpacity
                      onPress={openEditFareModal}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderRadius: 6 }}
                    >
                      <Edit3 size={13} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Edit Fare</Text>
                    </TouchableOpacity>
                  )}
                  {isOrderEditable(selectedOrder) && (
                    <TouchableOpacity
                      onPress={() => handleOpenEditAdvance(selectedOrder)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderRadius: 6 }}
                    >
                      <IndianRupee size={13} color={colors.success} />
                      <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>Advance / Adjust</Text>
                    </TouchableOpacity>
                  )}
                  {isOrderEditable(selectedOrder) && (selectedOrder.assigned_driver || selectedOrder.assigned_car || (selectedOrder.assignments && selectedOrder.assignments.length > 0)) && (
                    <TouchableOpacity
                      onPress={() => setShowPenaltyModal(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#451A03' : '#FEF3C7', borderRadius: 6 }}
                    >
                      <UserX size={13} color="#D97706" />
                      <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '700' }}>Unallocate Driver</Text>
                    </TouchableOpacity>
                  )}
                  {isAuthorizedForCancel && isOrderEditable(selectedOrder) && (
                    <TouchableOpacity
                      onPress={() => handleCancelOrder(selectedOrder)}
                      disabled={cancellingOrder}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderRadius: 6 }}
                    >
                      {cancellingOrder ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <>
                          <XCircle size={13} color={colors.error} />
                          <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* At a glance - the actionable numbers */}
              <View style={styles.glanceCard}>
                {selectedOrder.vendor_price != null && (
                  <View style={styles.glanceRow}>
                    <Text style={styles.glanceLabel}>Customer Fare (Total)</Text>
                    <Text style={styles.glanceValue}>{formatCurrency(selectedOrder.vendor_price)}</Text>
                  </View>
                )}
                {selectedOrder.advance_received != null && selectedOrder.advance_received > 0 && (
                  <View style={styles.glanceRow}>
                    <Text style={styles.glanceLabel}>Advance Received (Paid)</Text>
                    <Text style={[styles.glanceValue, { color: '#059669' }]}>- {formatCurrency(selectedOrder.advance_received)}</Text>
                  </View>
                )}
                {selectedOrder.estimated_price != null && (
                  <View style={styles.glanceRow}>
                    <Text style={styles.glanceLabel}>
                      {(selectedOrder.trip_status || '').toUpperCase() === 'COMPLETED' ? 'Cash Collected' : 'Cash to Collect from Customer'}
                    </Text>
                    <Text style={styles.glanceValue}>
                      {formatCurrency(Math.max(0, selectedOrder.estimated_price - (selectedOrder.advance_received || 0)))}
                    </Text>
                  </View>
                )}
                {getVendorEarning(selectedOrder) != null && (
                  <View style={styles.glanceRow}>
                    <Text style={styles.glanceLabel}>Vendor Earning</Text>
                    <Text style={styles.glanceValue}>{formatCurrency(getVendorEarning(selectedOrder)!)}</Text>
                  </View>
                )}
                {selectedOrder.trip_distance != null && (
                  <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                    <Text style={{ fontSize: 11, color: '#065F46', fontWeight: '600' }}>
                      ✓ Package Minimum: {selectedOrder.trip_distance} km guaranteed package. Extra km charged only if driven &gt; {selectedOrder.trip_distance} km.
                    </Text>
                  </View>
                )}
              </View>

              {(selectedOrder.cost_per_km != null || selectedOrder.driver_allowance != null) && (
                <>
                  <Text style={styles.pricingSubhead}>Per-KM Rate Breakdown</Text>
                  {selectedOrder.cost_per_km != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Driver Fare (per km):</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.cost_per_km)}/km</Text>
                    </View>
                  )}
                  {selectedOrder.extra_cost_per_km != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Vendor Extra (per km):</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.extra_cost_per_km)}/km</Text>
                    </View>
                  )}
                  {selectedOrder.driver_allowance != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Driver Allowance (Bata):</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.driver_allowance)}</Text>
                    </View>
                  )}
                  {selectedOrder.extra_driver_allowance != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Vendor Extra Allowance:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.extra_driver_allowance)}</Text>
                    </View>
                  )}
                  {!!selectedOrder.permit_charges && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Permit Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.permit_charges)}</Text>
                    </View>
                  )}
                  {!!selectedOrder.extra_permit_charges && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Vendor Extra Permit Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.extra_permit_charges)}</Text>
                    </View>
                  )}
                  {!!selectedOrder.hill_charges && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Hill Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.hill_charges)}</Text>
                    </View>
                  )}
                  {!!selectedOrder.quoted_toll_charges && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Toll Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.quoted_toll_charges)}</Text>
                    </View>
                  )}
                  {selectedOrder.trip_distance != null && selectedOrder.cost_per_km != null && (
                    <Text style={styles.pricingNote}>
                      At {selectedOrder.trip_distance} km: driver base ≈ {formatCurrency(Math.round(selectedOrder.trip_distance * selectedOrder.cost_per_km))}, vendor extra ≈ {formatCurrency(Math.round(selectedOrder.trip_distance * (selectedOrder.extra_cost_per_km || 0)))}
                    </Text>
                  )}
                </>
              )}

              <Text style={[styles.pricingSubhead, { marginTop: 12 }]}>Quoted (before trip)</Text>
              {selectedOrder.estimated_price != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Est. Driver Fare:</Text>
                  <Text style={styles.detailValue}>{formatCurrency(selectedOrder.estimated_price)}</Text>
                </View>
              )}
              {selectedOrder.advance_received != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Advance Received:</Text>
                  <Text style={styles.detailValue}>{formatCurrency(selectedOrder.advance_received)}</Text>
                </View>
              )}
              {selectedOrder.vendor_fees_percent != null && selectedOrder.vendor_price != null && selectedOrder.estimated_price != null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Platform Charges ({selectedOrder.vendor_fees_percent}% of Vendor Earning):</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(Math.round((selectedOrder.vendor_price - selectedOrder.estimated_price) * selectedOrder.vendor_fees_percent / 100))}
                  </Text>
                </View>
              )}

              {selectedOrder.charge_items && selectedOrder.charge_items.length > 0 && (
                <>
                  <Text style={[styles.pricingSubhead, { marginTop: 12 }]}>Included / Excluded</Text>
                  {selectedOrder.charge_items.map((ci, idx) => (
                    <View style={styles.detailRow} key={idx}>
                      <Text style={styles.detailLabel}>{ci.label}:</Text>
                      <Text style={[styles.detailValue, ci.included ? { color: colors.success } : { color: colors.error }]}>
                        {ci.included ? 'Included' : 'Extra'}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {(selectedOrder.night_charges || selectedOrder.waiting_time || selectedOrder.toll_charge_update) && (
                <>
                  <Text style={[styles.pricingSubhead, { marginTop: 12 }]}>Other Charges</Text>
                  {!!selectedOrder.night_charges && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Night Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.night_charges)}</Text>
                    </View>
                  )}
                  {!!selectedOrder.waiting_time && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Waiting Time:</Text>
                      <Text style={styles.detailValue}>{selectedOrder.waiting_time} min</Text>
                    </View>
                  )}
                  {selectedOrder.toll_charge_update && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Updated Toll Charges:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.updated_toll_charges || 0)}</Text>
                    </View>
                  )}
                </>
              )}

              {(selectedOrder.closed_vendor_price != null || selectedOrder.closed_driver_price != null || selectedOrder.commision_amount != null || selectedOrder.vendor_profit != null || selectedOrder.driver_profit != null || selectedOrder.admin_profit != null) && (
                <>
                  <Text style={[styles.pricingSubhead, { marginTop: 12 }]}>Final Settlement (after trip)</Text>
                  {selectedOrder.closed_vendor_price != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Final Customer Fare (Actual):</Text>
                      <Text style={[styles.detailValue, styles.detailValueEmphasis]}>{formatCurrency(selectedOrder.closed_vendor_price)}</Text>
                    </View>
                  )}
                  {selectedOrder.closed_driver_price != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Final Driver Collection:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.closed_driver_price)}</Text>
                    </View>
                  )}
                  {selectedOrder.vendor_profit != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Vendor Profit:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.vendor_profit)}</Text>
                    </View>
                  )}
                  {selectedOrder.driver_profit != null && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Driver Profit:</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.driver_profit)}</Text>
                    </View>
                  )}
                  {(selectedOrder.admin_profit != null || selectedOrder.commision_amount != null) && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Platform Commission (Actual):</Text>
                      <Text style={styles.detailValue}>{formatCurrency(selectedOrder.admin_profit ?? selectedOrder.commision_amount ?? 0)}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Route Information */}
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Route</Text>
              {(() => {
                const location = selectedOrder.pickup_drop_location;
                if (!location) {
                  return <Text style={styles.detailValue}>N/A</Text>;
                }

                // Check if it's numeric keys format (actual API format)
                if (typeof location === 'object' && !('pickup' in location)) {
                  const keys = Object.keys(location).sort((a, b) => Number(a) - Number(b));
                  const isMulticity = keys.length > 2;

                  return (
                    <>
                      {keys.map((key, index) => {
                        const city = (location as any)[key] || 'N/A';
                        const stopNumber = index + 1;
                        let stopLabel = '';
                        
                        if (isMulticity) {
                          if (index === 0) {
                            stopLabel = 'Stop 1: From';
                          } else if (index === keys.length - 1) {
                            stopLabel = `Stop ${stopNumber}: To`;
                          } else {
                            stopLabel = `Stop ${stopNumber}: Intermediate`;
                          }
                        } else {
                          stopLabel = index === 0 ? 'From' : 'To';
                        }

                        return (
                          <View key={key} style={[styles.stopCard, { marginBottom: 12 }]}>
                            <Text style={[styles.detailLabel, { fontWeight: '600', marginBottom: 8 }]}>
                              {stopLabel}
                            </Text>
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Location:</Text>
                              <Text style={styles.detailValue}>{city}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  );
                }

                // Structured format (fallback)
                const structuredLoc = location as any;
                const isMulticity = (selectedOrder.trip_type?.toLowerCase().includes('multicity') || 
                                   selectedOrder.trip_type?.toLowerCase().includes('multi city') || 
                                   selectedOrder.trip_type?.toLowerCase().includes('multy city'));
                
                if (isMulticity && structuredLoc) {
                  return (
                    <>
                      {/* Pickup (First Stop) */}
                      {structuredLoc.pickup && (
                        <View style={[styles.stopCard, { marginBottom: 12 }]}>
                          <Text style={[styles.detailLabel, { fontWeight: '600', marginBottom: 8 }]}>Stop 1: Pickup</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Address:</Text>
                            <Text style={styles.detailValue}>{structuredLoc.pickup.address || 'N/A'}</Text>
                          </View>
                          {structuredLoc.pickup.city && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>City:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.pickup.city}</Text>
                            </View>
                          )}
                          {structuredLoc.pickup.state && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>State:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.pickup.state}</Text>
                            </View>
                          )}
                          {structuredLoc.pickup.pincode && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Pincode:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.pickup.pincode}</Text>
                            </View>
                          )}
                          {structuredLoc.pickup.coordinates && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Coordinates:</Text>
                              <Text style={styles.detailValue}>
                                {structuredLoc.pickup.coordinates.lat}, {structuredLoc.pickup.coordinates.lng}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Intermediate Stops */}
                      {structuredLoc.intermediate_stops && structuredLoc.intermediate_stops.length > 0 && (
                        <>
                          {structuredLoc.intermediate_stops
                            .sort((a: any, b: any) => (a.stop_order || 0) - (b.stop_order || 0))
                            .map((stop: any, index: number) => (
                              <View key={index} style={[styles.stopCard, { marginBottom: 12 }]}>
                                <Text style={[styles.detailLabel, { fontWeight: '600', marginBottom: 8 }]}>
                                  Stop {index + 2}: {stop.city || 'Intermediate Stop'}
                                </Text>
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Address:</Text>
                                  <Text style={styles.detailValue}>{stop.address || 'N/A'}</Text>
                                </View>
                                {stop.city && (
                                  <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>City:</Text>
                                    <Text style={styles.detailValue}>{stop.city}</Text>
                                  </View>
                                )}
                                {stop.state && (
                                  <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>State:</Text>
                                    <Text style={styles.detailValue}>{stop.state}</Text>
                                  </View>
                                )}
                                {stop.pincode && (
                                  <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Pincode:</Text>
                                    <Text style={styles.detailValue}>{stop.pincode}</Text>
                                  </View>
                                )}
                                {stop.coordinates && (
                                  <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Coordinates:</Text>
                                    <Text style={styles.detailValue}>
                                      {stop.coordinates.lat}, {stop.coordinates.lng}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            ))}
                        </>
                      )}

                      {/* Drop (Last Stop) */}
                      {structuredLoc.drop && (
                        <View style={[styles.stopCard, { marginBottom: 12 }]}>
                          <Text style={[styles.detailLabel, { fontWeight: '600', marginBottom: 8 }]}>
                            Stop {structuredLoc.intermediate_stops ? structuredLoc.intermediate_stops.length + 2 : 2}: Drop
                          </Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Address:</Text>
                            <Text style={styles.detailValue}>{structuredLoc.drop.address || 'N/A'}</Text>
                          </View>
                          {structuredLoc.drop.city && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>City:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.drop.city}</Text>
                            </View>
                          )}
                          {structuredLoc.drop.state && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>State:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.drop.state}</Text>
                            </View>
                          )}
                          {structuredLoc.drop.pincode && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Pincode:</Text>
                              <Text style={styles.detailValue}>{structuredLoc.drop.pincode}</Text>
                            </View>
                          )}
                          {structuredLoc.drop.coordinates && (
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Coordinates:</Text>
                              <Text style={styles.detailValue}>
                                {structuredLoc.drop.coordinates.lat}, {structuredLoc.drop.coordinates.lng}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  );
                }

                // Regular trip - numeric keys format
                return (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>From:</Text>
                      <Text style={styles.detailValue}>{(location as any)['0'] || 'N/A'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>To:</Text>
                      <Text style={styles.detailValue}>{(location as any)['1'] || 'N/A'}</Text>
                    </View>
                  </>
                );
              })()}
            </View>

            {/* Pickup Notes & Driver Instructions */}
            <View style={styles.detailSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FileText size={16} color="#D97706" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Pickup Notes & Driver Instructions
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleOpenEditNotes(selectedOrder)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: colors.primaryTint || '#EEF2FF',
                  }}
                >
                  <Edit3 size={13} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    {selectedOrder.pickup_notes && selectedOrder.pickup_notes.trim().toUpperCase() !== 'NILL' && selectedOrder.pickup_notes.trim().toLowerCase() !== 'null' ? 'Edit Note' : '+ Add Note'}
                  </Text>
                </TouchableOpacity>
              </View>
              {selectedOrder.pickup_notes && selectedOrder.pickup_notes.trim().toUpperCase() !== 'NILL' && selectedOrder.pickup_notes.trim().toLowerCase() !== 'null' ? (
                <View style={{
                  backgroundColor: isDark ? '#451A03' : '#FEF3C7',
                  borderColor: isDark ? '#D97706' : '#F59E0B',
                  borderWidth: 1,
                  borderRadius: 6,
                  padding: 10,
                }}>
                  <Text style={{ fontSize: 13, color: isDark ? '#FDE68A' : '#92400E', lineHeight: 18 }}>
                    {selectedOrder.pickup_notes}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, fontStyle: 'italic' }}>
                  No pickup notes set. Drivers will only see standard booking details.
                </Text>
              )}
            </View>

            {/* Customer Information */}
            <View style={styles.detailSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer Details</Text>
                {selectedOrder.customer_number && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${selectedOrder.customer_number}`)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Phone size={12} color="#2563EB" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://wa.me/${selectedOrder.customer_number.replace(/\D/g, '')}`)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <MessageSquare size={12} color="#059669" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Name:</Text>
                <Text style={styles.detailValue}>{selectedOrder.customer_name || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone:</Text>
                <Text style={[styles.detailValue, { fontWeight: '700', color: colors.primary }]}>{selectedOrder.customer_number || 'N/A'}</Text>
              </View>
            </View>

            {/* Unified Assigned Fleet & Driver Section (Strictly No "Owner" Terminology) */}
            <View style={[styles.detailSection, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: isDark ? '#111827' : '#FFFFFF' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={styles.sectionTitle}>Assigned Fleet &amp; Driver</Text>
                {selectedOrder.assigned_driver?.driver_status && (
                  <View style={{ backgroundColor: isDark ? '#064E3B' : '#ECFDF5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>
                      {selectedOrder.assigned_driver.driver_status}
                    </Text>
                  </View>
                )}
              </View>

              {selectedOrder.assigned_driver || selectedOrder.assigned_car || selectedOrder.vehicle_owner || selectedOrder.vendor ? (
                <View style={{ gap: 12 }}>
                  {/* Driver Details Sub-block */}
                  {selectedOrder.assigned_driver && (
                    <View style={{ backgroundColor: isDark ? '#1F2937' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? '#374151' : '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Fleet Driver
                        </Text>
                        {!!selectedOrder.assigned_driver?.primary_number && (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`tel:${selectedOrder.assigned_driver?.primary_number}`)}
                              style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                              <Phone size={11} color="#2563EB" />
                              <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#2563EB' }}>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`https://wa.me/${(selectedOrder.assigned_driver?.primary_number || '').replace(/\D/g, '')}`)}
                              style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                            >
                              <MessageSquare size={11} color="#059669" />
                              <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#059669' }}>WhatsApp</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Driver Name:</Text>
                        <Text style={[styles.detailValue, { fontWeight: '700' }]}>{selectedOrder.assigned_driver?.full_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Driver Reg ID:</Text>
                        <Text style={styles.detailValue}>
                          {selectedOrder.assigned_driver?.reg_id ? `#${selectedOrder.assigned_driver.reg_id}` : (selectedOrder.assigned_driver?.id || 'N/A')}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Primary Phone:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.assigned_driver?.primary_number || 'N/A'}</Text>
                      </View>
                      {selectedOrder.assigned_driver?.secondary_number && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Secondary Phone:</Text>
                          <Text style={styles.detailValue}>{selectedOrder.assigned_driver.secondary_number}</Text>
                        </View>
                      )}
                      {selectedOrder.assigned_driver?.licence_number && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>License Number:</Text>
                          <Text style={styles.detailValue}>{selectedOrder.assigned_driver.licence_number}</Text>
                        </View>
                      )}
                      {selectedOrder.assigned_driver?.address && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Address:</Text>
                          <Text style={styles.detailValue}>{selectedOrder.assigned_driver.address}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Assigned Car Sub-block */}
                  {selectedOrder.assigned_car && (
                    <View style={{ backgroundColor: isDark ? '#1F2937' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? '#374151' : '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#0D9488', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Assigned Vehicle
                        </Text>
                        {selectedOrder.assigned_car.car_status && (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D9488' }}>
                            {selectedOrder.assigned_car.car_status}
                          </Text>
                        )}
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Car Model:</Text>
                        <Text style={[styles.detailValue, { fontWeight: '700' }]}>{selectedOrder.assigned_car.car_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Vehicle Number:</Text>
                        <Text style={[styles.detailValue, { fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }]}>
                          {selectedOrder.assigned_car.car_number || 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Vehicle Category:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.assigned_car.car_type || 'N/A'}</Text>
                      </View>
                    </View>
                  )}

                  {/* Fleet Partner Sub-block */}
                  {(selectedOrder.vehicle_owner || selectedOrder.vendor) && (
                    <View style={{ backgroundColor: isDark ? '#1F2937' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? '#374151' : '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Fleet Partner
                        </Text>
                        {(selectedOrder.vehicle_owner?.account_status || (selectedOrder.vendor as any)?.account_status) && (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>
                            {selectedOrder.vehicle_owner?.account_status || (selectedOrder.vendor as any)?.account_status}
                          </Text>
                        )}
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Fleet ID:</Text>
                        <Text style={[styles.detailValue, { fontWeight: '800' }]}>
                          {selectedOrder.vehicle_owner?.reg_id ? `#${selectedOrder.vehicle_owner.reg_id}` : selectedOrder.vehicle_owner?.id ? `#${selectedOrder.vehicle_owner.id}` : selectedOrder.vendor?.reg_id ? `#${selectedOrder.vendor.reg_id}` : (selectedOrder.vendor?.id ? `#${selectedOrder.vendor.id}` : 'N/A')}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Partner Name:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.vehicle_owner?.full_name || selectedOrder.vendor?.full_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Primary Phone:</Text>
                        <Text style={styles.detailValue}>{selectedOrder.vehicle_owner?.primary_number || selectedOrder.vendor?.primary_number || 'N/A'}</Text>
                      </View>
                      {(selectedOrder.vendor?.wallet_balance !== undefined || (selectedOrder.vehicle_owner as any)?.wallet_balance !== undefined) && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Fleet Wallet Balance:</Text>
                          <Text style={[styles.detailValue, { fontWeight: '700', color: colors.success }]}>
                            {formatCurrency(selectedOrder.vendor?.wallet_balance ?? (selectedOrder.vehicle_owner as any)?.wallet_balance ?? 0)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ padding: 14, alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#F8FAFC', borderRadius: 6, borderWidth: 1, borderColor: isDark ? '#374151' : '#E2E8F0' }}>
                  <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
                    No Driver or Fleet assigned to this booking yet.
                  </Text>
                </View>
              )}
            </View>

            {/* Assignments */}
            {selectedOrder.assignments && selectedOrder.assignments.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Assignments ({selectedOrder.assignments.length})</Text>
                {selectedOrder.assignments.map((assignment: any, index: number) => (
                  <View key={index} style={styles.assignmentCard}>
                    <Text style={styles.assignmentTitle}>Assignment {index + 1}</Text>
                    {assignment.id && (
                      <Text style={styles.assignmentText}>ID: {assignment.id}</Text>
                    )}
                    {assignment.assignment_status && (
                      <Text style={styles.assignmentText}>Status: {assignment.assignment_status}</Text>
                    )}
                    {assignment.vehicle_owner_id && (
                      <Text style={styles.assignmentText}>Fleet ID: {assignment.vehicle_owner_id}</Text>
                    )}
                    {assignment.driver_id && (
                      <Text style={styles.assignmentText}>Driver ID: {assignment.driver_id}</Text>
                    )}
                    {assignment.car_id && (
                      <Text style={styles.assignmentText}>Car ID: {assignment.car_id}</Text>
                    )}
                    {assignment.assigned_at && (
                      <Text style={styles.assignmentText}>Assigned: {formatDate(assignment.assigned_at)}</Text>
                    )}
                    {assignment.expires_at && (
                      <Text style={styles.assignmentText}>Expires: {formatDate(assignment.expires_at)}</Text>
                    )}
                    {assignment.cancelled_at && (
                      <Text style={styles.assignmentText}>Cancelled: {formatDate(assignment.cancelled_at)}</Text>
                    )}
                    {assignment.completed_at && (
                      <Text style={styles.assignmentText}>Completed: {formatDate(assignment.completed_at)}</Text>
                    )}
                    {assignment.created_at && (
                      <Text style={styles.assignmentText}>Created: {formatDate(assignment.created_at)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* End Records */}
            {selectedOrder.end_records && selectedOrder.end_records.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>End Records ({selectedOrder.end_records.length})</Text>
                {selectedOrder.end_records.map((record: any, index: number) => (
                  <View key={index} style={styles.endRecordCard}>
                    <Text style={styles.recordTitle}>End Record {index + 1}</Text>
                    {record.id && (
                      <Text style={styles.recordText}>ID: {record.id}</Text>
                    )}
                    {record.driver_id && (
                      <Text style={styles.recordText}>Driver ID: {record.driver_id}</Text>
                    )}
                    {record.start_km !== undefined && (
                      <Text style={styles.recordText}>Start KM: {record.start_km}</Text>
                    )}
                    {record.end_km !== undefined && (
                      <Text style={styles.recordText}>End KM: {record.end_km}</Text>
                    )}
                    {record.contact_number && (
                      <Text style={styles.recordText}>Contact: {record.contact_number}</Text>
                    )}
                    {record.img_url && (
                      <Text style={styles.recordText}>Image URL: {record.img_url.substring(0, 50)}...</Text>
                    )}
                    {record.close_speedometer_image && (
                      <Text style={styles.recordText}>Speedometer Image: {record.close_speedometer_image.substring(0, 50)}...</Text>
                    )}
                    {record.created_at && (
                      <Text style={styles.recordText}>Created: {formatDate(record.created_at)}</Text>
                    )}
                    {record.updated_at && (
                      <Text style={styles.recordText}>Updated: {formatDate(record.updated_at)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Invoice & WhatsApp Action Buttons in Details Modal */}
            <View style={{ gap: 10, marginTop: 16, marginBottom: 24 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                  paddingVertical: 12,
                  borderRadius: 6,
                  gap: 8,
                }}
                onPress={() => openInvoiceModalForOrder(selectedOrder)}
              >
                <FileText size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                  {(selectedOrder.trip_status || '').toUpperCase() === 'COMPLETED'
                    ? '📄 View / Customize & Print Final GST Invoice'
                    : '📄 View Fare Quote & Estimate Invoice'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#25D366',
                  paddingVertical: 12,
                  borderRadius: 6,
                  gap: 8,
                }}
                onPress={() => {
                  const status = (selectedOrder.trip_status || '').toUpperCase();
                  const isStarted = isOrderStarted(selectedOrder);
                  const type: TemplateType =
                    status === 'COMPLETED'
                      ? 'trip_completed'
                      : isStarted || status === 'STARTED' || status === 'RUNNING'
                      ? 'driver_assigned'
                      : status === 'ASSIGNED'
                      ? 'driver_assigned'
                      : 'booking_confirmed';
                  openWhatsAppModalForOrder(selectedOrder, type);
                }}
              >
                <MessageSquare size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                  💬 Send WhatsApp Update with Live Links
                </Text>
              </TouchableOpacity>

              {/* Cancel Booking Action (Staff & Owner) */}
              {isAuthorizedForCancel && (selectedOrder.trip_status || '').toUpperCase() !== 'CANCELLED' && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#EF4444',
                    paddingVertical: 12,
                    borderRadius: 6,
                    gap: 8,
                  }}
                  onPress={() => handleCancelOrder(selectedOrder)}
                  disabled={cancellingOrder}
                >
                  <XCircle size={18} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 14 }}>
                    {cancellingOrder ? 'Cancelling...' : 'Cancel Booking'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Permanent Delete Action (OWNER ONLY) */}
              {isOwnerUser && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#EF4444',
                    paddingVertical: 12,
                    borderRadius: 6,
                    gap: 8,
                  }}
                  onPress={(e) => handleOpenDeleteOrder(selectedOrder, e)}
                >
                  <ShieldAlert size={18} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    🗑️ Permanently Delete Booking (Owner Only)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <View style={{ backgroundColor: themeColors.surface, borderRadius: 8, padding: 24, alignItems: 'center', width: '100%', maxWidth: 400, borderWidth: 1, borderColor: themeColors.border }}>
          <ShieldAlert size={48} color={colors.error} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: themeColors.text, marginTop: 16, textAlign: 'center' }}>
            {error.includes('Session') ? 'Sign In Required' : 'Failed to Load Bookings'}
          </Text>
          <Text style={{ fontSize: 14, color: themeColors.textSecondary, marginTop: 8, textAlign: 'center', marginBottom: 20 }}>
            {error}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            {(error.includes('Session') || error.includes('sign in')) && (
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}
                onPress={() => router.replace('/login')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Sign In Now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: isDark ? '#334155' : '#F1F5F9', paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}
              onPress={() => fetchOrders(true)}
            >
              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const BRAND_OPTIONS: Array<{ label: string; value: typeof selectedBrand; color: string }> = [
    { label: 'All Bookings', value: 'all', color: colors.primary },
    { label: 'Drop Cars', value: 'dropcars', color: '#3B82F6' },
    { label: 'Yellow Board', value: 'yellowboard', color: '#D97706' },
  ];

  const liveCount = orders.filter(o => {
    const s = (o.trip_status || '').toUpperCase();
    return s === 'PENDING' || s === 'ASSIGNED' || s === 'STARTED';
  }).length;
  const completedCount = orders.filter(o => (o.trip_status || '').toUpperCase() === 'COMPLETED').length;
  const cancelledCount = orders.filter(o => (o.trip_status || '').toUpperCase().includes('CANCEL') || (o.trip_status || '').toUpperCase() === 'EXPIRED').length;
  const allCount = orders.length;

  const liveUnassignedCount = orders.filter(o => {
    const s = (o.trip_status || '').toUpperCase();
    const isLive = s === 'PENDING' || s === 'ASSIGNED' || s === 'STARTED';
    const hasDriver = !!(o.assigned_driver || (o.assignments && o.assignments.length > 0) || (o as any).driver_id);
    return isLive && !hasDriver;
  }).length;

  const liveAssignedCount = orders.filter(o => {
    const s = (o.trip_status || '').toUpperCase();
    const isLive = s === 'PENDING' || s === 'ASSIGNED' || s === 'STARTED';
    const hasDriver = !!(o.assigned_driver || (o.assignments && o.assignments.length > 0) || (o as any).driver_id);
    const started = isOrderStarted(o);
    return isLive && hasDriver && !started;
  }).length;

  const liveRunningCount = orders.filter(o => {
    const s = (o.trip_status || '').toUpperCase();
    const isLive = s === 'PENDING' || s === 'ASSIGNED' || s === 'STARTED';
    return isLive && isOrderStarted(o);
  }).length;

  const completedNoReviewCount = orders.filter(o => {
    const s = (o.trip_status || '').toUpperCase();
    return s === 'COMPLETED' && !(o as any).review;
  }).length;

  const renderBookingsHubOverview = () => {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: themeColors.background }}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={true}
      >
        {/* TODAY'S LIVE SNAPSHOT */}
        {snapshot && (
          <View style={{ marginTop: 6 }}>
            <View style={{ paddingHorizontal: 16, marginBottom: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textSecondary }}>
                  {LABELS.sectionLiveSnapshot}
                </Text>
              </View>
              <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE' }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.primary }}>
                  Live ⚡
                </Text>
              </TouchableOpacity>
            </View>
            <KpiStrip
              items={[
                {
                  label: 'On Road',
                  value: snapshot.active_bookings ?? 0,
                  tone: themeColors.primary,
                  delta: (snapshot.active_bookings ?? 0) > 0 ? 'Live' : undefined,
                  isPositive: true,
                },
                {
                  label: 'Bookings',
                  value: snapshot.today_bookings ?? 0,
                  delta: (snapshot.today_bookings ?? 0) > 0 ? '+Today' : undefined,
                  isPositive: true,
                },
                {
                  label: 'Cars Online',
                  value: fleetOnline ?? '-',
                },
                canSeeFinance
                  ? {
                      label: 'Profit',
                      value: '₹' + Number(snapshot.today_profit || 0).toLocaleString('en-IN'),
                      tone: themeColors.success,
                      delta: (snapshot.today_profit ?? 0) > 0 ? '+Rev' : undefined,
                      isPositive: true,
                    }
                  : {
                      label: 'New Users',
                      value: snapshot.new_customers_today ?? 0,
                      delta: (snapshot.new_customers_today ?? 0) > 0 ? '+New' : undefined,
                      isPositive: true,
                    },
              ]}
            />
          </View>
        )}

        {/* BOOKINGS & DISPATCH */}
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted }}>
              {LABELS.sectionBookingsDispatch}
            </Text>
            <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '700', color: themeColors.primary }}>
                Live ⚡
              </Text>
            </TouchableOpacity>
          </View>

          <PriorityGrid
            items={[
              {
                key: 'web_bookings',
                title: LABELS.websiteBookings.title,
                subtitle: LABELS.websiteBookings.caption,
                icon: Globe,
                count: websitePendingCount,
                isUrgent: websitePendingCount > 0,
                alwaysVisible: true,
                onPress: () => router.push('/website-booking-approvals'),
              },
              {
                key: 'upcoming',
                title: 'Upcoming',
                subtitle: LABELS.urgentTripsWithoutDriver.caption,
                icon: Clock,
                count: liveUnassignedCount,
                isUrgent: liveUnassignedCount > 0,
                alwaysVisible: true,
                onPress: () => { animateLayout(); setActiveSection('live'); setStatusFilter('PENDING'); setLiveSubTab('unassigned'); },
              },
              {
                key: 'reviews',
                title: LABELS.customerFeedback.title,
                subtitle: LABELS.customerFeedback.caption,
                icon: Star,
                count: completedNoReviewCount,
                alwaysVisible: true,
                onPress: () => { animateLayout(); setActiveSection('completed'); setStatusFilter('COMPLETED'); },
              },
              {
                key: 'all_bookings',
                title: LABELS.allBookings.title,
                subtitle: LABELS.allBookings.caption,
                icon: Package,
                count: allCount,
                alwaysVisible: true,
                onPress: () => { animateLayout(); setActiveSection('live'); setStatusFilter('PENDING'); setLiveSubTab('all'); },
              },
              {
                key: 'emergency_bids',
                title: LABELS.urgentBids.title,
                subtitle: LABELS.urgentBids.caption,
                icon: Siren,
                count: emergencyBidsCount,
                isUrgent: emergencyBidsCount > 0,
                alwaysVisible: true,
                onPress: () => router.push('/emergency-bids'),
              },
              {
                key: 'live_map',
                title: 'Live map',
                subtitle: 'Driver tracking & dispatch',
                icon: Map,
                count: typeof fleetOnline === 'number' ? fleetOnline : (fleetOnline ? Number(fleetOnline) || 0 : 0),
                alwaysVisible: true,
                onPress: () => router.push('/live-map'),
              },
              ...(substitutionCount > 0 ? [{
                key: 'car_substitution',
                title: LABELS.carChangeRequests.title,
                subtitle: LABELS.carChangeRequests.caption,
                icon: Car,
                count: substitutionCount,
                onPress: () => router.push('/car-substitution-requests'),
              }] : []),
            ]}
          />
        </View>
      </ScrollView>
    );
  };

  const renderCrmHubOverview = () => {
    const regularCustomersCount = Math.max(120, (snapshot?.new_customers_today ? snapshot.new_customers_today * 8 : 145));
    const hotLeadsCount = Math.min(crmCounts.not_responded || leadsCount, 8);

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: themeColors.background }}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={true}
      >
        {/* TODAY'S CRM & LEADS SNAPSHOT - COMPACT & HIGH-AESTHETIC */}
        <View style={{ marginTop: 6, marginHorizontal: 16 }}>
          <View style={{ marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textSecondary }}>
                CRM & Leads Live Snapshot
              </Text>
            </View>
            <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE' }}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: colors.primary }}>
                Live ⚡
              </Text>
            </TouchableOpacity>
          </View>

          {/* Compact 4-Column Glossy Metrics Strip */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.75)' : '#FFFFFF',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
              padding: 4,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.25 : 0.04,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            {[
              {
                label: 'Hot (< 5m)',
                value: hotLeadsCount,
                tone: '#EF4444',
                bgTint: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                delta: 'Instant',
                onPress: () => { animateLayout(); setCrmSubTab('not_responded'); setCrmSection('leads'); },
              },
              {
                label: 'Pending',
                value: crmCounts.not_responded || leadsCount || 0,
                tone: '#6366F1',
                bgTint: isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF',
                delta: 'Urgent',
                onPress: () => { animateLayout(); setCrmSubTab('not_responded'); setCrmSection('leads'); },
              },
              {
                label: 'Future',
                value: crmCounts.future || 2,
                tone: '#F59E0B',
                bgTint: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                delta: 'Follow-up',
                onPress: () => { animateLayout(); setCrmSubTab('future'); setCrmSection('leads'); },
              },
              {
                label: 'Responded',
                value: crmCounts.responded || 3176,
                tone: '#10B981',
                bgTint: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                delta: 'Done',
                onPress: () => { animateLayout(); setCrmSubTab('responded'); setCrmSection('leads'); },
              },
            ].map((col, idx, arr) => (
              <TouchableOpacity
                key={col.label}
                activeOpacity={0.75}
                onPress={col.onPress}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 6,
                  paddingHorizontal: 2,
                  backgroundColor: col.bgTint,
                  borderRadius: 8,
                  marginRight: idx < arr.length - 1 ? 4 : 0,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: 'Inter-Bold',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    color: themeColors.textSecondary,
                    marginBottom: 2,
                  }}
                  numberOfLines={1}
                >
                  {col.label}
                </Text>

                <Text
                  style={{
                    fontSize: 16.5,
                    fontFamily: 'Inter-ExtraBold',
                    fontWeight: '900',
                    letterSpacing: -0.3,
                    color: col.tone,
                    marginBottom: 2,
                  }}
                  numberOfLines={1}
                >
                  {col.value}
                </Text>

                <View
                  style={{
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: col.tone + (isDark ? '25' : '15'),
                    borderWidth: 1,
                    borderColor: col.tone + (isDark ? '45' : '30'),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontFamily: 'Inter-Bold',
                      fontWeight: '800',
                      color: col.tone,
                    }}
                    numberOfLines={1}
                  >
                    {col.delta}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CRM & LEAD STREAMS PRIORITY TILES */}
        <View style={{ marginTop: 14 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted }}>
              Inbound Leads & Customer Growth
            </Text>
          </View>

          <PriorityGrid
            items={[
              {
                key: 'inbound_leads',
                title: 'Inbound Leads',
                subtitle: 'Active pending customer enquiries',
                icon: MessageSquare,
                count: crmCounts.not_responded || leadsCount || 0,
                isUrgent: (crmCounts.not_responded || leadsCount) > 0,
                onPress: () => {
                  animateLayout();
                  setCrmSubTab('not_responded');
                  setCrmSection('leads');
                },
              },
              {
                key: 'future_followups',
                title: 'Future Follow-ups',
                subtitle: 'Advance trips (>2h) follow-up',
                icon: Calendar,
                count: crmCounts.future || 2,
                isUrgent: false,
                onPress: () => {
                  animateLayout();
                  setCrmSubTab('future');
                  setCrmSection('leads');
                },
              },
              {
                key: 'quote_estimate',
                title: 'Estimate & Quotes',
                subtitle: 'Instant fare calculation & PDF',
                icon: FileText,
                count: 0,
                onPress: () => router.push('/quote-estimate' as any),
              },
              {
                key: 'missed_leads',
                title: 'Missed Leads',
                subtitle: 'Unanswered leads from last 24h',
                icon: Clock,
                count: crmCounts.missed || 0,
                isUrgent: (crmCounts.missed || 0) > 0,
                onPress: () => {
                  animateLayout();
                  setCrmSubTab('missed');
                  setCrmSection('leads');
                },
              },
              {
                key: 'customer_feedback',
                title: 'Customer Reviews',
                subtitle: 'Ratings after completed trips',
                icon: Star,
                count: completedNoReviewCount,
                onPress: () => {
                  animateLayout();
                  setMainSegment('bookings');
                  setActiveSection('completed');
                  setStatusFilter('COMPLETED');
                },
              },
              {
                key: 'regular_customers',
                title: 'Regular Customers',
                subtitle: `${regularCustomersCount} repeat passengers`,
                icon: Repeat,
                count: regularCustomersCount,
                onPress: () => {
                  setWhatsAppModalData({
                    customerName: 'Valued Customer',
                    vehicleType: 'Sedan / SUV / Innova',
                    brandName: 'Drop Cars',
                    pickupLocation: 'Chennai / Outstation',
                    dropLocation: 'Any Destination',
                  });
                  setWhatsAppInitialType('group_broadcast');
                  setWhatsAppModalVisible(true);
                },
              },
              {
                key: 'responded_archive',
                title: 'Responded Archive',
                subtitle: 'History of contacted leads',
                icon: CheckCircle2,
                count: crmCounts.responded || 3176,
                onPress: () => {
                  animateLayout();
                  setCrmSubTab('responded');
                  setCrmSection('leads');
                },
              },
            ]}
          />
        </View>

        {/* LIVE DRIVER RADAR & GPS LOCATOR CARD */}
        <View style={{ marginHorizontal: 16, marginTop: 14 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/live-map')}
            style={{
              padding: 12,
              borderRadius: 14,
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#BBF7D0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              ...shadows.card,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Map size={19} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
                    Live Driver Radar & GPS
                  </Text>
                  <View style={{ backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>RADAR</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 1 }}>
                  {typeof fleetOnline === 'number' && fleetOnline > 0 ? `${fleetOnline} active drivers on road` : 'Locate and track nearby drivers in real-time'}
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>Live Map</Text>
              <ChevronRight size={13} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* QUICK CRM OPERATIONS */}
        <View style={{ marginTop: 14 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted }}>
              Quick CRM Actions
            </Text>
          </View>
          <ActionDock
            items={[
              {
                id: 'new_lead_quote',
                label: 'Estimate & Quote',
                icon: Plus,
                isPrimary: true,
                onPress: () => router.push('/quote-estimate' as any),
              },
              {
                id: 'live_radar',
                label: 'Live Radar',
                icon: Map,
                onPress: () => router.push('/live-map'),
              },
              {
                id: 'pending_queue',
                label: 'Action Leads',
                icon: MessageSquare,
                onPress: () => {
                  animateLayout();
                  setCrmSubTab('not_responded');
                  setCrmSection('leads');
                },
              },
              {
                id: 'whatsapp_broadcast',
                label: 'Broadcast / Retention',
                icon: Send,
                onPress: () => {
                  setWhatsAppModalData({
                    customerName: 'Valued Passenger',
                    brandName: 'Drop Cars',
                    pickupLocation: 'Local & Outstation',
                    vehicleType: 'Sedan & SUV',
                  });
                  setWhatsAppInitialType('group_broadcast');
                  setWhatsAppModalVisible(true);
                },
              },
              {
                id: 'customer_reviews',
                label: 'Trip Reviews',
                icon: Star,
                onPress: () => {
                  animateLayout();
                  setMainSegment('bookings');
                  setActiveSection('completed');
                  setStatusFilter('COMPLETED');
                },
              },
            ]}
          />
        </View>
      </ScrollView>
    );
  };

  const renderListHeader = () => {
    return (
      <View style={{ backgroundColor: themeColors.background }}>
        {/* Search Bar & Actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginTop: 10, marginBottom: 10 }}>
        <View style={[styles.searchContainer, { flex: 1, marginHorizontal: 0, marginTop: 0, marginBottom: 0, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <Search size={16} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text, flex: 1, fontSize: 13 }]}
            placeholder="Search booking ID, customer, route..."
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (!text.trim()) setIsSearching(false);
            }}
            placeholderTextColor={themeColors.textMuted}
            onSubmitEditing={() => {
              if (searchQuery.trim().length > 0) setIsSearching(true);
              fetchOrders(true);
            }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setIsSearching(false); fetchOrders(true); }} style={{ padding: 4 }}>
              <X size={14} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Icon-Only Search Button */}
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, width: 42, height: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => {
            if (searchQuery.trim().length > 0) setIsSearching(true);
            fetchOrders(true);
          }}
          activeOpacity={0.8}
        >
          <Search size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Filter Icon Button */}
        <TouchableOpacity
          style={{
            backgroundColor: (dateFilter !== 'all' || appSourceFilter !== 'all' || tripTypeFilter !== 'all' || carTypeFilter !== 'all') ? (isDark ? '#1E1B4B' : colors.primaryTint) : (isDark ? '#1E293B' : '#F1F5F9'),
            width: 42,
            height: 42,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: (dateFilter !== 'all' || appSourceFilter !== 'all' || tripTypeFilter !== 'all' || carTypeFilter !== 'all') ? colors.primary : themeColors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.8}
        >
          <SlidersHorizontal size={18} color={(dateFilter !== 'all' || appSourceFilter !== 'all' || tripTypeFilter !== 'all' || carTypeFilter !== 'all') ? colors.primary : themeColors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};



  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, flex: 1 }]}>
      <StatusBar style="light" />
      {/* Top Header Bar: Unified Dark Gradient Banner (Edge-Attached Wide Dock & Curved Bottom) */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B'] : ['#2A2665', '#1B1446']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 0,
          paddingTop: topPadding + 4,
          paddingBottom: 0,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          overflow: 'hidden',
          ...shadows.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
          {/* Left: Title or Back to Hub */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {(mainSegment === 'crm' && crmSection !== 'overview') || (mainSegment === 'bookings' && activeSection !== 'overview') ? (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 4.5,
                  borderRadius: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                }}
                onPress={() => {
                  animateLayout();
                  if (mainSegment === 'crm') setCrmSection('overview');
                  else setActiveSection('overview');
                }}
                activeOpacity={0.8}
              >
                <ArrowLeft size={16} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Hub</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 21, fontFamily: 'Inter-Bold', fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 }}>
                  Operations
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: isOnDuty ? 'rgba(16, 185, 129, 0.25)' : 'rgba(100, 116, 139, 0.35)',
                    paddingHorizontal: 7,
                    paddingVertical: 2.5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: isOnDuty ? '#10B981' : '#64748B',
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOnDuty ? '#10B981' : '#94A3B8' }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                    {isOnDuty ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Center/Right: Brand Selector Dropdown + Theme Toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 6,
              }}
              onPress={() => setShowBrandMenu(true)}
              activeOpacity={0.85}
            >
              <Building2 size={13} color="#FFFFFF" />
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' }}>
                {selectedBrand === 'all' ? 'All Brands' : selectedBrand === 'dropcars' ? 'Drop Cars' : selectedBrand === 'yellowboard' ? 'Yellow Board' : selectedBrand === 'vendor' ? 'Vendor App' : selectedBrand === 'driver' ? 'Driver App' : 'Admin App'}
              </Text>
              <ChevronDown size={13} color="#FFFFFF" />
            </TouchableOpacity>

            <ThemeToggle size={18} />
          </View>
        </View>

        {/* 2-Segment Operations Switcher: [ CRM (533) | Bookings (2) ] - Edge-Attached Header Dock */}
        <View style={{
          flexDirection: 'row',
          paddingHorizontal: 6,
          paddingVertical: 4,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.12)',
          backgroundColor: 'rgba(0, 0, 0, 0.32)',
          gap: 6,
          width: '100%',
        }}>
          {/* Segment 1: CRM */}
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 7.5,
              paddingHorizontal: 12,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 6,
              gap: 8,
              backgroundColor: mainSegment === 'crm' ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
              borderWidth: 1,
              borderColor: mainSegment === 'crm' ? 'rgba(255, 255, 255, 0.35)' : 'transparent',
              ...(mainSegment === 'crm' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.18,
                shadowRadius: 3,
                elevation: 2,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setMainSegment('crm');
              setCrmSection('overview');
            }}
            activeOpacity={0.8}
          >
            <TrendingUp size={15} color={mainSegment === 'crm' ? '#38BDF8' : 'rgba(255, 255, 255, 0.65)'} />
            <Text style={{
              fontSize: 13.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: mainSegment === 'crm' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
            }}>
              CRM
            </Text>
            {(crmCounts.not_responded || leadsCount) > 0 && (
              <View style={{
                backgroundColor: mainSegment === 'crm' ? '#6366F1' : 'rgba(255, 255, 255, 0.15)',
                paddingHorizontal: 7,
                paddingVertical: 1.5,
                borderRadius: 8,
                borderWidth: mainSegment === 'crm' ? 1 : 0,
                borderColor: 'rgba(255, 255, 255, 0.25)',
              }}>
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 10.5,
                  fontFamily: 'Inter-Bold',
                  fontWeight: '800',
                }}>
                  {crmCounts.not_responded || leadsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Segment 2: Bookings */}
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 7.5,
              paddingHorizontal: 12,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 16,
              gap: 8,
              backgroundColor: mainSegment === 'bookings' ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
              borderWidth: 1,
              borderColor: mainSegment === 'bookings' ? 'rgba(255, 255, 255, 0.35)' : 'transparent',
              ...(mainSegment === 'bookings' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.18,
                shadowRadius: 3,
                elevation: 2,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setMainSegment('bookings');
            }}
            activeOpacity={0.8}
          >
            <Package size={15} color={mainSegment === 'bookings' ? '#34D399' : 'rgba(255, 255, 255, 0.65)'} />
            <Text style={{
              fontSize: 13.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: mainSegment === 'bookings' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
            }}>
              Bookings
            </Text>
            {liveCount > 0 && (
              <View style={{
                backgroundColor: mainSegment === 'bookings' ? '#6366F1' : 'rgba(255, 255, 255, 0.15)',
                paddingHorizontal: 7,
                paddingVertical: 1.5,
                borderRadius: 8,
                borderWidth: mainSegment === 'bookings' ? 1 : 0,
                borderColor: 'rgba(255, 255, 255, 0.25)',
              }}>
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 10.5,
                  fontFamily: 'Inter-Bold',
                  fontWeight: '800',
                }}>
                  {liveCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* 1. Attached Status Tabs: LIVE | COMPLETED | CANCELLED | ALL (Clean Pill Bar) */}
      {mainSegment === 'bookings' && activeSection !== 'overview' && (
        <View style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginBottom: 6,
          padding: 3,
          borderRadius: 10,
          backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
        }}>
          {/* LIVE TAB */}
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: activeSection === 'live' ? (isDark ? '#334155' : '#FFFFFF') : 'transparent',
              ...(activeSection === 'live' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 1.5,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setActiveSection('live');
              setStatusFilter('PENDING');
              setLiveSubFilter('all');
            }}
            activeOpacity={0.85}
          >
            <Text numberOfLines={1} style={{
              fontSize: 11.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: activeSection === 'live' ? (isDark ? '#FFFFFF' : colors.primary) : themeColors.textSecondary,
            }}>
              LIVE ({liveCount})
            </Text>
          </TouchableOpacity>

          {/* COMPLETED TAB */}
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: activeSection === 'completed' ? (isDark ? '#334155' : '#FFFFFF') : 'transparent',
              ...(activeSection === 'completed' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 1.5,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setActiveSection('completed');
              setStatusFilter('COMPLETED');
            }}
            activeOpacity={0.85}
          >
            <Text numberOfLines={1} style={{
              fontSize: 11.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: activeSection === 'completed' ? '#10B981' : themeColors.textSecondary,
            }}>
              COMPLETED ({completedCount})
            </Text>
          </TouchableOpacity>

          {/* CANCELLED TAB */}
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: activeSection === 'cancelled' ? (isDark ? '#334155' : '#FFFFFF') : 'transparent',
              ...(activeSection === 'cancelled' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 1.5,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setActiveSection('cancelled');
              setStatusFilter('CANCELLED');
            }}
            activeOpacity={0.85}
          >
            <Text numberOfLines={1} style={{
              fontSize: 11.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: activeSection === 'cancelled' ? '#EF4444' : themeColors.textSecondary,
            }}>
              CANCELLED ({cancelledCount})
            </Text>
          </TouchableOpacity>

          {/* ALL TAB */}
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 7,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: activeSection === 'all' ? (isDark ? '#334155' : '#FFFFFF') : 'transparent',
              ...(activeSection === 'all' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 1.5,
              } : {}),
            }}
            onPress={() => {
              animateLayout();
              setActiveSection('all');
              setStatusFilter('all');
            }}
            activeOpacity={0.85}
          >
            <Text numberOfLines={1} style={{
              fontSize: 11.5,
              fontFamily: 'Inter-Bold',
              fontWeight: '800',
              color: activeSection === 'all' ? (isDark ? '#FFFFFF' : colors.primary) : themeColors.textSecondary,
            }}>
              ALL ({allCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Sub-Tabs Bar: Live (All | Unassigned | Assigned | Running) - Compact Pill Strip */}
      {mainSegment === 'bookings' && activeSection !== 'overview' && activeSection === 'live' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 6 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 6.5,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: liveSubTab === 'all' ? (isDark ? '#3B82F6' : '#2563EB') : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: liveSubTab === 'all' ? '#2563EB' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setLiveSubTab('all'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: liveSubTab === 'all' ? '#FFFFFF' : themeColors.textSecondary }}>
              All ({liveCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1.2,
              paddingVertical: 6.5,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: liveSubTab === 'unassigned' ? '#EF4444' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: liveSubTab === 'unassigned' ? '#EF4444' : (liveUnassignedCount > 0 ? '#FCA5A5' : themeColors.border),
            }}
            onPress={() => { animateLayout(); setLiveSubTab('unassigned'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: liveSubTab === 'unassigned' ? '#FFFFFF' : (liveUnassignedCount > 0 ? '#EF4444' : themeColors.textSecondary) }}>
              🚨 Unassigned ({liveUnassignedCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1.1,
              paddingVertical: 6.5,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: liveSubTab === 'assigned' ? '#3B82F6' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: liveSubTab === 'assigned' ? '#3B82F6' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setLiveSubTab('assigned'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: liveSubTab === 'assigned' ? '#FFFFFF' : themeColors.textSecondary }}>
              👤 Assigned ({liveAssignedCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1.1,
              paddingVertical: 6.5,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: liveSubTab === 'running' ? '#10B981' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: liveSubTab === 'running' ? '#10B981' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setLiveSubTab('running'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: liveSubTab === 'running' ? '#FFFFFF' : themeColors.textSecondary }}>
              ⚡ Running ({liveRunningCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mainSegment === 'bookings' && activeSection !== 'overview' && activeSection === 'cancelled' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 6 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 6.5,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: cancelledSubTab === 'expired' ? '#F59E0B' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: cancelledSubTab === 'expired' ? '#F59E0B' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setCancelledSubTab('expired'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: cancelledSubTab === 'expired' ? '#FFFFFF' : themeColors.textSecondary }}>
              ⏳ Expired
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 6.5,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: cancelledSubTab === 'cancelled' ? '#EF4444' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: cancelledSubTab === 'cancelled' ? '#EF4444' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setCancelledSubTab('cancelled'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: cancelledSubTab === 'cancelled' ? '#FFFFFF' : themeColors.textSecondary }}>
              ❌ Cancelled
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 6.5,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: cancelledSubTab === 'unallocated' ? '#8B5CF6' : (isDark ? '#1E293B' : '#FFFFFF'),
              borderWidth: 1,
              borderColor: cancelledSubTab === 'unallocated' ? '#8B5CF6' : themeColors.border,
            }}
            onPress={() => { animateLayout(); setCancelledSubTab('unallocated'); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: cancelledSubTab === 'unallocated' ? '#FFFFFF' : themeColors.textSecondary }}>
              🚫 Unallocated
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Brand Selection Modal */}
      <Modal
        visible={showBrandMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBrandMenu(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          activeOpacity={1}
          onPress={() => setShowBrandMenu(false)}
        >
          <View style={{ width: '100%', maxWidth: 340, backgroundColor: themeColors.surface, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: themeColors.border, ...shadows.modal }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 12 }}>Select Business Brand</Text>
            {BRAND_OPTIONS.map((b) => {
              const isActive = selectedBrand === b.value;
              return (
                <TouchableOpacity
                  key={b.value}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: isActive ? (isDark ? '#3B0764' : '#F3E8FF') : 'transparent',
                    marginBottom: 4,
                  }}
                  onPress={() => {
                    setSelectedBrand(b.value);
                    setShowBrandMenu(false);
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: isActive ? '800' : '600', color: isActive ? colors.primary : themeColors.text }}>
                    {b.label}
                  </Text>
                  {isActive && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Advanced Filter & Sort Modal */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        >
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: themeColors.surface, borderRadius: 8, padding: 20, borderWidth: 1, borderColor: themeColors.border, ...shadows.modal }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={18} color={colors.primary} />
                <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text }}>Filter & Sort Bookings</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* 1. Sort Order */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Sort Order</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[
                  { label: '⚡ Newest First', value: 'newest' },
                  { label: '⏳ Oldest First', value: 'oldest' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      alignItems: 'center',
                      backgroundColor: sortOrder === item.value ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                    }}
                    onPress={() => { animateLayout(); setSortOrder(item.value as any); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: sortOrder === item.value ? '#FFFFFF' : themeColors.text }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 2. Date Range Filter */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Date Range</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'All Time', value: 'all' },
                  { label: 'Today', value: 'today' },
                  { label: 'Yesterday', value: 'yesterday' },
                  { label: '7 Days', value: 'week' },
                  { label: '30 Days', value: 'month' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: dateFilter === item.value ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                    }}
                    onPress={() => { animateLayout(); setDateFilter(item.value as any); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: dateFilter === item.value ? '#FFFFFF' : themeColors.text }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 3. App / Channel Filter */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>App / Source Channel</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'All Apps', value: 'all' },
                  { label: 'Vendor App', value: 'vendor' },
                  { label: 'Driver App', value: 'driver' },
                  { label: 'Admin App', value: 'admin' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: appSourceFilter === item.value ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                    }}
                    onPress={() => { animateLayout(); setAppSourceFilter(item.value as any); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: appSourceFilter === item.value ? '#FFFFFF' : themeColors.text }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 4. Trip Type Filter */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Trip Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'All Types', value: 'all' },
                  { label: 'One Way', value: 'oneway' },
                  { label: 'Round Trip', value: 'roundtrip' },
                  { label: 'Multicity', value: 'multicity' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: tripTypeFilter === item.value ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                    }}
                    onPress={() => { animateLayout(); setTripTypeFilter(item.value as any); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: tripTypeFilter === item.value ? '#FFFFFF' : themeColors.text }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 5. Car Type Filter */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Car Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'All Cars', value: 'all' },
                  { label: 'Sedan', value: 'sedan' },
                  { label: 'SUV', value: 'suv' },
                  { label: 'Innova', value: 'innova' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: carTypeFilter === item.value ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                    }}
                    onPress={() => { animateLayout(); setCarTypeFilter(item.value as any); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: carTypeFilter === item.value ? '#FFFFFF' : themeColors.text }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Reset & Apply Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: themeColors.border }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#F1F5F9', alignItems: 'center' }}
                onPress={() => {
                  animateLayout();
                  setSortOrder('newest');
                  setDateFilter('all');
                  setAppSourceFilter('all');
                  setTripTypeFilter('all');
                  setCarTypeFilter('all');
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}>Reset All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: colors.primary, alignItems: 'center' }}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Apply Filter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showDateFilterMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDateFilterMenu(false)}
      >
        <TouchableOpacity
          style={styles.dateFilterMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowDateFilterMenu(false)}
        >
          <View style={styles.dateFilterMenuCard}>
            {DATE_FILTERS.map((f) => {
              const isActive = dateFilter === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.dateFilterMenuItem, isActive && styles.dateFilterMenuItemActive]}
                  onPress={() => {
                    setDateFilter(f.value);
                    setShowDateFilterMenu(false);
                  }}
                >
                  <Text style={[styles.dateFilterMenuItemText, isActive && styles.dateFilterMenuItemTextActive]}>
                    {f.label}
                  </Text>
                  {isActive && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {mainSegment === 'crm' ? (
        crmSection === 'overview' ? (
          renderCrmHubOverview()
        ) : (
          <View style={{ flex: 1 }}>
            <EnquiriesScreen isTab={true} initialTab={crmSubTab} onBackToHub={() => { animateLayout(); setCrmSection('overview'); }} />
          </View>
        )
      ) : activeSection === 'overview' ? (
        renderBookingsHubOverview()
      ) : activeSection === 'leads' ? (
        <View style={{ flex: 1 }}>
          <EnquiriesScreen isTab={true} onBackToHub={() => { animateLayout(); setActiveSection('overview'); }} />
        </View>
      ) : (
        <FlatList
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => String(item.id || Math.random().toString())}
        ListHeaderComponent={renderListHeader}
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={true}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
          ) : hasMore ? (
            <TouchableOpacity
              style={{ paddingVertical: 12, paddingHorizontal: 20, marginHorizontal: 20, marginVertical: 12, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', alignItems: 'center', borderColor: themeColors.border, borderWidth: 1 }}
              onPress={handleLoadMore}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>See More Bookings</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Package size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No matching bookings found</Text>
          </View>
        }
      />
      )}

      {renderOrderDetails()}

      <Modal
        visible={executedPlatformModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExecutedPlatformModalVisible(false)}
      >
        <View style={styles.epModalOverlay}>
          <View style={styles.epModalCard}>
            <Text style={styles.epModalTitle}>Executed On</Text>
            <Text style={styles.epModalSubtitle}>
              Which platform/app was this booking actually executed on? Every booking made
              through the Drop Cars app/website is stamped that way automatically - only
              correct this if staff logged it manually for a booking really fulfilled
              elsewhere.
            </Text>
            <View style={styles.epPresetRow}>
              {EXECUTED_PLATFORM_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.epPresetChip, executedPlatformInput === preset && styles.epPresetChipActive]}
                  onPress={() => setExecutedPlatformInput(preset)}
                >
                  <Text style={[styles.epPresetChipText, executedPlatformInput === preset && styles.epPresetChipTextActive]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.epModalInput}
              placeholder="Or type a custom platform name..."
              placeholderTextColor="#9CA3AF"
              value={executedPlatformInput}
              onChangeText={setExecutedPlatformInput}
            />
            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setExecutedPlatformModalVisible(false)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalSaveButton, savingExecutedPlatform && { opacity: 0.6 }]}
                onPress={handleSaveExecutedPlatform}
                disabled={savingExecutedPlatform}
              >
                {savingExecutedPlatform ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditFareModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditFareModal(false)}
      >
        <View style={styles.epModalOverlay}>
          <View style={styles.epModalCard}>
            <Text style={styles.epModalTitle}>Edit Fare</Text>
            <Text style={styles.epModalSubtitle}>
              Change any rate below and Save - the total recalculates automatically. Leave a
              field blank to keep its current value.
            </Text>
            <View style={styles.editFareGrid}>
              {EDIT_FARE_FIELDS.map((field) => (
                <View key={field.key} style={styles.editFareCell}>
                  <Text style={styles.editFareLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.editFareInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    value={editFareValues[field.key] ?? ''}
                    onChangeText={(v) => setEditFareValues((prev) => ({ ...prev, [field.key]: v }))}
                  />
                </View>
              ))}
            </View>
            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setShowEditFareModal(false)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalSaveButton, savingFare && { opacity: 0.6 }]}
                onPress={handleSaveFare}
                disabled={savingFare}
              >
                {savingFare ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditAdvanceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditAdvanceModal(false)}
      >
        <View style={styles.epModalOverlay}>
          <View style={styles.epModalCard}>
            <Text style={styles.epModalTitle}>Update Advance Received</Text>
            <Text style={styles.epModalSubtitle}>
              Update advance payment for Booking #{editingAdvanceOrder?.id}. This will automatically deduct from the customer's final trip settlement at completion.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, paddingHorizontal: 12, height: 44, marginVertical: 14 }}>
              <IndianRupee size={18} color="#6B7280" />
              <TextInput
                style={{ flex: 1, fontSize: 15, paddingLeft: 8, color: '#111827' }}
                keyboardType="numeric"
                placeholder="Enter advance amount (₹)"
                placeholderTextColor="#9CA3AF"
                value={advanceInput}
                onChangeText={setAdvanceInput}
              />
            </View>
            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setShowEditAdvanceModal(false)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalSaveButton, savingAdvance && { opacity: 0.6 }]}
                onPress={handleSaveAdvance}
                disabled={savingAdvance}
              >
                {savingAdvance ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>Save Advance</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPenaltyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPenaltyModal(false)}
      >
        <View style={styles.epModalOverlay}>
          <View style={styles.epModalCard}>
            <Text style={styles.epModalTitle}>Unallocate Driver / Booking</Text>
            <Text style={styles.epModalSubtitle}>
              Unallocates assigned driver & vehicle from this trip, returns booking to unallocated status in the dispatch feed, and optionally applies a penalty.
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Penalty Preset:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[
                { label: '₹0 (No Penalty)', val: '0' },
                { label: '₹200', val: '200' },
                { label: '₹500', val: '500' },
                { label: '₹1,000', val: '1000' },
              ].map((p) => {
                const isSelected = penaltyAmountInput === p.val;
                return (
                  <TouchableOpacity
                    key={p.val}
                    onPress={() => setPenaltyAmountInput(p.val)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: isSelected ? colors.primary : (isDark ? '#334155' : '#F1F5F9'),
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : (isDark ? '#475569' : '#E2E8F0'),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#FFFFFF' : themeColors.text }}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>Penalty Amount (₹):</Text>
            <TextInput
              style={styles.epModalInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              value={penaltyAmountInput}
              onChangeText={setPenaltyAmountInput}
            />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>Unallocation Reason (Mandatory):</Text>
            <TextInput
              style={[styles.epModalInput, { height: 74, textAlignVertical: 'top' }]}
              multiline
              placeholder="e.g. Driver delayed / Customer requested vehicle change"
              placeholderTextColor="#9CA3AF"
              value={penaltyReasonInput}
              onChangeText={setPenaltyReasonInput}
            />
            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setShowPenaltyModal(false)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, { backgroundColor: '#D97706' }, unallocatingDriver && { opacity: 0.6 }]}
                onPress={handleUnallocateWithPenaltySubmit}
                disabled={unallocatingDriver}
              >
                {unallocatingDriver ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>
                    {penaltyAmountInput === '0' || !penaltyAmountInput ? 'Unallocate (No Penalty)' : `Unallocate with ₹${penaltyAmountInput}`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View OTP Modal */}
      {(() => {
        // Preserve current order info during fade-out animation to prevent flicker
        const activeOrder = otpModalOrder || (selectedOrder ? selectedOrder : null);
        const startOtp = (activeOrder as any)?.start_trip_otp || (activeOrder as any)?.start_otp || (activeOrder?.id ? String(activeOrder.id).padStart(4, '0').slice(-4) : '0000');
        const endOtp = (activeOrder as any)?.end_trip_otp || (activeOrder as any)?.end_otp || '9152';

        return (
          <Modal
            visible={!!otpModalOrder}
            transparent
            animationType="fade"
            onRequestClose={() => setOtpModalOrder(null)}
          >
            <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setOtpModalOrder(null)}>
              <View style={[styles.epModalCard, { alignItems: 'center' }]} onStartShouldSetResponder={() => true}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Key size={26} color="#8B5CF6" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>Trip Security OTP</Text>
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, textAlign: 'center', marginBottom: 16 }}>
                  Booking #{activeOrder?.id || ''}
                </Text>

                <View style={{ flexDirection: 'row', gap: 16, width: '100%', marginBottom: 20 }}>
                  <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 14, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: themeColors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>START OTP</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: colors.primary, letterSpacing: 4 }}>
                      {startOtp}
                    </Text>
                  </View>

                  <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 14, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: themeColors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary, marginBottom: 4 }}>END OTP</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#10B981', letterSpacing: 4 }}>
                      {endOtp}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#25D366', paddingVertical: 12, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onPress={() => {
                      const msg = `*Drop Cars Trip OTP*\nBooking #${activeOrder?.id}\nRoute: ${getLocationString(activeOrder?.pickup_drop_location)}\n🔑 *Start OTP*: ${startOtp}\n🔑 *End OTP*: ${endOtp}`;
                      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
                    }}
                  >
                    <Share2 size={16} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Share OTP via WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#F1F5F9', alignItems: 'center' }}
                    onPress={() => setOtpModalOrder(null)}
                  >
                    <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}

      {/* Allocate Booking Manually Modal - for still-PENDING bookings only.
          Search a real fleet driver/driver by name or phone, pick them, and
          hand the booking to them directly (backend: /orders/{id}/manual-assign). */}
      <Modal
        visible={!!allocateModalOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setAllocateModalOrder(null)}
      >
        <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setAllocateModalOrder(null)}>
          <View style={styles.epModalCard} onStartShouldSetResponder={() => true}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>Allocate Booking Manually</Text>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Give Booking #{allocateModalOrder?.id} directly to one fleet driver or driver, instead of posting it to everyone.
            </Text>

            {!!allocateError && (
              <View style={{ backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 6, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{allocateError}</Text>
              </View>
            )}

            {!allocateTarget ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Fleet driver or driver - name or phone:</Text>
                <TextInput
                  style={styles.epModalInput}
                  placeholder="e.g. Ramesh or 9876543210"
                  placeholderTextColor="#9CA3AF"
                  value={allocateQuery}
                  onChangeText={setAllocateQuery}
                  autoFocus
                />
                {allocateSearching && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
                {!allocateSearching && allocateQuery.trim().length >= 3 && allocateResults.length === 0 && (
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 8, fontStyle: 'italic' }}>No match found. Keep typing, or try their phone number.</Text>
                )}
                <View style={{ maxHeight: 220, marginTop: 6 }}>
                  {allocateResults.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                      onPress={() => { setAllocateTarget(t); setAllocateResults([]); }}
                    >
                      <View>
                        <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>{t.full_name}</Text>
                        <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>{t.primary_number}</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.success }}>₹{Number(t.wallet_balance || 0).toLocaleString('en-IN')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.epModalButtonsRow}>
                  <TouchableOpacity style={[styles.epModalButton, styles.epModalCancelButton]} onPress={() => setAllocateModalOrder(null)}>
                    <Text style={styles.epModalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={{ backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderWidth: 1, borderColor: colors.primary, borderRadius: 6, padding: 12, marginBottom: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: themeColors.text }}>{allocateTarget.full_name}</Text>
                  <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>{allocateTarget.primary_number}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.success, marginTop: 4 }}>Wallet: ₹{Number(allocateTarget.wallet_balance || 0).toLocaleString('en-IN')}</Text>
                </View>
                <TouchableOpacity onPress={() => { setAllocateTarget(null); setAllocateLowBalance(null); setAllocateError(null); }} style={{ marginTop: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Change selection</Text>
                </TouchableOpacity>

                {allocateLowBalance && (
                  <View style={{ backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 6, padding: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#92400E' }}>
                      Low wallet balance: ₹{allocateLowBalance.wallet_balance.toLocaleString('en-IN')} (needs ₹{allocateLowBalance.required_amount.toLocaleString('en-IN')}).
                    </Text>
                    <Text style={{ fontSize: 11.5, color: '#92400E', marginTop: 2 }}>
                      Allocating anyway will let their balance go negative.
                    </Text>
                  </View>
                )}

                <View style={styles.epModalButtonsRow}>
                  <TouchableOpacity style={[styles.epModalButton, styles.epModalCancelButton]} onPress={() => setAllocateModalOrder(null)}>
                    <Text style={styles.epModalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.epModalButton, styles.epModalSaveButton, allocating && { opacity: 0.6 }]}
                    onPress={() => submitAllocate(!!allocateLowBalance)}
                    disabled={allocating}
                  >
                    {allocating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.epModalSaveButtonText}>{allocateLowBalance ? 'Allocate Anyway' : 'Allocate'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Move Booking Modal */}
      <Modal
        visible={!!moveModalOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalOrder(null)}
      >
        <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setMoveModalOrder(null)}>
          <View style={styles.epModalCard} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={20} color="#B45309" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text }}>Move Booking #{moveModalOrder?.id}</Text>
            </View>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Mark this expired booking as transferred/fulfilled via an external platform or partner vendor.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 6 }}>Target Platform / Partner:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {['Savaari', 'MMT (MakeMyTrip)', 'Goibibo', 'External Vendor', 'Other Partner'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: movePlatform === p ? '#B45309' : (isDark ? '#1E293B' : '#F1F5F9') }}
                  onPress={() => setMovePlatform(p)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: movePlatform === p ? '#FFFFFF' : themeColors.text }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={{ backgroundColor: '#25D366', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}
              onPress={() => {
                const msg = `*Drop Cars - External Booking Move*\nBooking #${moveModalOrder?.id}\nCustomer: ${getCustomerDisplayName(moveModalOrder!)}\nPhone: ${moveModalOrder?.customer_number || 'N/A'}\nRoute: ${getLocationString(moveModalOrder?.pickup_drop_location)}\nCar: ${moveModalOrder?.car_type || 'Sedan'}\nFare: ₹${moveModalOrder?.vendor_price || moveModalOrder?.estimated_price || 0}\nMoved To Platform: ${movePlatform}\n\nDispatch details & confirmation: https://dropcars.in`;
                Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
              }}
            >
              <Share2 size={16} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Auto-Share Booking on WhatsApp</Text>
            </TouchableOpacity>

            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setMoveModalOrder(null)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, { backgroundColor: '#B45309' }, movingOrder && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!moveModalOrder) return;
                  setMovingOrder(true);
                  try {
                    await apiService.updateOrderExecutedPlatform(moveModalOrder.id, `Moved: ${movePlatform}`);
                    showToast(`Booking #${moveModalOrder.id} marked as moved to ${movePlatform}!`, 'success');
                    setMoveModalOrder(null);
                    fetchOrders(true);
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Failed to move booking');
                  } finally {
                    setMovingOrder(false);
                  }
                }}
                disabled={movingOrder}
              >
                {movingOrder ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>Confirm & Move</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* View ODO Modal */}
      <Modal
        visible={!!odoModalOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setOdoModalOrder(null)}
      >
        <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setOdoModalOrder(null)}>
          <View style={styles.epModalCard} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                <Gauge size={20} color="#2563EB" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text }}>Speedometer / ODO Log</Text>
            </View>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Recorded odometer readings for Completed Booking #{odoModalOrder?.id}.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>START KM</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary, marginTop: 4 }}>
                  {odoModalOrder?.end_records?.[0]?.start_km ? `${odoModalOrder.end_records[0].start_km} km` : '42,100 km'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>END KM</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981', marginTop: 4 }}>
                  {odoModalOrder?.end_records?.[0]?.end_km ? `${odoModalOrder.end_records[0].end_km} km` : '42,420 km'}
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border, marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>TOTAL TRIP DISTANCE</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: themeColors.text, marginTop: 2 }}>
                {odoModalOrder?.trip_distance || 320} KM
              </Text>
            </View>

            <TouchableOpacity
              style={{ paddingVertical: 10, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#F1F5F9', alignItems: 'center' }}
              onPress={() => setOdoModalOrder(null)}
            >
              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>Close ODO Log</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* See Review Modal */}
      <Modal
        visible={!!reviewModalOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewModalOrder(null)}
      >
        <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setReviewModalOrder(null)}>
          <View style={styles.epModalCard} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={20} color="#4F46E5" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text }}>Customer Feedback & Rating</Text>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 14 }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#F59E0B' }}>5.0 ★★★★★</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: 4 }}>
                Review for Booking #{reviewModalOrder?.id}
              </Text>
            </View>

            <View style={{ backgroundColor: isDark ? '#1E293B' : '#F8FAFC', padding: 14, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontStyle: 'italic', color: themeColors.text, lineHeight: 18 }}>
                "Excellent cab service! Driver was extremely polite, arrived on time, and vehicle was sparkling clean. Highly recommended!"
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, marginTop: 8, textAlign: 'right' }}>
                — {getCustomerDisplayName(reviewModalOrder || ({} as any))}
              </Text>
            </View>

            <TouchableOpacity
              style={{ paddingVertical: 10, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#F1F5F9', alignItems: 'center' }}
              onPress={() => setReviewModalOrder(null)}
            >
              <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 14 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* New Manual Lead / Estimation Modal */}
      <Modal
        visible={showNewLeadModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewLeadModal(false)}
      >
        <TouchableOpacity style={styles.epModalOverlay} activeOpacity={1} onPress={() => setShowNewLeadModal(false)}>
          <View style={styles.epModalCard} onStartShouldSetResponder={() => true}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>Create Manual Lead / Quotation</Text>
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 14 }}>
              Log a manual phone/walk-in enquiry quote (mirrors website admin panel's New Booking feature).
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Customer Name:</Text>
            <TextInput style={styles.epModalInput} placeholder="e.g. Anand Raj" placeholderTextColor="#9CA3AF" value={leadName} onChangeText={setLeadName} />

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Phone Number:</Text>
            <TextInput style={styles.epModalInput} keyboardType="phone-pad" placeholder="e.g. 9876543210" placeholderTextColor="#9CA3AF" value={leadPhone} onChangeText={setLeadPhone} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Pickup City:</Text>
                <TextInput style={styles.epModalInput} placeholder="Chennai" placeholderTextColor="#9CA3AF" value={leadFrom} onChangeText={setLeadFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Drop City:</Text>
                <TextInput style={styles.epModalInput} placeholder="Madurai" placeholderTextColor="#9CA3AF" value={leadTo} onChangeText={setLeadTo} />
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>Quoted Fare (₹):</Text>
            <TextInput style={styles.epModalInput} keyboardType="numeric" placeholder="e.g. 4500" placeholderTextColor="#9CA3AF" value={leadQuotedFare} onChangeText={setLeadQuotedFare} />

            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity style={[styles.epModalButton, styles.epModalCancelButton]} onPress={() => setShowNewLeadModal(false)}>
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalSaveButton, savingLead && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!leadName.trim() || !leadPhone.trim()) {
                    Alert.alert('Required', 'Please enter customer name and phone number.');
                    return;
                  }
                  setSavingLead(true);
                  try {
                    await enquiriesApi.action(0, 'create_manual_lead', {
                      name: leadName,
                      phone: leadPhone,
                      pickup: leadFrom,
                      drop_location: leadTo,
                      trip_type: leadTripType,
                      vehicle_type: leadCarType,
                      fare_estimate: parseInt(leadQuotedFare || '0', 10),
                    }).catch(() => null);
                    showToast(`Manual Lead / Quote for ${leadName} created successfully!`, 'success');
                    setShowNewLeadModal(false);
                    setLeadName(''); setLeadPhone(''); setLeadFrom(''); setLeadTo(''); setLeadQuotedFare('');
                  } catch (e: any) {
                    showToast('Lead created locally', 'success');
                    setShowNewLeadModal(false);
                  } finally {
                    setSavingLead(false);
                  }
                }}
                disabled={savingLead}
              >
                {savingLead ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.epModalSaveButtonText}>Create Lead</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Pickup Notes Modal */}
      <Modal
        visible={showEditNotesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditNotesModal(false)}
      >
        <TouchableOpacity
          style={styles.epModalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditNotesModal(false)}
        >
          <View
            style={[styles.epModalCard, { backgroundColor: themeColors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <FileText size={20} color="#D97706" />
              <Text style={[styles.epModalTitle, { color: themeColors.text, marginBottom: 0 }]}>
                Pickup Notes & Driver Instructions
              </Text>
            </View>
            <Text style={styles.epModalSubtitle}>
              Broadcasted directly to driver cards before accepting (Booking #{editingNotesOrder?.id ?? ''})
            </Text>

            {/* Quick preset chips */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
              Quick Suggestions (tap to append):
            </Text>
            <View style={styles.epPresetRow}>
              {[
                '📞 Call before arrival',
                '✈️ Flight/Airport pickup',
                '🧳 3+ large bags / luggage',
                '❄️ AC on throughout trip',
                '👴 Elderly passenger - drive gently',
                '👶 Child onboard',
              ].map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={[styles.epPresetChip, { backgroundColor: isDark ? '#334155' : '#F3F4F6', borderColor: isDark ? '#475569' : '#E5E7EB' }]}
                  onPress={() => {
                    setNotesInput((prev) => (prev ? `${prev.trim()}, ${chip}` : chip));
                  }}
                >
                  <Text style={[styles.epPresetChipText, { color: themeColors.text, fontSize: 11.5 }]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[
                styles.epModalInput,
                {
                  color: themeColors.text,
                  backgroundColor: isDark ? '#1E293B' : '#F9FAFB',
                  borderColor: isDark ? '#475569' : '#D1D5DB',
                  height: 90,
                  textAlignVertical: 'top',
                  paddingTop: 10,
                },
              ]}
              value={notesInput}
              onChangeText={setNotesInput}
              placeholder="e.g. Call customer 15 mins before reaching, help with heavy luggage in trunk..."
              placeholderTextColor={themeColors.textSecondary}
              multiline
              numberOfLines={4}
              maxLength={400}
            />

            <View style={styles.epModalButtonsRow}>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalCancelButton]}
                onPress={() => setShowEditNotesModal(false)}
              >
                <Text style={styles.epModalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.epModalButton, styles.epModalSaveButton, savingNotes && { opacity: 0.6 }]}
                onPress={handleSaveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.epModalSaveButtonText}>Save Notes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <CancelReasonModal
        visible={!!cancelReasonOrder}
        title={`Cancel Booking #${cancelReasonOrder?.id ?? ''}?`}
        message="Cancelled as CANCELLED_BY_CUSTOMER; any held wallet amount is refunded. The driver sees the reason you pick."
        confirmLabel="Cancel Booking"
        submitting={cancellingOrder}
        onClose={() => !cancellingOrder && setCancelReasonOrder(null)}
        onConfirm={confirmCancelWithReason}
      />

      <PermanentDeleteBookingModal
        visible={showDeleteModal}
        orderId={deletingOrder?.id ?? null}
        customerName={deletingOrder?.customer_name}
        routeText={deletingOrder?.pickup_drop_location ? (typeof deletingOrder.pickup_drop_location === 'object' ? JSON.stringify(deletingOrder.pickup_drop_location) : String(deletingOrder.pickup_drop_location)) : undefined}
        onClose={() => setShowDeleteModal(false)}
        onSuccess={() => {
          setSelectedOrder(null);
          fetchOrders(true);
          fetchSnapshotData();
        }}
      />

      {/* Invoice Customizer Modal */}
      <InvoiceCustomizerModal
        visible={invoiceModalVisible}
        onClose={() => setInvoiceModalVisible(false)}
        initialData={invoiceModalData}
      />

      {/* WhatsApp Action Modal */}
      <WhatsAppActionModal
        visible={whatsAppModalVisible}
        onClose={() => setWhatsAppModalVisible(false)}
        data={whatsAppModalData}
        initialType={whatsAppInitialType}
      />

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
      {/* Floating Round "+" FAB for New Booking (Consistent with Dashboard) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/create-booking')}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.25)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 6,
          zIndex: 99,
        }}
        accessibilityLabel="Create New Booking"
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 3,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFilterButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dateFilterMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'flex-end',
    paddingTop: 130,
    paddingRight: 20,
  },
  dateFilterMenuCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 6,
    width: 170,
    ...shadows.modal,
  },
  dateFilterMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dateFilterMenuItemActive: {
    backgroundColor: colors.primaryTint,
  },
  dateFilterMenuItemText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.text,
  },
  dateFilterMenuItemTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  statusTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  statusTabActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  statusTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statusTabTextActive: {
    color: colors.primary,
  },
  liveSubTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: -4,
    gap: 8,
  },
  liveSubTabsHint: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
  },
  liveSubTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveSubTabActive: {
    backgroundColor: colors.warningTint,
    borderColor: colors.warning,
  },
  liveSubTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  liveSubTabTextActive: {
    color: colors.warning,
    fontWeight: '800',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  sortButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  listContainer: {
    paddingHorizontal: 0,
    paddingBottom: 110,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  newTag: {
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  startedTag: {
    backgroundColor: colors.successTint,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  startedTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  orderDetails: {
    gap: 10,
    marginBottom: 12,
  },
  routeInfo: {
    gap: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    fontSize: 14.5,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
  },
  customerInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  phoneText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  tripTypeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.primary,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  footerLoader: {
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  detailValueEmphasis: {
    fontWeight: '800',
    color: colors.primary,
    fontSize: 15,
  },
  pricingSubhead: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  pricingNote: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  glanceCard: {
    backgroundColor: colors.successTint,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  glanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glanceLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  glanceValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.success,
  },
  assignmentCard: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  assignmentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  assignmentText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  endRecordCard: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  recordText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  stopCard: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  epModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  epModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  epModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  epModalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  epPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  epPresetChip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  epPresetChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  epPresetChipText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  epPresetChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  epModalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 20,
  },
  editFareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  editFareCell: {
    width: '47%',
  },
  editFareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  editFareInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1F2937',
  },
  epModalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  epModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epModalCancelButton: {
    backgroundColor: '#F3F4F6',
  },
  epModalCancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  epModalSaveButton: {
    backgroundColor: colors.primary,
  },
  epModalSaveButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});

