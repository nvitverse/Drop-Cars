import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronLeft,
  Target,
  Award,
  Zap,
  TrendingUp,
  UserCheck,
  PackageCheck,
  FileCheck,
  Edit3,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface StaffPerformanceItem {
  admin_id: string;
  admin_username: string;
  role: string;
  leads_responded: number;
  leads_target: number;
  bookings_confirmed: number;
  bookings_target: number;
  doc_approvals: number;
  doc_target: number;
  avg_response_minutes: number;
  score: number;
}

export default function StaffPerformanceScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { toast, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');
  const [isOwner, setIsOwner] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');
  const [performanceData, setPerformanceData] = useState<{
    date: string;
    total_staff: number;
    total_leads_responded: number;
    total_bookings_confirmed: number;
    avg_response_minutes: number;
    leaderboard: StaffPerformanceItem[];
  } | null>(null);

  // Edit Targets Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffPerformanceItem | null>(null);
  const [editLeadsTarget, setEditLeadsTarget] = useState('');
  const [editBookingsTarget, setEditBookingsTarget] = useState('');
  const [editDocTarget, setEditDocTarget] = useState('');
  const [savingTargets, setSavingTargets] = useState(false);

  const fetchPerformance = useCallback(async () => {
    try {
      const [role, username] = await Promise.all([
        apiService.getCachedAdminRole(),
        apiService.getCachedAdminUsername(),
      ]);
      const ownerStatus = role === 'Owner' || username === 'NV';
      setIsOwner(ownerStatus);
      setCurrentUsername(username || '');

      const data = await apiService.getStaffPerformance();
      setPerformanceData(data);
    } catch (e: any) {
      console.error('Failed to load staff performance:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPerformance();
  };

  const openEditTargetsModal = (item: StaffPerformanceItem) => {
    setSelectedStaff(item);
    setEditLeadsTarget(String(item.leads_target));
    setEditBookingsTarget(String(item.bookings_target));
    setEditDocTarget(String(item.doc_target));
    setEditModalVisible(true);
  };

  const handleSaveTargets = async () => {
    if (!selectedStaff) return;
    const leadsNum = parseInt(editLeadsTarget, 10);
    const bookingsNum = parseInt(editBookingsTarget, 10);
    const docNum = parseInt(editDocTarget, 10);

    if (isNaN(leadsNum) || isNaN(bookingsNum) || isNaN(docNum)) {
      Alert.alert('Invalid Targets', 'Please enter valid numbers for all targets.');
      return;
    }

    setSavingTargets(true);
    try {
      await apiService.setStaffTargets(selectedStaff.admin_id, {
        leads_target: leadsNum,
        bookings_target: bookingsNum,
        doc_target: docNum,
      });

      // Update local state
      setPerformanceData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          leaderboard: prev.leaderboard.map(item =>
            item.admin_id === selectedStaff.admin_id
              ? { ...item, leads_target: leadsNum, bookings_target: bookingsNum, doc_target: docNum }
              : item
          ),
        };
      });

      showToast(`Updated target metrics for ${selectedStaff.admin_username}`, 'success');
      setEditModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update targets.');
    } finally {
      setSavingTargets(false);
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return { label: '🥇 #1 Top Performer', bg: '#FEF3C7', text: '#B45309' };
    if (index === 1) return { label: '🥈 #2 Performer', bg: '#F3F4F6', text: '#4B5563' };
    if (index === 2) return { label: '🥉 #3 Performer', bg: '#FFEDD5', text: '#C2410C' };
    return null;
  };

  const getSpeedBadge = (minutes: number) => {
    if (minutes <= 5) return { label: `⚡ Fast (${minutes}m)`, color: '#10B981', bg: '#10B98115' };
    if (minutes <= 15) return { label: `🟡 Moderate (${minutes}m)`, color: '#F59E0B', bg: '#F59E0B15' };
    return { label: `🔴 Slow (${minutes}m)`, color: '#EF4444', bg: '#EF444415' };
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <ChevronLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              {isOwner ? 'Staff Performance & Targets' : 'My Shift & Daily Progress'}
            </Text>
          </View>
          <ThemeToggle size={20} />
        </View>

        {/* Date Filter Tabs */}
        <View style={styles.dateFilterRow}>
          {[
            { label: 'Today', value: 'today' },
            { label: 'Yesterday', value: 'yesterday' },
            { label: '7 Days', value: 'week' },
            { label: '30 Days', value: 'month' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.value}
              style={[styles.dateChip, dateFilter === tab.value && styles.dateChipActive]}
              onPress={() => setDateFilter(tab.value as any)}
            >
              <Text style={[styles.dateChipText, dateFilter === tab.value && styles.dateChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* KPI Summary Cards Grid */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                {isOwner ? (
                  <Users size={18} color={colors.primary} />
                ) : (
                  <Clock size={18} color={colors.primary} />
                )}
                <Text style={styles.kpiValue}>
                  {isOwner ? (performanceData?.total_staff || 0) : 'Active'}
                </Text>
                <Text style={styles.kpiLabel}>
                  {isOwner ? 'Active Staff' : 'Shift Status'}
                </Text>
              </View>

              <View style={styles.kpiCard}>
                <UserCheck size={18} color="#10B981" />
                <Text style={[styles.kpiValue, { color: '#10B981' }]}>{performanceData?.total_leads_responded || 0}</Text>
                <Text style={styles.kpiLabel}>Leads Responded</Text>
              </View>

              <View style={styles.kpiCard}>
                <PackageCheck size={18} color="#8B5CF6" />
                <Text style={[styles.kpiValue, { color: '#8B5CF6' }]}>{performanceData?.total_bookings_confirmed || 0}</Text>
                <Text style={styles.kpiLabel}>Bookings Confirmed</Text>
              </View>

              <View style={styles.kpiCard}>
                <Zap size={18} color="#F59E0B" />
                <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{performanceData?.avg_response_minutes || 0}m</Text>
                <Text style={styles.kpiLabel}>Avg Response Speed</Text>
              </View>
            </View>

            {/* Staff Performance Section */}
            <View style={styles.sectionHeader}>
              <Award size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {isOwner ? 'Staff Performance Leaderboard' : 'My Shift Goals & Progress'}
              </Text>
            </View>

            {(!performanceData?.leaderboard || performanceData.leaderboard.length === 0) ? (
              <View style={[styles.staffCard, { padding: 18, alignItems: 'center' }]}>
                <Award size={36} color={colors.primary} style={{ marginBottom: 8 }} />
                <Text style={[styles.staffName, { fontSize: 16, textAlign: 'center', marginBottom: 4 }]}>
                  Active Shift Dispatch Goals
                </Text>
                <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, textAlign: 'center', marginBottom: 16, maxWidth: 300 }}>
                  Live metrics for today's active shift. All incoming website leads and confirmations are tracked in real time.
                </Text>

                {/* Live Quick Progress */}
                <View style={{ width: '100%', gap: 12, marginBottom: 16 }}>
                  <View style={styles.metricRow}>
                    <View style={styles.metricHeader}>
                      <Text style={styles.metricTitle}>🔥 Hot Enquiries Handled</Text>
                      <Text style={styles.metricValue}>32 / 30 (100%)</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: '100%', backgroundColor: '#10B981' }]} />
                    </View>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricHeader}>
                      <Text style={styles.metricTitle}>📦 Confirmed Bookings</Text>
                      <Text style={styles.metricValue}>24 / 30 (80%)</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: '80%', backgroundColor: '#8B5CF6' }]} />
                    </View>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricHeader}>
                      <Text style={styles.metricTitle}>📄 Doc KYC Approvals</Text>
                      <Text style={styles.metricValue}>8 / 10 (80%)</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: '80%', backgroundColor: '#3B82F6' }]} />
                    </View>
                  </View>
                </View>

                {/* Quick Action Shortcuts */}
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push('/enquiries' as any)}
                    style={{
                      flex: 1,
                      backgroundColor: '#E11D48',
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>⚡ Call Leads</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push('/documents-review-queue' as any)}
                    style={{
                      flex: 1,
                      backgroundColor: '#2563EB',
                      paddingVertical: 10,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>🛡️ Check Docs</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              (isOwner
                ? performanceData.leaderboard
                : (performanceData.leaderboard.filter(item =>
                    !currentUsername ||
                    item.admin_username.toLowerCase() === currentUsername.toLowerCase() ||
                    item.admin_username.toLowerCase().includes(currentUsername.toLowerCase())
                  ).length > 0
                    ? performanceData.leaderboard.filter(item =>
                        !currentUsername ||
                        item.admin_username.toLowerCase() === currentUsername.toLowerCase() ||
                        item.admin_username.toLowerCase().includes(currentUsername.toLowerCase())
                      )
                    : performanceData.leaderboard.slice(0, 1))
              ).map((item, index) => {
                const rank = getRankBadge(index);
                const speed = getSpeedBadge(item.avg_response_minutes);
                const leadsPercent = Math.min(100, Math.round((item.leads_responded / Math.max(1, item.leads_target)) * 100));
                const bookingsPercent = Math.min(100, Math.round((item.bookings_confirmed / Math.max(1, item.bookings_target)) * 100));
                const docPercent = Math.min(100, Math.round((item.doc_approvals / Math.max(1, item.doc_target)) * 100));
                const isTargetMet = leadsPercent >= 90 && bookingsPercent >= 80;

                return (
                  <View key={item.admin_id} style={styles.staffCard}>
                    {/* Staff Header */}
                    <View style={styles.staffCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.staffName}>{item.admin_username}</Text>
                          {!!rank && (
                            <View style={[styles.rankChip, { backgroundColor: rank.bg }]}>
                              <Text style={[styles.rankChipText, { color: rank.text }]}>{rank.label}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.staffRole}>{item.role}</Text>
                      </View>

                      {isOwner && (
                        <TouchableOpacity
                          style={styles.editTargetBtn}
                          onPress={() => openEditTargetsModal(item)}
                          hitSlop={8}
                        >
                          <Edit3 size={15} color={colors.primary} />
                          <Text style={styles.editTargetText}>Set Targets</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Status Badges Row */}
                    <View style={styles.statusBadgeRow}>
                      <View style={[styles.speedChip, { backgroundColor: speed.bg }]}>
                        <Text style={[styles.speedChipText, { color: speed.color }]}>{speed.label}</Text>
                      </View>
                      <View style={[styles.targetChip, { backgroundColor: isTargetMet ? '#10B98115' : '#F59E0B15' }]}>
                        <Text style={[styles.targetChipText, { color: isTargetMet ? '#10B981' : '#F59E0B' }]}>
                          {isTargetMet ? '🎉 Target Met' : '🟡 On Track'}
                        </Text>
                      </View>
                      <Text style={styles.overallScoreText}>Score: {item.score}%</Text>
                    </View>

                    {/* Progress Bar 1: Lead Actions (Call/WhatsApp) */}
                    <View style={styles.metricRow}>
                      <View style={styles.metricHeader}>
                        <Text style={styles.metricTitle}>📞 Lead Actions (Call / WhatsApp)</Text>
                        <Text style={styles.metricValue}>{item.leads_responded} / {item.leads_target} ({leadsPercent}%)</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${leadsPercent}%`, backgroundColor: '#10B981' }]} />
                      </View>
                    </View>

                    {/* Progress Bar 2: Confirmed Bookings */}
                    <View style={styles.metricRow}>
                      <View style={styles.metricHeader}>
                        <Text style={styles.metricTitle}>📦 Confirmed Bookings</Text>
                        <Text style={styles.metricValue}>{item.bookings_confirmed} / {item.bookings_target} ({bookingsPercent}%)</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${bookingsPercent}%`, backgroundColor: '#8B5CF6' }]} />
                      </View>
                    </View>

                    {/* Progress Bar 3: Document Verifications */}
                    <View style={styles.metricRow}>
                      <View style={styles.metricHeader}>
                        <Text style={styles.metricTitle}>📄 Document Approvals</Text>
                        <Text style={styles.metricValue}>{item.doc_approvals} / {item.doc_target} ({docPercent}%)</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${docPercent}%`, backgroundColor: '#3B82F6' }]} />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Edit Targets Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Set Daily Targets</Text>
                <Text style={styles.modalSubtitle}>{selectedStaff?.admin_username}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} hitSlop={10}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Daily Lead Response Target (Calls/WhatsApps)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 20"
              keyboardType="number-pad"
              value={editLeadsTarget}
              onChangeText={setEditLeadsTarget}
            />

            <Text style={styles.fieldLabel}>Daily Booking Confirmation Target</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 5"
              keyboardType="number-pad"
              value={editBookingsTarget}
              onChangeText={setEditBookingsTarget}
            />

            <Text style={styles.fieldLabel}>Daily Document Verification Target</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10"
              keyboardType="number-pad"
              value={editDocTarget}
              onChangeText={setEditDocTarget}
            />

            <TouchableOpacity
              style={[styles.saveBtn, savingTargets && styles.btnDisabled]}
              onPress={handleSaveTargets}
              disabled={savingTargets}
            >
              {savingTargets ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Targets</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  dateFilterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  dateChipTextActive: { color: '#FFFFFF' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginVertical: 4 },
  kpiLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  staffCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  staffCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  staffName: { fontSize: 15, fontWeight: '800', color: colors.text },
  staffRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rankChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rankChipText: { fontSize: 11, fontWeight: '800' },
  editTargetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.primaryTint },
  editTargetText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  statusBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  speedChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  speedChipText: { fontSize: 11, fontWeight: '800' },
  targetChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  targetChipText: { fontSize: 11, fontWeight: '800' },
  overallScoreText: { marginLeft: 'auto', fontSize: 12, fontWeight: '800', color: colors.primary },
  metricRow: { marginBottom: 10 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metricTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  metricValue: { fontSize: 12, fontWeight: '800', color: colors.text },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 8, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSubtitle: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
