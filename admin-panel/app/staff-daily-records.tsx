import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, ChevronLeft, ChevronRight as ChevronRightIcon, Send, Target, Award, CheckCircle2 } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
const formatDisplayDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function StaffDailyRecordsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<Array<{ admin_id: string; admin_username: string; note: string; submitted_at: string }>>([]);
  const [forbidden, setForbidden] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const load = async (date: Date) => {
    try {
      const res = await apiService.getStaffDailyRecords(toIsoDate(date), 0, 100);
      setRecords(res.records || []);
      setForbidden(false);
    } catch (e: any) {
      if (String(e?.message || '').includes('403') || String(e?.message || '').toLowerCase().includes('owner')) {
        setForbidden(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load(selectedDate);
  }, [selectedDate]);

  const onRefresh = () => {
    setRefreshing(true);
    load(selectedDate);
  };

  const shiftDay = (delta: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    if (next > new Date()) return;
    setSelectedDate(next);
  };

  const isToday = toIsoDate(selectedDate) === toIsoDate(new Date());

  const handleSubmitNote = async () => {
    if (!quickNote.trim()) {
      Alert.alert('Empty Note', 'Please enter a shift handover note before submitting.');
      return;
    }
    setSubmittingNote(true);
    try {
      await apiService.submitOwnDailyRecord(quickNote.trim());
      setQuickNote('');
      Alert.alert('Success', 'Shift handover note submitted successfully.');
      load(selectedDate);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit shift record.');
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: themeColors.text }]}>Staff Daily Records</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <View style={[styles.dateNav, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={[styles.dateNavBtn, { backgroundColor: isDark ? '#312E81' : colors.primaryTint }]} onPress={() => shiftDay(-1)} accessibilityLabel="Previous day">
          <ChevronLeft size={18} color={isDark ? '#818CF8' : colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.dateNavText, { color: themeColors.text }]}>{isToday ? 'Today' : formatDisplayDate(selectedDate)}</Text>
        <TouchableOpacity style={[styles.dateNavBtn, { backgroundColor: isDark ? '#312E81' : colors.primaryTint }, isToday && { opacity: 0.3 }]} onPress={() => shiftDay(1)} disabled={isToday} accessibilityLabel="Next day">
          <ChevronRightIcon size={18} color={isDark ? '#818CF8' : colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Quick link banner to Performance Dashboard */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/staff-performance' as any)}
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
          borderWidth: 1,
          borderColor: isDark ? '#3B82F640' : '#BFDBFE',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Target size={18} color="#2563EB" />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#93C5FD' : '#1D4ED8' }}>
              Staff Performance & Targets
            </Text>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              View live booking goals, response speed & leaderboard
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB' }}>View →</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : forbidden ? (
        <View style={styles.loading}><Text style={styles.emptyText}>Only Naveen can view all staff daily records.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Submit Today's Handover Note Section */}
          {isToday && (
            <View style={{
              backgroundColor: themeColors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: themeColors.border,
              padding: 14,
              marginBottom: 16,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginBottom: 8 }}>
                ✍️ Submit Shift Handover Note
              </Text>
              <TextInput
                style={{
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  padding: 10,
                  fontSize: 13,
                  color: themeColors.text,
                  minHeight: 64,
                  textAlignVertical: 'top',
                  marginBottom: 10,
                }}
                placeholder="Log your shift summary, completed bookings, or handover points..."
                placeholderTextColor={themeColors.textSecondary}
                multiline
                value={quickNote}
                onChangeText={setQuickNote}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSubmitNote}
                disabled={submittingNote}
                style={{
                  backgroundColor: '#2563EB',
                  paddingVertical: 9,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {submittingNote ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Send size={14} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>Submit Record</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {records.length === 0 ? (
            <View style={styles.emptyBox}>
              <FileText size={32} color={isDark ? '#475569' : '#CBD5E1'} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No written handover records submitted for this date.
              </Text>
              <Text style={{ fontSize: 11.5, color: themeColors.textMuted, textAlign: 'center', maxWidth: 280 }}>
                Daily live metrics (leads, bookings, KYC verifications) are automatically tracked in the Performance Dashboard.
              </Text>
            </View>
          ) : (
            records.map((r, idx) => (
              <View key={r.admin_id || idx} style={[styles.recordCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.recordHeader}>
                  <Text style={[styles.recordUsername, { color: themeColors.text }]}>{r.admin_username}</Text>
                  <Text style={styles.recordTime}>{new Date(r.submitted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={[styles.recordNote, { color: themeColors.text }]}>{r.note}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dateNavBtn: { padding: 8, backgroundColor: colors.primaryTint, borderRadius: 6 },
  dateNavText: { fontSize: 14, fontWeight: '800', color: colors.text, minWidth: 150, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  recordCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, marginBottom: 10,
  },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recordUsername: { fontSize: 14, fontWeight: '800', color: colors.text },
  recordTime: { fontSize: 11, color: colors.textMuted },
  recordNote: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
});
