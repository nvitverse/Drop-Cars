import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ShieldAlert, ShieldCheck, ToggleLeft, Wallet, UserPlus, Settings2, UserMinus, History, Trash2, Package, Receipt, Link, FileText, Check, Copy, Save, X, Info, XCircle, CheckCircle2, CalendarRange, ChevronRight } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';
import DateRangePickerModal from '@/components/DateRangePickerModal';

interface ActivityEntry {
  id: string;
  admin_username: string;
  admin_role?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  target_name?: string | null;
  details?: Record<string, any> | null;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  PERMANENT_BLOCK: { label: 'Permanently blocked', icon: ShieldAlert, color: colors.error },
  PERMANENT_UNBLOCK: { label: 'Removed permanent block on', icon: ShieldCheck, color: colors.success },
  ACCOUNT_STATUS_CHANGE: { label: 'Changed status of', icon: ToggleLeft, color: colors.warning },
  WALLET_ADJUST: { label: 'Adjusted wallet for', icon: Wallet, color: colors.primary },
  STAFF_CREATED: { label: 'Added staff member', icon: UserPlus, color: colors.success },
  STAFF_PERMISSIONS_UPDATED: { label: 'Updated permissions for', icon: Settings2, color: colors.primary },
  STAFF_REMOVED: { label: 'Removed staff member', icon: UserMinus, color: colors.error },
  PAYOUT_MARKED_PAID: { label: 'Marked payout paid for', icon: Wallet, color: colors.success },
  DIRECT_PAYOUT: { label: 'Paid directly to', icon: Wallet, color: colors.primary },
  OWNER_PASSWORD_CHANGED: { label: 'Changed Naveen password', icon: ShieldCheck, color: colors.warning },
  ACCOUNT_DELETED: { label: 'Permanently deleted', icon: ShieldAlert, color: colors.error },
  BOOKING_CREATED: { label: 'Created a booking for', icon: Package, color: colors.primary },
  ACTIVITY_LOG_CLEARED: { label: 'Cleared the activity log', icon: Trash2, color: colors.textSecondary },
  ORDER_FARE_EDITED: { label: 'Edited fare for', icon: Receipt, color: colors.warning },
  ACTIVITY_LOG_WEBHOOK_UPDATED: { label: 'Updated Google Sheets Webhook', icon: Link, color: colors.success },
  ORDER_CANCELLED: { label: 'Cancelled', icon: XCircle, color: colors.error },
  WEBSITE_BOOKING_APPROVED: { label: 'Approved a website booking from', icon: CheckCircle2, color: colors.success },
  REFUND_PROCESSED: { label: 'Processed a refund for', icon: Wallet, color: colors.primary },
};

/** Where tapping a card should go, by target_type - only covers types with
 * a real detail screen; anything else (driver/quickdriver, payout_request
 * IDs the list screen can't deep-link to, or no target at all) stays
 * un-tappable rather than linking somewhere wrong. */
const targetRoute = (targetType?: string | null, targetId?: string | null): string | null => {
  if (!targetType || !targetId) return null;
  const t = targetType.toLowerCase();
  if (t === 'order') return `/trip-detail?orderId=${targetId}`;
  if (t === 'vehicle_owner' || t === 'vehicle_owners' || t === 'vehicleowner') return `/fleet-owner-detail?ownerId=${targetId}`;
  if (t === 'vendor' || t === 'vendors') return `/vendor-detail?vendorId=${targetId}`;
  if (t === 'admin') return '/staff-management';
  if (t === 'payout_request') return '/payout-requests';
  return null;
};

const PAGE_SIZE = 50;

type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month';
const DATE_FILTERS: { label: string; value: DateFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: '7 Days', value: 'week' },
  { label: '30 Days', value: 'month' },
];

const GOOGLE_APPS_SCRIPT_SAMPLE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID", "Timestamp", "Staff Username", "Role", "Action", "Target Type", "Target Name", "Details", "Cleared At", "Cleared By"]);
    }
    var logs = data.logs || [];
    for (var i = 0; i < logs.length; i++) {
      var log = logs[i];
      sheet.appendRow([
        log.id, log.created_at, log.admin_username, log.admin_role || '', log.action,
        log.target_type || '', log.target_name || '', JSON.stringify(log.details || {}),
        data.cleared_at, data.cleared_by
      ]);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "success", count: logs.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

const formatTargetType = (t?: string | null) => {
  if (!t) return '';
  return t.replace(/_/g, ' ').toLowerCase();
};

export default function StaffActivityScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [showRangePicker, setShowRangePicker] = useState(false);

  // Webhook Modal State
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);

  const loadData = useCallback(async (skip = 0, append = false) => {
    try {
      const res = await apiService.getActivityLog(skip, PAGE_SIZE, dateFilter, customRange || undefined);
      setTotalCount(res.total_count);
      if (append) {
        setEntries((prev) => [...prev, ...res.entries]);
      } else {
        setEntries(res.entries);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [dateFilter, customRange]);

  const handleApplyCustomRange = (from: string, to: string) => {
    setCustomRange({ from, to });
    setShowRangePicker(false);
  };

  const handleResetCustomRange = () => {
    setCustomRange(null);
    setShowRangePicker(false);
  };

  useEffect(() => {
    setLoading(true);
    loadData(0, false);
  }, [loadData]);

  const loadWebhookUrl = async () => {
    setLoadingWebhook(true);
    try {
      const res = await apiService.getActivityLogWebhookUrl();
      setWebhookUrl(res.url || '');
    } catch (e) {
      // ignore
    } finally {
      setLoadingWebhook(false);
    }
  };

  const openWebhookSettings = () => {
    loadWebhookUrl();
    setShowWebhookModal(true);
  };

  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const res = await apiService.updateActivityLogWebhookUrl(webhookUrl);
      setShowWebhookModal(false);
      Alert.alert('Success', res.message || 'Google Sheets Webhook URL updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update Webhook URL');
    } finally {
      setSavingWebhook(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData(0, false);
  };

  const loadMore = () => {
    if (loadingMore || entries.length >= totalCount) return;
    setLoadingMore(true);
    loadData(entries.length, true);
  };

  const handleClearLog = () => {
    Alert.alert(
      'Clear Activity Log',
      'Are you sure you want to clear the activity log? If a Google Sheets Webhook URL is set, logs will automatically be backed up to your Google Sheet before deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear & Backup',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiService.clearActivityLog(dateFilter);
              setEntries([]);
              setTotalCount(0);
              let msg = `Activity log cleared (${res.deleted_count} entries).`;
              if (res.webhook_triggered) {
                msg += res.webhook_success
                  ? '\n\n✅ Successfully backed up to Google Sheets!'
                  : '\n\n⚠️ Webhook triggered but Google Sheets post failed.';
              }
              Alert.alert('Success', msg);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to clear activity log');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Staff Activity Log</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{totalCount} actions recorded</Text>
        </View>
        <TouchableOpacity style={styles.sheetButton} onPress={openWebhookSettings}>
          <Link size={14} color="#10B981" />
          <Text style={styles.sheetButtonText}>Sheet Link</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearLog}>
          <Trash2 size={14} color={colors.error} />
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
        <ThemeToggle size={20} />
      </View>

      <View style={[styles.dateFilterRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {DATE_FILTERS.map((f) => {
          const active = dateFilter === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.dateFilterChip,
                { backgroundColor: active ? (isDark ? '#1E3A8A' : colors.primaryTint) : (isDark ? '#334155' : themeColors.background), borderColor: active ? colors.primary : themeColors.border },
              ]}
              onPress={() => { setCustomRange(null); setDateFilter(f.value); }}
            >
              <Text style={[styles.dateFilterChipText, { color: active ? (isDark ? '#93C5FD' : colors.primary) : themeColors.textSecondary, fontWeight: active ? '800' : '600' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[
            styles.dateFilterChip,
            { flexDirection: 'row', alignItems: 'center', gap: 4 },
            { backgroundColor: customRange ? (isDark ? '#1E3A8A' : colors.primaryTint) : (isDark ? '#334155' : themeColors.background), borderColor: customRange ? colors.primary : themeColors.border },
          ]}
          onPress={() => setShowRangePicker(true)}
        >
          <CalendarRange size={13} color={customRange ? (isDark ? '#93C5FD' : colors.primary) : themeColors.textSecondary} />
          <Text style={[styles.dateFilterChipText, { color: customRange ? (isDark ? '#93C5FD' : colors.primary) : themeColors.textSecondary, fontWeight: customRange ? '800' : '600' }]}>
            {customRange ? (customRange.from === customRange.to ? customRange.from : `${customRange.from} → ${customRange.to}`) : 'Custom Range'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
        >
          {entries.length === 0 ? (
            <View style={styles.emptyBox}>
              <History size={40} color={themeColors.textMuted} />
              <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>No activity recorded for this period.</Text>
            </View>
          ) : (
            entries.map((entry, idx) => {
              const meta = ACTION_META[entry.action] || { label: entry.action, icon: History, color: colors.primary };
              const Icon = meta.icon;
              const curDay = new Date(entry.created_at).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
              const prevDay = idx > 0 ? new Date(entries[idx - 1].created_at).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : null;
              const showDayHeader = curDay !== prevDay;

              const route = targetRoute(entry.target_type, entry.target_id);
              const CardWrapper = route ? TouchableOpacity : View;
              const cardWrapperProps = route ? { activeOpacity: 0.7, onPress: () => router.push(route as any) } : {};

              return (
                <React.Fragment key={entry.id}>
                  {showDayHeader && <Text style={[styles.dayHeader, { color: themeColors.textMuted }]}>{curDay}</Text>}
                  <CardWrapper
                    style={[styles.entryCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                    {...cardWrapperProps}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1A` }]}>
                      <Icon size={16} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.entryText, { color: themeColors.text }]}>
                        <Text style={[styles.entryUsername, { color: themeColors.text }]}>{entry.admin_username}</Text>
                        {entry.admin_role === 'Owner' && <Text style={styles.ownerTag}> (Naveen)</Text>}
                        {' '}{meta.label.toLowerCase()}{' '}
                        {!!entry.target_name && <Text style={styles.entryTarget}>{entry.target_name}</Text>}
                        {!entry.target_name && !!entry.target_type && (
                          <Text style={styles.entryTarget}>a {formatTargetType(entry.target_type)}</Text>
                        )}
                      </Text>
                      {!!entry.details && Object.keys(entry.details).length > 0 && (
                        <Text style={[styles.entryDetails, { color: themeColors.textSecondary }]} numberOfLines={2}>
                          {Object.entries(entry.details)
                            .filter(([, v]) => v !== null && v !== undefined && v !== '')
                            .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') || 'none' : v}`)
                            .join(' · ')}
                        </Text>
                      )}
                      <Text style={[styles.entryTime, { color: themeColors.textMuted }]}>
                        {new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {!!route && <ChevronRight size={16} color={themeColors.textMuted} />}
                  </CardWrapper>
                </React.Fragment>
              );
            })
          )}

          {entries.length > 0 && entries.length < totalCount && (
            <TouchableOpacity style={[styles.loadMoreButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, loadingMore && { opacity: 0.6 }]} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreButtonText}>Load More ({totalCount - entries.length} remaining)</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Google Sheets Webhook Modal */}
      <Modal visible={showWebhookModal} animationType="slide" transparent onRequestClose={() => setShowWebhookModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Link size={18} color="#10B981" />
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Google Sheets Webhook Backup</Text>
              </View>
              <TouchableOpacity onPress={() => setShowWebhookModal(false)} style={styles.modalCloseButton}>
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                Add your Google Apps Script Web App URL below. When you clear the activity log, all logs will automatically be posted to your Google Sheet before deletion.
              </Text>

              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Google Webhook URL</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: isDark ? '#1E293B' : '#F9FAFB', borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="https://script.google.com/macros/s/.../exec"
                placeholderTextColor={themeColors.textMuted}
                value={webhookUrl}
                onChangeText={setWebhookUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={styles.toggleCodeButton}
                onPress={() => setShowScriptCode(!showScriptCode)}
              >
                <Info size={14} color="#3B82F6" />
                <Text style={styles.toggleCodeText}>
                  {showScriptCode ? 'Hide Setup Instructions & Code' : 'View Google Apps Script Code & Setup Instructions'}
                </Text>
              </TouchableOpacity>

              {showScriptCode && (
                <View style={[styles.codeBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeColors.border }]}>
                  <Text style={[styles.codeStepTitle, { color: themeColors.text }]}>How to Setup (1 Minute):</Text>
                  <Text style={[styles.codeStepText, { color: themeColors.textSecondary }]}>
                    1. Open a Google Sheet{'\n'}
                    2. Go to <Text style={{ fontWeight: '700' }}>Extensions &gt; Apps Script</Text>{'\n'}
                    3. Delete existing code and paste the code below{'\n'}
                    4. Click <Text style={{ fontWeight: '700' }}>Deploy &gt; New deployment &gt; Web app</Text>{'\n'}
                    5. Set <Text style={{ fontWeight: '700' }}>Execute as: Me</Text> and <Text style={{ fontWeight: '700' }}>Who has access: Anyone</Text>{'\n'}
                    6. Click Deploy and paste the Web App URL above!
                  </Text>
                  <View style={styles.codeSnippetHeader}>
                    <Text style={styles.codeSnippetTitle}>Apps Script Code:</Text>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Apps Script Code', GOOGLE_APPS_SCRIPT_SAMPLE)}
                      style={styles.copyCodeButton}
                    >
                      <Copy size={12} color="#3B82F6" />
                      <Text style={styles.copyCodeText}>View/Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.codeText}>{GOOGLE_APPS_SCRIPT_SAMPLE}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelModalButton} onPress={() => setShowWebhookModal(false)}>
                <Text style={[styles.cancelModalText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveModalButton} onPress={handleSaveWebhook} disabled={savingWebhook}>
                {savingWebhook ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={16} color="#FFFFFF" />
                    <Text style={styles.saveModalText}>Save Webhook URL</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DateRangePickerModal
        visible={showRangePicker}
        onClose={() => setShowRangePicker(false)}
        onApply={handleApplyCustomRange}
        onReset={handleResetCustomRange}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  dayHeader: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 14, marginBottom: 6,
  },
  entryCard: {
    flexDirection: 'row', gap: 12,
    borderRadius: 6, padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  entryText: { fontSize: 13.5, lineHeight: 19 },
  entryUsername: { fontWeight: '800' },
  ownerTag: { fontWeight: '700', color: colors.warning, fontSize: 11 },
  entryTarget: { fontWeight: '700', color: colors.primary },
  entryDetails: { fontSize: 11.5, marginTop: 4, fontStyle: 'italic' },
  entryTime: { fontSize: 11, marginTop: 6 },
  loadMoreButton: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    borderRadius: 6, borderWidth: 1,
  },
  loadMoreButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  sheetButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6,
    backgroundColor: '#ECFDF5',
  },
  sheetButtonText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  clearButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6,
    backgroundColor: colors.error + '15',
  },
  clearButtonText: { fontSize: 12, fontWeight: '700', color: colors.error },
  dateFilterRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, paddingTop: 12,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  dateFilterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1,
  },
  dateFilterChipText: { fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 8,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScroll: {
    marginVertical: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 16,
  },
  toggleCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  toggleCodeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#3B82F6',
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  codeStepTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  codeStepText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  codeSnippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  codeSnippetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  copyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelModalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  cancelModalText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  saveModalText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
