import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
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

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : forbidden ? (
        <View style={styles.loading}><Text style={styles.emptyText}>Only Naveen can view staff daily records.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {records.length === 0 ? (
            <View style={styles.emptyBox}>
              <FileText size={28} color="#CBD5E1" />
              <Text style={styles.emptyText}>No records submitted for this day yet.</Text>
            </View>
          ) : (
            records.map((r) => (
              <View key={r.admin_id} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordUsername}>{r.admin_username}</Text>
                  <Text style={styles.recordTime}>{new Date(r.submitted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={styles.recordNote}>{r.note}</Text>
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
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  recordCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    padding: 14, marginBottom: 10,
  },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recordUsername: { fontSize: 14, fontWeight: '800', color: colors.text },
  recordTime: { fontSize: 11, color: colors.textMuted },
  recordNote: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
});
