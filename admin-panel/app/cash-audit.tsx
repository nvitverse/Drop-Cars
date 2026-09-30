import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, AlertTriangle, Check, Save } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import LoadingSpinner from '@/components/LoadingSpinner';

interface FlaggedTrip {
  end_record_id: number;
  order_id: number;
  driver_id: string;
  cash_collection: number | null;
  driver_profit: number | null;
  mismatch_amount: number | null;
  cleared: boolean;
  updated_at: string;
}

export default function CashAuditScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState('500');
  const [savedThreshold, setSavedThreshold] = useState(500);
  const [trips, setTrips] = useState<FlaggedTrip[]>([]);
  const [clearingId, setClearingId] = useState<number | null>(null);

  const load = async () => {
    try {
      const [settings, flagged] = await Promise.all([
        apiService.getCashAuditSettings(),
        apiService.getFlaggedTrips(),
      ]);
      setThreshold(String(settings.cash_mismatch_threshold));
      setSavedThreshold(settings.cash_mismatch_threshold);
      setTrips(flagged || []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load cash audit data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveThreshold = async () => {
    const val = parseInt(threshold, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert('Invalid', 'Enter a non-negative threshold');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateCashAuditSettings(val);
      setSavedThreshold(val);
      showToast('Cash audit threshold updated', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update threshold');
    } finally {
      setSaving(false);
    }
  };

  const clearFlag = async (item: FlaggedTrip) => {
    setClearingId(item.end_record_id);
    try {
      await apiService.clearCashFlag(item.end_record_id);
      setTrips((prev) => prev.filter((t) => t.end_record_id !== item.end_record_id));
      showToast(`Flag cleared for Order #${item.order_id}`, 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to clear flag');
    } finally {
      setClearingId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Cash Mismatch Review ({trips.length})</Text>
        <ThemeToggle size={20} />
      </View>

      <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
        Flagged when cash collected by driver exceeds expected profit by threshold amount.
      </Text>

      <View style={styles.thresholdRow}>
        <Text style={[styles.thresholdLabel, { color: themeColors.textSecondary }]}>Threshold (₹):</Text>
        <TextInput
          style={[styles.thresholdInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="number-pad"
        />
        <TouchableOpacity
          style={[styles.saveBtn, (saving || parseInt(threshold, 10) === savedThreshold) && { opacity: 0.5 }]}
          onPress={saveThreshold}
          disabled={saving}
          accessibilityLabel="Save threshold"
        >
          {saving ? <ActivityIndicator size="small" color="white" /> : <Save size={16} color="white" />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => String(item.end_record_id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <AlertTriangle size={18} color="#F59E0B" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: themeColors.text }]}>Order #{item.order_id}</Text>
              <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>
                Cash collected: ₹{item.cash_collection ?? '-'} • Driver profit: ₹{item.driver_profit ?? '-'}
              </Text>
              <Text style={styles.rowMismatch}>Mismatch: ₹{item.mismatch_amount}</Text>
              <Text style={[styles.rowDate, { color: themeColors.textMuted }]}>{new Date(item.updated_at).toLocaleString()}</Text>
            </View>
            <TouchableOpacity
              onPress={() => clearFlag(item)}
              style={[styles.clearBtn, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }, clearingId === item.end_record_id && { opacity: 0.5 }]}
              disabled={clearingId === item.end_record_id}
            >
              <Check size={14} color="#10B981" />
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No flagged trips</Text>}
      />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingTop: 12, lineHeight: 17 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  thresholdLabel: { fontSize: 13, fontWeight: '600' },
  thresholdInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveBtn: { backgroundColor: '#3B82F6', borderRadius: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowMismatch: { fontSize: 12, color: '#EF4444', fontWeight: '600', marginTop: 2 },
  rowDate: { fontSize: 11, marginTop: 4 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
  },
  clearBtnText: { color: '#10B981', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 13 },
});
