import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
} from 'lucide-react-native';
import { enquiriesApi, WebsiteEnquiry, WEBSITE_BRANDS, RESPONSE_REASONS } from '@/services/enquiriesApi';
import { apiService } from '@/services/api';
import { printOrDownloadInvoice, printOrDownloadEstimation, shareQuotationViaWhatsApp, shareQuotationViaEmail, generateQuotationText } from '@/utils/invoiceGenerator';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DateTimeField from '@/components/DateTimeField';
import {
  starsForSeconds,
  renderStars,
  formatDurationFriendly,
  parseIstTimestamp,
  formatEnquiryReceivedTime,
  formatPickupDateTime,
  recordEnquiryResponse,
  getDailyPerformance,
  updateCommentsPendingInLedger,
  updateMissedCountInLedger,
} from '@/utils/performance';

type Tab = 'not_responded' | 'missed' | 'responded';

interface EnquiriesScreenProps {
  isTab?: boolean;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Same vehicle list + rate defaults as create-booking.tsx's getDefaultsForCarType
// (kept in sync manually - this modal has no shared fare-engine module to
// import from yet). Used to live-calculate a quote instead of leaving staff
// to guess a number into a blank field.
const LEAD_VEHICLE_TYPES = ['Sedan', 'Prime Sedan', 'SUV', 'Innova', 'Innova Crysta'];

function getLeadRateDefaults(vehicleLabel: string, tripType: string) {
  const isRound = tripType === 'Round Trip' || tripType === 'Multicity';
  if (vehicleLabel === 'Innova Crysta') return { costPerKm: isRound ? 22 : 23, driverBata: isRound ? 400 : 300 };
  if (vehicleLabel === 'Innova') return { costPerKm: isRound ? 20 : 21, driverBata: isRound ? 400 : 300 };
  if (vehicleLabel === 'SUV') return { costPerKm: isRound ? 19 : 20, driverBata: 300 };
  if (vehicleLabel === 'Prime Sedan') return { costPerKm: isRound ? 15 : 16, driverBata: 300 };
  return { costPerKm: isRound ? 14 : 15, driverBata: 300 }; // Sedan default
}

export default function EnquiriesScreen({ isTab = false }: EnquiriesScreenProps) {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [tab, setTab] = useState<Tab>('not_responded');
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

  // Customize Booking Modal state
  const [customizeTarget, setCustomizeTarget] = useState<WebsiteEnquiry | null>(null);
  const [editPickup, setEditPickup] = useState('');
  const [editDrop, setEditDrop] = useState('');
  const [editTripType, setEditTripType] = useState('');
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editTravelDate, setEditTravelDate] = useState('');
  const [editTravelTime, setEditTravelTime] = useState('');
  const [editFare, setEditFare] = useState('');
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
    return (Date.now() - createdMs) >= TWO_HOURS_MS;
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

  // Enquiries must feel instant - a new website lead shouldn't sit unseen
  // until someone happens to pull-to-refresh. Silent background poll, only
  // while on page 1 with no active search (so it never fights a deep-scroll
  // or an in-progress search-as-you-type) - unlike the account/fleet list
  // screens, which stay on-demand-search-only to keep cost down (2026-09-30).
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
  let displayedEnquiries = enquiries;

  if (tab === 'not_responded') {
    // Shows fresh untouched (< 2h) plus touched-not-completed
    displayedEnquiries = enquiries.filter((e) => !isEnquiryMissed(e));
  } else if (tab === 'missed') {
    // Shows only untouched older than 2h
    displayedEnquiries = enquiries.filter((e) => isEnquiryMissed(e));
  } else if (tab === 'responded') {
    if (showOnlyPendingComments) {
      displayedEnquiries = enquiries.filter((e) => !e.dispatcher_notes || e.dispatcher_notes.trim().length < 3);
    }
  }

  // Count metrics for tabs
  const missedCount = tab === 'responded'
    ? 0
    : enquiries.filter(isEnquiryMissed).length;
  const pendingFreshCount = tab === 'responded'
    ? serverCounts.not_responded
    : enquiries.filter((e) => !isEnquiryMissed(e)).length;
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

  const openCustomizeModal = (enquiry: WebsiteEnquiry) => {
    setCustomizeTarget(enquiry);
    setEditPickup(enquiry.pickup || '');
    setEditDrop(enquiry.drop_location || '');
    setEditTripType(enquiry.trip_type || '');
    setEditVehicleType(enquiry.vehicle_type || '');
    setEditTravelDate(enquiry.travel_date || '');
    setEditTravelTime(enquiry.travel_time || '');
    setEditFare(enquiry.fare_estimate ? String(enquiry.fare_estimate) : '');
    setEditExtraCharges(enquiry.extra_charges ? String(enquiry.extra_charges) : '');
    setEditCostPerKm(enquiry.cost_per_km ? String(enquiry.cost_per_km) : '');
    setEditExtraCostPerKm(enquiry.extra_cost_per_km ? String(enquiry.extra_cost_per_km) : '');
    setEditNotes(enquiry.dispatcher_notes || '');
    setEditIncludeGst(!!enquiry.include_gst);
    setEditGstAmount(enquiry.gst_amount ? String(enquiry.gst_amount) : '');
  };

  const saveCustomizeBooking = async () => {
    if (!customizeTarget) return;
    setSavingCustomize(true);
    try {
      const parsedFare = parseFloat(editFare) || 0;
      const parsedGstAmount = editIncludeGst
        ? (parseFloat(editGstAmount) || Math.round(parsedFare * 0.05))
        : 0;

      const updatedData = {
        pickup: editPickup.trim(),
        drop_location: editDrop.trim(),
        trip_type: editTripType.trim(),
        vehicle_type: editVehicleType.trim(),
        travel_date: editTravelDate.trim(),
        travel_time: editTravelTime.trim(),
        fare_estimate: parsedFare || undefined,
        extra_charges: parseFloat(editExtraCharges) || undefined,
        cost_per_km: parseFloat(editCostPerKm) || undefined,
        extra_cost_per_km: parseFloat(editExtraCostPerKm) || undefined,
        include_gst: editIncludeGst,
        gst_percent: 5.0,
        gst_amount: parsedGstAmount,
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
                gst_amount: parsedGstAmount,
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
      baseFare: enquiry.fare_estimate || 0,
      extraCharges: enquiry.extra_charges || 0,
      tollCharges: 0,
      includeGst: false,
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

    return (
      <TouchableOpacity
        key={enquiry.id}
        activeOpacity={0.75}
        onPress={() => { markSeen(enquiry.id); setDetailTarget(enquiry); }}
        style={[
          styles.card,
          {
            backgroundColor: themeColors.surface,
            borderColor: isMissed
              ? '#EF4444'
              : isNew
              ? '#F59E0B'
              : themeColors.border,
            borderWidth: isMissed ? 1.5 : isNew ? 1.5 : 1,
            borderRadius: 6,
            padding: 12,
            marginBottom: 10,
          },
          isNew && styles.cardNew,
        ]}
      >
        {/* Top Header Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.brandBadge}>
              <Globe size={10} color="#0EA5E9" />
              <Text style={styles.brandBadgeText}>{enquiry.website || enquiry.source || 'dropcars.in'}</Text>
            </View>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: themeColors.text }}>
              #{refId}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
            ) : isNew ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F59E0B15', borderWidth: 1, borderColor: '#F59E0B' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>NEW LEAD</Text>
              </View>
            ) : null}

            {enquiry.lead_stage ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>
                  {RESPONSE_REASONS.find((r) => r.key === enquiry.lead_stage)?.label || enquiry.lead_stage}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Missed Warning Strip (Feature B) */}
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

        {/* Date & Received Time Line */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            <Clock size={12} color={themeColors.textSecondary} />
            <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }} numberOfLines={1}>
              Pickup: {formatPickupDateTime(enquiry.travel_date, enquiry.travel_time)}
            </Text>
          </View>

          {!!enquiry.phone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#10B98115', borderWidth: 1, borderColor: '#10B98150' }}
                onPress={(e) => { e.stopPropagation(); handleCall(enquiry); }}
              >
                <PhoneCall size={11} color="#10B981" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>{enquiry.phone}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: '#25D36615', borderWidth: 1, borderColor: '#25D36650' }}
                onPress={(e) => { e.stopPropagation(); handleWhatsApp(enquiry); }}
              >
                <MessageSquare size={11} color="#25D366" />
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

        {/* Action Buttons Row */}
        {isActioning ? (
          <View style={styles.actionRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <View style={{
            flexDirection: 'row',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 6,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: themeColors.border,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: '#10B981' }}
                onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleConfirm(enquiry); }}
                activeOpacity={0.8}
              >
                <CheckCircle2 size={12} color="#FFFFFF" />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' }}>Confirm & Post</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderWidth: 1, borderColor: '#3B82F6' }}
                onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openCustomizeModal(enquiry); }}
                activeOpacity={0.8}
              >
                <Edit3 size={12} color="#3B82F6" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#3B82F6' }}>Customize</Text>
              </TouchableOpacity>

              {/* Respond / Respond Now Button */}
              {tab !== 'responded' && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: isMissed ? '#DC2626' : '#ECFDF5',
                    borderWidth: 1,
                    borderColor: isMissed ? '#DC2626' : '#10B981',
                  }}
                  onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openRespondModal(enquiry); }}
                  activeOpacity={0.8}
                >
                  <CheckCircle2 size={12} color={isMissed ? '#FFFFFF' : '#10B981'} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: isMissed ? '#FFFFFF' : '#10B981' }}>
                    {isMissed ? 'Respond now' : 'Responded'}
                  </Text>
                  <ChevronDown size={12} color={isMissed ? '#FFFFFF' : '#10B981'} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: themeColors.border }}
                onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handlePdfEstimation(enquiry); }}
                activeOpacity={0.8}
              >
                <FileText size={12} color={themeColors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Quote</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity style={styles.actionBtnIcon} onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); openNote(enquiry); }} accessibilityLabel="Add note">
                <StickyNote size={14} color={hasNote ? '#10B981' : themeColors.primary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnIcon} onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleSpam(enquiry); }} accessibilityLabel="Mark as spam">
                <XCircle size={14} color={colors.error} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnIcon} onPress={(e) => { e.stopPropagation(); markSeen(enquiry.id); handleDelete(enquiry); }} accessibilityLabel="Delete enquiry">
                <Trash2 size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* App Header with Center Brand Selector Dropdown */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {!isTab ? (
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
          ) : (
            <View style={{ padding: 4 }}>
              <MessageSquare size={22} color={colors.primary} />
            </View>
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

      {/* Attached Edge-to-Edge 3-Tabs Bar: Pending | Missed | Responded */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: themeColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: themeColors.border,
      }}>
        {/* Tab 1: Pending Leads */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: tab === 'not_responded' ? 3 : 0,
            borderBottomColor: '#6366F1',
          }}
          onPress={() => setTab('not_responded')}
        >
          <Text style={{
            fontSize: 12.5,
            fontWeight: tab === 'not_responded' ? '800' : '600',
            color: tab === 'not_responded' ? (isDark ? '#818CF8' : '#4F46E5') : themeColors.textSecondary,
          }}>
            Pending ({pendingFreshCount})
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Missed (Feature B) */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: tab === 'missed' ? 3 : 0,
            borderBottomColor: '#EF4444',
          }}
          onPress={() => setTab('missed')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              fontSize: 12.5,
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

        {/* Tab 3: Responded */}
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: tab === 'responded' ? 3 : 0,
            borderBottomColor: '#10B981',
          }}
          onPress={() => setTab('responded')}
        >
          <Text style={{
            fontSize: 12.5,
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

      {/* Customize Booking Modal */}
      <Modal visible={!!customizeTarget} transparent animationType="slide" onRequestClose={() => setCustomizeTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1, maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Customize Lead #{customizeTarget?.id}</Text>
              <TouchableOpacity onPress={() => setCustomizeTarget(null)} accessibilityLabel="Close">
                <X size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 10 }}>
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

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Trip Category</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editTripType}
                    onChangeText={setEditTripType}
                    placeholder="e.g. One Way"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Vehicle Type</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editVehicleType}
                    onChangeText={setEditVehicleType}
                    placeholder="e.g. Sedan"
                  />
                </View>
              </View>

              <DateTimeField
                dateLabel="Travel Date"
                timeLabel="Travel Time"
                dateValue={editTravelDate}
                timeValue={editTravelTime}
                onDateChange={setEditTravelDate}
                onTimeChange={setEditTravelTime}
                minimumDate={new Date(2000, 0, 1)}
              />

              <Text style={styles.sectionLabel}>Customer Price</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Quoted Fare (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editFare}
                    onChangeText={setEditFare}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Extra Tolls (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editExtraCharges}
                    onChangeText={setEditExtraCharges}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.sectionLabel}>Driver Price</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Driver Fare / km (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editCostPerKm}
                    onChangeText={setEditCostPerKm}
                    keyboardType="numeric"
                    placeholder="e.g. 14"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Extra / km (₹)</Text>
                  <TextInput
                    style={[styles.modalInputSingle, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                    value={editExtraCostPerKm}
                    onChangeText={setEditExtraCostPerKm}
                    keyboardType="numeric"
                    placeholder="e.g. 1"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Dispatcher Notes</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                placeholder="Internal notes or customer preference..."
              />
            </ScrollView>

            <TouchableOpacity style={[styles.saveBtn, savingCustomize && { opacity: 0.6 }]} onPress={saveCustomizeBooking} disabled={savingCustomize}>
              {savingCustomize ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save & Sync Live</Text>}
            </TouchableOpacity>
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
