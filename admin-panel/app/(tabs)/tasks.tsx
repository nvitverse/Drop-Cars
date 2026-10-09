import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  StatusBar as RNStatusBar,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MessageSquare,
  Star,
  ShieldAlert,
  FileCheck,
  Wallet,
  Megaphone,
  Plus,
  RefreshCw,
  Crown,
  ListTodo,
  CheckCircle2,
  Receipt,
  FileText,
  UserCheck,
  ShieldCheck,
  Calendar,
  PhoneCall,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Clock,
  Car,
  ChevronRight,
  Zap,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { enquiriesApi } from '@/services/enquiriesApi';
import VoiceNoteButton from '@/components/VoiceNoteButton';
import { colors, shadows } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface FounderDirective {
  id: string;
  message: string | null;
  voice_note_url?: string | null;
  target_admin_ids: string[] | null;
  created_by_username: string;
  created_at: string;
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { themeColors, isDark } = useTheme();

  const [loading, setLoading] = useState(false);
  // false until the first fetch finishes (or last saved numbers are restored): badges show … instead of a false 'Clear'
  const [tasksReady, setTasksReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter Segment: 'all' | 'verifications' | 'feedback' | 'finance'
  const [activeSegment, setActiveSegment] = useState<'all' | 'verifications' | 'feedback' | 'finance'>('all');

  // Live Counts for Tasks
  const [feedbacksCount, setFeedbacksCount] = useState(0);
  const [docsPendingCount, setDocsPendingCount] = useState(0);
  const [profileReviewsCount, setProfileReviewsCount] = useState(0);
  const [payoutsCount, setPayoutsCount] = useState(0);
  const [futureLeadsCount, setFutureLeadsCount] = useState(0);

  // Directives & Targets
  const [directives, setDirectives] = useState<FounderDirective[]>([]);
  const [ownRecordSubmitted, setOwnRecordSubmitted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Modal for Owner Directive
  const [newDirectiveModalVisible, setNewDirectiveModalVisible] = useState(false);
  const [newDirectiveMessage, setNewDirectiveMessage] = useState('');
  const [submittingDirective, setSubmittingDirective] = useState(false);

  const animateLayout = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  };

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);

    try {
      const role = await apiService.getCachedAdminRole();
      setIsOwner(role === 'Owner');

      // Fetch each task source in parallel; each updates immediately upon resolving
      const jobs = [
        // 1. Customer Feedback on Completed Trips
        apiService.getOrders(0, 60).then((ordersData) => {
          const list = Array.isArray(ordersData?.orders) ? ordersData.orders : (Array.isArray(ordersData) ? ordersData : []);
          const completedWithoutReview = list.filter((o: any) => {
            const s = String(o.trip_status || o.status || '').toUpperCase();
            return s === 'COMPLETED' && !o.review;
          });
          setFeedbacksCount(completedWithoutReview.length);
        }).catch(() => {}),

        // 2. Driver Docs & KYC Review Queue
        apiService.getDocumentsNeedingReview().then((docs) => {
          const count = typeof docs?.count === 'number' ? docs.count : (Array.isArray(docs) ? docs.length : 0);
          setDocsPendingCount(count);
        }).catch(() => {}),

        // 3. Profile Edit Reviews (Bank, phone changes)
        apiService.getProfileEditReviews('PENDING').then((prof) => {
          const count = Array.isArray(prof?.reviews) ? prof.reviews.length : 0;
          setProfileReviewsCount(count);
        }).catch(() => {}),

        // 4. Payout Requests
        apiService.getPayoutRequests('PENDING').then((pay) => {
          const count = Array.isArray(pay) ? pay.length : 0;
          setPayoutsCount(count);
        }).catch(() => {}),

        // 5. Future Leads Follow-up Queue
        enquiriesApi.getFutureLeadsCount().then((cnt) => {
          setFutureLeadsCount(cnt);
        }).catch(() => {}),

        // 6. Founder Directives & Voice Notes
        apiService.getStaffDirectives(20).then((dirs) => {
          setDirectives(Array.isArray(dirs) ? dirs : []);
        }).catch(() => {}),

        // 7. Own Daily Record Check
        apiService.getOwnDailyRecord().then((rec) => setOwnRecordSubmitted(!!rec?.note)).catch(() => {}),
      ];

      await Promise.allSettled(jobs);
      setTasksReady(true);
    } catch (e) {
      console.warn('Failed to refresh tasks:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Last real counts are kept on the phone and shown at once; fresh ones replace them as soon as they arrive.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('tasks_counts_cache_v1');
        if (!raw) return;
        const c = JSON.parse(raw);
        if (typeof c.feedbacksCount === 'number') setFeedbacksCount(c.feedbacksCount);
        if (typeof c.docsPendingCount === 'number') setDocsPendingCount(c.docsPendingCount);
        if (typeof c.profileReviewsCount === 'number') setProfileReviewsCount(c.profileReviewsCount);
        if (typeof c.payoutsCount === 'number') setPayoutsCount(c.payoutsCount);
        if (typeof c.futureLeadsCount === 'number') setFutureLeadsCount(c.futureLeadsCount);
        setTasksReady(true);
      } catch { /* first launch: no cache */ }
    })();
  }, []);
  useEffect(() => {
    if (!tasksReady) return;
    AsyncStorage.setItem('tasks_counts_cache_v1', JSON.stringify({ feedbacksCount, docsPendingCount, profileReviewsCount, payoutsCount, futureLeadsCount })).catch(() => {});
  }, [tasksReady, feedbacksCount, docsPendingCount, profileReviewsCount, payoutsCount, futureLeadsCount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    loadData(true);
  };

  const handlePostDirective = async () => {
    if (!newDirectiveMessage.trim()) {
      Alert.alert('Required', 'Please enter instruction message text.');
      return;
    }
    setSubmittingDirective(true);
    try {
      await apiService.createStaffDirective({
        message: newDirectiveMessage.trim(),
        target_admin_ids: null, // broadcast to all
      });
      setNewDirectiveMessage('');
      setNewDirectiveModalVisible(false);
      Alert.alert('Success', 'Instruction broadcasted to staff members.');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to post instruction');
    } finally {
      setSubmittingDirective(false);
    }
  };

  const totalTasksPending =
    feedbacksCount +
    docsPendingCount +
    profileReviewsCount +
    payoutsCount +
    futureLeadsCount;

  const verificationTotal = docsPendingCount + profileReviewsCount;

  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  // Header Gradient based on Dark/Light mode
  const headerGradientColors: [string, string] = isDark
    ? ['#0F172A', '#1E1B4B']
    : ['#2A2665', '#1B1446'];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, flex: 1 }]}>
      <StatusBar style="light" />
      {/* 1. Compact Unified Executive Header with Edge-Attached Dock */}
      <LinearGradient
        colors={headerGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroBanner, { paddingTop: topPadding + 6 }]}
      >
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.heroTitle}>Tasks</Text>
              <View style={[styles.heroBadge, { backgroundColor: totalTasksPending > 0 ? '#EF4444' : '#10B981' }]}>
                <Text style={styles.heroBadgeText}>
                  {totalTasksPending > 0 ? `${totalTasksPending} waiting` : 'All caught up'}
                </Text>
              </View>
            </View>
            <Text style={styles.heroSubTitle}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · What to do today
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle size={18} />
            <TouchableOpacity
              onPress={onRefresh}
              style={styles.heroRefreshBtn}
              activeOpacity={0.7}
            >
              <RefreshCw size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Header-Attached Edge Dock */}
        <View style={styles.heroDock}>
          {[
            { key: 'all', label: 'All', count: totalTasksPending },
            { key: 'verifications', label: 'Verify', count: verificationTotal },
            { key: 'feedback', label: 'Feedback', count: feedbacksCount },
            { key: 'finance', label: 'Finance', count: payoutsCount },
          ].map((tab) => {
            const isActive = activeSegment === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => {
                  animateLayout();
                  setActiveSegment(tab.key as any);
                }}
                activeOpacity={0.8}
                style={[
                  styles.dockSegment,
                  isActive && styles.dockSegmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.dockLabel,
                    { color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)' },
                    isActive && { fontFamily: 'Inter-Bold', fontWeight: '800' },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View
                    style={[
                      styles.dockBadge,
                      {
                        backgroundColor: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.2)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dockBadgeText,
                        { color: isActive ? '#4338CA' : '#FFFFFF' },
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* 3. Executive Founder Directive Card ("Message from NV") */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Crown size={15} color="#D97706" />
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                {isOwner ? 'Broadcast Directives to Team' : 'Message from NV'}
              </Text>
            </View>
            {isOwner && (
              <TouchableOpacity
                onPress={() => setNewDirectiveModalVisible(true)}
                activeOpacity={0.7}
                style={[styles.actionChip, { backgroundColor: colors.primaryLight }]}
              >
                <Plus size={13} color={colors.primary} />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.primary }}>Post note</Text>
              </TouchableOpacity>
            )}
          </View>

          {directives.length === 0 ? (
            <View
              style={[
                styles.directiveCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.directiveIconBox, { backgroundColor: '#10B98115' }]}>
                <CheckCircle2 size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.directiveMainText, { color: themeColors.text }]}>
                  No new messages
                </Text>
                <Text style={[styles.directiveSubText, { color: themeColors.textSecondary }]}>
                  Keep up the good work today!
                </Text>
              </View>
            </View>
          ) : (
            directives.slice(0, 2).map((d) => (
              <View
                key={d.id}
                style={[
                  styles.directiveCardActive,
                  {
                    backgroundColor: isDark ? '#1E1B4B35' : '#FEF3C725',
                    borderColor: isDark ? '#F59E0B40' : '#FDE68A',
                  },
                ]}
              >
                <View style={styles.directiveTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.vipBadge}>
                      <Text style={styles.vipBadgeText}>👑 {d.created_by_username || 'NV'}</Text>
                    </View>
                    <Text style={[styles.directiveTimeText, { color: themeColors.textSecondary }]}>
                      {new Date(d.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>

                {!!d.message && (
                  <Text style={[styles.directiveBodyText, { color: themeColors.text }]}>
                    {d.message}
                  </Text>
                )}

                {!!d.voice_note_url && (
                  <View style={{ marginTop: 8 }}>
                    <VoiceNoteButton url={d.voice_note_url} />
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* 4. Action Bento Grid (Clean 2x2 Bento Tiles with concise labels) */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 10 }]}>
            To Do
          </Text>

          <View style={styles.bentoGrid}>
            {/* Tile 1: Trip Feedbacks (Highest Priority) */}
            {(activeSegment === 'all' || activeSegment === 'feedback') && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'completed' } } as any)}
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#3D280835' : '#FFFBEB',
                    borderColor: (feedbacksCount > 0) ? (isDark ? '#F59E0B60' : '#FCD34D') : themeColors.border,
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#F59E0B20' }]}>
                    <Star size={19} color="#F59E0B" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: feedbacksCount > 0 ? '#F59E0B' : '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>
                      {!tasksReady ? '…' : feedbacksCount > 0 ? `${feedbacksCount} Pending` : 'Clear'}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.bentoTitle, { color: themeColors.text }]}>
                    Trip Feedbacks
                  </Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    Rating & review calls
                  </Text>
                </View>

                <View style={[styles.bentoActionBtn, { backgroundColor: '#D97706' }]}>
                  <Text style={styles.bentoActionBtnText}>Call →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Tile 2: Future Leads (Highest Priority) */}
            {(activeSegment === 'all' || activeSegment === 'feedback') && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: '/enquiries', params: { tab: 'future' } } as any)}
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#3B170535' : '#FFF7ED',
                    borderColor: (futureLeadsCount > 0) ? (isDark ? '#EA580C60' : '#FDBA74') : themeColors.border,
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#EA580C20' }]}>
                    <Calendar size={19} color="#EA580C" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: futureLeadsCount > 0 ? '#EA580C' : '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>
                      {!tasksReady ? '…' : futureLeadsCount > 0 ? `${futureLeadsCount} Follow-ups` : 'All Clear'}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.bentoTitle, { color: themeColors.text }]}>
                    Future Leads
                  </Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    Advance trip calls
                  </Text>
                </View>

                <View style={[styles.bentoActionBtn, { backgroundColor: '#EA580C' }]}>
                  <Text style={styles.bentoActionBtnText}>Schedule →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Tile 3: Document Checks */}
            {(activeSegment === 'all' || activeSegment === 'verifications') && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push('/documents-review-queue' as any)}
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#3B1B5435' : '#FAF5FF',
                    borderColor: (docsPendingCount > 0) ? (isDark ? '#8B5CF660' : '#DDD6FE') : themeColors.border,
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#8B5CF620' }]}>
                    <ShieldAlert size={19} color="#8B5CF6" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: docsPendingCount > 0 ? '#8B5CF6' : '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>
                      {!tasksReady ? '…' : docsPendingCount > 0 ? `${docsPendingCount} Pending` : 'Clear'}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.bentoTitle, { color: themeColors.text }]}>
                    Document Checks
                  </Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    Licence, RC, insurance
                  </Text>
                </View>

                <View style={[styles.bentoActionBtn, { backgroundColor: '#8B5CF6' }]}>
                  <Text style={styles.bentoActionBtnText}>Review →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Tile 4: Profile Changes */}
            {(activeSegment === 'all' || activeSegment === 'verifications') && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push('/profile-edit-queue' as any)}
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#0C2B4035' : '#F0F9FF',
                    borderColor: (profileReviewsCount > 0) ? (isDark ? '#0EA5E960' : '#BAE6FD') : themeColors.border,
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#0EA5E920' }]}>
                    <FileCheck size={19} color="#0EA5E9" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: profileReviewsCount > 0 ? '#0EA5E9' : '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>
                      {!tasksReady ? '…' : profileReviewsCount > 0 ? `${profileReviewsCount} Pending` : 'Clear'}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.bentoTitle, { color: themeColors.text }]}>
                    Profile Changes
                  </Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                    Bank & phone edits
                  </Text>
                </View>

                <View style={[styles.bentoActionBtn, { backgroundColor: '#0EA5E9' }]}>
                  <Text style={styles.bentoActionBtnText}>Review →</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 5. Finance & Staff Reports List */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 10 }]}>
            Finance & Reports
          </Text>

          <View style={styles.denseList}>
            {/* Payouts */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/payout-requests' as any)}
              style={[
                styles.denseRow,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#10B98115' }]}>
                <Wallet size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Payouts</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Withdrawals waiting to be paid
                </Text>
              </View>
              {payoutsCount > 0 ? (
                <View style={[styles.denseBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.denseBadgeText}>{payoutsCount} Requests</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>0 Pending</Text>
              )}
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* GST Invoices */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/gst-invoices' as any)}
              style={[
                styles.denseRow,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#05966915' }]}>
                <Receipt size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>GST invoices</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Invoices and monthly GST filing
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Staff Reports */}
            {isOwner && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/staff-daily-records' as any)}
                style={[
                  styles.denseRow,
                  {
                    backgroundColor: themeColors.surface,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <View style={[styles.denseIconBox, { backgroundColor: '#4338CA15' }]}>
                  <FileText size={18} color="#4338CA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.denseTitle, { color: themeColors.text }]}>Staff daily reports</Text>
                  <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                    Team targets and activity records
                  </Text>
                </View>
                <ChevronRight size={16} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Modal: Post New Directive (Owner Only) ── */}
      <Modal
        visible={newDirectiveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewDirectiveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Crown size={20} color="#D97706" />
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Broadcast Directive to Staff</Text>
            </View>

            <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 10 }}>
              Instructions appear immediately on staff task dashboards:
            </Text>

            <TextInput
              style={[
                styles.modalTextInput,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  color: themeColors.text,
                  borderColor: themeColors.border,
                },
              ]}
              placeholder="e.g. Please verify driver documents within 10 minutes and respond to new leads immediately."
              placeholderTextColor={themeColors.textSecondary}
              value={newDirectiveMessage}
              onChangeText={setNewDirectiveMessage}
              multiline
              numberOfLines={4}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                onPress={() => setNewDirectiveModalVisible(false)}
              >
                <Text style={{ color: themeColors.textSecondary, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handlePostDirective}
                disabled={submittingDirective}
              >
                {submittingDirective ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Broadcast</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroBanner: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 21,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  heroBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  heroSubTitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  heroRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 4,
    width: '100%',
  },
  dockSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 4,
    borderRadius: 6,
    gap: 5,
  },
  dockSegmentActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  dockLabel: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
    fontWeight: '700',
  },
  dockBadge: {
    paddingHorizontal: 5.5,
    paddingVertical: 1.5,
    borderRadius: 6,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBadgeText: {
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  sectionWrap: {
    marginTop: 14,
    paddingHorizontal: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  directiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  directiveIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directiveMainText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  directiveSubText: {
    fontSize: 11.5,
    marginTop: 1,
  },
  directiveCardActive: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  directiveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  vipBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vipBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  directiveTimeText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  directiveBodyText: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bentoCard: {
    width: '48.5%',
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 13,
    justifyContent: 'space-between',
    ...shadows.card,
  },
  bentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bentoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  bentoBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  bentoTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    marginBottom: 2,
  },
  bentoSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginBottom: 6,
  },
  bentoActionBtn: {
    paddingVertical: 6.5,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  denseList: {
    gap: 8,
  },
  denseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  denseIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denseTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  denseSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  denseBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  denseBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    ...shadows.modal,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalSubmitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
});

