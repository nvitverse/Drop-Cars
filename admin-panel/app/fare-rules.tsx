import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calculator } from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import { Card, Btn, SkeletonRow } from '@/components/ui';

export default function FareRulesScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [onewayMinKm, setOnewayMinKm] = useState('');
  const [roundTripMinKmPerDay, setRoundTripMinKmPerDay] = useState('');
  const [multicityMinKmPerDay, setMulticityMinKmPerDay] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rules = await apiService.getFareRules();
      setOnewayMinKm(String(rules.oneway_min_km));
      setRoundTripMinKmPerDay(String(rules.round_trip_min_km_per_day));
      setMulticityMinKmPerDay(String(rules.multicity_min_km_per_day));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load fare rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const oneway = parseInt(onewayMinKm, 10);
    const roundTrip = parseInt(roundTripMinKmPerDay, 10);
    const multicity = parseInt(multicityMinKmPerDay, 10);
    if ([oneway, roundTrip, multicity].some((n) => isNaN(n) || n <= 0)) {
      Alert.alert('Invalid', 'Enter a positive number of kilometers for every field');
      return;
    }
    setSaving(true);
    try {
      await apiService.updateFareRules({
        oneway_min_km: oneway,
        round_trip_min_km_per_day: roundTrip,
        multicity_min_km_per_day: multicity,
      });
      showToast('Fare rules updated - new quotes will use these values immediately.', 'success');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save fare rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Fare Rules</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.formCard}>
            <View style={styles.headerInfo}>
              <View style={[styles.iconBox, { backgroundColor: themeColors.primaryTint }]}>
                <Calculator size={20} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>Minimum Distance Rules</Text>
                <Text style={[styles.cardSub, { color: themeColors.textMuted }]}>Configure minimum billed kilometers per booking type.</Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>One-way Minimum (km)</Text>
              <TextInput
                style={[styles.inputField, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                keyboardType="numeric"
                value={onewayMinKm}
                onChangeText={setOnewayMinKm}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Round-trip Minimum per Day (km)</Text>
              <TextInput
                style={[styles.inputField, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                keyboardType="numeric"
                value={roundTripMinKmPerDay}
                onChangeText={setRoundTripMinKmPerDay}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Multi-city Minimum per Day (km)</Text>
              <TextInput
                style={[styles.inputField, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                keyboardType="numeric"
                value={multicityMinKmPerDay}
                onChangeText={setMulticityMinKmPerDay}
              />
            </View>

            <Btn
              label={saving ? 'Saving...' : 'Save Rules'}
              variant="primary"
              onPress={save}
              disabled={saving}
              style={{ marginTop: 10 }}
            />
          </Card>
        </ScrollView>
      )}
      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  loadingContainer: { padding: 16, gap: 8 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  formCard: { padding: 16 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  inputField: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
});
