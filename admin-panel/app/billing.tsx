import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, IndianRupee, Save, Play, CalendarClock, AlertTriangle } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface BillingSummary {
  dry_run: boolean;
  enabled: boolean;
  yearly_fee: number;
  suspend_threshold: number;
  charged: any[];
  suspended: any[];
  reactivated: any[];
  warnings: string[];
}

export default function BillingScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [applyingCycle, setApplyingCycle] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [yearlyFee, setYearlyFee] = useState('0');
  const [monthlyFee, setMonthlyFee] = useState('199');
  const [threshold, setThreshold] = useState('-100');
  const [monthlyMinWalletFloor, setMonthlyMinWalletFloor] = useState('500');
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  const loadSettings = async () => {
    try {
      const s = await apiService.getBillingSettings();
      setEnabled(s.billing_enabled);
      setYearlyFee(String(s.yearly_fee || 0));
      setMonthlyFee(String(s.monthly_fee || 199));
      setThreshold(String(s.suspend_threshold || -100));
      setMonthlyMinWalletFloor(String(s.monthly_min_wallet_floor || 500));
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load billing settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiService.updateBillingSettings({
        billing_enabled: enabled,
        yearly_fee: parseFloat(yearlyFee) || 0,
        monthly_fee: parseFloat(monthlyFee) || 199,
        suspend_threshold: parseFloat(threshold) || -100,
        monthly_min_wallet_floor: parseFloat(monthlyMinWalletFloor) || 500,
      });
      showToast('Billing settings saved!', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunBilling = async (dryRun: boolean) => {
    setRunning(true);
    setSummary(null);
    try {
      const res = await apiService.runBilling(dryRun);
      setSummary(res);
      if (!dryRun) {
        showToast('Billing cycle executed live.', 'success');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Billing cycle failed');
    } finally {
      setRunning(false);
    }
  };

  const handleApplyMonthlyCycleNow = async () => {
    Alert.alert(
      'Apply Monthly Billing Cycle Now?',
      `Deduct ₹${monthlyFee} monthly platform fee from active partners (unless wallet balance is below ₹${monthlyMinWalletFloor}). Confirm?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply Cycle',
          onPress: async () => {
            setApplyingCycle(true);
            try {
              const res = await apiService.startBillingCycle(false);
              showToast(res.message || 'Monthly billing applied', 'success');
              setSummary({
                dry_run: false,
                enabled: true,
                yearly_fee: parseFloat(yearlyFee) || 0,
                suspend_threshold: parseFloat(threshold) || -100,
                charged: res.charged || [],
                suspended: [],
                reactivated: [],
                warnings: [],
              });
            } catch (e: any) {
              Alert.alert('Failed', e?.message || 'Failed to apply monthly cycle');
            } finally {
              setApplyingCycle(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Platform Billing Engine</Text>
        <View style={{ flex: 1 }} />
        <ThemeToggle size={20} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>Billing Automation</Text>
          <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>
            Automatically deduct monthly platform fees from partner wallets and suspend accounts with negative balance.
          </Text>

          <View style={styles.switchRow}>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: isDark ? '#334155' : '#D1D5DB', true: '#3B82F6' }}
            />
            <Text style={{ fontSize: 15, fontWeight: '600', color: themeColors.text }}>
              Automated Billing {enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>

          {!enabled && (
            <View style={[styles.warnBanner, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
              <AlertTriangle size={18} color={isDark ? '#FDE68A' : '#B45309'} />
              <Text style={[styles.warnText, { color: isDark ? '#FDE68A' : '#B45309' }]}>
                Automated background billing is off. Manual billing cycles can still be run below.
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, marginTop: 16 }}>
            Monthly Platform Fee (₹)
          </Text>
          <View style={[styles.inputRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <IndianRupee size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              value={monthlyFee}
              onChangeText={setMonthlyFee}
              keyboardType="number-pad"
            />
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, marginTop: 16 }}>
            Minimum Wallet Floor for Monthly Fee (₹)
          </Text>
          <View style={[styles.inputRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <IndianRupee size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              value={monthlyMinWalletFloor}
              onChangeText={setMonthlyMinWalletFloor}
              keyboardType="number-pad"
            />
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, marginTop: 16 }}>
            Negative Balance Suspension Threshold (₹)
          </Text>
          <View style={[styles.inputRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <IndianRupee size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.input, { color: themeColors.text }]}
              value={threshold}
              onChangeText={setThreshold}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? <LoadingSpinner size="small" color="white" /> : (
              <>
                <Save size={18} color="white" />
                <Text style={styles.saveButtonText}>Save Billing Settings</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>Manual Billing Execution</Text>
          <Text style={[styles.cardHint, { color: themeColors.textSecondary }]}>
            Run a preview dry-run to see what will happen, or execute a monthly billing cycle immediately.
          </Text>

          <TouchableOpacity
            style={[styles.previewButton, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]}
            onPress={() => handleRunBilling(true)}
            disabled={running}
          >
            {running ? <LoadingSpinner size="small" color="#3B82F6" /> : (
              <>
                <Play size={18} color={isDark ? '#93C5FD' : '#3B82F6'} />
                <Text style={[styles.previewButtonText, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>Run Dry-Run Preview</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.runButton, applyingCycle && { opacity: 0.6 }]}
            onPress={handleApplyMonthlyCycleNow}
            disabled={applyingCycle}
          >
            {applyingCycle ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <CalendarClock size={18} color="white" />
                <Text style={styles.runButtonText}>Apply Monthly Cycle Now (Live)</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {summary && (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              Cycle Summary {summary.dry_run ? '(Dry-Run Preview)' : '(Live Execution)'}
            </Text>

            <View style={[styles.summaryRow, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Partners Charged</Text>
              <Text style={[styles.summaryValue, { color: themeColors.text }]}>{summary.charged.length}</Text>
            </View>

            <View style={[styles.summaryRow, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Accounts Suspended</Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{summary.suspended.length}</Text>
            </View>

            <View style={[styles.summaryRow, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Accounts Reactivated</Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>{summary.reactivated.length}</Text>
            </View>

            {summary.charged.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginBottom: 6 }}>
                  Charged Partners:
                </Text>
                {summary.charged.map((c: any, i: number) => (
                  <View key={i} style={styles.chargeItem}>
                    <Text style={[styles.chargeName, { color: themeColors.text }]}>{c.full_name || c.name || `ID #${c.id}`}</Text>
                    <Text style={[styles.chargeBalance, { color: themeColors.textSecondary }]}>-₹{c.amount || monthlyFee}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  card: {
    borderRadius: 6,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  cardHint: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    padding: 10,
    marginTop: 12,
  },
  warnText: { flex: 1, fontSize: 13, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 14 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 14,
    marginTop: 20,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 14,
    marginBottom: 12,
  },
  previewButtonText: { fontSize: 15, fontWeight: '600' },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingVertical: 14,
  },
  runButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  chargeName: { fontSize: 14, flex: 1 },
  chargeBalance: { fontSize: 13 },
});
