import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  Clock,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Activity,
  ArrowLeft,
  Calendar,
  Save,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useAuthPermissions } from '@/utils/auth';
import { useTheme } from '@/context/ThemeContext';
import { triggerTestEnquiryAlarm } from '@/components/EnquiryAlarmHost';
import AlertHealthModal from '@/components/AlertHealthModal';

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export default function AlarmSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();
  const { isOwner, loading: authLoading } = useAuthPermissions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [healthModalVisible, setHealthModalVisible] = useState(false);

  // Alarm settings state
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [ringSeconds, setRingSeconds] = useState(15);
  const [repeatMinutes, setRepeatMinutes] = useState(3);
  const [schedule, setSchedule] = useState<Record<string, Array<{ start: string; end: string }>>>({});
  const [staffOverrides, setStaffOverrides] = useState<Record<string, { enabled: boolean }>>({});
  const [staffList, setStaffList] = useState<
    Array<{
      id: string;
      full_name: string;
      email: string;
      role: string;
      is_on_duty: boolean;
      alarm_enabled: boolean;
      booking_alarm_enabled: boolean;
    }>
  >([]);

  // Booking Alarm ("unassigned booking about to hit pickup time") - separate
  // from the enquiry alarm above, same who/how-long shape the owner asked
  // for (2026-09-30).
  const [bookingGlobalEnabled, setBookingGlobalEnabled] = useState(true);
  const [bookingThresholdMinutes, setBookingThresholdMinutes] = useState(60);
  const [bookingStaffOverrides, setBookingStaffOverrides] = useState<Record<string, { enabled: boolean }>>({});

  const [activeDay, setActiveDay] = useState('mon');
  const [startTimeInput, setStartTimeInput] = useState('07:00');
  const [endTimeInput, setEndTimeInput] = useState('22:00');

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getFullAlarmConfig();
      if (res) {
        setGlobalEnabled(res.enquiry_alarm_enabled ?? true);
        setRingSeconds(res.enquiry_alarm_ring_seconds || 15);
        setRepeatMinutes(res.enquiry_alarm_repeat_minutes || 3);
        setSchedule(res.enquiry_alarm_schedule || {});
        setStaffOverrides(res.enquiry_alarm_staff || {});
        setStaffList(res.staff_list || []);
        setBookingGlobalEnabled(res.booking_alarm_enabled ?? true);
        setBookingThresholdMinutes(res.booking_alarm_unassigned_threshold_minutes || 60);
        setBookingStaffOverrides(res.booking_alarm_staff || {});

        const daySchedule = res.enquiry_alarm_schedule?.[activeDay];
        if (daySchedule && daySchedule.length > 0) {
          setStartTimeInput(daySchedule[0].start || '07:00');
          setEndTimeInput(daySchedule[0].end || '22:00');
        }
      }
    } catch (err: any) {
      if (!isOwner) {
        // Staff role: handled by permission UI
      } else {
        Alert.alert('Error', err?.message || 'Failed to load alarm configuration');
      }
    } finally {
      setLoading(false);
    }
  }, [isOwner, activeDay]);

  useEffect(() => {
    if (!authLoading) {
      loadConfig();
    }
  }, [authLoading, loadConfig]);

  const handleDaySelect = (dayKey: string) => {
    setActiveDay(dayKey);
    const daySchedule = schedule[dayKey];
    if (daySchedule && daySchedule.length > 0) {
      setStartTimeInput(daySchedule[0].start || '07:00');
      setEndTimeInput(daySchedule[0].end || '22:00');
    } else {
      setStartTimeInput('07:00');
      setEndTimeInput('22:00');
    }
  };

  const handleSaveScheduleWindow = () => {
    const updated = { ...schedule };
    updated[activeDay] = [{ start: startTimeInput.trim(), end: endTimeInput.trim() }];
    setSchedule(updated);
  };

  const handleToggleStaffAlarm = (staffId: string, currentVal: boolean) => {
    setStaffOverrides((prev) => ({
      ...prev,
      [staffId]: { enabled: !currentVal },
    }));
    setStaffList((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, alarm_enabled: !currentVal } : s))
    );
  };

  const handleToggleStaffBookingAlarm = (staffId: string, currentVal: boolean) => {
    setBookingStaffOverrides((prev) => ({
      ...prev,
      [staffId]: { enabled: !currentVal },
    }));
    setStaffList((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, booking_alarm_enabled: !currentVal } : s))
    );
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      await apiService.updateFullAlarmConfig({
        enquiry_alarm_enabled: globalEnabled,
        enquiry_alarm_schedule: schedule,
        enquiry_alarm_staff: staffOverrides,
        enquiry_alarm_repeat_minutes: repeatMinutes,
        enquiry_alarm_ring_seconds: ringSeconds,
        booking_alarm_enabled: bookingGlobalEnabled,
        booking_alarm_staff: bookingStaffOverrides,
        booking_alarm_unassigned_threshold_minutes: bookingThresholdMinutes,
      });
      Alert.alert('Success', 'Enquiry alarm configuration saved successfully.');
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message || 'Could not update alarm settings');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (!isOwner) {
    router.replace('/(tabs)' as any);
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Screen Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9', paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={18} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Enquiry Alarm Control</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Master switches & staff dispatch schedule
          </Text>
        </View>
        <TouchableOpacity style={[styles.saveHeaderBtn, { backgroundColor: themeColors.primary }]} onPress={handleSaveAll} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Save size={16} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Master Global Switch Card */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bell size={18} color={globalEnabled ? '#10B981' : '#EF4444'} />
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Master Alarm Switch</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.textSecondary }]}>
                  {globalEnabled ? 'Alarm enabled across organisation' : 'All incoming enquiry alarms muted'}
                </Text>
              </View>
            </View>
            <Switch
              value={globalEnabled}
              onValueChange={setGlobalEnabled}
              trackColor={{ false: '#CBD5E1', true: '#10B981' }}
            />
          </View>
        </View>

        {/* Timing Parameters */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Alarm Ring & Escalation Cycle</Text>
          <View style={styles.paramGrid}>
            <View style={styles.paramItem}>
              <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>Ring Duration (seconds)</Text>
              <TextInput
                style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
                keyboardType="numeric"
                value={String(ringSeconds)}
                onChangeText={(v) => setRingSeconds(parseInt(v, 10) || 15)}
              />
            </View>
            <View style={styles.paramItem}>
              <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>Repeat Interval (minutes)</Text>
              <TextInput
                style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
                keyboardType="numeric"
                value={String(repeatMinutes)}
                onChangeText={(v) => setRepeatMinutes(parseInt(v, 10) || 3)}
              />
            </View>
          </View>
        </View>

        {/* Weekly Schedule Window Editor */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Calendar size={18} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Weekly Active Windows (IST)</Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: themeColors.textSecondary, marginBottom: 12 }]}>
            Outside these windows, enquiries are listed silently without alarms.
          </Text>

          {/* Day Chips */}
          <View style={styles.dayChipsRow}>
            {DAYS_OF_WEEK.map((d) => {
              const isSelected = activeDay === d.key;
              return (
                <TouchableOpacity
                  key={d.key}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: isSelected ? themeColors.primary : isDark ? '#334155' : '#F1F5F9',
                      borderColor: isSelected ? themeColors.primary : isDark ? '#475569' : '#E2E8F0',
                    },
                  ]}
                  onPress={() => handleDaySelect(d.key)}
                >
                  <Text style={[styles.dayChipText, { color: isSelected ? '#FFFFFF' : themeColors.text }]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Time window inputs for selected day */}
          <View style={styles.timeWindowBox}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>Start Time (HH:MM)</Text>
              <TextInput
                style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
                value={startTimeInput}
                onChangeText={setStartTimeInput}
                placeholder="07:00"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>End Time (HH:MM)</Text>
              <TextInput
                style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
                value={endTimeInput}
                onChangeText={setEndTimeInput}
                placeholder="22:00"
                placeholderTextColor={themeColors.textSecondary}
              />
            </View>
            <TouchableOpacity style={[styles.applyDayBtn, { backgroundColor: themeColors.primary }]} onPress={handleSaveScheduleWindow}>
              <Text style={styles.applyDayBtnText}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Per-Staff Overrides */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Users size={18} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Staff Member Alarm Controls</Text>
          </View>

          {staffList.length === 0 ? (
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No staff accounts found.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {staffList.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.staffRow,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.staffName, { color: themeColors.text }]}>{s.full_name || s.email}</Text>
                      {s.is_on_duty ? (
                        <View style={styles.dutyBadge}>
                          <Text style={styles.dutyBadgeText}>On Duty</Text>
                        </View>
                      ) : (
                        <View style={[styles.dutyBadge, { backgroundColor: 'rgba(156, 163, 175, 0.2)' }]}>
                          <Text style={[styles.dutyBadgeText, { color: themeColors.textSecondary }]}>Off Duty</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.staffRole, { color: themeColors.textSecondary }]}>
                      {s.role} • {s.email}
                    </Text>
                  </View>
                  <Switch
                    value={s.alarm_enabled}
                    onValueChange={() => handleToggleStaffAlarm(s.id, s.alarm_enabled)}
                    trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Booking Alarm ("unassigned booking about to hit pickup time") */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color={bookingGlobalEnabled ? '#10B981' : '#EF4444'} />
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Booking Alarm</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.textSecondary }]}>
                  Unassigned bookings with pickup coming up soon
                </Text>
              </View>
            </View>
            <Switch
              value={bookingGlobalEnabled}
              onValueChange={setBookingGlobalEnabled}
              trackColor={{ false: '#CBD5E1', true: '#10B981' }}
            />
          </View>

          <View style={[styles.paramItem, { marginTop: 10 }]}>
            <Text style={[styles.paramLabel, { color: themeColors.textSecondary }]}>Alert when pickup is within (minutes)</Text>
            <TextInput
              style={[styles.input, { color: themeColors.text, borderColor: isDark ? '#475569' : '#CBD5E1' }]}
              keyboardType="numeric"
              value={String(bookingThresholdMinutes)}
              onChangeText={(v) => setBookingThresholdMinutes(parseInt(v, 10) || 60)}
            />
          </View>
        </View>

        {/* Per-Staff Booking Alarm Overrides */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Users size={18} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Who Gets the Booking Alarm</Text>
          </View>

          {staffList.length === 0 ? (
            <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No staff accounts found.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {staffList.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.staffRow,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.staffName, { color: themeColors.text }]}>{s.full_name || s.email}</Text>
                    <Text style={[styles.staffRole, { color: themeColors.textSecondary }]}>
                      {s.role} • {s.email}
                    </Text>
                  </View>
                  <Switch
                    value={s.booking_alarm_enabled}
                    onValueChange={() => handleToggleStaffBookingAlarm(s.id, s.booking_alarm_enabled)}
                    trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Test Alarm & Alert Diagnostics Trigger */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={[styles.testBtn, { backgroundColor: '#F59E0B' }]} onPress={() => triggerTestEnquiryAlarm()}>
            <PlayCircle size={16} color="#FFFFFF" />
            <Text style={styles.testBtnText}>Test Alarm Now (5s Popup)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.healthBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
            onPress={() => setHealthModalVisible(true)}
          >
            <Activity size={16} color={themeColors.primary} />
            <Text style={[styles.healthBtnText, { color: themeColors.text }]}>Alert Health Diagnostics</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AlertHealthModal visible={healthModalVisible} onClose={() => setHealthModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11.5,
  },
  saveHeaderBtn: {
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  paramGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  paramItem: {
    flex: 1,
  },
  paramLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    fontWeight: '700',
  },
  dayChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayChipText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  timeWindowBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  applyDayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyDayBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  staffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  staffName: {
    fontSize: 13,
    fontWeight: '700',
  },
  staffRole: {
    fontSize: 11.5,
    marginTop: 2,
  },
  dutyBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dutyBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomActions: {
    gap: 10,
    marginTop: 6,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  healthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  healthBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  restrictedBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  restrictedTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },
  restrictedText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
