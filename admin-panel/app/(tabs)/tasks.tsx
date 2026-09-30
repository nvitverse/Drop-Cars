import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import VoiceNoteButton from '@/components/VoiceNoteButton';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Section, Row } from '@/components/ui';

interface FounderDirective {
  id: string;
  message: string | null;
  voice_note_url?: string | null;
  target_admin_ids: string[] | null;
  created_by_username: string;
  created_at: string;
}

export default function TasksScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live Counts for Tasks
  const [feedbacksCount, setFeedbacksCount] = useState(0);
  const [docsPendingCount, setDocsPendingCount] = useState(0);
  const [profileReviewsCount, setProfileReviewsCount] = useState(0);
  const [payoutsCount, setPayoutsCount] = useState(0);

  // Directives & Targets
  const [directives, setDirectives] = useState<FounderDirective[]>([]);
  const [ownRecordSubmitted, setOwnRecordSubmitted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Modal for Owner Directive
  const [newDirectiveModalVisible, setNewDirectiveModalVisible] = useState(false);
  const [newDirectiveMessage, setNewDirectiveMessage] = useState('');
  const [submittingDirective, setSubmittingDirective] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const role = await apiService.getCachedAdminRole();
      setIsOwner(role === 'Owner');

      // Fetch all sources concurrently
      await Promise.allSettled([
        // 1. Completed Trips Without Reviews
        apiService.getOrders(0, 100).then((ordersData) => {
          const list = Array.isArray(ordersData?.orders) ? ordersData.orders : [];
          const completedWithoutReview = list.filter((o: any) => {
            const s = String(o.trip_status || o.status || '').toUpperCase();
            return s === 'COMPLETED' && !o.review;
          });
          setFeedbacksCount(completedWithoutReview.length);
        }),

        // 2. Driver Docs & KYC Review Queue
        apiService.getDocumentsNeedingReview().then((docs) => {
          setDocsPendingCount(typeof docs?.count === 'number' ? docs.count : (Array.isArray(docs) ? docs.length : 0));
        }),

        // 3. Profile Edit Reviews (Bank, phone changes)
        apiService.getProfileEditReviews('PENDING').then((prof) => {
          setProfileReviewsCount(Array.isArray(prof?.reviews) ? prof.reviews.length : 0);
        }),

        // 4. Payout Requests
        apiService.getPayoutRequests('PENDING').then((pay) => {
          setPayoutsCount(Array.isArray(pay) ? pay.length : 0);
        }),

        // 5. Founder Directives & Voice Notes
        apiService.getStaffDirectives(20).then((dirs) => {
          setDirectives(Array.isArray(dirs) ? dirs : []);
        }),

        // 6. Own Daily Record Check
        apiService.getOwnDailyRecord().then((rec) => setOwnRecordSubmitted(!!rec?.note)),
      ]);
    } catch (e) {
      console.warn('Failed to refresh tasks:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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
    payoutsCount;

  // Curated Operational Work Queues
  const taskItems = [
    {
      id: 'reviews',
      title: 'Customer ratings',
      subtitle: 'Finished trips waiting for a rating call',
      count: feedbacksCount,
      color: '#F59E0B',
      bgColor: '#FFFBEB',
      darkBgColor: '#F59E0B15',
      icon: Star,
      route: '/(tabs)/orders?tab=completed',
    },
    {
      id: 'kyc_docs',
      title: 'Document checks',
      subtitle: 'Licence, RC, insurance and permits to check',
      count: docsPendingCount,
      color: '#8B5CF6',
      bgColor: '#F5F3FF',
      darkBgColor: '#8B5CF615',
      icon: ShieldAlert,
      route: '/documents-review-queue',
    },
    {
      id: 'profile_reviews',
      title: 'Profile changes',
      subtitle: 'Bank account or phone number change requests',
      count: profileReviewsCount,
      color: '#0EA5E9',
      bgColor: '#F0F9FF',
      darkBgColor: '#0EA5E915',
      icon: FileCheck,
      route: '/profile-edit-queue',
    },
    {
      id: 'payouts',
      title: 'Payouts',
      subtitle: 'Withdrawals waiting to be paid',
      count: payoutsCount,
      color: '#10B981',
      bgColor: '#ECFDF5',
      darkBgColor: '#10B98115',
      icon: Wallet,
      route: '/payout-requests',
    },
    {
      id: 'gst_invoices',
      title: 'GST invoices',
      subtitle: 'Invoices, monthly GST report and PDF downloads',
      count: 0,
      color: '#059669',
      bgColor: '#ECFDF5',
      darkBgColor: '#05966915',
      icon: Receipt,
      route: '/gst-invoices',
      isAlwaysActive: true,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconCircle, { backgroundColor: isDark ? '#6366F125' : '#EEF2FF' }]}>
            <ListTodo size={20} color={colors.primary} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>My tasks</Text>
              <View style={[styles.headerBadge, { backgroundColor: totalTasksPending > 0 ? (isDark ? '#EF444430' : '#FEE2E2') : (isDark ? '#10B98130' : '#DCFCE7') }]}>
                <Text style={{ color: totalTasksPending > 0 ? '#EF4444' : '#10B981', fontSize: 11, fontWeight: '800' }}>
                  {totalTasksPending > 0 ? `${totalTasksPending} waiting` : 'All done'}
                </Text>
              </View>
            </View>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
              What to do today
            </Text>
          </View>
        </View>

        {/* Header Right Actions: ThemeToggle + Refresh (Records are preserved automatically) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} activeOpacity={0.7}>
            <RefreshCw size={17} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Refreshing pending tasks...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          <Section
            title="Message from NV"
            right={isOwner ? (
              <TouchableOpacity onPress={() => setNewDirectiveModalVisible(true)} activeOpacity={0.7}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.primary }}>Send a message</Text>
              </TouchableOpacity>
            ) : undefined}
            style={{ marginTop: 0 }}
          >
            {directives.length === 0 ? (
              <Row icon={CheckCircle2} color="#059669" title="No new messages" subtitle="Keep up the good work" last />
            ) : (
              directives.slice(0, 3).map((d, i, arr) => (
                <View key={d.id} style={{ padding: 14, borderBottomWidth: i === arr.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: themeColors.border }}>
                  {!!d.message && <Text style={{ fontSize: 15, lineHeight: 21, color: themeColors.text, fontWeight: '500' }}>{d.message}</Text>}
                  {!!d.voice_note_url && <View style={{ marginTop: 8 }}><VoiceNoteButton url={d.voice_note_url} /></View>}
                  <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 6 }}>
                    {d.created_by_username || 'NV'} · {new Date(d.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))
            )}
          </Section>

          <Section title="To do">
            {taskItems.map((item, i) => (
              <Row
                key={item.id}
                icon={item.icon}
                color={item.color}
                title={item.title}
                subtitle={item.subtitle}
                count={item.isAlwaysActive ? null : item.count}
                right={item.isAlwaysActive ? <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.primary }}>Open</Text> : undefined}
                last={i === taskItems.length - 1}
                onPress={() => { if (item.route) router.push(item.route as any); }}
              />
            ))}
          </Section>

          {isOwner && (
            <Section title="Staff reports">
              <Row icon={FileText} color="#059669" title="Daily reports" subtitle="Who worked, targets met, team activity" onPress={() => router.push('/staff-daily-records' as any)} last />
            </Section>
          )}
        </ScrollView>
      )}

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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  headerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  headerRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerRecordBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addDirectiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addDirectiveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyDirectiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyDirectiveText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  directiveCard: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  directiveIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directiveText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  directiveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  directiveMeta: {
    fontSize: 10.5,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  taskIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskTextContainer: {
    flex: 1,
  },
  taskItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  taskItemSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
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
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 90,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalSubmitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
});
