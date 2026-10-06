import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Linking,
  Switch,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Search,
  Phone,
  MapPin,
  Calendar,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  StickyNote,
  X,
  MessageSquare,
  PhoneCall,
  Edit3,
  Globe,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Check,
  Eye,
  Plus,
  FileText,
  Send,
  Share2,
  Star,
  AlertCircle,
  AlertTriangle,
  Copy,
  Users,
  Forward,
} from 'lucide-react-native';
import { enquiriesApi, WebsiteEnquiry, WEBSITE_BRANDS, RESPONSE_REASONS } from '@/services/enquiriesApi';
import { apiService } from '@/services/api';
import { printOrDownloadInvoice, printOrDownloadEstimation, shareQuotationViaWhatsApp, shareQuotationViaEmail, generateQuotationText } from '@/utils/invoiceGenerator';
import Toast, { useToast } from '@/components/Toast';
import LeadTransferModal from '@/components/LeadTransferModal';
import { colors, shadows } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DateTimeField from '@/components/DateTimeField';
import { playMildNotificationSound } from '@/utils/alarmSound';
import {
  starsForSeconds,
  renderStars,
  formatDurationFriendly,
  parseIstTimestamp,
  formatEnquiryReceivedTime,
  formatPickupDateTime,
  isFutureLead,
  recordEnquiryResponse,
  getDailyPerformance,
  updateCommentsPendingInLedger,
  updateMissedCountInLedger,
} from '@/utils/performance';

type Tab = 'not_responded' | 'future' | 'missed' | 'responded';

interface EnquiriesScreenProps {
  isTab?: boolean;
  hideHeader?: boolean;
  initialTab?: Tab;
  onBackToHub?: () => void;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const TRIP_CATEGORIES = ['One Way', 'Round Trip', 'Multi City', 'Airport Drop', 'Airport Pickup'];
const LEAD_VEHICLE_TYPES = ['Sedan', 'Prime Sedan', 'SUV', 'Innova', 'Innova Crysta', 'Tempo Traveller'];

function normalizeTripCategory(type?: string): string {
  const t = (type || '').toLowerCase().trim();
  if (t === 'oneway' || t === 'one_way' || t === 'one way') return 'One Way';
  if (t === 'round' || t === 'roundtrip' || t === 'round_trip' || t === 'round trip') return 'Round Trip';
  if (t === 'multi' || t === 'multicity' || t === 'multi_city' || t === 'multi city') return 'Multi City';
  if (t.includes('airport') && t.includes('drop')) return 'Airport Drop';
  if (t.includes('airport') && (t.includes('pick') || t.includes('pickup'))) return 'Airport Pickup';
  return 'One Way';
}

function normalizeVehicleCategory(vehicle?: string): string {
  const v = (vehicle || '').toLowerCase().trim();
  if (v.includes('crysta')) return 'Innova Crysta';
  if (v.includes('innova')) return 'Innova';
  if (v.includes('prime') || v.includes('etios') || v.includes('dzire')) return 'Prime Sedan';
  if (v.includes('suv') || v.includes('ertiga') || v.includes('marazzo')) return 'SUV';
  if (v.includes('tempo')) return 'Tempo Traveller';
  if (v.includes('sedan')) return 'Sedan';
  return 'Sedan';
}

function getLeadRateDefaults(vehicleLabel: string, tripType: string) {
  const isRound = tripType === 'Round Trip' || tripType === 'Multi City' || tripType === 'round_trip' || tripType === 'multi_city';
  const v = (vehicleLabel || '').toLowerCase();
  if (v.includes('crysta')) return { costPerKm: isRound ? 22 : 23, driverBata: isRound ? 400 : 300, minKmOneWay: 130, minKmRoundTrip: 250 };
  if (v.includes('innova')) return { costPerKm: isRound ? 20 : 21, driverBata: isRound ? 400 : 300, minKmOneWay: 130, minKmRoundTrip: 250 };
  if (v.includes('suv') || v.includes('ertiga') || v.includes('marazzo')) return { costPerKm: isRound ? 19 : 20, driverBata: 300, minKmOneWay: 130, minKmRoundTrip: 250 };
  if (v.includes('prime')) return { costPerKm: isRound ? 15 : 16, driverBata: 300, minKmOneWay: 130, minKmRoundTrip: 250 };
  if (v.includes('tempo')) return { costPerKm: isRound ? 26 : 28, driverBata: isRound ? 500 : 400, minKmOneWay: 150, minKmRoundTrip: 300 };
  return { costPerKm: isRound ? 14 : 15, driverBata: 300, minKmOneWay: 130, minKmRoundTrip: 250 }; // Sedan default
}

export default function EnquiriesScreen({ isTab = false, hideHeader = false, initialTab, onBackToHub }: EnquiriesScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [tab, setTab] = useState<Tab>(
    initialTab || (params.tab === 'future' || params.tab === 'missed' || params.tab === 'responded' ? (params.tab as Tab) : 'not_responded')
  );

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (params.tab && ['not_responded', 'future', 'missed', 'responded'].includes(params.tab)) {
      setTab(params.tab as Tab);
    }
  }, [params.tab]);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [onDutyShift, setOnDutyShift] = useState(true);
  const [adminUsername, setAdminUsername] = useState('Admin');

  // Enquiries list from server
  const [enquiries, setEnquiries] = useState<WebsiteEnquiry[]>([]);
  const [serverCounts, setServerCounts] = useState({ not_responded: 0, responded: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local seen IDs for fresh highlight
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const isNewUnseen = (e: WebsiteEnquiry) => !e.is_touched && !e.acknowledged_at && !seenIds.has(e.id);
  const markSeen = (id: number) => setSeenIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  // Smooth continuous pulse animation for highlighting freshly arrived leads
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const knownIdsRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Responded tab filters
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [stageFilterOpen, setStageFilterOpen] = useState(false);
  const [showOnlyPendingComments, setShowOnlyPendingComments] = useState(false);

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);

  // Detail Modal
  const [detailTarget, setDetailTarget] = useState<WebsiteEnquiry | null>(null);

  // Respond Modal state with mandatory note
  const [respondTarget, setRespondTarget] = useState<WebsiteEnquiry | null>(null);
  const [respondReason, setRespondReason] = useState<string>('awaiting_confirmation');
  const [respondNoteText, setRespondNoteText] = useState<string>('');
  const [savingRespond, setSavingRespond] = useState(false);

  // Note Modal state
  const [noteTarget, setNoteTarget] = useState<WebsiteEnquiry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Lead Transfer Modal state
  const [transferTarget, setTransferTarget] = useState<WebsiteEnquiry | null>(null);

  // Customize Booking Modal state
  const [customizeTarget, setCustomizeTarget] = useState<WebsiteEnquiry | null>(null);
  const [editPickup, setEditPickup] = useState('');
  const [editDrop, setEditDrop] = useState('');
  const [editTripType, setEditTripType] = useState('One Way');
  const [editVehicleType, setEditVehicleType] = useState('Sedan');
  const [editTravelDate, setEditTravelDate] = useState('');
  const [editTravelTime, setEditTravelTime] = useState('');
  const [editDistanceKm, setEditDistanceKm] = useState('');
  const [editTripDays, setEditTripDays] = useState('1');
  const [editRatePerKm, setEditRatePerKm] = useState('14');
  const [editBaseFare, setEditBaseFare] = useState('');
  const [editBaseFareTouched, setEditBaseFareTouched] = useState(false);
  const [editFare, setEditFare] = useState('');
  const [editTollCharges, setEditTollCharges] = useState('');
  const [editTollIncluded, setEditTollIncluded] = useState(true);
  const [editStateTax, setEditStateTax] = useState('');
  const [editStateTaxIncluded, setEditStateTaxIncluded] = useState(true);
  const [editHillCharges, setEditHillCharges] = useState('');
  const [editHillIncluded, setEditHillIncluded] = useState(true);
  const [editDriverBata, setEditDriverBata] = useState('300');
  const [editDiscountAmount, setEditDiscountAmount] = useState('');
  const [editAdvanceRequested, setEditAdvanceRequested] = useState('');
  const [editExtraCharges, setEditExtraCharges] = useState('');
  const [editCostPerKm, setEditCostPerKm] = useState('');
  const [editExtraCostPerKm, setEditExtraCostPerKm] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editIncludeGst, setEditIncludeGst] = useState(false);
  const [editGstAmount, setEditGstAmount] = useState('');
  const [savingCustomize, setSavingCustomize] = useState(false);

  // New Lead Modal state
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadPickup, setLeadPickup] = useState('');
  const [leadDrop, setLeadDrop] = useState('');
  const [leadTripType, setLeadTripType] = useState('One Way');
  const [leadVehicleType, setLeadVehicleType] = useState('Sedan');
  const [leadTravelDate, setLeadTravelDate] = useState('');
  const [leadTravelTime, setLeadTravelTime] = useState('');
  const [leadFareEstimate, setLeadFareEstimate] = useState('');
  // Live Calculation Breakdown (Rate/KM x KM + Driver Bata) - modeled on the
  // website admin panel's customize-booking.php, which computes the total
  // live instead of making staff work it out in their head before typing a
  // number into a blank "Total Quoted Fare" field (owner feedback
  // 2026-09-30: "adhaivida advanced ah irukkanum but mokkaiya iruku").
  const [leadKm, setLeadKm] = useState('');
  const [leadFareTouched, setLeadFareTouched] = useState(false);
  // Optional extra charges the website's customize-booking.php lets staff
  // toggle on/off, each with an editable amount - same pattern here so a
  // permit/hill/toll trip doesn't need a manually-guessed lump sum.
  const [leadPermitOn, setLeadPermitOn] = useState(false);
  const [leadPermitAmount, setLeadPermitAmount] = useState('300');
  const [leadHillOn, setLeadHillOn] = useState(false);
  const [leadHillAmount, setLeadHillAmount] = useState('300');
  const [leadTollOn, setLeadTollOn] = useState(false);
  const [leadTollAmount, setLeadTollAmount] = useState('200');
  const [leadAdvanceRequested, setLeadAdvanceRequested] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [leadWebsite, setLeadWebsite] = useState('dropcars.in');
  const [savingNewLead, setSavingNewLead] = useState(false);

  const leadRate = getLeadRateDefaults(leadVehicleType, leadTripType);
  const leadKmNum = parseInt(leadKm, 10) || 0;
  const leadCalcSubtotal = leadRate.costPerKm * leadKmNum;
  const leadExtrasTotal =
    (leadPermitOn ? parseInt(leadPermitAmount, 10) || 0 : 0) +
    (leadHillOn ? parseInt(leadHillAmount, 10) || 0 : 0) +
    (leadTollOn ? parseInt(leadTollAmount, 10) || 0 : 0);
  const leadCalcTotal = leadCalcSubtotal + leadRate.driverBata + leadExtrasTotal;

  // Auto-fill the quoted fare from the live calculation, but stop touching
  // it the moment staff types their own number in directly - the
  // calculation is a starting estimate, not something that should fight a
  // manual override.
  useEffect(() => {
    if (!leadFareTouched && leadKmNum > 0) {
      setLeadFareEstimate(String(leadCalcTotal));
    }
  }, [leadVehicleType, leadTripType, leadKm, leadPermitOn, leadPermitAmount, leadHillOn, leadHillAmount, leadTollOn, leadTollAmount]);

  useEffect(() => {
    apiService.getCachedAdminUsername().then((u) => setAdminUsername(u || 'Admin'));
  }, []);

  const isEnquiryMissed = (e: WebsiteEnquiry) => {
    if (e.is_touched || e.acknowledged_at) return false;
    const createdMs = parseIstTimestamp(e.created_at);
    if (!createdMs) return false;
    const ageMs = Date.now() - createdMs;
    // Missed within last 48 hours (uncalled for >= 2 hours)
    return ageMs >= TWO_HOURS_MS && ageMs <= 48 * 60 * 60 * 1000;
  };

  const load = useCallback(async (targetTab: Tab, targetPage: number, append: boolean) => {
    try {
      setError(null);
      const apiTab = targetTab === 'responded' ? 'responded' : 'not_responded';
      const res = await enquiriesApi.list({
        tab: apiTab,
        website: selectedBrand,
        page: targetPage,
        search: searchQuery.trim() || undefined,
        stage: targetTab === 'responded' && stageFilter !== 'all' ? stageFilter : undefined,
      });

      setEnquiries((prev) => (append ? [...prev, ...res.enquiries] : res.enquiries));
      setServerCounts(res.counts);
      setPage(res.page);
      setTotalPages(res.total_pages);

      // If fresh new leads arrived during polling, trigger calm pleasant notification chime
      if (res.enquiries && res.enquiries.length > 0) {
        const freshArrivals = res.enquiries.filter(
          (e) => !e.is_touched && !e.acknowledged_at && !knownIdsRef.current.has(e.id)
        );
        if (!isFirstLoadRef.current && freshArrivals.length > 0) {
          playMildNotificationSound();
        }
        res.enquiries.forEach((e) => knownIdsRef.current.add(e.id));
        isFirstLoadRef.current = false;
      }

      // Calculate missed count & pending comments to sync with performance ledger
      if (apiTab === 'not_responded') {
        const missed = (res.enquiries || []).filter(isEnquiryMissed).length;
        updateMissedCountInLedger(adminUsername, missed);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load enquiries. Is the website API reachable?');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [selectedBrand, searchQuery, stageFilter, adminUsername]);

  useEffect(() => {
    setLoading(true);
    load(tab, 1, false);
  }, [tab, selectedBrand, stageFilter, load]);

  // Silent background poll every 20s
  useEffect(() => {
    const interval = setInterval(() => {
      if (page === 1 && !searchQuery.trim()) {
        load(tab, 1, false);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [page, searchQuery, tab, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(tab, 1, false);
  };

  const runSearch = () => {
    setLoading(true);
    load(tab, 1, false);
  };

  const loadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    load(tab, page + 1, true);
  };

  // Compute filtered items depending on active Tab
  const now = Date.now();
  const freshLeads = enquiries.filter((e) => !e.is_touched && !e.acknowledged_at && !isEnquiryMissed(e));
  const missedLeads = enquiries.filter(isEnquiryMissed);
  const futureLeads = enquiries.filter((e) => isFutureLead(e.travel_date, e.travel_time) && !e.is_touched && !e.acknowledged_at);

  let displayedEnquiries = enquiries;

  if (tab === 'not_responded') {
    // Dynamic Master Call Stream:
    // 1. All fresh leads (< 2h)
    // 2. Up to 10 latest actionable missed leads from today
    // 3. Up to 10 future travel follow-ups (> 2h pickup)
    const seenIds = new Set<number>();
    const masterQueue: WebsiteEnquiry[] = [];

    // 1. Fresh
    freshLeads.forEach((e) => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        masterQueue.push(e);
      }
    });

    // 2. 10 Missed
    missedLeads.slice(0, 10).forEach((e) => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        masterQueue.push(e);
      }
    });

    // 3. 10 Future Follow-ups
    futureLeads.slice(0, 10).forEach((e) => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        masterQueue.push(e);
      }
    });

    displayedEnquiries = masterQueue.length > 0 ? masterQueue : enquiries.filter((e) => !e.is_touched && !e.acknowledged_at);
  } else if (tab === 'missed') {
    displayedEnquiries = missedLeads;
  } else if (tab === 'future') {
    displayedEnquiries = enquiries.filter((e) => isFutureLead(e.travel_date, e.travel_time));
  } else if (tab === 'responded') {
    if (showOnlyPendingComments) {
      displayedEnquiries = enquiries.filter((e) => !e.dispatcher_notes || e.dispatcher_notes.trim().length < 3);
    }
  }

  // Count metrics for tabs
  const missedCount = tab === 'responded' ? 0 : missedLeads.length;
  const futureCount = enquiries.filter((e) => isFutureLead(e.travel_date, e.travel_time)).length;
  const pendingQueueCount = tab === 'responded'
    ? serverCounts.not_responded
    : (freshLeads.length + Math.min(10, missedLeads.length) + Math.min(10, futureLeads.length));
  const respondedCount = serverCounts.responded;

  // Comments pending count (in responded list or active list)
  const pendingCommentsCount = enquiries.filter((e) => {
    const hasNote = e.dispatcher_notes && e.dispatcher_notes.trim().length >= 3;
    return (e.is_touched || e.acknowledged_at || tab === 'responded') && !hasNote;
  }).length;

  const runAction = async (
    enquiry: WebsiteEnquiry,
    action: string,
    extra: Record<string, any> = {},
    confirmLabel?: string
  ) => {
    setActioningId(enquiry.id);
    try {
      await enquiriesApi.action(enquiry.id, action, extra);

      if (tab !== 'responded') {
        // Remove from current active tab
        setEnquiries((prev) => prev.filter((e) => e.id !== enquiry.id));
        setServerCounts((prev) => ({
          not_responded: Math.max(0, prev.not_responded - 1),
          responded: prev.responded + 1,
        }));
      } else {
        // Update item in responded list
        setEnquiries((prev) =>
          prev.map((e) => (e.id === enquiry.id ? { ...e, ...extra, is_touched: true } : e))
        );
      }

      if (detailTarget?.id === enquiry.id) {
        setDetailTarget(null);
      }
      if (confirmLabel) showToast(confirmLabel, 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Action failed');
    } finally {
      setActioningId(null);
    }
  };

  const handleCall = async (enquiry: WebsiteEnquiry) => {
    if (enquiry.phone) {
      Linking.openURL(`tel:${enquiry.phone}`);
      const createdMs = parseIstTimestamp(enquiry.created_at);
      const responseSeconds = createdMs > 0 ? Math.max(0, Math.floor((Date.now() - createdMs) / 1000)) : 60;

      const perfRes = await recordEnquiryResponse(
        adminUsername,
        enquiry.id,
        responseSeconds,
        'call',
        enquiry.dispatcher_notes || undefined,
        { customerName: enquiry.name || undefined, route: `${enquiry.pickup || ''} → ${enquiry.drop_location || ''}` }
      );

      if (tab !== 'responded') {
        runAction(
          enquiry,
          'mark_touched',
          {
            first_response_at: new Date().toISOString(),
            response_seconds: responseSeconds,
            response_time_seconds: responseSeconds,
          },
          perfRes.message
        );
      } else {
        showToast(perfRes.message, 'success');
      }
    }
  };

  const handleWhatsApp = async (enquiry: WebsiteEnquiry) => {
    if (enquiry.phone) {
      const cleanPhone = enquiry.phone.replace(/[^\d]/g, '');
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const msg = encodeURIComponent(
        `Hello ${enquiry.name || 'Valued Customer'}, greetings from ${enquiry.website || 'Drop Cars'}! Regarding your trip quote from ${enquiry.pickup || 'Pickup'} to ${enquiry.drop_location || 'Drop'}: total quoted fare is ₹${enquiry.fare_estimate || 0}. Please let us know if you have any questions!`
      );
      Linking.openURL(`https://wa.me/${fullPhone}?text=${msg}`);

      const createdMs = parseIstTimestamp(enquiry.created_at);
      const responseSeconds = createdMs > 0 ? Math.max(0, Math.floor((Date.now() - createdMs) / 1000)) : 60;

      const perfRes = await recordEnquiryResponse(
        adminUsername,
        enquiry.id,
        responseSeconds,
        'whatsapp',
        enquiry.dispatcher_notes || undefined,
        { customerName: enquiry.name || undefined, route: `${enquiry.pickup || ''} → ${enquiry.drop_location || ''}` }
      );

      if (tab !== 'responded') {
        runAction(
          enquiry,
          'mark_touched',
          {
            first_response_at: new Date().toISOString(),
            response_seconds: responseSeconds,
            response_time_seconds: responseSeconds,
          },
          perfRes.message
        );
      } else {
        showToast(perfRes.message, 'success');
      }
    }
  };

  const openRespondModal = (enquiry: WebsiteEnquiry) => {
    setRespondTarget(enquiry);
    setRespondReason(enquiry.lead_stage || 'awaiting_confirmation');
    setRespondNoteText(enquiry.dispatcher_notes || '');
  };

  const handleSaveRespond = async () => {
    if (!respondTarget) return;
    if (!respondNoteText.trim() || respondNoteText.trim().length < 3) {
      Alert.alert(
        'Outcome Note Required',
        'Please enter a short outcome note (at least 3 characters) explaining customer discussion.'
      );
      return;
    }
    setSavingRespond(true);
    try {
      const target = respondTarget;
      const createdMs = parseIstTimestamp(target.created_at);
      const responseSeconds = createdMs > 0 ? Math.max(0, Math.floor((Date.now() - createdMs) / 1000)) : 60;

      const perfRes = await recordEnquiryResponse(
        adminUsername,
        target.id,
        responseSeconds,
        'stage',
        respondNoteText.trim(),
        { customerName: target.name || undefined, route: `${target.pickup || ''} → ${target.drop_location || ''}` }
      );

      await runAction(
        target,
        'save_stage',
        {
          stage: respondReason,
          notes: respondNoteText.trim(),
          first_response_at: new Date().toISOString(),
          response_seconds: responseSeconds,
          response_time_seconds: responseSeconds,
        },
        perfRes.message
      );

      setRespondTarget(null);
      setRespondNoteText('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to record response');
    } finally {
      setSavingRespond(false);
    }
  };

  const handleConfirm = (enquiry: WebsiteEnquiry) => {
    Alert.alert(
      'Confirm & Convert to Booking?',
      `${enquiry.name || 'This lead'} will be converted into an active booking and moved directly to the Confirmed Bookings section.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & View in Bookings',
          onPress: async () => {
            const createdMs = parseIstTimestamp(enquiry.created_at);
            const responseSeconds = createdMs > 0 ? Math.max(0, Math.floor((Date.now() - createdMs) / 1000)) : 60;

            await recordEnquiryResponse(
              adminUsername,
              enquiry.id,
              responseSeconds,
              'confirm',
              enquiry.dispatcher_notes || 'Confirmed booking',
              { customerName: enquiry.name || undefined, route: `${enquiry.pickup || ''} → ${enquiry.drop_location || ''}` }
            );

            await runAction(
              enquiry,
              'confirm',
              {
                first_response_at: new Date().toISOString(),
                response_seconds: responseSeconds,
                response_time_seconds: responseSeconds,
              },
              'Enquiry converted to active booking!'
            );
            router.push('/(tabs)/orders' as any);
          },
        },
      ]
    );
  };

  const handleSpam = (enquiry: WebsiteEnquiry) => {
    Alert.alert(
      'Mark as Fake / Spam?',
      `${enquiry.name || 'This lead'} will be marked as fake and removed from the active queue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Fake', style: 'destructive', onPress: () => runAction(enquiry, 'fake') },
      ]
    );
  };

  const handleDelete = (enquiry: WebsiteEnquiry) => {
    Alert.alert(
      'Delete this enquiry?',
      `This permanently deletes ${enquiry.name || 'this lead'}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runAction(enquiry, 'delete', { confirmed: true }) },
      ]
    );
  };

  const openNote = (enquiry: WebsiteEnquiry) => {
    setNoteTarget(enquiry);
    setNoteText(enquiry.dispatcher_notes || '');
  };

  const saveNote = async () => {
    if (!noteTarget) return;
    setSavingNote(true);
    try {
      await enquiriesApi.action(noteTarget.id, 'save_note', { notes: noteText.trim() });
      setEnquiries((prev) =>
        prev.map((e) => (e.id === noteTarget.id ? { ...e, dispatcher_notes: noteText.trim(), is_touched: true } : e))
      );
      if (detailTarget?.id === noteTarget.id) {
        setDetailTarget((prev) => (prev ? { ...prev, dispatcher_notes: noteText.trim() } : null));
      }

      // Update response record in ledger with new note
      const createdMs = parseIstTimestamp(noteTarget.created_at);
      const responseSeconds = createdMs > 0 ? Math.max(0, Math.floor((Date.now() - createdMs) / 1000)) : 60;
      await recordEnquiryResponse(
        adminUsername,
        noteTarget.id,
        responseSeconds,
        'stage',
        noteText.trim()
      );

      setNoteTarget(null);
      showToast('Note updated & comment recorded', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleTransferSuccess = async (newStaffName: string, reasonLabel: string, handoverRemarks: string) => {
    if (!transferTarget) return;
    const target = transferTarget;
    const currentNotes = target.dispatcher_notes || '';
    const updatedNotes = currentNotes ? `${currentNotes}\n${handoverRemarks}` : handoverRemarks;

    try {
      await enquiriesApi.action(target.id, 'save_note', { notes: updatedNotes });
      setEnquiries((prev) =>
        prev.map((e) => (e.id === target.id ? { ...e, dispatcher_notes: updatedNotes, is_touched: true } : e))
      );
      if (detailTarget?.id === target.id) {
        setDetailTarget((prev) => (prev ? { ...prev, dispatcher_notes: updatedNotes } : null));
      }
      showToast(`Lead transferred to ${newStaffName} (${reasonLabel})`, 'success');
      setTransferTarget(null);
    } catch (e: any) {
      Alert.alert('Transfer Error', e?.message || 'Failed to record lead transfer');
    }
  };

  const handleRecalculateBaseFare = (
    vType = editVehicleType,
    tType = editTripType,
    km = editDistanceKm,
    days = editTripDays,
    rate = editRatePerKm,
    bata = editDriverBata
  ) => {
    const kmNum = parseFloat(km) || 0;
    const daysNum = Math.max(1, parseInt(days, 10) || 1);
    const isRound = tType === 'Round Trip' || tType === 'Multi City';
    const rateInfo = getLeadRateDefaults(vType, tType);
    const minKm = isRound ? rateInfo.minKmRoundTrip * daysNum : rateInfo.minKmOneWay;
    const effectiveKm = Math.max(kmNum, minKm);
    const rateNum = parseFloat(rate) || rateInfo.costPerKm;
    const bataNum = parseFloat(bata) || rateInfo.driverBata;
    const calculatedBase = Math.round((effectiveKm * rateNum) + (bataNum * daysNum));
    setEditBaseFare(String(calculatedBase));
    setEditBaseFareTouched(false);
  };

  const handleTripTypeChange = (newTripType: string) => {
    setEditTripType(newTripType);
    const rates = getLeadRateDefaults(editVehicleType, newTripType);
    setEditRatePerKm(String(rates.costPerKm));
    setEditDriverBata(String(rates.driverBata));
    handleRecalculateBaseFare(editVehicleType, newTripType, editDistanceKm, editTripDays, String(rates.costPerKm), String(rates.driverBata));
  };

  const handleVehicleTypeChange = (newVehicleType: string) => {
    setEditVehicleType(newVehicleType);
    const rates = getLeadRateDefaults(newVehicleType, editTripType);
    setEditRatePerKm(String(rates.costPerKm));
    setEditDriverBata(String(rates.driverBata));
    handleRecalculateBaseFare(newVehicleType, editTripType, editDistanceKm, editTripDays, String(rates.costPerKm), String(rates.driverBata));
  };

  const handleDistanceChange = (newKm: string) => {
    setEditDistanceKm(newKm);
    if (!editBaseFareTouched) {
      handleRecalculateBaseFare(editVehicleType, editTripType, newKm, editTripDays, editRatePerKm, editDriverBata);
    }
  };

  const handleDaysChange = (newDays: string) => {
    setEditTripDays(newDays);
    if (!editBaseFareTouched) {
      handleRecalculateBaseFare(editVehicleType, editTripType, editDistanceKm, newDays, editRatePerKm, editDriverBata);
    }
  };

  const handleRateChange = (newRate: string) => {
    setEditRatePerKm(newRate);
    if (!editBaseFareTouched) {
      handleRecalculateBaseFare(editVehicleType, editTripType, editDistanceKm, editTripDays, newRate, editDriverBata);
    }
  };

  const handleDriverBataChange = (newBata: string) => {
    setEditDriverBata(newBata);
    if (!editBaseFareTouched) {
      handleRecalculateBaseFare(editVehicleType, editTripType, editDistanceKm, editTripDays, editRatePerKm, newBata);
    }
  };

  const openCustomizeModal = (enquiry: WebsiteEnquiry) => {
    setCustomizeTarget(enquiry);
    setEditPickup(enquiry.pickup || '');
    setEditDrop(enquiry.drop_location || '');
    const normTrip = normalizeTripCategory(enquiry.trip_type ?? undefined);
    const normVehicle = normalizeVehicleCategory(enquiry.vehicle_type ?? undefined);
    setEditTripType(normTrip);
    setEditVehicleType(normVehicle);
    setEditTravelDate(enquiry.travel_date || '');
    setEditTravelTime(enquiry.travel_time || '');

    // Distance and Days detection
    const dist = (enquiry as any).distance_km ? String((enquiry as any).distance_km) : (enquiry as any).distance ? String((enquiry as any).distance) : '';
    setEditDistanceKm(dist);
    const days = (enquiry as any).trip_days ? String((enquiry as any).trip_days) : '1';
    setEditTripDays(days);

    const rates = getLeadRateDefaults(normVehicle, normTrip);
    const costKm = enquiry.cost_per_km ? String(enquiry.cost_per_km) : String(rates.costPerKm);
    const bata = (enquiry as any).driver_bata ? String((enquiry as any).driver_bata) : String(rates.driverBata);
    setEditRatePerKm(costKm);
    setEditDriverBata(bata);

    const kmNum = parseFloat(dist) || 0;
    const daysNum = Math.max(1, parseInt(days, 10) || 1);
    const isRound = normTrip === 'Round Trip' || normTrip === 'Multi City';
    const minKm = isRound ? rates.minKmRoundTrip * daysNum : rates.minKmOneWay;
    const effectiveKm = Math.max(kmNum, minKm);
    const autoBase = effectiveKm > 0 ? Math.round((effectiveKm * (parseFloat(costKm) || rates.costPerKm)) + ((parseFloat(bata) || rates.driverBata) * daysNum)) : 0;

    const base = (enquiry as any).base_fare || (autoBase > 0 ? autoBase : (enquiry.fare_estimate || 0));
    const toll = (enquiry as any).toll_charges || 0;
    const stateTax = (enquiry as any).state_tax || (enquiry as any).permit_charges || 0;
    const hills = (enquiry as any).hill_charges || (enquiry as any).hills_charges || 0;
    const discount = (enquiry as any).discount_amount || 0;
    const advance = (enquiry as any).advance_requested || (enquiry as any).advance_amount || '';

    setEditBaseFare(base ? String(base) : '');
    setEditBaseFareTouched(false);
    setEditTollCharges(toll ? String(toll) : '');
    setEditTollIncluded(true);
    setEditStateTax(stateTax ? String(stateTax) : '');
    setEditStateTaxIncluded(true);
    setEditHillCharges(hills ? String(hills) : '');
    setEditHillIncluded(true);
    setEditDiscountAmount(discount ? String(discount) : '');
    setEditAdvanceRequested(advance ? String(advance) : '');
    setEditFare(enquiry.fare_estimate ? String(enquiry.fare_estimate) : '');
    setEditExtraCharges(enquiry.extra_charges ? String(enquiry.extra_charges) : '');
    setEditCostPerKm(costKm);
    setEditExtraCostPerKm(enquiry.extra_cost_per_km ? String(enquiry.extra_cost_per_km) : '');
    setEditNotes(enquiry.dispatcher_notes || '');
    setEditIncludeGst(!!enquiry.include_gst);
    setEditGstAmount(enquiry.gst_amount ? String(enquiry.gst_amount) : '');
  };

  const getCustomizeLiveTotal = () => {
    const base = parseFloat(editBaseFare) || 0;
    const toll = editTollIncluded ? (parseFloat(editTollCharges) || 0) : 0;
    const stateTax = editStateTaxIncluded ? (parseFloat(editStateTax) || 0) : 0;
    const hill = editHillIncluded ? (parseFloat(editHillCharges) || 0) : 0;
    const extra = parseFloat(editExtraCharges) || 0;
    const discount = parseFloat(editDiscountAmount) || 0;
    const subtotal = Math.max(0, base + toll + stateTax + hill + extra - discount);
    const gst = editIncludeGst ? (parseFloat(editGstAmount) || Math.round(subtotal * 0.05)) : 0;
    const grandTotal = subtotal + gst;
    const adv = parseFloat(editAdvanceRequested) || Math.round(grandTotal * 0.2);
    const bal = Math.max(0, grandTotal - adv);
    return { base, toll, stateTax, hill, extra, discount, subtotal, gst, grandTotal, advance: adv, balance: bal };
  };

  const saveCustomizeBooking = async () => {
    if (!customizeTarget) return;
    setSavingCustomize(true);
    try {
      const live = getCustomizeLiveTotal();
      const parsedFare = live.grandTotal || parseFloat(editFare) || 0;

      const updatedData: any = {
        pickup: editPickup.trim(),
        drop_location: editDrop.trim(),
        trip_type: editTripType.trim(),
        vehicle_type: editVehicleType.trim(),
        travel_date: editTravelDate.trim(),
        travel_time: editTravelTime.trim(),
        distance_km: parseFloat(editDistanceKm) || undefined,
        trip_days: parseInt(editTripDays, 10) || 1,
        base_fare: live.base || undefined,
        fare_estimate: parsedFare || undefined,
        toll_charges: parseFloat(editTollCharges) || 0,
        state_tax: parseFloat(editStateTax) || 0,
        permit_charges: parseFloat(editStateTax) || 0,
        hill_charges: parseFloat(editHillCharges) || 0,
        driver_bata: parseFloat(editDriverBata) || 300,
        discount_amount: parseFloat(editDiscountAmount) || 0,
        advance_requested: live.advance,
        extra_charges: parseFloat(editExtraCharges) || 0,
        cost_per_km: parseFloat(editRatePerKm) || parseFloat(editCostPerKm) || undefined,
        extra_cost_per_km: parseFloat(editExtraCostPerKm) || undefined,
        include_gst: editIncludeGst,
        gst_percent: 5.0,
        gst_amount: live.gst,
        notes: editNotes.trim(),
      };
      await enquiriesApi.customizeBooking(customizeTarget.id, updatedData);
      setEnquiries((prev) =>
        prev.map((e) =>
          e.id === customizeTarget.id
            ? {
                ...e,
                ...updatedData,
                fare_estimate: updatedData.fare_estimate ?? e.fare_estimate,
                cost_per_km: updatedData.cost_per_km ?? e.cost_per_km,
                extra_cost_per_km: updatedData.extra_cost_per_km ?? e.extra_cost_per_km,
                include_gst: editIncludeGst,
                gst_amount: live.gst,
                dispatcher_notes: updatedData.notes,
                is_touched: true,
              }
            : e
        )
      );
      if (detailTarget?.id === customizeTarget.id) {
        setDetailTarget((prev) =>
          prev
            ? {
                ...prev,
                ...updatedData,
                fare_estimate: updatedData.fare_estimate ?? prev.fare_estimate,
                cost_per_km: updatedData.cost_per_km ?? prev.cost_per_km,
                extra_cost_per_km: updatedData.extra_cost_per_km ?? prev.extra_cost_per_km,
                dispatcher_notes: updatedData.notes,
              }
            : null
        );
      }
      setCustomizeTarget(null);
      showToast('Booking customized & synced live!', 'success');
    } catch (e: any) {
      Alert.alert('Customize Failed', e?.message || 'Failed to customize booking');
    } finally {
      setSavingCustomize(false);
    }
  };

  const handleShareCustomizeWhatsApp = async () => {
    if (!customizeTarget) return;
    const live = getCustomizeLiveTotal();
    shareQuotationViaWhatsApp({
      invoiceNumber: `EST-${customizeTarget.id}`,
      date: new Date().toISOString().split('T')[0],
      brandName: customizeTarget.website || 'Drop Cars',
      customerName: customizeTarget.name || 'Valued Customer',
      customerPhone: customizeTarget.phone || '',
      pickup: editPickup || customizeTarget.pickup || 'Pickup Location',
      dropLocation: editDrop || customizeTarget.drop_location || 'Drop Location',
      travelDate: `${editTravelDate || customizeTarget.travel_date || ''} ${editTravelTime || customizeTarget.travel_time || ''}`,
      vehicleType: editVehicleType || customizeTarget.vehicle_type || 'Sedan',
      tripType: editTripType || customizeTarget.trip_type || 'One Way',
      distanceKm: editDistanceKm ? parseFloat(editDistanceKm) : undefined,
      ratePerKm: editRatePerKm ? parseFloat(editRatePerKm) : undefined,
      baseFare: live.base,
      tollCharges: parseFloat(editTollCharges) || 0,
      stateTax: parseFloat(editStateTax) || 0,
      hillsCharges: parseFloat(editHillCharges) || 0,
      driverBata: parseFloat(editDriverBata) || 300,
      extraCharges: parseFloat(editExtraCharges) || 0,
      discountAmount: parseFloat(editDiscountAmount) || 0,
      advancePaid: live.advance,
      includeGst: editIncludeGst,
      gstPercent: 5.0,
      gstAmount: live.gst,
      notes: editNotes.trim(),
    });
  };

  const handlePdfEstimation = (enquiry: WebsiteEnquiry) => {
    printOrDownloadEstimation({
      invoiceNumber: `EST-${enquiry.id}`,
      date: new Date().toISOString().split('T')[0],
      brandName: enquiry.website || 'Drop Cars',
      customerName: enquiry.name || 'Customer',
      customerPhone: enquiry.phone || '',
      pickup: enquiry.pickup || 'Pickup Location',
      dropLocation: enquiry.drop_location || 'Drop Location',
      travelDate: `${enquiry.travel_date || ''} ${enquiry.travel_time || ''}`,
      vehicleType: enquiry.vehicle_type || 'Sedan',
      tripType: enquiry.trip_type || 'One Way',
      baseFare: (enquiry as any).base_fare || enquiry.fare_estimate || 0,
      extraCharges: enquiry.extra_charges || 0,
      tollCharges: (enquiry as any).toll_charges || 0,
      stateTax: (enquiry as any).state_tax || (enquiry as any).permit_charges || 0,
      hillsCharges: (enquiry as any).hill_charges || (enquiry as any).hills_charges || 0,
      driverBata: (enquiry as any).driver_bata || 300,
      discountAmount: (enquiry as any).discount_amount || 0,
      advancePaid: (enquiry as any).advance_requested || (enquiry as any).advance_amount || 0,
      includeGst: !!enquiry.include_gst,
      gstPercent: 5.0,
      gstAmount: enquiry.gst_amount || 0,
      notes: enquiry.dispatcher_notes || '',
    });
  };

  const handleSaveNewLead = async (confirmImmediately: boolean = false) => {
    if (!leadName.trim() || !leadPhone.trim() || !leadPickup.trim() || !leadDrop.trim()) {
      Alert.alert('Required Fields Missing', 'Please enter customer name, phone number, pickup location, and drop location.');
      return;
    }
    setSavingNewLead(true);
    try {
      const fare = parseFloat(leadFareEstimate) || 0;
      const advance = parseFloat(leadAdvanceRequested) || 0;

      const newLeadData = {
        name: leadName.trim(),
        phone: leadPhone.trim(),
        pickup: leadPickup.trim(),
        drop_location: leadDrop.trim(),
        trip_type: leadTripType,
        vehicle_type: leadVehicleType,
        travel_date: leadTravelDate.trim() || new Date().toISOString().split('T')[0],
        travel_time: leadTravelTime.trim() || '10:00 AM',
        fare_estimate: fare,
        advance_requested: advance,
        notes: leadNotes.trim(),
        website: leadWebsite,
      };

      const res = await enquiriesApi.createLead(newLeadData);

      if (confirmImmediately && res?.id) {
        await enquiriesApi.action(res.id, 'confirm');
        showToast('Lead created and converted to Confirmed Booking!', 'success');
        router.push('/(tabs)/orders' as any);
      } else {
        showToast('New Lead & Quotation created successfully!', 'success');
      }

      setShowNewLeadModal(false);
      setLeadName('');
      setLeadPhone('');
      setLeadPickup('');
      setLeadDrop('');
      setLeadFareEstimate('');
      setLeadAdvanceRequested('');
      setLeadNotes('');
      setLeadKm('');
      setLeadFareTouched(false);
      load(tab, 1, false);
    } catch (e: any) {
      showToast('Lead saved!', 'success');
      setShowNewLeadModal(false);
    } finally {
      setSavingNewLead(false);
    }
  };

  const handleCopyLead = (enquiry: WebsiteEnquiry) => {
    const pickupDateStr = formatPickupDateTime(enquiry.travel_date, enquiry.travel_time);
    const summary = `🚗 LEAD #${enquiry.booking_id || enquiry.id}
Customer: ${enquiry.name || 'Customer'}
Phone: ${enquiry.phone || 'N/A'}
Route: ${enquiry.pickup || ''} → ${enquiry.drop_location || ''}
Vehicle: ${enquiry.vehicle_type || 'Sedan'} (${enquiry.trip_type || 'One Way'})
Pickup: ${pickupDateStr}
Quoted Fare: ₹${enquiry.fare_estimate || 0}
Source: ${enquiry.website || enquiry.source || 'dropcars.in'}${enquiry.dispatcher_notes ? `\nNotes: ${enquiry.dispatcher_notes}` : ''}`;

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(summary);
    }
    showToast('Lead details copied to clipboard!', 'success');
  };

  const renderCard = (enquiry: WebsiteEnquiry) => {
    const isActioning = actioningId === enquiry.id;
    const isNew = isNewUnseen(enquiry);
    const isMissed = isEnquiryMissed(enquiry);
    const displayPrice = enquiry.fare_estimate || 0;
    const refId = enquiry.booking_id || `LD-${enquiry.id}`;
    const hasNote = !!(enquiry.dispatcher_notes && enquiry.dispatcher_notes.trim().length >= 3);

    const createdMs = parseIstTimestamp(enquiry.created_at);
    const ageHrs = createdMs > 0 ? Math.max(2, Math.floor((Date.now() - createdMs) / 3600000)) : 2;

    const starInfo = enquiry.response_time_seconds != null
      ? starsForSeconds(enquiry.response_time_seconds)
      : null;

    const isConfirmed =
      enquiry.lead_stage === 'confirmed' ||
      enquiry.status === 'confirmed' ||
      enquiry.status === 'converted' ||
      !!(enquiry as any).converted_order_id;

    return (
      <TouchableOpacity
        key={enquiry.id}
        activeOpacity={0.75}
        onPress={() => { markSeen(enquiry.id); setDetailTarget(enquiry); }}
        style={[
          styles.card,
          {
            backgroundColor: themeColors.surface,
            borderColor: isConfirmed
              ? '#10B981'
              : isMissed
              ? '#EF4444'
              : isNew
              ? '#F59E0B'
              : themeColors.border,
            borderWidth: isConfirmed ? 1.8 : isMissed ? 1.5 : isNew ? 1.5 : 1,
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          },
          isNew && !isConfirmed && styles.cardNew,
        ]}
      >
        {/* Top Header Row: Brand, ID & Status Chips (Zero-Overflow Responsive Wrap) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, marginTop: 2 }}>
            <View style={styles.brandBadge}>
              <Globe size={10} color="#0EA5E9" />
              <Text style={styles.brandBadgeText}>{enquiry.website || enquiry.source || 'dropcars.in'}</Text>
            </View>
            <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
              #{refId}
            </Text>
          </View>

          {/* Badges Container (Flex Wrap & No Overflow) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1, maxWidth: '65%' }}>
            {isConfirmed && (
              <View style={{ backgroundColor: isDark ? '#064E3B30' : '#ECFDF5', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5, borderWidth: 1, borderColor: '#10B981', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={11} color="#10B981" />
                <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', fontWeight: '800', color: isDark ? '#34D399' : '#047857' }}>
                  CONFIRMED
                </Text>
              </View>
            )}

            {isFutureLead(enquiry.travel_date, enquiry.travel_time) && !isConfirmed && (
              <View style={{ backgroundColor: isDark ? '#EA580C25' : '#FFEDD5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#EA580C50', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Calendar size={10} color="#EA580C" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#EA580C' }}>Future Follow-up</Text>
              </View>
            )}

            {/* Star Rating Chip for Responded */}
            {starInfo ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: starInfo.stars >= 4 ? '#ECFDF5' : starInfo.stars >= 2 ? '#FEF3C7' : '#FEE2E2',
                  borderWidth: 1,
                  borderColor: starInfo.stars >= 4 ? '#10B981' : starInfo.stars >= 2 ? '#F59E0B' : '#EF4444',
                }}
              >
                <Star size={10} color={starInfo.stars >= 4 ? '#10B981' : starInfo.stars >= 2 ? '#D97706' : '#DC2626'} fill={starInfo.stars >= 4 ? '#10B981' : starInfo.stars >= 2 ? '#D97706' : '#DC2626'} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: starInfo.stars >= 4 ? '#065F46' : starInfo.stars >= 2 ? '#92400E' : '#991B1B' }}>
                  {starInfo.starString} · {formatDurationFriendly(enquiry.response_time_seconds || 0)}
                </Text>
              </View>
            ) : isMissed ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: '#EF4444' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>MISSED (LATE)</Text>
              </View>
            ) : isNew && !isConfirmed ? (
              <Animated.View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 2.5,
                  borderRadius: 4,
                  backgroundColor: '#FEF3C7',
                  borderWidth: 1.5,
                  borderColor: '#F59E0B',
                  opacity: pulseAnim,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EA580C' }} />
                <Text style={{ fontSize: 10, fontFamily: 'Inter-Bold', fontWeight: '900', color: '#B45309' }}>
                  ⚡ JUST IN
                </Text>
              </Animated.View>
            ) : null}

            {enquiry.lead_stage && enquiry.lead_stage !== 'new' && enquiry.lead_stage !== 'confirmed' ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>
                  {RESPONSE_REASONS.find((r) => r.key === enquiry.lead_stage)?.label || enquiry.lead_stage}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Subtle Enquiry Received Date & Time */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <Clock size={11} color={themeColors.textSecondary} />
          <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
            Recd: <Text style={{ fontWeight: '600', color: themeColors.text }}>{formatEnquiryReceivedTime(enquiry.created_at)}</Text>
          </Text>
        </View>

        {/* Missed Warning Strip */}
        {isMissed && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2', borderColor: '#EF4444', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginBottom: 8 }}>
            <AlertCircle size={13} color="#DC2626" />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#DC2626', flex: 1 }}>
              Received {ageHrs} hrs ago — you can still respond
            </Text>
          </View>
        )}

        {/* Route Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <MapPin size={15} color="#10B981" />
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: themeColors.text, flex: 1 }} numberOfLines={1}>
            {enquiry.pickup || 'Pickup Location'} → {enquiry.drop_location || 'Drop Location'}
          </Text>
        </View>

        {/* 3-Column Grid Details Box */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 6,
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          marginBottom: 8,
          borderWidth: 1,
          borderColor: themeColors.border,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Car & Type</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text, marginTop: 2 }} numberOfLines={1}>
              {enquiry.vehicle_type || 'Sedan'} · {enquiry.trip_type || 'One Way'}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Customer</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text, marginTop: 2 }} numberOfLines={1}>
              {enquiry.name || 'Customer'}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Quoted Fare</Text>
            <Text style={{ fontSize: 15, fontWeight: '900', color: '#059669', marginTop: 1 }}>
              {displayPrice ? `₹${displayPrice.toLocaleString('en-IN')}` : '₹0'}
            </Text>
            {enquiry.include_gst ? (
              <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginTop: 2 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0284C7' }}>+ GST 5% Included</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Highlighted Pickup Date & Time Box + Call / WhatsApp Action Buttons */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : '#F0F9FF',
          borderColor: isDark ? '#0284C7' : '#BAE6FD',
          borderWidth: 1.2,
          borderRadius: 6,
          paddingHorizontal: 9,
          paddingVertical: 6,
          marginBottom: 8,
          gap: 6,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Calendar size={13} color="#0284C7" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.3 }}>Pickup Schedule</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: isDark ? '#38BDF8' : '#0369A1' }} numberOfLines={1}>
                {formatPickupDateTime(enquiry.travel_date, enquiry.travel_time)}
              </Text>
            </View>
          </View>

          {!!enquiry.phone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: '#10B98115',
                  borderWidth: 1,
                  borderColor: '#10B981',
                }}
                onPress={(e) => { e.stopPropagation(); handleCall(enquiry); }}
                activeOpacity={0.8}
                accessibilityLabel="Call Customer"
              >
                <PhoneCall size={11} color="#10B981" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>{enquiry.phone}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: '#25D36615',
                  borderWidth: 1,
                  borderColor: '#25D366',
                }}
                onPress={(e) => { e.stopPropagation(); handleWhatsApp(enquiry); }}
                activeOpacity={0.8}
                accessibilityLabel="WhatsApp Customer"
              >
                <MessageSquare size={12} color="#25D366" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Dispatcher Notes Banner or Comment Pending Reminder */}
        {hasNote ? (
          <View style={{ backgroundColor: isDark ? '#0F172A' : '#EFF6FF', borderRadius: 6, padding: 6, paddingHorizontal: 8, marginBottom: 8, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }} numberOfLines={2}>
              📍 Note: {enquiry.dispatcher_notes}
            </Text>
          </View>
        ) : (enquiry.is_touched || tab === 'responded') ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); openNote(enquiry); }}
            style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7', borderRadius: 6, padding: 6, paddingHorizontal: 8, marginBottom: 8, borderWidth: 1, borderColor: '#F59E0B', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#FBBF24' : '#B45309' }}>
              ⚠️ Comment pending — tap to add note
            </Text>
            <Edit3 size={12} color="#D97706" />
          </TouchableOpacity>
        ) : null}

        {/* Action Buttons Section (Unified Modern 2-Row Layout) */}
        {actioningId === enquiry.id ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <View style={{
            marginTop: 8,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: themeColors.border,
            gap: 8,
          }}>
            {/* Row 1: Primary Business Workflow Actions */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {!isConfirmed && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6.5,
                    borderRadius: 8,
                    backgroundColor: '#10B981',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleConfirm(enquiry); }}
                  activeOpacity={0.8}
                >
                  <CheckCircle2 size={13} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: '#FFFFFF' }}>Confirm & Post</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 6.5,
                  borderRadius: 8,
                  backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                  borderWidth: 1.2,
                  borderColor: isDark ? '#3B82F650' : '#93C5FD',
                }}
                onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openCustomizeModal(enquiry); }}
                activeOpacity={0.8}
              >
                <Edit3 size={13} color="#2563EB" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#2563EB' }}>Customize</Text>
              </TouchableOpacity>

              {/* Respond / Respond Now Button */}
              {tab !== 'responded' && !isConfirmed && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 9,
                    paddingVertical: 6.5,
                    borderRadius: 8,
                    backgroundColor: isMissed ? '#DC2626' : (isDark ? '#064E3B30' : '#ECFDF5'),
                    borderWidth: 1.2,
                    borderColor: isMissed ? '#DC2626' : '#10B981',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openRespondModal(enquiry); }}
                  activeOpacity={0.8}
                >
                  <CheckCircle2 size={13} color={isMissed ? '#FFFFFF' : '#10B981'} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: isMissed ? '#FFFFFF' : '#047857' }}>
                    {isMissed ? 'Respond now' : 'Responded'}
                  </Text>
                  <ChevronDown size={12} color={isMissed ? '#FFFFFF' : '#047857'} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  paddingVertical: 6.5,
                  borderRadius: 8,
                  backgroundColor: isDark ? '#1E293B' : '#FAF5FF',
                  borderWidth: 1.2,
                  borderColor: isDark ? '#9333EA50' : '#E9D5FF',
                }}
                onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handlePdfEstimation(enquiry); }}
                activeOpacity={0.8}
              >
                <FileText size={13} color="#9333EA" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#9333EA' }}>Quote</Text>
              </TouchableOpacity>
            </View>

            {/* Row 2: Collaboration & Utility Tools (Transfer, Notes, Copy, Spam, Delete) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* Transfer Lead Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4.5,
                    paddingHorizontal: 9,
                    paddingVertical: 5.5,
                    borderRadius: 7,
                    backgroundColor: isDark ? '#1E1B4B40' : '#EEF2FF',
                    borderWidth: 1,
                    borderColor: isDark ? '#6366F150' : '#C7D2FE',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); setTransferTarget(enquiry); }}
                  activeOpacity={0.8}
                >
                  <Users size={12.5} color="#6366F1" />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', color: '#6366F1' }}>Transfer</Text>
                </TouchableOpacity>

                {/* Add / View Note Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4.5,
                    paddingHorizontal: 9,
                    paddingVertical: 5.5,
                    borderRadius: 7,
                    backgroundColor: hasNote ? (isDark ? '#064E3B30' : '#ECFDF5') : (isDark ? '#1E293B' : '#F8FAFC'),
                    borderWidth: 1,
                    borderColor: hasNote ? '#10B981' : themeColors.border,
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openNote(enquiry); }}
                  activeOpacity={0.8}
                >
                  <StickyNote size={12.5} color={hasNote ? '#10B981' : themeColors.textSecondary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: hasNote ? '#047857' : themeColors.textSecondary }}>
                    {hasNote ? 'Note added' : 'Note'}
                  </Text>
                </TouchableOpacity>

                {/* Copy Lead Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4.5,
                    paddingHorizontal: 8,
                    paddingVertical: 5.5,
                    borderRadius: 7,
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderWidth: 1,
                    borderColor: themeColors.border,
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleCopyLead(enquiry); }}
                  activeOpacity={0.8}
                >
                  <Copy size={12.5} color={themeColors.textSecondary} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.textSecondary }}>Copy</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <TouchableOpacity
                  style={{
                    padding: 6.5,
                    borderRadius: 7,
                    backgroundColor: isDark ? '#7F1D1D25' : '#FEF2F2',
                    borderWidth: 1,
                    borderColor: isDark ? '#EF444440' : '#FECACA',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleSpam(enquiry); }}
                  accessibilityLabel="Mark as spam"
                >
                  <XCircle size={13.5} color={colors.error} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    padding: 6.5,
                    borderRadius: 7,
                    backgroundColor: isDark ? '#7F1D1D25' : '#FEF2F2',
                    borderWidth: 1,
                    borderColor: isDark ? '#EF444440' : '#FECACA',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleDelete(enquiry); }}
                  accessibilityLabel="Delete enquiry"
                >
                  <Trash2 size={13.5} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={isTab || hideHeader ? [] : ['top']}>
      {/* App Header with Center Brand Selector Dropdown (Only when not embedded inside orders tab) */}
      {!isTab && !hideHeader && (
        <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {onBackToHub ? (
              <TouchableOpacity
                onPress={onBackToHub}
                accessibilityLabel="Back to CRM Hub"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: isDark ? '#1E293B' : '#EEF2FF',
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#C7D2FE',
                }}
              >
                <ArrowLeft size={15} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>Hub</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/' as any);
                  }
                }}
                accessibilityLabel="Go back"
                style={{ padding: 4 }}
              >
                <ArrowLeft size={22} color={themeColors.text} />
              </TouchableOpacity>
            )}

            {/* Center Brand Selector Dropdown */}
            <TouchableOpacity
              onPress={() => setShowBrandModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                borderWidth: 1,
                borderColor: themeColors.border,
                maxWidth: 210,
              }}
              activeOpacity={0.8}
            >
              <Globe size={14} color="#0EA5E9" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                {WEBSITE_BRANDS.find((b) => b.domain === selectedBrand)?.name || 'All Brands'}
              </Text>
              <ChevronDown size={14} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ThemeToggle size={20} />
        </View>
      )}

      {/* Attached Edge-to-Edge 4-Tabs Bar: Pending (1st) | Missed (2nd) | 📅 Future (3rd) | Responded (4th) */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: themeColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: themeColors.border,
      }}>
        {/* Tab 1: Pending Master Call Queue */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 11,
            borderBottomWidth: tab === 'not_responded' ? 3 : 0,
            borderBottomColor: '#6366F1',
          }}
          onPress={() => setTab('not_responded')}
        >
          <Text style={{
            fontSize: 11.5,
            fontWeight: tab === 'not_responded' ? '800' : '600',
            color: tab === 'not_responded' ? (isDark ? '#818CF8' : '#4F46E5') : themeColors.textSecondary,
          }}>
            Pending ({pendingQueueCount})
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Missed (within 48h) */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 11,
            borderBottomWidth: tab === 'missed' ? 3 : 0,
            borderBottomColor: '#EF4444',
          }}
          onPress={() => setTab('missed')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              fontSize: 11.5,
              fontWeight: tab === 'missed' ? '800' : '600',
              color: tab === 'missed' ? '#EF4444' : themeColors.textSecondary,
            }}>
              Missed ({missedCount})
            </Text>
            {missedCount > 0 && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
            )}
          </View>
        </TouchableOpacity>

        {/* Tab 3: Future Follow-ups (> 2h pickup) */}
        <TouchableOpacity
          style={{
            flex: 1.15,
            alignItems: 'center',
            paddingVertical: 11,
            borderBottomWidth: tab === 'future' ? 3 : 0,
            borderBottomColor: '#EA580C',
          }}
          onPress={() => setTab('future')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              fontSize: 11.5,
              fontWeight: tab === 'future' ? '800' : '600',
              color: tab === 'future' ? '#EA580C' : themeColors.textSecondary,
            }}>
              📅 Future ({futureCount})
            </Text>
            {futureCount > 0 && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EA580C' }} />
            )}
          </View>
        </TouchableOpacity>

        {/* Tab 4: Responded */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 11,
            borderBottomWidth: tab === 'responded' ? 3 : 0,
            borderBottomColor: '#10B981',
          }}
          onPress={() => setTab('responded')}
        >
          <Text style={{
            fontSize: 11.5,
            fontWeight: tab === 'responded' ? '800' : '600',
            color: tab === 'responded' ? (isDark ? '#34D399' : '#059669') : themeColors.textSecondary,
          }}>
            Responded ({respondedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mandatory Comments Pending Banner */}
      {pendingCommentsCount > 0 && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            setShowOnlyPendingComments((prev) => !prev);
            if (tab !== 'responded') setTab('responded');
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: showOnlyPendingComments ? '#F59E0B' : (isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7'),
            borderBottomWidth: 1,
            borderBottomColor: '#F59E0B',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} color={showOnlyPendingComments ? '#FFFFFF' : '#D97706'} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: showOnlyPendingComments ? '#FFFFFF' : (isDark ? '#FBBF24' : '#B45309') }}>
              {pendingCommentsCount} comments pending
            </Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: showOnlyPendingComments ? '#FFFFFF' : (isDark ? '#FBBF24' : '#B45309') }}>
            {showOnlyPendingComments ? 'Showing pending comments ✓' : 'Tap to filter & complete →'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Search Input & Filter Bar */}
      <View style={{ paddingHorizontal: 16, marginTop: 10, marginBottom: 4 }}>
        <View style={[styles.searchRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border, marginHorizontal: 0, borderRadius: 6 }]}>
          <Search size={16} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search by name, phone, pickup, drop, or website"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={runSearch}
            placeholderTextColor={themeColors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); runSearch(); }} style={{ padding: 2, marginRight: 4 }}>
              <X size={15} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: dateFilter !== 'all' ? '#0EA5E9' : isDark ? '#1E293B' : '#F1F5F9',
              borderWidth: 1,
              borderColor: dateFilter !== 'all' ? '#0EA5E9' : themeColors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
            onPress={() => setShowDateFilterModal(true)}
          >
            <SlidersHorizontal size={14} color={dateFilter !== 'all' ? '#FFFFFF' : themeColors.textSecondary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: dateFilter !== 'all' ? '#FFFFFF' : themeColors.textSecondary }}>
              {dateFilter === 'all' ? 'Filter' : dateFilter.toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Responded-tab-only stage filter dropdown picker */}
      {tab === 'responded' && (
        <View style={styles.stageFilterWrap}>
          <TouchableOpacity
            style={[styles.stageDropdownBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            onPress={() => setStageFilterOpen(true)}
          >
            <Text style={[styles.stageDropdownText, { color: themeColors.text }]} numberOfLines={1}>
              {stageFilter === 'all' ? 'All statuses' : RESPONSE_REASONS.find((r) => r.key === stageFilter)?.label || 'All statuses'}
            </Text>
            <ChevronDown size={16} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Stage filter modal */}
      <Modal visible={stageFilterOpen} transparent animationType="fade" onRequestClose={() => setStageFilterOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setStageFilterOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Filter by status</Text>
              <TouchableOpacity onPress={() => setStageFilterOpen(false)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.reasonOption, { borderColor: themeColors.border }]}
              onPress={() => { setStageFilter('all'); setStageFilterOpen(false); }}
            >
              <Text style={[styles.reasonOptionText, { color: themeColors.text, fontWeight: stageFilter === 'all' ? '800' : '600' }]}>All statuses</Text>
              {stageFilter === 'all' && <CheckCircle2 size={16} color="#10B981" />}
            </TouchableOpacity>
            {RESPONSE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.key}
                style={[styles.reasonOption, { borderColor: themeColors.border }]}
                onPress={() => { setStageFilter(reason.key); setStageFilterOpen(false); }}
              >
                <Text style={[styles.reasonOptionText, { color: themeColors.text, fontWeight: stageFilter === reason.key ? '800' : '600' }]}>{reason.label}</Text>
                {stageFilter === reason.key && <CheckCircle2 size={16} color="#10B981" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Brand Selector Modal */}
      <Modal visible={showBrandModal} transparent animationType="fade" onRequestClose={() => setShowBrandModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBrandModal(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, maxHeight: 460 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Globe size={20} color="#0EA5E9" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Select Brand Website</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBrandModal(false)} style={{ padding: 4 }}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {WEBSITE_BRANDS.map((b) => {
                const isSelected = selectedBrand === b.domain;
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => {
                      setSelectedBrand(b.domain);
                      setShowBrandModal(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor: isSelected ? (isDark ? '#1E293B' : '#F0F9FF') : 'transparent',
                      borderWidth: 1,
                      borderColor: isSelected ? '#0EA5E9' : themeColors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Globe size={16} color={isSelected ? '#0EA5E9' : themeColors.textSecondary} />
                      <View>
                        <Text style={{ fontSize: 13.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#0EA5E9' : themeColors.text }}>
                          {b.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>
                          {b.domain === 'all' ? 'All integrated websites' : b.domain}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Check size={18} color="#0EA5E9" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Filter Modal */}
      <Modal visible={showDateFilterModal} transparent animationType="fade" onRequestClose={() => setShowDateFilterModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDateFilterModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Filter by Date Range</Text>
              <TouchableOpacity onPress={() => setShowDateFilterModal(false)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { key: 'all', label: 'All Dates' },
              { key: 'today', label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: 'week', label: 'Last 7 Days' },
              { key: 'month', label: 'This Month' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.reasonOption, { borderColor: themeColors.border }]}
                onPress={() => { setDateFilter(option.key as any); setShowDateFilterModal(false); }}
              >
                <Text style={[styles.reasonOptionText, { color: themeColors.text, fontWeight: dateFilter === option.key ? '800' : '600' }]}>
                  {option.label}
                </Text>
                {dateFilter === option.key && <CheckCircle2 size={16} color="#0EA5E9" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Main List Area */}
      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.loading}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(tab, 1, false); }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {displayedEnquiries.length === 0 ? (
            <View style={styles.emptyBox}>
              <Globe size={40} color={themeColors.textMuted} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary, marginTop: 12 }]}>
                {tab === 'missed'
                  ? 'No missed enquiries. Great job staying on top of customer leads!'
                  : tab === 'responded'
                  ? (showOnlyPendingComments ? 'No pending comments found!' : 'No responded enquiries found.')
                  : 'No pending enquiries found.'}
              </Text>
            </View>
          ) : (
            displayedEnquiries.map(renderCard)
          )}
          {page < totalPages && (
            <TouchableOpacity style={[styles.loadMoreBtn, loadingMore && { opacity: 0.6 }]} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.loadMoreText}>Load More Leads</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Full Enquiry Detailed View Modal */}
      <Modal visible={!!detailTarget} transparent animationType="slide" onRequestClose={() => setDetailTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Lead #{detailTarget?.id} Details</Text>
                <Text style={{ fontSize: 12, color: '#0EA5E9', fontWeight: '700' }}>{detailTarget?.website || 'dropcars.in'}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailTarget(null)} accessibilityLabel="Close">
                <X size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {detailTarget && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>
                  {detailTarget.name || 'Customer Lead'}
                </Text>
                <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 12 }}>
                  Phone: {detailTarget.phone || 'N/A'}
                </Text>

                <View style={{ padding: 10, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderWidth: 1, borderColor: themeColors.border, gap: 6, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: themeColors.text }}>
                    📍 <Text style={{ fontWeight: '700' }}>Route:</Text> {detailTarget.pickup} → {detailTarget.drop_location}
                  </Text>
                  <Text style={{ fontSize: 13, color: themeColors.text }}>
                    📅 <Text style={{ fontWeight: '700' }}>Date & Time:</Text> {detailTarget.travel_date} @ {detailTarget.travel_time}
                  </Text>
                  <Text style={{ fontSize: 13, color: themeColors.text }}>
                    🚕 <Text style={{ fontWeight: '700' }}>Vehicle:</Text> {detailTarget.vehicle_type} ({detailTarget.trip_type})
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#10B981' }}>
                    💰 Total Quoted Fare: ₹{detailTarget.fare_estimate?.toLocaleString('en-IN') || 0}
                  </Text>
                </View>

                {!!detailTarget.dispatcher_notes && (
                  <View style={{ padding: 10, borderRadius: 6, backgroundColor: isDark ? '#0F172A' : '#EFF6FF', borderWidth: 1, borderColor: themeColors.border, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary, marginBottom: 2 }}>Dispatcher Note:</Text>
                    <Text style={{ fontSize: 13, color: themeColors.text }}>{detailTarget.dispatcher_notes}</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#10B981', flex: 1 }]}
                    onPress={() => {
                      const t = detailTarget;
                      setDetailTarget(null);
                      handleCall(t);
                    }}
                  >
                    <PhoneCall size={15} color="#FFFFFF" />
                    <Text style={[styles.modalActionBtnText, { color: '#FFFFFF' }]}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: '#25D366', flex: 1 }]}
                    onPress={() => {
                      const t = detailTarget;
                      setDetailTarget(null);
                      handleWhatsApp(t);
                    }}
                  >
                    <MessageSquare size={15} color="#FFFFFF" />
                    <Text style={[styles.modalActionBtnText, { color: '#FFFFFF' }]}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Comprehensive Customize Booking & Fare Estimation Modal */}
      <Modal visible={!!customizeTarget} transparent animationType="slide" onRequestClose={() => setCustomizeTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '92%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Customize Fare & Package #{customizeTarget?.id}</Text>
                <Text style={{ fontSize: 11.5, color: '#0EA5E9', fontWeight: '700' }}>
                  {customizeTarget?.name} · {customizeTarget?.phone || ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCustomizeTarget(null)} accessibilityLabel="Close">
                <X size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 8 }}>
              {/* Route & Vehicle Class */}
              <Text style={styles.sectionLabel}>Route & Vehicle Specification</Text>
              <Text style={styles.inputLabel}>Pickup Location</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={editPickup}
                onChangeText={setEditPickup}
              />

              <Text style={styles.inputLabel}>Drop Location</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={editDrop}
                onChangeText={setEditDrop}
              />

              {/* Trip Category Selector */}
              <Text style={[styles.inputLabel, { marginTop: 6 }]}>Trip Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {TRIP_CATEGORIES.map((cat) => {
                    const isSelected = editTripType === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => handleTripTypeChange(cat)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? (isDark ? '#0284C7' : '#0284C7') : (isDark ? '#1E293B' : '#F1F5F9'),
                          borderWidth: 1.2,
                          borderColor: isSelected ? '#0284C7' : themeColors.border,
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#FFFFFF' : themeColors.text }}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Vehicle Category Selector */}
              <Text style={styles.inputLabel}>Vehicle Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {LEAD_VEHICLE_TYPES.map((vType) => {
                    const isSelected = editVehicleType === vType;
                    return (
                      <TouchableOpacity
                        key={vType}
                        onPress={() => handleVehicleTypeChange(vType)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? (isDark ? '#0D9488' : '#0D9488') : (isDark ? '#1E293B' : '#F1F5F9'),
                          borderWidth: 1.2,
                          borderColor: isSelected ? '#0D9488' : themeColors.border,
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#FFFFFF' : themeColors.text }}>
                          {vType}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <DateTimeField
                dateLabel="Travel Date"
                timeLabel="Travel Time"
                dateValue={editTravelDate}
                timeValue={editTravelTime}
                onDateChange={setEditTravelDate}
                onTimeChange={setEditTravelTime}
                minimumDate={new Date(2000, 0, 1)}
              />

              {/* Journey Distance, Duration & Tariff Recalculation Engine */}
              <View
                style={{
                  marginTop: 12,
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📏 Distance & Tariff Calculation
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRecalculateBaseFare()}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: isDark ? '#334155' : '#E2E8F0' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.text }}>🔄 Auto-Recalc</Text>
                  </TouchableOpacity>
                </View>

                {/* 2x2 Grid: Distance, Days, Rate/km, Driver Bata */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Distance (KM) *</Text>
                    <TextInput
                      style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, fontWeight: '700' }]}
                      value={editDistanceKm}
                      onChangeText={handleDistanceChange}
                      placeholder="e.g. 240"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Trip Days</Text>
                    <TextInput
                      style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, fontWeight: '700' }]}
                      value={editTripDays}
                      onChangeText={handleDaysChange}
                      placeholder="e.g. 1"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Rate / KM (₹)</Text>
                    <TextInput
                      style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                      value={editRatePerKm}
                      onChangeText={handleRateChange}
                      placeholder="e.g. 14"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Driver Bata / Day (₹)</Text>
                    <TextInput
                      style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                      value={editDriverBata}
                      onChangeText={handleDriverBataChange}
                      placeholder="e.g. 300"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Min KM Formula Visual Indicator */}
                {(() => {
                  const kmNum = parseFloat(editDistanceKm) || 0;
                  const daysNum = Math.max(1, parseInt(editTripDays, 10) || 1);
                  const isRound = editTripType === 'Round Trip' || editTripType === 'Multi City';
                  const rateInfo = getLeadRateDefaults(editVehicleType, editTripType);
                  const minKm = isRound ? rateInfo.minKmRoundTrip * daysNum : rateInfo.minKmOneWay;
                  const effectiveKm = Math.max(kmNum, minKm);
                  const rateNum = parseFloat(editRatePerKm) || rateInfo.costPerKm;
                  const bataNum = parseFloat(editDriverBata) || rateInfo.driverBata;
                  return (
                    <View style={{ padding: 6, borderRadius: 6, backgroundColor: isDark ? '#0F172A' : '#EFF6FF', borderWidth: 1, borderColor: '#BAE6FD' }}>
                      <Text style={{ fontSize: 10.5, color: isDark ? '#7DD3FC' : '#0369A1', fontWeight: '600' }}>
                        ⚡ Billable: <Text style={{ fontWeight: '800' }}>{effectiveKm} KM</Text> {kmNum < minKm ? `(Min ${minKm} KM applied)` : ''} × ₹{rateNum}/km + Bata (₹{bataNum} × {daysNum}d) = <Text style={{ fontWeight: '900', color: '#10B981' }}>₹{Math.round((effectiveKm * rateNum) + (bataNum * daysNum))}</Text>
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Comprehensive Itemized Fare Engine */}
              <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Package Pricing Breakdown (Tolls & State Tax)</Text>

              {/* 1. Base Trip Fare */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <Text style={styles.inputLabel}>Base Vehicle Fare (₹) *</Text>
                {editBaseFareTouched && (
                  <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '700' }}>✏️ Manual override active</Text>
                )}
              </View>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, fontWeight: '700' }]}
                value={editBaseFare}
                onChangeText={(val) => {
                  setEditBaseFare(val);
                  setEditBaseFareTouched(true);
                }}
                placeholder="e.g. 2350"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
              />

              {/* 2. Toll Charges with Inclusion Toggle */}
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.inputLabel}>Highway Tolls (₹)</Text>
                  <TouchableOpacity
                    onPress={() => setEditTollIncluded(!editTollIncluded)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: editTollIncluded ? '#ECFDF5' : '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: editTollIncluded ? '#10B981' : '#F59E0B' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: editTollIncluded ? '#065F46' : '#92400E' }}>
                      {editTollIncluded ? '✅ Included in Fare' : '⚠️ Extra / By Customer'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  value={editTollCharges}
                  onChangeText={setEditTollCharges}
                  placeholder="e.g. 350"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="numeric"
                />
              </View>

              {/* 3. State Entry Permit Tax with Inclusion Toggle */}
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.inputLabel}>State Entry Permit / Border Tax (₹)</Text>
                  <TouchableOpacity
                    onPress={() => setEditStateTaxIncluded(!editStateTaxIncluded)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: editStateTaxIncluded ? '#ECFDF5' : '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: editStateTaxIncluded ? '#10B981' : '#F59E0B' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: editStateTaxIncluded ? '#065F46' : '#92400E' }}>
                      {editStateTaxIncluded ? '✅ Included in Fare' : '⚠️ Extra / By Customer'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  value={editStateTax}
                  onChangeText={setEditStateTax}
                  placeholder="e.g. 350 (KA Permit), 400 (KL Permit)"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="numeric"
                />
              </View>

              {/* Quick Route Presets */}
              <View style={{ marginTop: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary, fontWeight: '700', marginBottom: 4 }}>
                  ⚡ 1-Tap Quick Presets:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => { setEditStateTax('350'); setEditStateTaxIncluded(true); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#4338CA' }}>+ KA Permit ₹350</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setEditStateTax('400'); setEditStateTaxIncluded(true); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#4338CA' }}>+ KL Permit ₹400</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setEditTollCharges('150'); setEditTollIncluded(true); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#047857' }}>+ Pondy Toll ₹150</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setEditTollCharges('450'); setEditTollIncluded(true); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#047857' }}>+ Blr Toll ₹450</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { setEditHillCharges('400'); setEditHillIncluded(true); }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#C2410C' }}>+ Hill / Ooty ₹400</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>

              {/* Hill Charges & Discount */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Hill / Ghat Road (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editHillCharges}
                    onChangeText={setEditHillCharges}
                    placeholder="e.g. 400"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Special Discount (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: '#DC2626' }]}
                    value={editDiscountAmount}
                    onChangeText={setEditDiscountAmount}
                    placeholder="e.g. 150"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* GST 5% Switch */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginVertical: 4 }}>
                <View>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.text }}>Include 5% GST Invoice</Text>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>Adds 5% GST on the total fare</Text>
                </View>
                <Switch value={editIncludeGst} onValueChange={setEditIncludeGst} trackColor={{ false: '#94A3B8', true: '#10B981' }} />
              </View>

              {/* Booking Advance Requested */}
              <Text style={styles.inputLabel}>Booking Advance Requested (₹)</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={editAdvanceRequested}
                onChangeText={setEditAdvanceRequested}
                placeholder="e.g. 500 or 20%"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
              />

              {/* Live Calculated Package Summary Card */}
              {(() => {
                const live = getCustomizeLiveTotal();
                return (
                  <View
                    style={{
                      marginVertical: 12,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: isDark ? '#064E3B20' : '#ECFDF5',
                      borderWidth: 1.5,
                      borderColor: '#10B981',
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>Total Package Estimate:</Text>
                      <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', fontWeight: '900', color: '#047857' }}>
                        ₹{live.grandTotal.toLocaleString('en-IN')}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Breakdown: Base (₹{live.base}) {live.toll > 0 ? `+ Tolls (₹${live.toll}) ` : ''}{live.stateTax > 0 ? `+ State Tax (₹${live.stateTax}) ` : ''}{live.hill > 0 ? `+ Hill (₹${live.hill}) ` : ''}{live.gst > 0 ? `+ GST (₹${live.gst}) ` : ''}{live.discount > 0 ? `- Discount (₹${live.discount})` : ''}
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#A7F3D0' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369A1' }}>
                        Advance: ₹{live.advance.toLocaleString('en-IN')}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>
                        Trip Balance: ₹{live.balance.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.inputLabel}>Internal Dispatcher Notes</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                placeholder="e.g. Quoted all-inclusive package with Tolls & KA Permit. Customer accepted."
              />
            </ScrollView>

            {/* Action Buttons Row */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 8, backgroundColor: '#25D366' }}
                onPress={handleShareCustomizeWhatsApp}
                activeOpacity={0.8}
              >
                <MessageSquare size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 8, backgroundColor: '#9333EA' }}
                onPress={() => {
                  const target = customizeTarget;
                  if (target) handlePdfEstimation(target);
                }}
                activeOpacity={0.8}
              >
                <FileText size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>PDF Quote</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1.4 }, savingCustomize && { opacity: 0.6 }]}
                onPress={saveCustomizeBooking}
                disabled={savingCustomize}
              >
                {savingCustomize ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save & Sync</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Simple Note Modal */}
      <Modal visible={!!noteTarget} transparent animationType="fade" onRequestClose={() => setNoteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Note for {noteTarget?.name || 'this lead'}</Text>
              <TouchableOpacity onPress={() => setNoteTarget(null)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. Customer called, will confirm date by tomorrow morning"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              placeholderTextColor={themeColors.textMuted}
            />
            <TouchableOpacity style={[styles.saveBtn, savingNote && { opacity: 0.6 }]} onPress={saveNote} disabled={savingNote}>
              {savingNote ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Feature C: Respond Modal with Mandatory Outcome Note */}
      <Modal visible={!!respondTarget} transparent animationType="fade" onRequestClose={() => setRespondTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                Respond to {respondTarget?.name || 'Customer Lead'}
              </Text>
              <TouchableOpacity onPress={() => setRespondTarget(null)} accessibilityLabel="Close">
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtext, { color: themeColors.textSecondary, marginBottom: 8 }]}>
              Select the response reason:
            </Text>

            {RESPONSE_REASONS.map((reason) => {
              const isSel = respondReason === reason.key;
              return (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.reasonOption,
                    {
                      borderColor: isSel ? '#10B981' : themeColors.border,
                      backgroundColor: isSel ? (isDark ? '#064E3B20' : '#ECFDF5') : 'transparent',
                    },
                  ]}
                  onPress={() => setRespondReason(reason.key)}
                >
                  <Text style={[styles.reasonOptionText, { color: isSel ? '#10B981' : themeColors.text, fontWeight: isSel ? '800' : '600' }]}>
                    {reason.label}
                  </Text>
                  {isSel ? <Check size={16} color="#10B981" /> : <ChevronRight size={16} color={themeColors.textSecondary} />}
                </TouchableOpacity>
              );
            })}

            {/* Mandatory Comment Input */}
            <Text style={[styles.inputLabel, { marginTop: 10, color: themeColors.text, fontWeight: '800' }]}>
              Outcome / Discussion Note * (Mandatory)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: themeColors.background,
                  borderColor: respondNoteText.trim().length >= 3 ? '#10B981' : themeColors.border,
                  color: themeColors.text,
                  minHeight: 70,
                },
              ]}
              placeholder="e.g. Quoted ₹3500 for Sedan, customer will confirm by 5 PM"
              placeholderTextColor={themeColors.textMuted}
              value={respondNoteText}
              onChangeText={setRespondNoteText}
              multiline
            />
            {respondNoteText.trim().length < 3 && (
              <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>
                * Min 3 characters required to submit response
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.reasonOption, { flex: 1, borderColor: 'rgba(239, 68, 68, 0.4)', justifyContent: 'center', backgroundColor: isDark ? '#7F1D1D20' : '#FEF2F2' }]}
                onPress={() => {
                  const target = respondTarget!;
                  setRespondTarget(null);
                  handleSpam(target);
                }}
              >
                <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12 }}>Mark Fake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  {
                    flex: 2,
                    backgroundColor: respondNoteText.trim().length >= 3 ? '#10B981' : '#94A3B8',
                  },
                ]}
                onPress={handleSaveRespond}
                disabled={savingRespond}
              >
                {savingRespond ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>Save & Log Response</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create New Lead Modal */}
      <Modal visible={showNewLeadModal} transparent animationType="slide" onRequestClose={() => setShowNewLeadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '92%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Create New Lead & Quotation</Text>
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>Website Admin Panel Manual Lead Generator</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNewLeadModal(false)} accessibilityLabel="Close">
                <X size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 8 }}>
              <Text style={styles.sectionLabel}>Customer Details</Text>
              <Text style={styles.inputLabel}>Customer Name *</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={themeColors.textMuted}
                value={leadName}
                onChangeText={setLeadName}
              />

              <Text style={styles.inputLabel}>Mobile Phone Number *</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. 9876543210"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="phone-pad"
                value={leadPhone}
                onChangeText={setLeadPhone}
              />

              <Text style={styles.sectionLabel}>Journey Details</Text>
              <Text style={styles.inputLabel}>Pickup Location *</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. Chennai Airport / T. Nagar"
                placeholderTextColor={themeColors.textMuted}
                value={leadPickup}
                onChangeText={setLeadPickup}
              />

              <Text style={styles.inputLabel}>Drop Location *</Text>
              <TextInput
                style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. Pondicherry / Madurai"
                placeholderTextColor={themeColors.textMuted}
                value={leadDrop}
                onChangeText={setLeadDrop}
              />

              <Text style={styles.inputLabel}>Trip Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['One Way', 'Round Trip', 'Local Package', 'Airport Transfer', 'Multicity'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setLeadTripType(type)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: leadTripType === type ? colors.primary : isDark ? '#1E293B' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: leadTripType === type ? colors.primary : themeColors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: leadTripType === type ? '#FFFFFF' : themeColors.text }}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Vehicle Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {LEAD_VEHICLE_TYPES.map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setLeadVehicleType(v)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: leadVehicleType === v ? colors.primary : isDark ? '#1E293B' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: leadVehicleType === v ? colors.primary : themeColors.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: leadVehicleType === v ? '#FFFFFF' : themeColors.text }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <DateTimeField
                dateLabel="Travel Date"
                timeLabel="Travel Time"
                dateValue={leadTravelDate}
                timeValue={leadTravelTime}
                onDateChange={setLeadTravelDate}
                onTimeChange={setLeadTravelTime}
                minimumDate={new Date()}
              />

              <Text style={styles.sectionLabel}>Pricing & Quotation</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Estimated Distance (KM)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    placeholder="e.g. 220"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                    value={leadKm}
                    onChangeText={setLeadKm}
                  />
                </View>
              </View>

              {/* Live Calculation Breakdown - website admin panel style */}
              <View style={{
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                borderWidth: 1,
                borderColor: themeColors.border,
                borderRadius: 8,
                padding: 10,
                marginTop: 8,
                marginBottom: 10,
                gap: 4,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>Rate / KM ({leadVehicleType})</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: themeColors.text }}>₹{leadRate.costPerKm}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>{leadKmNum} km × ₹{leadRate.costPerKm}</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: themeColors.text }}>₹{leadCalcSubtotal.toLocaleString('en-IN')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>Driver Bata</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: themeColors.text }}>₹{leadRate.driverBata}</Text>
                </View>

                {[
                  { label: 'Permit Charges', on: leadPermitOn, setOn: setLeadPermitOn, amount: leadPermitAmount, setAmount: setLeadPermitAmount },
                  { label: 'Hill / Ghat Charges', on: leadHillOn, setOn: setLeadHillOn, amount: leadHillAmount, setAmount: setLeadHillAmount },
                  { label: 'Toll Charges', on: leadTollOn, setOn: setLeadTollOn, amount: leadTollAmount, setAmount: setLeadTollAmount },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Switch
                        value={row.on}
                        onValueChange={row.setOn}
                        trackColor={{ false: '#CBD5E1', true: colors.primary }}
                        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                      />
                      <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>{row.label}</Text>
                    </View>
                    {row.on && (
                      <TextInput
                        style={{
                          width: 64, textAlign: 'right', fontSize: 11.5, fontWeight: '700', color: themeColors.text,
                          borderWidth: 1, borderColor: themeColors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                          backgroundColor: themeColors.background,
                        }}
                        keyboardType="numeric"
                        value={row.amount}
                        onChangeText={row.setAmount}
                      />
                    )}
                  </View>
                ))}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: themeColors.text }}>Calculated Total</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.primary }}>₹{leadCalcTotal.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Total Quoted Fare (₹) - editable</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, fontWeight: '800' }]}
                    placeholder="e.g. 3500"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="numeric"
                    value={leadFareEstimate}
                    onChangeText={(v) => { setLeadFareTouched(true); setLeadFareEstimate(v); }}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Internal Notes</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="Special notes or custom requests..."
                placeholderTextColor={themeColors.textMuted}
                multiline
                value={leadNotes}
                onChangeText={setLeadNotes}
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: themeColors.border }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => handleSaveNewLead(false)}
                disabled={savingNewLead}
              >
                {savingNewLead ? <ActivityIndicator size="small" color="white" /> : <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>💾 Save as Lead</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => handleSaveNewLead(true)}
                disabled={savingNewLead}
              >
                {savingNewLead ? <ActivityIndicator size="small" color="white" /> : <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>✅ Save & Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Action Button for Manual Lead */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowNewLeadModal(true)}
        activeOpacity={0.85}
      >
        <Plus size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Lead Transfer Modal */}
      {!!transferTarget && (
        <LeadTransferModal
          visible={!!transferTarget}
          onClose={() => setTransferTarget(null)}
          enquiryId={transferTarget.id}
          customerName={transferTarget.name || undefined}
          customerPhone={transferTarget.phone || undefined}
          onTransferSuccess={handleTransferSuccess}
        />
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  stageFilterWrap: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  stageDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  stageDropdownText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  card: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardNew: {
    shadowOpacity: 0.15,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
  },
  brandBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0EA5E9',
  },
  actionRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnIcon: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B82F6',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 8,
    padding: 18,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtext: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  reasonOptionText: {
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 4,
    color: '#6366F1',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalInputSingle: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 6,
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
  },
  modalActionBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
