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
  Modal,
  TextInput,
  Alert,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
} from 'lucide-react-native';
import { apiService } from '../../services/api';
import { enquiriesApi } from '../../services/enquiriesApi';
import { colors, shadows } from '../../constants/theme';
import { LABELS } from '@/constants/labels';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import VoiceNoteButton from '@/components/VoiceNoteButton';
import { Section, Row, Segmented, Stat, Btn, ScreenHero, KpiStrip, PriorityGrid, ActionDock } from '@/components/ui';
import DutySignOffModal from '@/components/DutySignOffModal';
import { updateFeedbackTasksInLedger, updateMissedCountInLedger } from '@/utils/performance';

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
  const router = useRouter();
  const [adminRole, setAdminRole] = useState('Owner');
  const [onDutyShift, setOnDutyShift] = useState(true);
  const [dutyExpanded, setDutyExpanded] = useState(false);
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [group, setGroup] = useState('bookings');
  const [showSignOffModal, setShowSignOffModal] = useState(false);
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
    setOnDutyShift(false);
    setDutyExpanded(false);
    AsyncStorage.setItem('@admin_staff_on_duty_shift', 'false').catch(() => {});
    const shiftTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    apiService.submitOwnDailyRecord(`Duty shift concluded at ${shiftTime} (Sign-off: ${ackType})`).catch(() => {});
    apiService.setOnDuty(false).catch(() => {});
  };

  const handleToggleStaffDuty = () => {
    if (onDutyShift) {
      setShowSignOffModal(true);
    } else {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setOnDutyShift(true);
      AsyncStorage.setItem('@admin_staff_on_duty_shift', 'true').catch(() => {});
      apiService.setOnDuty(true).catch(() => {});
    }
  };

  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (onDutyShift) {
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
  }, [onDutyShift]);

  const renderPulsingBubble = (size = 18) => {
    const pulseScale = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.65],
    });
    const pulseOpacity = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.75, 0],
    });

    if (onDutyShift) {
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
  // targets, but still real and still worth showing to Staff.
  const [staffTarget, setStaffTarget] = useState<{ target: number; achieved: number } | null>(null);
  const [ownRecordSubmitted, setOwnRecordSubmitted] = useState(false);

  // Live Operational Tasks matching Tasks Tab exactly
  const [feedbacksPendingCount, setFeedbacksPendingCount] = useState<number>(0);
  const [docsPendingCount, setDocsPendingCount] = useState<number>(0);
  const [profileReviewsCount, setProfileReviewsCount] = useState<number>(0);
  const [payoutsCount, setPayoutsCount] = useState<number>(0);

  const totalTasksPending =
    feedbacksPendingCount +
    docsPendingCount +
    profileReviewsCount +
    payoutsCount;

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
      ]);
    } catch (e) {
      // Non-fatal
    }
  };

  const fetchUnrespondedEnquiries = async () => {
    try {
      const res = await enquiriesApi.list({ tab: 'not_responded', page: 1 });
      setUnrespondedEnquiries(res.counts?.not_responded ?? res.total_count ?? 0);
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
    const role = await apiService.getCachedAdminRole();
    const perms = await apiService.getCachedAdminPermissions();
    setAdminRole(role);
    setPermissions(perms);
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
    if (isInitial) setLoading(false);
    await Promise.allSettled(jobs);
  };

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        setAdminUsername(await apiService.getCachedAdminUsername());
        const savedDuty = await AsyncStorage.getItem('@admin_staff_on_duty_shift');
        if (savedDuty !== null) setOnDutyShift(savedDuty === 'true');
        try {
          const liveDuty = await apiService.getMyOnDuty();
          if (typeof liveDuty?.is_on_duty === 'boolean') {
            setOnDutyShift(liveDuty.is_on_duty);
            AsyncStorage.setItem('@admin_staff_on_duty_shift', String(liveDuty.is_on_duty)).catch(() => {});
          }
        } catch {}
      })();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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
      { key: 'crm', label: 'CRM & Leads Hub', hint: 'Calls, quotes, enquiries & feedback', icon: TrendingUp, color: '#0D9488', count: unrespondedEnquiries, route: '/crm', perm: 'bookings' },
      { key: 'bids', label: 'Urgent bids', hint: 'Live customer bids awaiting a driver', icon: Siren, color: '#D97706', count: emergencyBidsCount, route: '/emergency-bids', perm: 'bookings' },
      { key: 'map', label: 'Live map', hint: 'Where the drivers are now', icon: Map, color: '#0284C7', count: null, route: '/live-map', perm: 'fleet' },
    ],
    people: [
      { key: 'fleet', label: 'Fleet & partners', hint: 'Fleet drivers, duty drivers, cars, vendors', icon: Users, color: '#7C3AED', count: fleetDocsPending, route: '/(tabs)/fleet-hub', perm: 'fleet' },
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
      { key: 'enquiries', label: 'Website Enquiries', hint: 'Raw enquiries from web forms', icon: MessageSquare, color: '#DC2626', count: unrespondedEnquiries, route: '/enquiries', perm: 'bookings' },
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
    { key: 'unassigned', label: 'Trips without a driver', hint: 'Upcoming, nobody assigned yet', icon: Car, color: '#4338CA', count: upcomingUnassignedCount, route: '/(tabs)/orders', perm: 'bookings' },
    { key: 'tasks', label: 'My pending tasks', hint: 'Feedback, documents, payouts', icon: ListTodo, color: '#0F766E', count: totalTasksPending, route: '/(tabs)/tasks' },
    ...allRows.bookings.slice(0, 3),
    allRows.people[1],
    allRows.money[0],
  ].filter((r) => (isOwner || !r.perm || canSee(r.perm)) && (r.count ?? 0) > 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = isOwner ? 'NV' : adminUsername;
  const money = (n?: number) => (n == null ? '-' : '₹' + Math.round(n).toLocaleString('en-IN'));

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: topPadding }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 1. Dashboard Greeting Hero Header (Plain Greeting, No "Command Center") */}
        <ScreenHero
          greeting={greeting}
          name={displayName}
          subtitle={isOwner ? LABELS.dashboardCaptionOwner : onDutyShift ? LABELS.dashboardCaptionStaffOnDuty : LABELS.dashboardCaptionStaffOffDuty}
          onDuty={!isOwner ? onDutyShift : undefined}
          onToggleDuty={!isOwner ? handleToggleStaffDuty : undefined}
          avatarText={adminUsername || 'NV'}
          onAvatarPress={() => router.push('/profile' as any)}
          rightAction={<ThemeToggle size={20} />}
        />

        {/* 2. My Tasks Strip */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/tasks' as any)}
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: totalTasksPending > 0 ? themeColors.primary + '40' : themeColors.border,
            backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryLight,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: themeColors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ListTodo size={16} color={themeColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                {LABELS.sectionMyTasks} · <Text style={{ color: themeColors.primary, fontWeight: '800' }}>{totalTasksPending} {LABELS.taskStripPending}</Text>
              </Text>
              <Text style={{ fontSize: 10.5, color: themeColors.textSecondary, fontWeight: '500' }}>
                KYC, Feedbacks, Payouts & Profile reviews
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.primary }}>
              {LABELS.taskStripComplete}
            </Text>
            <ChevronRight size={14} color={themeColors.primary} />
          </View>
        </TouchableOpacity>

        {/* 3. URGENT ACTIONS (2 Big Side-by-Side Attention Tiles with <2h Pickup Alert) */}
        <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted, marginBottom: 8 }}>
            {LABELS.sectionUrgentActions}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Tile 1: Enquiries */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/enquiries' as any)}
              style={{
                flex: 1,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: unrespondedEnquiries > 0 ? themeColors.error + '40' : themeColors.border,
                backgroundColor: unrespondedEnquiries > 0 ? themeColors.errorLight : themeColors.surface,
                padding: 12,
                minHeight: 95,
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: unrespondedEnquiries > 0 ? themeColors.error : themeColors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={16} color={unrespondedEnquiries > 0 ? '#FFFFFF' : themeColors.textSecondary} />
                </View>
                <Text style={{ fontSize: 20, fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: unrespondedEnquiries > 0 ? themeColors.error : themeColors.text }}>
                  {unrespondedEnquiries}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.urgentEnquiries.title}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: unrespondedEnquiries > 0 ? themeColors.error : themeColors.textSecondary }} numberOfLines={1}>
                  {unrespondedEnquiries > 0 ? LABELS.urgentEnquiries.caption : 'All clear'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tile 2: Trips without a driver + <2h Attention Alert */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'unassigned' } } as any)}
              style={{
                flex: 1,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: upcomingUnder2HrsCount > 0 ? '#DC262680' : upcomingUnassignedCount > 0 ? themeColors.primary + '40' : themeColors.border,
                backgroundColor: upcomingUnder2HrsCount > 0 ? (isDark ? '#450A0A30' : '#FEF2F2') : upcomingUnassignedCount > 0 ? themeColors.primaryLight : themeColors.surface,
                padding: 12,
                minHeight: 95,
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: upcomingUnder2HrsCount > 0 ? '#DC2626' : upcomingUnassignedCount > 0 ? themeColors.primary : themeColors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Car size={16} color={upcomingUnassignedCount > 0 ? '#FFFFFF' : themeColors.textSecondary} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 20, fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: upcomingUnder2HrsCount > 0 ? '#DC2626' : upcomingUnassignedCount > 0 ? themeColors.primary : themeColors.text }}>
                    {upcomingUnassignedCount}
                  </Text>
                  {upcomingUnder2HrsCount > 0 && (
                    <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginTop: 2 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>⚡ {upcomingUnder2HrsCount} &lt; 2 Hrs</Text>
                    </View>
                  )}
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.urgentTripsWithoutDriver.title}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: upcomingUnder2HrsCount > 0 ? '#DC2626' : themeColors.textSecondary }} numberOfLines={1}>
                  {upcomingUnder2HrsCount > 0 ? '⚠️ Immediate Driver Dispatch' : upcomingUnassignedCount > 0 ? LABELS.urgentTripsWithoutDriver.caption : 'All dispatched'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. QUICK OPERATIONS (2x2 Fixed Vertical Grid - Zero Horizontal Scroll) */}
        <View style={{ marginTop: 14, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted, marginBottom: 8 }}>
            {LABELS.sectionQuickOperations}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {/* Quick 1: New Booking */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/create-booking' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#4F46E515', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={18} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.btnNewBooking}
                </Text>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Post trip / cab</Text>
              </View>
            </TouchableOpacity>

            {/* Quick 2: Live Fleet Map */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/live-map' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#0284C715', alignItems: 'center', justifyContent: 'center' }}>
                <Map size={18} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.btnLiveMap}
                </Text>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Live tracking</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Quick 3: Lead / Quick Quote */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/quote-estimate' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#05966915', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.btnLeadQuote}
                </Text>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Instant quote</Text>
              </View>
            </TouchableOpacity>

            {/* Quick 4: GST Invoices */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/gst-invoices' as any)}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                  {LABELS.btnGstInvoices}
                </Text>
                <Text style={{ fontSize: 10.5, color: themeColors.textSecondary }}>Billing & tax</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. Team & duty Banner */}
        <View style={{ marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, backgroundColor: themeColors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color={themeColors.primary} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>
              {LABELS.teamAndDuty.title}
            </Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: '500', color: themeColors.textSecondary, marginTop: 2 }}>
            {LABELS.teamAndDuty.tamilSub} · {LABELS.teamAndDuty.caption}
          </Text>
        </View>

        {/* 6. EVERYTHING ELSE 2-Column Module Tile Grid */}
        <View style={{ marginTop: 14 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: themeColors.textMuted }}>
              {LABELS.sectionEverythingElse}
            </Text>
          </View>
          <PriorityGrid
            items={[
              {
                key: 'team_hub',
                title: LABELS.teamAndDuty.title,
                subtitle: LABELS.teamAndDuty.caption,
                icon: Megaphone,
                count: recentDirectivesCount ?? 0,
                onPress: () => router.push('/staff-management' as any),
              },
              {
                key: 'own_fleet',
                title: LABELS.ownFleet.title,
                subtitle: LABELS.ownFleet.caption,
                icon: Car,
                count: 0,
                onPress: () => router.push('/own-fleet' as any),
              },
              {
                key: 'urgent_bids',
                title: LABELS.urgentBids.title,
                subtitle: LABELS.urgentBids.caption,
                icon: Siren,
                count: emergencyBidsCount ?? 0,
                isUrgent: (emergencyBidsCount ?? 0) > 0,
                onPress: () => router.push('/emergency-bids' as any),
              },
              {
                key: 'fleet_hub',
                title: LABELS.driversAndCars.title,
                subtitle: LABELS.driversAndCars.caption,
                icon: Users,
                count: fleetDocsPending ?? 0,
                onPress: () => router.push('/(tabs)/fleet-hub' as any),
              },
              {
                key: 'docs_review',
                title: LABELS.documentChecks.title,
                subtitle: LABELS.documentChecks.caption,
                icon: ShieldAlert,
                count: docsNeedingReview ?? 0,
                isUrgent: (docsNeedingReview ?? 0) > 0,
                onPress: () => router.push('/documents-review-queue' as any),
              },
              {
                key: 'payouts',
                title: LABELS.payouts.title,
                subtitle: LABELS.payouts.caption,
                icon: Wallet,
                count: payoutsPending ?? 0,
                onPress: () => router.push('/payout-requests' as any),
              },
              {
                key: 'gst_invoices',
                title: LABELS.gstInvoices.title,
                subtitle: LABELS.gstInvoices.caption,
                icon: Receipt,
                count: 0,
                onPress: () => router.push('/gst-invoices' as any),
              },
              {
                key: 'web_bookings',
                title: LABELS.websiteBookings.title,
                subtitle: LABELS.websiteBookings.caption,
                icon: Globe,
                count: websiteBookingsPending ?? 0,
                onPress: () => router.push('/website-booking-approvals' as any),
              },
              {
                key: 'staff_targets',
                title: LABELS.staffAndRoles.title,
                subtitle: LABELS.staffAndRoles.caption,
                icon: ListTodo,
                count: 0,
                onPress: () => router.push('/staff-management' as any),
              },
              {
                key: 'profile_reviews',
                title: LABELS.profileChanges.title,
                subtitle: LABELS.profileChanges.caption,
                icon: FileCheck,
                count: profileReviewsPending ?? 0,
                onPress: () => router.push('/profile-edit-queue' as any),
              },
              {
                key: 'brand_integrations',
                title: LABELS.brandsAndWebsite.title,
                subtitle: LABELS.brandsAndWebsite.caption,
                icon: Building2,
                count: 0,
                onPress: () => router.push('/website-integrations' as any),
              },
              {
                key: 'crm_ads',
                title: LABELS.customersAndAds.title,
                subtitle: LABELS.customersAndAds.caption,
                icon: TrendingUp,
                count: 0,
                onPress: () => router.push('/crm' as any),
              },
              {
                key: 'system_health',
                title: 'System Health & Diagnostics',
                subtitle: 'SMTP Pool, Maps API & Telemetry',
                icon: Activity,
                count: 0,
                onPress: () => router.push('/system-health' as any),
              },
              {
                key: 'system_settings',
                title: LABELS.ratesAndSettings.title,
                subtitle: LABELS.ratesAndSettings.caption,
                icon: Settings2,
                count: 0,
                onPress: () => router.push('/(tabs)/settings' as any),
              },
            ].filter((r) => isOwner || canSee(r.key === 'payouts' ? 'finance' : r.key === 'fleet_hub' ? 'fleet' : 'bookings'))}
          />
        </View>

        {/* Message from the owner */}
        {myDirectives.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Section title="Message from NV">
              <View style={{ padding: 14 }}>
                {!!myDirectives[0].message && (
                  <Text style={{ fontSize: 14, lineHeight: 20, color: themeColors.text, fontWeight: '500' }}>{myDirectives[0].message}</Text>
                )}
                {!!myDirectives[0].voice_note_url && (
                  <View style={{ marginTop: 8 }}><VoiceNoteButton url={myDirectives[0].voice_note_url} /></View>
                )}
                <Text style={{ fontSize: 11.5, color: themeColors.textMuted, marginTop: 6 }}>
                  {new Date(myDirectives[0].created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </Section>
          </View>
        )}
      </ScrollView>

      {/* Floating Round "+" FAB */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowFabMenu(true)}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: themeColors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadows.modal,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.2)',
          zIndex: 99,
        }}
      >
        <Plus size={24} color="#FFFFFF" />
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', fontWeight: '800', color: themeColors.text }}>Quick Actions</Text>
              <TouchableOpacity onPress={() => setShowFabMenu(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { label: 'New booking', icon: Plus, route: '/create-booking' },
                { label: 'Quote & Leads', icon: Calculator, route: '/quote-estimate' },
                { label: 'Live map', icon: Map, route: '/live-map' },
                { label: 'GST invoices', icon: Receipt, route: '/gst-invoices' },
                { label: 'Urgent bids', icon: Siren, route: '/emergency-bids' },
                { label: 'Website Leads', icon: MessageSquare, route: '/enquiries' },
              ].map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={{
                    width: '47.5%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: 10,
                    borderRadius: 8,
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
                >
                  <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: themeColors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                    <item.icon size={16} color={themeColors.primary} />
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', fontWeight: '700', color: themeColors.text, flex: 1 }} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
