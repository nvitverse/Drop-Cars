import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, History } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Settings > Referral Bonus: the flat amount credited to a fleet owner's
// wallet when their referral code is used (crud/referrals.py already has
// the full apply/credit logic - this screen just exposes the existing
// GET/PUT /admin/referral-settings config). The "view usage/payouts" list
// (who referred whom, how much was paid out) lives at referral-history.tsx.
export default function ReferralSettingsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const settings = await apiService.getReferralSettings();
      setAmount(String(settings.referral_bonus_amount));
    } catch (e: any) {
      console.warn('Failed to load referral setting:', e);
      showToast(e?.message || 'Failed to load setting', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 0) {
      Alert.alert('Invalid', 'Enter a valid bonus amount');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateReferralSettings(value);
      showToast(`Referral bonus updated to ₹${value}.`, 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Referral Bonus</Text>
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#EA580C" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardHeader}>
              <Gift size={18} color="#EA580C" />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Bonus Amount (₹)</Text>
            </View>
            <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
              Credited to a fleet owner's wallet when a new signup uses their referral code, and
              to a customer's account on qualifying referred bookings. Applies platform-wide.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="e.g. 100"
              placeholderTextColor={themeColors.textMuted}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.historyBtn, { borderColor: '#EA580C' }]} onPress={() => router.push('/referral-history')}>
            <History size={16} color="#EA580C" />
            <Text style={styles.historyBtnText}>View Referral History</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937' },
  card: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 10 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  saveBtn: {
    backgroundColor: '#EA580C',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#EA580C',
    borderRadius: 6,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 40,
  },
  historyBtnText: { color: '#EA580C', fontWeight: '700', fontSize: 14 },
});
