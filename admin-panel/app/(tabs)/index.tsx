import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  TextInput,
  Alert,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MessageSquare,
  Globe,
  Users,
  Wallet,
  Siren,
  Megaphone,
  FileCheck,
  Building2,
  TrendingUp,
  Settings2,
  ShieldAlert,
  Car,
  Star,
  Receipt,
  ListTodo,
  Plus,
  Calculator,
  ChevronRight,
  Sparkles,
  FileText,
  Map,
  X,
  CheckCircle2,
  Activity,
  Package,
  RefreshCw,
  Zap,
  CreditCard,
} from 'lucide-react-native';
import { apiService } from '../../services/api';
import { enquiriesApi } from '../../services/enquiriesApi';
import { colors, shadows } from '../../constants/theme';
import { LABELS } from '@/constants/labels';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import VoiceNoteButton from '@/components/VoiceNoteButton';
import { Section, Row, Segmented, Stat, Btn, ScreenHero, KpiStrip, PriorityGrid, ActionDock, Shimmer, LiveNumber, FadeIn, StatChip, Pill } from '@/components/ui';
import DutySignOffModal from '@/components/DutySignOffModal';
import StaffWelcomeShiftModal from '@/components/StaffWelcomeShiftModal';
import { useStaffDuty } from '@/context/StaffDutyContext';
import { unlockAudioContext, playMildNotificationSound } from '@/utils/alarmSound';
import { triggerTestEnquiryAlarm } from '@/components/EnquiryAlarmHost';

type StaffDirective = {
  id: string;
  message: string | null;
  voice_note_url: string | null;
  target_admin_ids: string[] | null;
  created_by_username: string;
  created_at: string;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // false until the first round of dashboard requests has finished: counts show a shimmer instead of a misleading 0
  const [dataReady, setDataReady] = useState(false);
  const router = useRouter();
  const [adminRole, setAdminRole] = useState('Owner');
  const { isOnDuty, toggleDuty } = useStaffDuty();
  const [dutyExpanded, setDutyExpanded] = useState(false);
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [group, setGroup] = useState('bookings');
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const isOwner = adminRole === 'Owner';
  const canSee = (key: string) => isOwner || permissions.includes(key);

  const toggleDutyExpanded = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setDutyExpanded((prev) => !prev);
  };

  const handleConfirmOffline = (ackType: 'acknowledged' | 'will_improve') => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    toggleDuty(false);
    setDutyExpanded(false);
    const shiftTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    apiService.submitOwnDailyRecord(`Duty shift concluded at ${shiftTime} (Sign-off: ${ackType})`).catch(() => {});
  };

  const handleToggleStaffDuty = () => {
    unlockAudioContext();
    if (isOnDuty) {
      setShowSignOffModal(true);
    } else {
      setShowWelcomeModal(true);
    }
  };

  const handleStartShiftFromModal = () => {
    playMildNotificationSound();
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    toggleDuty(true);
  };

  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isOnDuty) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(0);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isOnDuty]);

  const renderPulsingBubble = (size = 18) => {
    const pulseScale = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.65],
    });
    const pulseOpacity = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.75, 0],
    });

    if (isOnDuty) {
      return (
        <View style={{ width: size + 10, height: size + 10, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              backgroundColor: '#10B981',
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            }}
          />
          <View
            style={{
              width: size + 2,
              height: size + 2,
              borderRadius: (size + 2) / 2,
              backgroundColor: 'rgba(16, 185, 129, 0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: '#10B981',
                borderWidth: 1.5,
                borderColor: '#34D399',
                shadowColor: '#10B981',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 3,
                  width: Math.max(3, size / 4),
                  height: Math.max(3, size / 4),
                  borderRadius: size / 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                }}
              />
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ width: size + 10, height: size + 10, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#EF4444',
            borderWidth: 1.5,
            borderColor: '#FCA5A5',
            opacity: 0.85,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: 2,
              left: 3,
              width: Math.max(3, size / 4),
              height: Math.max(3, size / 4),
              borderRadius: size / 8,
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
            }}
          />
        </View>
      </View>
    );
  };

  const [snapshot, setSnapshot] = useState<{
    total_bookings: number;
    today_bookings: number;
    active_bookings: number;
    today_profit: number;
    new_customers_today: number;
  } | null>(null);
  const [unrespondedEnquiries, setUnrespondedEnquiries] = useState(0);
  const [totalLeadsToday, setTotalLeadsToday] = useState(0);
  const [upcomingUnassignedCount, setUpcomingUnassignedCount] = useState<number>(0);
  const [upcomingUnder2HrsCount, setUpcomingUnder2HrsCount] = useState<number>(0);

  // Quick Action Menu State
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Owner-only Command Center tile badges - each a real API-backed count,
  // left null (=> tile renders icon-only) whenever its source failed or
  // has no clean single count to show.
  const [fleetDocsPending, setFleetDocsPending] = useState<number | null>(null);
  const [fleetOnline, setFleetOnline] = useState<number | null>(null);
  const [payoutsPending, setPayoutsPending] = useState<number | null>(null);
  const [websiteBookingsPending, setWebsiteBookingsPending] = useState<number | null>(null);
  const [emergencyBidsCount, setEmergencyBidsCount] = useState<number | null>(null);
  const [profileReviewsPending, setProfileReviewsPending] = useState<number | null>(null);
  const [recentDirectivesCount, setRecentDirectivesCount] = useState<number | null>(null);
  const [docsNeedingReview, setDocsNeedingReview] = useState<number | null>(null);
  const [substitutionRequestsCount, setSubstitutionRequestsCount] = useState<number | null>(null);
  const [fleetOverdueCount, setFleetOverdueCount] = useState<number | null>(null);

  // Staff-only "Today's messages" card.
  const [myTarget, setMyTarget] = useState<{
    calls_target: number;
    approvals_target: number;
    checkins_target: number;
    calls_achieved: number | null;
    approvals_achieved: number | null;
    checkins_achieved: number | null;
  } | null>(null);
  const [myDirectives, setMyDirectives] = useState<StaffDirective[]>([]);

  // Older, separate "shared actions/day" target feature (staff-performance.tsx
  // / Staff & Roles) - kept as-is, not part of this redesign's new per-metric
  const [dailyDigest, setDailyDigest] = useState<{
    headline: string;
    generated_at: string;
    source: string;
    metrics: {
      bookings_posted_today: number;
      bookings_completed_today: number;
      unassigned_bookings: number;
      waiting_chats: number;
      documents_pending_review: number;
      low_rated_drivers: number;
      unpaid_invoices: number;
    };
  } | null>(null);

  const fetchDigest = async () => {
    try {
      const res = await apiService.getDashboardDigest();
      if (res) setDailyDigest(res);
    } catch {
      // Non-fatal - dashboard continues if digest is unavailable
    }
  };
  // targets, but still real and still worth showing to Staff.
  const [staffTarget, setStaffTarget] = useState<{ target: number; achieved: number } | null>(null);
  const [ownRecordSubmitted, setOwnRecordSubmitted] = useState(false);

  // Live Operational Tasks matching Tasks Tab exactly
  const [feedbacksPendingCount, setFeedbacksPendingCount] = useState<number>(0);
  const [docsPendingCount, setDocsPendingCount] = useState<number>(0);
  const [profileReviewsCount, setProfileReviewsCount] = useState<number>(0);
  const [payoutsCount, setPayoutsCount] = useState<number>(0);
  const [futureLeadsCount, setFutureLeadsCount] = useState<number>(0);

  const totalTasksPending =
    feedbacksPendingCount +
    docsPendingCount +
    profileReviewsCount +
    payoutsCount +
    futureLeadsCount;

  // Last real numbers, kept on the phone: the dashboard opens with them straight away and quietly replaces them when fresh data
  // arrives, so there is never a flash of 0 (and never an invented number). Only the very first launch shows shimmer.
  const DASH_CACHE_KEY = 'dash_counts_cache_v1';
  const cachedSetters: Record<string, (v: any) => void> = {
    unrespondedEnquiries: setUnrespondedEnquiries, totalLeadsToday: setTotalLeadsToday, upcomingUnassignedCount: setUpcomingUnassignedCount,
    upcomingUnder2HrsCount: setUpcomingUnder2HrsCount, feedbacksPendingCount: setFeedbacksPendingCount, docsPendingCount: setDocsPendingCount,
    profileReviewsCount: setProfileReviewsCount, payoutsCount: setPayoutsCount, futureLeadsCount: setFutureLeadsCount,
    websiteBookingsPending: setWebsiteBookingsPending, emergencyBidsCount: setEmergencyBidsCount, fleetDocsPending: setFleetDocsPending,
    payoutsPending: setPayoutsPending, profileReviewsPending: setProfileReviewsPending, recentDirectivesCount: setRecentDirectivesCount,
    docsNeedingReview: setDocsNeedingReview, fleetOverdueCount: setFleetOverdueCount, snapshot: setSnapshot,
  };
  const cachedValues: Record<string, any> = {
    unrespondedEnquiries, totalLeadsToday, upcomingUnassignedCount, upcomingUnder2HrsCount, feedbacksPendingCount, docsPendingCount,
    profileReviewsCount, payoutsCount, futureLeadsCount, websiteBookingsPending, emergencyBidsCount, fleetDocsPending, payoutsPending,
    profileReviewsPending, recentDirectivesCount, docsNeedingReview, fleetOverdueCount, snapshot,
  };
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DASH_CACHE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        Object.keys(cachedSetters).forEach((k) => { if (saved[k] !== undefined) cachedSetters[k](saved[k]); });
        setDataReady(true);
      } catch { /* no cache yet: shimmer shows until the first fetch ends */ }
    })();
  }, []);
  useEffect(() => {
    if (!dataReady) return;
    const t = setTimeout(() => { AsyncStorage.setItem(DASH_CACHE_KEY, JSON.stringify(cachedValues)).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [dataReady, ...Object.values(cachedValues)]);

  const fetchTasksData = async () => {
    try {
      await Promise.allSettled([
        // 1. Completed Trips Without Reviews
        apiService.getOrders(0, 100).then((ordersData) => {
          const list = Array.isArray(ordersData?.orders) ? ordersData.orders : (Array.isArray(ordersData) ? ordersData : []);
          const completedWithoutReview = list.filter((o: any) => {
            const s = String(o.trip_status || o.status || '').toUpperCase();
            return s === 'COMPLETED' && !o.review;
          });
          setFeedbacksPendingCount(completedWithoutReview.length);
        }),

        // 2. Driver Docs & KYC Review Queue
        apiService.getDocumentsNeedingReview().then((docs) => {
          const count = typeof docs?.count === 'number' ? docs.count : (Array.isArray(docs) ? docs.length : 0);
          setDocsPendingCount(count);
          setDocsNeedingReview(count);
        }),

        // 3. Profile Edit Reviews (Bank, phone changes)
        apiService.getProfileEditReviews('PENDING').then((prof) => {
          const count = Array.isArray(prof?.reviews) ? prof.reviews.length : 0;
          setProfileReviewsCount(count);
          setProfileReviewsPending(count);
        }),

        // 4. Payout Requests
        apiService.getPayoutRequests('PENDING').then((pay) => {
          const count = Array.isArray(pay) ? pay.length : 0;
          setPayoutsCount(count);
          setPayoutsPending(count);
        }),

        // 5. Future Leads Follow-up Queue
        enquiriesApi.getFutureLeadsCount().then((cnt) => {
          setFutureLeadsCount(cnt);
        }),
      ]);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchUnrespondedEnquiries = async () => {
    try {
      const res = await enquiriesApi.list({ tab: 'not_responded', page: 1 });
      const notResponded = res.counts?.not_responded ?? 0;
      setUnrespondedEnquiries(notResponded);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchUpcomingBookingsCount = async () => {
    try {
      const data = await apiService.getOrders(0, 100);
      const orderList = Array.isArray(data) ? data : data?.orders || [];
      const nowMs = Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      let unassigned = 0;
      let under2Hrs = 0;

      orderList.forEach((o: any) => {
        const s = (o.trip_status || o.status || '').toUpperCase();
        const isLive = s === 'PENDING' || s === 'ASSIGNED' || s === 'CONFIRMED';
        const hasDriver = !!(o.assigned_driver || (o.assignments && o.assignments.length > 0) || o.driver_id);
        if (isLive && !hasDriver) {
          unassigned++;
          const pickupIso = o.start_date_time || o.pickup_date_time || o.pickup_time || o.pickup_date;
          if (pickupIso) {
            const pickupMs = new Date(pickupIso).getTime();
            if (!isNaN(pickupMs) && pickupMs >= (nowMs - 30 * 60 * 1000) && pickupMs <= (nowMs + twoHoursMs)) {
              under2Hrs++;
            }
          }
        }
      });

      setUpcomingUnassignedCount(unassigned);
      setUpcomingUnder2HrsCount(under2Hrs);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchEmergencyBidsCount = async () => {
    try {
      const bids = await apiService.getEmergencyBids();
      setEmergencyBidsCount(Array.isArray(bids) ? bids.length : null);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchSnapshot = async () => {
    try {
      const data = await apiService.getBusinessSnapshot();
      setSnapshot(data);
    } catch (error) {
      console.error('Failed to fetch business snapshot:', error);
    }
  };

  const fetchOldStaffTarget = async (role: string) => {
    if (role === 'Owner') return;
    try {
      const [target, record] = await Promise.all([
        apiService.getStaffTodayTarget(),
        apiService.getOwnDailyRecord(),
      ]);
      setStaffTarget(target);
      setOwnRecordSubmitted(!!record.note);
    } catch (error) {
      // Non-fatal - the widget just stays hidden if this fails
    }
  };

  const fetchOwnerTileData = async () => {
    // Each source is independent - one failing must not blank out the
    // others, so each gets its own try/catch rather than a single
    // Promise.all that would drop every badge on one bad endpoint.
    try {
      const na = await apiService.getNeedsAttentionSummary();
      setPayoutsPending(na.pending_payout_requests);
      setWebsiteBookingsPending(na.pending_website_bookings);
    } catch (e) {
      // Non-fatal - those two tiles just render icon-only
    }
    try {
      const fh = await apiService.getFleetHubCounts();
      if (fh.reports) {
        setFleetDocsPending(fh.reports.pending_fleet_doc_reviews);
        setFleetOnline(fh.reports.drivers_online);
      }
    } catch (e) {
      // Non-fatal
    }
    try {
      const bids = await apiService.getEmergencyBids();
      setEmergencyBidsCount(Array.isArray(bids) ? bids.length : null);
    } catch (e) {
      // Non-fatal
    }
    try {
      const reviews = await apiService.getProfileEditReviews('PENDING');
      setProfileReviewsPending(Array.isArray(reviews?.reviews) ? reviews.reviews.length : null);
    } catch (e) {
      // Non-fatal
    }
    try {
      const directives = await apiService.getStaffDirectives(20);
      setRecentDirectivesCount(Array.isArray(directives) ? directives.length : null);
    } catch (e) {
      // Non-fatal
    }
    try {
      const docs = await apiService.getDocumentsNeedingReview();
      setDocsNeedingReview(typeof docs.count === 'number' ? docs.count : null);
    } catch (e) {
      // Non-fatal
    }
    try {
      const subReqs = await apiService.getCarSubstitutionRequests();
      setSubstitutionRequestsCount(typeof subReqs.count === 'number' ? subReqs.count : null);
    } catch (e) {
      // Non-fatal
    }
    try {
      const subs = await apiService.getFleetSubscriptions('OVERDUE', '', 0, 1);
      setFleetOverdueCount(subs?.summary?.overdue_count ?? 0);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchStaffDirectivesCard = async () => {
    try {
      const target = await apiService.getMyStaffTarget();
      setMyTarget(target);
    } catch (e) {
      // Non-fatal - card section just stays hidden
    }
    try {
      const directives = await apiService.getStaffDirectives(10);
      setMyDirectives(Array.isArray(directives) ? directives : []);
    } catch (e) {
      // Non-fatal
    }
  };

  // Staff's own tile badges/KPIs, scoped to only the sections their
  // permissions actually grant - reuses the exact same endpoints Owner's
  // Command Center already calls for real counts (the backend doesn't
  // gate these particular read-only summaries by role), so a Staff
  // account with e.g. "finance" or "fleet" permission gets the same live
  // badge/KPI treatment Owner gets for those sections, instead of staffTiles
  // always rendering icon-only with no counts at all.
  const fetchStaffTileData = async (perms: string[]) => {
    const has = (k: string) => perms.includes(k);
    if (has('finance') || has('bookings')) {
      try {
        const na = await apiService.getNeedsAttentionSummary();
        if (has('finance')) setPayoutsPending(na.pending_payout_requests);
        if (has('bookings')) setWebsiteBookingsPending(na.pending_website_bookings);
      } catch (e) {
        // Non-fatal
      }
    }
    if (has('fleet')) {
      try {
        const fh = await apiService.getFleetHubCounts();
        if (fh.reports) {
          setFleetDocsPending(fh.reports.pending_fleet_doc_reviews);
          setFleetOnline(fh.reports.drivers_online);
        }
      } catch (e) {
        // Non-fatal
      }
      try {
        const subReqs = await apiService.getCarSubstitutionRequests();
        setSubstitutionRequestsCount(typeof subReqs.count === 'number' ? subReqs.count : null);
      } catch (e) {
        // Non-fatal
      }
      try {
        const subs = await apiService.getFleetSubscriptions('OVERDUE', '', 0, 1);
      fetchDigest(),
        setFleetOverdueCount(subs?.summary?.overdue_count ?? 0);
      } catch (e) {
        // Non-fatal
      }
    }
    if (has('verifications')) {
      try {
        const docs = await apiService.getDocumentsNeedingReview();
        setDocsNeedingReview(typeof docs.count === 'number' ? docs.count : null);
      } catch (e) {
        // Non-fatal
      }
    }
  };

  const loadData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    let role: any = null;
    let perms: any[] = [];
    try {
      role = await apiService.getCachedAdminRole();
      perms = (await apiService.getCachedAdminPermissions()) || [];
      setAdminRole(role);
      setPermissions(perms);
    } catch {
      // cached role unreadable: carry on with defaults - the dashboard must still open
    } finally {
      if (isInitial) setLoading(false);           // never leave the first screen on the spinner, whatever happens below
    }
    const jobs: Promise<any>[] = [
      fetchSnapshot(),
      fetchUnrespondedEnquiries(),
      fetchUpcomingBookingsCount(),
      fetchEmergencyBidsCount(),
      fetchStaffDirectivesCard(),
      fetchTasksData(),
    ];
    if (role === 'Owner') {
      jobs.push(fetchOwnerTileData());
    } else {
      jobs.push(fetchOldStaffTarget(role));
      jobs.push(fetchStaffTileData(perms));
    }
    // Show the screen right away; each section fills in as its own data arrives (one slow or
    // failing request must never keep the whole dashboard on the "Loading..." screen).
    await Promise.allSettled(jobs);
    setDataReady(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        setAdminUsername(await apiService.getCachedAdminUsername());
      })();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch {
      // each section already handles its own failure
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Plain names, grouped by what the person is trying to do. Counts come from the same fetches as before; a row without a
  // count simply shows no chip. (The old "Our team" tile is gone - it opened a screen from another product.)
  type SectionRow = { key: string; label: string; hint: string; icon: any; color: string; count: number | null; route: string; perm?: string };
  const allRows: Record<string, SectionRow[]> = {
    bookings: [
      { key: 'website', label: 'Website bookings', hint: 'Approve and post to drivers', icon: Globe, color: '#2563EB', count: websiteBookingsPending, route: '/website-booking-approvals', perm: 'bookings' },
      { key: 'crm', label: 'CRM & Leads Hub', hint: 'Calls, quotes, enquiries & feedback', icon: TrendingUp, color: '#0D9488', count: unrespondedEnquiries, route: '/(tabs)/orders?segment=crm', perm: 'bookings' },
      { key: 'bids', label: 'Urgent bids', hint: 'Live customer bids awaiting a driver', icon: Siren, color: '#D97706', count: emergencyBidsCount, route: '/emergency-bids', perm: 'bookings' },
      { key: 'map', label: 'Live map', hint: 'Where the drivers are now', icon: Map, color: '#0284C7', count: null, route: '/live-map', perm: 'fleet' },
    ],
    people: [
      { key: 'fleet', label: 'Fleet & partners', hint: 'Fleet drivers, duty drivers, cars, vendors', icon: Users, color: '#7C3AED', count: fleetDocsPending, route: '/(tabs)/fleet-hub', perm: 'fleet' },
      { key: 'subscriptions', label: 'Fleet subscriptions', hint: 'Payments, renewals & pause logs', icon: CreditCard, color: '#8B5CF6', count: fleetOverdueCount, route: '/fleet-subscriptions', perm: 'fleet' },
      { key: 'own_fleet', label: 'Own fleet', hint: 'Company cars, drivers, attendance & payroll', icon: Car, color: '#0EA5E9', count: null, route: '/own-fleet', perm: 'fleet' },
      { key: 'docs', label: 'Document checks', hint: 'Licence, RC, insurance', icon: ShieldAlert, color: '#7C3AED', count: docsNeedingReview, route: '/documents-review-queue', perm: 'verifications' },
      { key: 'profile', label: 'Profile changes', hint: 'Name or number change requests', icon: FileCheck, color: '#0284C7', count: profileReviewsPending, route: '/profile-edit-queue', perm: 'verifications' },
      { key: 'staff', label: 'Staff & duty', hint: 'Staff attendance, roles and targets', icon: Megaphone, color: '#4338CA', count: recentDirectivesCount, route: '/staff-management' },
    ],
    money: [
      { key: 'payouts', label: 'Payouts', hint: 'Withdrawals to approve', icon: Wallet, color: '#059669', count: payoutsPending, route: '/payout-requests', perm: 'finance' },
      { key: 'gst', label: 'GST invoices', hint: 'Invoices and monthly filing', icon: Receipt, color: '#0369A1', count: null, route: '/gst-invoices', perm: 'finance' },
    ],
    setup: [
      { key: 'brands', label: 'Partner websites', hint: 'Brands using our booking form', icon: Building2, color: '#DB2777', count: null, route: '/website-integrations' },
      { key: 'enquiries', label: 'Website Enquiries', hint: 'Raw enquiries from web forms', icon: MessageSquare, color: '#DC2626', count: unrespondedEnquiries, route: '/(tabs)/orders?segment=crm', perm: 'bookings' },
      { key: 'settings', label: 'Settings and rates', hint: 'Fares, cities, app setup', icon: Settings2, color: '#475569', count: null, route: '/(tabs)/settings' },
    ],
  };
  const visibleRows = (list: SectionRow[]) => list.filter((r) => isOwner || !r.perm || canSee(r.perm));
  const groupTabs = [
    { key: 'bookings', label: 'Bookings' },
    { key: 'people', label: 'Fleet' },
    { key: 'money', label: 'Money' },
    ...(isOwner ? [{ key: 'setup', label: 'Setup' }] : []),
  ].filter((g) => visibleRows(allRows[g.key]).length > 0);
  const activeGroup = groupTabs.some((g) => g.key === group) ? group : (groupTabs[0]?.key || 'bookings');

  // "Needs attention" only lists what actually has a number waiting.
  const attention: SectionRow[] = [
    { key: 'unassigned', label: 'Trips without a driver', hint: 'Upcoming, nobody assigned yet', icon: Car, color: '#4338CA', count: upcomingUnassignedCount, route: '/(tabs)/orders?segment=bookings&tab=unassigned', perm: 'bookings' },
    { key: 'tasks', label: 'My pending tasks', hint: 'Feedback, documents, payouts', icon: ListTodo, color: '#0F766E', count: totalTasksPending, route: '/(tabs)/tasks' },
    { key: 'subscriptions', label: 'Fleet subscriptions due', hint: 'Payment renewal pending', icon: CreditCard, color: '#DC2626', count: fleetOverdueCount, route: '/fleet-subscriptions', perm: 'fleet' },
    ...allRows.bookings.slice(0, 3),
    allRows.people[1],
    allRows.money[0],
  ].filter((r) => (isOwner || !r.perm || canSee(r.perm)) && (r.count ?? 0) > 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = isOwner ? 'NV' : adminUsername;
  const currentTodayBookings = snapshot?.today_bookings ?? snapshot?.active_bookings ?? 0;
  const currentTargetBookings = (staffTarget as any)?.bookings_target ?? staffTarget?.target ?? 30;
  const targetProgressPct = Math.min(100, Math.round((currentTodayBookings / Math.max(1, currentTargetBookings)) * 100));

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style="light" />

      {/* 1. Dashboard Operations-Grade Sticky Header */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B'] : ['#2A2665', '#1B1446']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 16,
          paddingTop: topPadding + 6,
          paddingBottom: 14,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          overflow: 'hidden',
          ...shadows.card,
        }}
      >
        {/* Top Row: Avatar + (Greeting & Name + Duty Pill) + Refresh + Theme Toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
            <TouchableOpacity
              onPress={() => router.push('/profile' as any)}
              activeOpacity={0.8}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255, 255, 255, 0.25)',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFFFFF' }}>
                {adminUsername.slice(0, 2).toUpperCase()}
              </Text>
            </TouchableOpacity>

            <View style={{ gap: 1.5 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', fontWeight: '500', color: 'rgba(255, 255, 255, 0.75)' }}>
                {greeting},
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', fontWeight: '900', color: '#FFFFFF' }}>
                  {displayName}
                </Text>
                <TouchableOpacity
                  onPress={handleToggleStaffDuty}
                  activeOpacity={0.8}
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
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle size={18} />
            <TouchableOpacity
              onPress={onRefresh}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
              }}
              activeOpacity={0.7}
            >
              <RefreshCw size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
      >

        {/* 1. Priority Directive from NV / Management (Shown at Top for Staff) */}
        {!isOwner && myDirectives.length > 0 && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              marginBottom: 8,
              padding: 14,
              borderRadius: 14,
              backgroundColor: isDark ? '#1E1B4B40' : '#EEF2FF',
              borderWidth: 1.5,
              borderColor: isDark ? '#6366F150' : '#C7D2FE',
              ...shadows.card,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366F120', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={15} color="#6366F1" />
                </View>
                <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: isDark ? '#C7D2FE' : '#3730A3' }}>
                  Message from Management / NV
                </Text>
              </View>
              <View style={{ backgroundColor: '#6366F1', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' }}>IMPORTANT</Text>
              </View>
            </View>

            {!!myDirectives[0].message && (
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: themeColors.text, fontWeight: '600', marginBottom: 6 }}>
                {myDirectives[0].message}
              </Text>
            )}

            {!!myDirectives[0].voice_note_url && (
              <View style={{ marginTop: 6, marginBottom: 4 }}>
                <VoiceNoteButton url={myDirectives[0].voice_note_url} />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                Posted {new Date(myDirectives[0].created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6366F1' }}>
                Follow Instructions
              </Text>
            </View>
          </View>
        )}

        {/* 1.5. Morning Shift Welcome & Start Shift Invitation (For Staff When Offline) */}
        {!isOwner && !isOnDuty && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              marginBottom: 4,
              padding: 14,
              borderRadius: 14,
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderWidth: 1.5,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              elevation: 3,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={15} color="#D97706" />
                </View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
                  Good morning, {displayName}! ☀️
                </Text>
              </View>
              <View style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textSecondary }}>Shift Ready</Text>
              </View>
            </View>
        {/* 1.8. Today at a Glance (AI-Assisted Operations Digest) */}
        {dailyDigest && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              marginBottom: 4,
              padding: 14,
              borderRadius: 14,
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderWidth: 1.5,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              ...shadows.card,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#8B5CF620', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={14} color="#8B5CF6" />
                </View>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
                  Today at a Glance
                </Text>
              </View>
              <View style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: themeColors.textSecondary }}>
                  {dailyDigest.source === 'llm' ? 'AI Summary' : 'Live Snapshot'}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 12.5, lineHeight: 18, color: themeColors.textSecondary, marginBottom: 10, fontWeight: '500' }}>
              {dailyDigest.headline}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <StatChip
                label="Bookings"
                value={`${dailyDigest.metrics.bookings_posted_today} posted`}
                variant="primary"
                onPress={() => router.push('/(tabs)/orders' as any)}
              />
              <StatChip
                label="Unassigned"
                value={dailyDigest.metrics.unassigned_bookings}
                variant={dailyDigest.metrics.unassigned_bookings > 0 ? 'warning' : 'neutral'}
                onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'unassigned' } } as any)}
              />
              <StatChip
                label="Chats Waiting"
                value={dailyDigest.metrics.waiting_chats}
                variant={dailyDigest.metrics.waiting_chats > 0 ? 'info' : 'neutral'}
                onPress={() => router.push('/(tabs)/chats' as any)}
              />
              <StatChip
                label="Docs Pending"
                value={dailyDigest.metrics.documents_pending_review}
                variant={dailyDigest.metrics.documents_pending_review > 0 ? 'danger' : 'neutral'}
                onPress={() => router.push('/documents-review-queue' as any)}
              />
              {dailyDigest.metrics.low_rated_drivers > 0 && (
                <StatChip
                  label="Low Rated"
                  value={dailyDigest.metrics.low_rated_drivers}
                  variant="danger"
                  onPress={() => router.push('/ratings-analytics' as any)}
                />
              )}
            </View>
          </View>
        )}


            <Text style={{ fontSize: 12, lineHeight: 17, color: themeColors.textSecondary, marginBottom: 12 }}>
              Ready to start your shift today? Go online to activate live customer enquiries, dispatch available drivers, and boost booking conversions.
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setShowWelcomeModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#10B981',
                paddingVertical: 10,
                borderRadius: 10,
                elevation: 2,
              }}
            >
              <Zap size={15} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                Start Shift (Go Online)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. Urgent Action Center (2x Grid Side-by-Side - Clean & Action-Oriented) */}
        <View style={{ marginTop: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, marginBottom: 10 }}>
            Urgent Action Center
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Tile 1: Hot Enquiries */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/(tabs)/orders', params: { segment: 'crm' } } as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#4C1D2440' : '#FFF1F2',
                borderWidth: 1,
                borderColor: isDark ? '#F43F5E40' : '#FFE4E6',
                borderRadius: 14,
                padding: 13,
                justifyContent: 'space-between',
                minHeight: 112,
              }}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={{ fontSize: 18 }}>🔥</Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', fontWeight: '800', color: isDark ? '#FDA4AF' : '#9F1239' }}>
                    {dataReady ? unrespondedEnquiries : ''}
                  </Text>
                  {!dataReady && <Shimmer width={26} height={18} />}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FDA4AF' : '#9F1239' }}>
                  Hot Enquiries
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: isDark ? '#FCA5A5' : '#BE123C', marginTop: 1, marginBottom: 8 }}>
                  {!dataReady ? 'Checking…' : unrespondedEnquiries > 0 ? `${unrespondedEnquiries} Pending Calls (<5m)` : 'All Caught Up'}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#E11D48',
                  paddingVertical: 6.5,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>⚡ Call Next</Text>
              </View>
            </TouchableOpacity>

            {/* Tile 2: Unassigned Cabs */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/(tabs)/orders', params: { segment: 'bookings', tab: 'unassigned' } } as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#451A0340' : '#FFFBEB',
                borderWidth: 1,
                borderColor: isDark ? '#F59E0B40' : '#FEF3C7',
                borderRadius: 14,
                padding: 13,
                justifyContent: 'space-between',
                minHeight: 112,
              }}
            >
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={{ fontSize: 18 }}>🚨</Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', fontWeight: '800', color: isDark ? '#FDE68A' : '#92400E' }}>
                    {dataReady ? upcomingUnassignedCount : ''}
                  </Text>
                  {!dataReady && <Shimmer width={26} height={18} />}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FDE68A' : '#92400E' }}>
                  Unassigned Trips
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: isDark ? '#FCD34D' : '#B45309', marginTop: 1, marginBottom: 8 }}>
                  {!dataReady ? 'Checking…' : upcomingUnassignedCount > 0 ? (upcomingUnder2HrsCount > 0 ? `${upcomingUnder2HrsCount} urgent (<2h)` : 'Needs Quick Driver') : 'All Trips Assigned'}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#D97706',
                  paddingVertical: 6.5,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>Dispatch →</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Overdue Fleet Subscriptions Action Banner (Matches standard frame, radius & dark/light theme) */}
          {(fleetOverdueCount ?? 0) > 0 && (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/fleet-subscriptions' as any)}
              style={{
                marginTop: 10,
                padding: 13,
                borderRadius: 14,
                backgroundColor: isDark ? '#4C1D2440' : '#FFF1F2',
                borderWidth: 1.5,
                borderColor: isDark ? '#F43F5E40' : '#FFE4E6',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#E11D4820',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CreditCard size={18} color="#E11D48" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', fontWeight: '800', color: isDark ? '#FDA4AF' : '#9F1239' }}>
                      {fleetOverdueCount} Overdue Subscriptions
                    </Text>
                    <View style={{ backgroundColor: '#E11D48', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>URGENT</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: isDark ? '#FCA5A5' : '#BE123C', marginTop: 1 }}>
                    Renewal payment due · Tap to collect or mark trusted
                  </Text>
                </View>
              </View>
              <View
                style={{
                  backgroundColor: '#E11D48',
                  paddingVertical: 6.5,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' }}>Review →</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* 3. Operational Tasks & Work Queues (2x2 Comprehensive Grid) */}
        {/* 3. Operational Tasks & Work Queues (2x2 Bento Grid matching Tasks screen) */}
        <View style={{ marginTop: 14, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
              {dataReady ? `Operational Tasks (${totalTasksPending} Pending)` : 'Operational Tasks'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>View All →</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {/* Priority 1: Customer Ratings / Feedbacks (High Importance) */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'completed' } } as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#3D280835' : '#FFFBEB',
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: (feedbacksPendingCount ?? 0) > 0 ? (isDark ? '#F59E0B60' : '#FCD34D') : themeColors.border,
                padding: 13,
                minHeight: 136,
                justifyContent: 'space-between',
                ...shadows.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F59E0B20', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={19} color="#F59E0B" />
                </View>
                <View style={{ backgroundColor: (feedbacksPendingCount ?? 0) > 0 ? '#F59E0B' : '#10B981', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                    {(feedbacksPendingCount ?? 0) > 0 ? `${feedbacksPendingCount} Pending` : 'Clear'}
                  </Text>
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>
                  Trip Feedbacks
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: themeColors.textSecondary, marginBottom: 6 }} numberOfLines={1}>
                  Rating & review calls
                </Text>
              </View>

              <View style={{ backgroundColor: '#D97706', paddingVertical: 6.5, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold', fontWeight: '800' }}>Call →</Text>
              </View>
            </TouchableOpacity>

            {/* Priority 2: Future Follow-ups (High Importance) */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push({ pathname: '/enquiries', params: { tab: 'future' } } as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#3B170535' : '#FFF7ED',
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: (futureLeadsCount ?? 0) > 0 ? (isDark ? '#EA580C60' : '#FDBA74') : themeColors.border,
                padding: 13,
                minHeight: 136,
                justifyContent: 'space-between',
                ...shadows.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EA580C20', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={19} color="#EA580C" />
                </View>
                <View style={{ backgroundColor: (futureLeadsCount ?? 0) > 0 ? '#EA580C' : '#10B981', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                    {(futureLeadsCount ?? 0) > 0 ? `${futureLeadsCount} Follow-ups` : 'All Clear'}
                  </Text>
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>
                  Future Leads
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: themeColors.textSecondary, marginBottom: 6 }} numberOfLines={1}>
                  Advance trip calls
                </Text>
              </View>

              <View style={{ backgroundColor: '#EA580C', paddingVertical: 6.5, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold', fontWeight: '800' }}>Schedule →</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Task 3: Document Checks */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/documents-review-queue' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#3B1B5435' : '#FAF5FF',
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: (docsPendingCount ?? 0) > 0 ? (isDark ? '#8B5CF660' : '#DDD6FE') : themeColors.border,
                padding: 13,
                minHeight: 136,
                justifyContent: 'space-between',
                ...shadows.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8B5CF620', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldAlert size={19} color="#8B5CF6" />
                </View>
                <View style={{ backgroundColor: (docsPendingCount ?? 0) > 0 ? '#8B5CF6' : '#10B981', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                    {(docsPendingCount ?? 0) > 0 ? `${docsPendingCount} Pending` : 'Clear'}
                  </Text>
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>
                  Document Checks
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: themeColors.textSecondary, marginBottom: 6 }} numberOfLines={1}>
                  Licence, RC, insurance
                </Text>
              </View>

              <View style={{ backgroundColor: '#8B5CF6', paddingVertical: 6.5, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold', fontWeight: '800' }}>Review →</Text>
              </View>
            </TouchableOpacity>

            {/* Task 4: Profile Changes */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/profile-edit-queue' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#0C2B4035' : '#F0F9FF',
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: (profileReviewsCount ?? 0) > 0 ? (isDark ? '#0EA5E960' : '#BAE6FD') : themeColors.border,
                padding: 13,
                minHeight: 136,
                justifyContent: 'space-between',
                ...shadows.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0EA5E920', alignItems: 'center', justifyContent: 'center' }}>
                  <FileCheck size={19} color="#0EA5E9" />
                </View>
                <View style={{ backgroundColor: (profileReviewsCount ?? 0) > 0 ? '#0EA5E9' : '#10B981', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                    {(profileReviewsCount ?? 0) > 0 ? `${profileReviewsCount} Pending` : 'Clear'}
                  </Text>
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>
                  Profile Changes
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: themeColors.textSecondary, marginBottom: 6 }} numberOfLines={1}>
                  Bank & phone edits
                </Text>
              </View>

              <View style={{ backgroundColor: '#0EA5E9', paddingVertical: 6.5, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter-Bold', fontWeight: '800' }}>Review →</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Shift & Target Compact Card (Routes to Staff Performance) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/staff-performance' as any)}
          style={{
            marginHorizontal: 16,
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            backgroundColor: themeColors.surface,
            borderWidth: 1,
            borderColor: themeColors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
              {isOwner ? 'Team Shift & Performance' : 'My Shift & Daily Progress'}
            </Text>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#3B82F6' }}>
              View Details →
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: isDark ? '#1E293B' : '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <View
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(15, targetProgressPct))}%`,
                backgroundColor: '#3B82F6',
                borderRadius: 4,
              }}
            />
          </View>
          <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>
            {!dataReady
              ? 'Loading today’s numbers…'
              : isOwner
                ? `Today: ${snapshot?.today_bookings || 0} Bookings Dispatched · ${unrespondedEnquiries} Pending Leads`
                : `Today Active: ${snapshot?.today_bookings || 0} Bookings · ${unrespondedEnquiries} Leads in Queue`}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Round "+" FAB (Green & Compact 46x46) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowFabMenu(true)}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 18,
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: '#10B981',
          alignItems: 'center',
          justifyContent: 'center',
          ...shadows.modal,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.25)',
          zIndex: 99,
        }}
      >
        <Plus size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* FAB Speed-Dial / Options Menu Modal */}
      <Modal
        visible={showFabMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFabMenu(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 }}
          activeOpacity={1}
          onPress={() => setShowFabMenu(false)}
        >
          <View
            style={{
              backgroundColor: themeColors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: themeColors.border,
              ...shadows.modal,
              marginBottom: 10,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', fontWeight: '900', color: themeColors.text }}>
                  Create Action
                </Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>
                  Create trip quotes, broadcasts or tax invoices
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowFabMenu(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              {[
                {
                  label: 'Create Estimate / Quotation',
                  sub: 'Brand-wise estimate with tariff calculator, GST options & WhatsApp share',
                  icon: Calculator,
                  color: '#0EA5E9',
                  route: '/billing-editor?type=ESTIMATE',
                },
                {
                  label: 'New Booking & Broadcast Trip',
                  sub: 'Post confirmed trip and dispatch to Driver App network',
                  icon: Plus,
                  color: '#10B981',
                  route: '/create-booking',
                },
                {
                  label: 'Create Invoice',
                  sub: 'Type a booking id - with or without GST, payment links & manual receipts',
                  icon: Receipt,
                  color: '#8B5CF6',
                  route: '/billing-editor?type=INVOICE',
                },
                {
                  label: 'All Invoices & Estimates',
                  sub: 'Follow-ups, who made each one, unpaid balances',
                  icon: FileText,
                  color: '#047857',
                  route: '/invoices',
                },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    backgroundColor: isDark ? themeColors.surfaceAlt : '#F8FAFC',
                  }}
                  onPress={() => {
                    setShowFabMenu(false);
                    if (item.route) {
                      router.push(item.route as any);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: item.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <item.icon size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
                      {item.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                      {item.sub}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Welcome / Start Shift Motivational Modal */}
      <StaffWelcomeShiftModal
        visible={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onStartShift={handleStartShiftFromModal}
        staffName={displayName}
      />

      {/* End-of-Duty Performance Summary Modal */}
      <DutySignOffModal
        visible={showSignOffModal}
        onClose={() => setShowSignOffModal(false)}
        onConfirmOffline={handleConfirmOffline}
        staffId={adminUsername}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  loadingText: { marginTop: 16, fontSize: 16, color: colors.textSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 18, fontFamily: 'Inter-ExtraBold' },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  dutyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 34, borderRadius: 6 },
});
