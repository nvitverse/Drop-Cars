import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Target, ShieldAlert, ShieldCheck, ToggleLeft, Wallet, UserPlus, Settings2, UserMinus, Trash2, Package } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  PERMANENT_BLOCK: { label: 'Permanent blocks', icon: ShieldAlert, color: colors.error },
  PERMANENT_UNBLOCK: { label: 'Permanent unblocks', icon: ShieldCheck, color: colors.success },
  ACCOUNT_STATUS_CHANGE: { label: 'Account status changes', icon: ToggleLeft, color: colors.warning },
  WALLET_ADJUST: { label: 'Wallet adjustments', icon: Wallet, color: colors.primary },
  STAFF_CREATED: { label: 'Staff members added', icon: UserPlus, color: colors.success },
  STAFF_PERMISSIONS_UPDATED: { label: 'Permission updates', icon: Settings2, color: colors.primary },
  STAFF_REMOVED: { label: 'Staff members removed', icon: UserMinus, color: colors.error },
  PAYOUT_MARKED_PAID: { label: 'Payouts marked paid', icon: Wallet, color: colors.success },
  DIRECT_PAYOUT: { label: 'Direct payouts', icon: Wallet, color: colors.primary },
  ACCOUNT_DELETED: { label: 'Accounts deleted', icon: ShieldAlert, color: colors.error },
  BOOKING_CREATED: { label: 'Bookings created', icon: Package, color: colors.primary },
  ACTIVITY_LOG_CLEARED: { label: 'Activity log cleared', icon: Trash2, color: colors.textSecondary },
};

export default function StaffDailyRecordScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<{ target: number; achieved: number; breakdown: Record<string, number> } | null>(null);
  const [note, setNote] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([
        apiService.getStaffTodayTarget(),
        apiService.getOwnDailyRecord(),
      ]);
      setTarget(t);
      setNote(r.note || '');
      setSubmittedAt(r.submitted_at);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async () => {
    if (!note.trim()) {
      Alert.alert('Note required', 'Please write a brief summary of what you worked on today.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiService.submitOwnDailyRecord(note.trim());
      setSubmittedAt(res.submitted_at);
      Alert.alert('Submitted!', 'Daily record saved successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to submit record');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const pct = target ? Math.min(100, Math.round((target.achieved / (target.target || 1)) * 100)) : 0;
  const entries = target?.breakdown ? Object.entries(target.breakdown).filter(([, c]) => c > 0) : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Today's Work Record</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {target && (
          <>
            <View style={[styles.progressCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Target size={16} color={colors.primary} />
                <Text style={[styles.progressTarget, { color: themeColors.textSecondary }]}>Target: {target.target} actions</Text>
              </View>
              <Text style={styles.progressValue}>{target.achieved} / {target.target}</Text>
              <View style={[styles.progressTrack, { backgroundColor: themeColors.border }]}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              {pct >= 100 && (
                <Text style={styles.metText}>Goal Met! 🎉</Text>
              )}
            </View>

            {entries.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Action Breakdown Today</Text>
                <View style={[styles.breakdownCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  {entries.map(([action, count], idx) => {
                    const meta = ACTION_META[action] || { label: action, icon: Target, color: colors.primary };
                    const Icon = meta.icon;
                    const isLast = idx === entries.length - 1;
                    return (
                      <View key={action} style={[styles.breakdownRow, { borderBottomColor: themeColors.border }, isLast && { borderBottomWidth: 0 }]}>
                        <View style={[styles.breakdownIconWrap, { backgroundColor: `${meta.color}1A` }]}>
                          <Icon size={16} color={meta.color} />
                        </View>
                        <Text style={[styles.breakdownLabel, { color: themeColors.text }]}>{meta.label}</Text>
                        <Text style={[styles.breakdownCount, { color: themeColors.text }]}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.sectionLabel}>Submit Today's Record</Text>
        <Text style={[styles.hint, { color: themeColors.textSecondary }]}>A short note about what you worked on today - issues faced, pending items, anything Naveen should know.</Text>
        <TextInput
          style={[styles.noteInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="e.g. Verified 6 fleet owner documents, followed up with 2 pending payout requests..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={6}
          placeholderTextColor={themeColors.textMuted}
        />
        {submittedAt && (
          <View style={styles.submittedRow}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text style={[styles.submittedText, { color: themeColors.textSecondary }]}>Last saved {new Date(submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.submitBtnText}>{submittedAt ? 'Update Record' : 'Submit Record'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800' },
  progressCard: {
    borderWidth: 1, borderRadius: 8,
    padding: 18, alignItems: 'center', gap: 8,
  },
  progressValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  progressTarget: { fontSize: 14, fontWeight: '700' },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  metText: { fontSize: 12.5, fontWeight: '700', color: colors.success, marginTop: 2 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 20, marginBottom: 8,
  },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  breakdownCard: {
    borderWidth: 1, borderRadius: 8, overflow: 'hidden',
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  breakdownIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  breakdownLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  breakdownCount: { fontSize: 14, fontWeight: '800' },
  noteInput: {
    borderWidth: 1, borderRadius: 6,
    padding: 14, fontSize: 14, minHeight: 120, textAlignVertical: 'top',
  },
  submittedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  submittedText: { fontSize: 12 },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 16,
  },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
