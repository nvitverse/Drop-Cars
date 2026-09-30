import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock, ShieldCheck, Bell, ShieldAlert, Save } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import Toast, { useToast } from '@/components/Toast';

export default function AssignmentPrioritySettingsScreen() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const { themeColors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [priorityHours, setPriorityHours] = useState('3');
  const [priorityPct, setPriorityPct] = useState('50');
  const [assignmentDefaultMins, setAssignmentDefaultMins] = useState('30');
  const [assignmentPct, setAssignmentPct] = useState('50');
  const [assignmentMinMins, setAssignmentMinMins] = useState('7');
  const [alarmPct, setAlarmPct] = useState('50');
  const [alarmDurationSecs, setAlarmDurationSecs] = useState('15');
  const [graceUnder1hMins, setGraceUnder1hMins] = useState('5');
  const [graceOver1hMins, setGraceOver1hMins] = useState('30');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAssignmentPrioritySettings();
      if (data) {
        setPriorityHours(String(data.priority_cutoff_hours ?? 3));
        setPriorityPct(String(data.priority_cutoff_pct ?? 50));
        setAssignmentDefaultMins(String(data.assignment_default_mins ?? 30));
        setAssignmentPct(String(data.assignment_pct ?? 50));
        setAssignmentMinMins(String(data.assignment_min_mins ?? 7));
        setAlarmPct(String(data.alarm_pct ?? 50));
        setAlarmDurationSecs(String(data.alarm_duration_secs ?? 15));
        setGraceUnder1hMins(String(data.grace_under_1h_mins ?? 5));
        setGraceOver1hMins(String(data.grace_over_1h_mins ?? 30));
      }
    } catch (error: any) {
      showToast(error?.message || 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiService.updateAssignmentPrioritySettings({
        priority_cutoff_hours: parseInt(priorityHours, 10) || 3,
        priority_cutoff_pct: parseInt(priorityPct, 10) || 50,
        assignment_default_mins: parseInt(assignmentDefaultMins, 10) || 30,
        assignment_pct: parseInt(assignmentPct, 10) || 50,
        assignment_min_mins: parseInt(assignmentMinMins, 10) || 7,
        alarm_pct: parseInt(alarmPct, 10) || 50,
        alarm_duration_secs: parseInt(alarmDurationSecs, 10) || 15,
        grace_under_1h_mins: parseInt(graceUnder1hMins, 10) || 5,
        grace_over_1h_mins: parseInt(graceOver1hMins, 10) || 30,
      });
      showToast('Assignment & Priority Settings saved!', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
      {/* Header */}
      <View style={[styles.header, { borderColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Assignment & Priority Rules</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Configure automated search, alarm, and penalty timings
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section 1: Priority Window Rules */}
        <View style={[styles.card, { backgroundColor: (themeColors as any).card || '#FFFFFF', borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <ShieldCheck size={20} color="#1D4ED8" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>1. Priority Window Rules</Text>
          </View>

          <Text style={styles.fieldLabel}>Default Priority Cutoff Before Pickup (Hours)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={priorityHours}
            onChangeText={setPriorityHours}
            keyboardType="numeric"
            placeholder="3"
          />
          <Text style={styles.fieldHint}>Used when pickup is &gt; 6 hrs away (e.g. 3 hrs before pickup).</Text>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Priority Window % for Closer Pickups (&le; 6h)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={priorityPct}
            onChangeText={setPriorityPct}
            keyboardType="numeric"
            placeholder="50"
          />
          <Text style={styles.fieldHint}>Percentage of time remaining from now until pickup (e.g. 50%).</Text>
        </View>

        {/* Section 2: Driver Assignment Timings */}
        <View style={[styles.card, { backgroundColor: (themeColors as any).card || '#FFFFFF', borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <Clock size={20} color="#059669" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>2. Driver Assignment Timings</Text>
          </View>

          <Text style={styles.fieldLabel}>Default Assignment Time (Minutes)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={assignmentDefaultMins}
            onChangeText={setAssignmentDefaultMins}
            keyboardType="numeric"
            placeholder="30"
          />
          <Text style={styles.fieldHint}>Standard time allowed for driver details assignment (pickup &gt; 1h).</Text>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Assignment % for Pickups &le; 1 Hour</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={assignmentPct}
            onChangeText={setAssignmentPct}
            keyboardType="numeric"
            placeholder="50"
          />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Minimum Assignment Time Limit (Minutes)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={assignmentMinMins}
            onChangeText={setAssignmentMinMins}
            keyboardType="numeric"
            placeholder="7"
          />
          <Text style={styles.fieldHint}>Never drops below this threshold (Default: 7 mins).</Text>
        </View>

        {/* Section 3: Alarm & Ops Alert */}
        <View style={[styles.card, { backgroundColor: (themeColors as any).card || '#FFFFFF', borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <Bell size={20} color="#D97706" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>3. Assignment Alarm & Need Help</Text>
          </View>

          <Text style={styles.fieldLabel}>Alarm Trigger Threshold (% of Assignment Time)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={alarmPct}
            onChangeText={setAlarmPct}
            keyboardType="numeric"
            placeholder="50"
          />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Alarm Popup Duration (Seconds)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={alarmDurationSecs}
            onChangeText={setAlarmDurationSecs}
            keyboardType="numeric"
            placeholder="15"
          />
          <Text style={styles.fieldHint}>Popup stays active with "Need Help" and "Assign Now" buttons.</Text>
        </View>

        {/* Section 4: Penalty Grace Period & Feed Re-entry */}
        <View style={[styles.card, { backgroundColor: (themeColors as any).card || '#FFFFFF', borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <ShieldAlert size={20} color="#DC2626" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>4. Penalty Grace & Feed Re-entry</Text>
          </View>

          <Text style={styles.fieldLabel}>Grace Window to Re-accept (&le; 1 Hour Pickup) (Mins)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={graceUnder1hMins}
            onChangeText={setGraceUnder1hMins}
            keyboardType="numeric"
            placeholder="5"
          />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Grace Window to Re-accept (&gt; 1 Hour Pickup) (Mins)</Text>
          <TextInput
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={graceOver1hMins}
            onChangeText={setGraceOver1hMins}
            keyboardType="numeric"
            placeholder="30"
          />
          <Text style={styles.fieldHint}>Original driver can re-accept within this window to waive penalty.</Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Save size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Assignment & Priority Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    padding: 6,
    borderRadius: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
    color: '#475569',
  },
  input: {
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  fieldHint: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
    paddingVertical: 14,
    borderRadius: 6,
    gap: 8,
    marginTop: 8,
    marginBottom: 30,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
  },
});
