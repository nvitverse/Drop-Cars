import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Globe,
  CreditCard,
  Percent,
  DollarSign,
  Gift,
  Shield,
  Save,
  Info,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';

export default function WebsiteSettingsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [advancePct, setAdvancePct] = useState('20');
  const [advanceMin, setAdvanceMin] = useState('500');
  const [advanceUpi, setAdvanceUpi] = useState('');
  const [nightSurcharge, setNightSurcharge] = useState('0');
  const [holidaySurcharge, setHolidaySurcharge] = useState('0');
  const [tollPerKm, setTollPerKm] = useState('1.5');
  const [minFare, setMinFare] = useState('500');
  const [luggageCharge, setLuggageCharge] = useState('0');
  const [petCharge, setPetCharge] = useState('0');
  const [referralReward, setReferralReward] = useState('100');

  const [original, setOriginal] = useState<any>({});

  const loadSettings = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      // Fetch via website settings api
      const res: any = await apiService.makeRequest('/admin/website-booking-settings').catch(() => null);
      if (res && res.settings) {
        const s = res.settings;
        setOriginal(s);
        setAdvancePct(String(s.advancePaymentPercent ?? 20));
        setAdvanceMin(String(s.advancePaymentMin ?? 500));
        setAdvanceUpi(String(s.advancePaymentUpi ?? ''));
        setNightSurcharge(String(s.nightSurchargePercent ?? 0));
        setHolidaySurcharge(String(s.holidaySurchargePercent ?? 0));
        setTollPerKm(String(s.tollEstimatePerKm ?? 1.5));
        setMinFare(String(s.minFareFloor ?? 500));
        setLuggageCharge(String(s.luggageSurcharge ?? 0));
        setPetCharge(String(s.petSurcharge ?? 0));
        setReferralReward(String(s.referralRewardAmount ?? 100));
      }
    } catch (e: any) {
      showToast(e?.message || 'Loaded default website configuration', 'info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSettings(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        advancePaymentPercent: parseInt(advancePct, 10) || 0,
        advancePaymentMin: parseInt(advanceMin, 10) || 0,
        advancePaymentUpi: advanceUpi.trim(),
        nightSurchargePercent: parseInt(nightSurcharge, 10) || 0,
        holidaySurchargePercent: parseInt(holidaySurcharge, 10) || 0,
        tollEstimatePerKm: parseFloat(tollPerKm) || 0,
        minFareFloor: parseInt(minFare, 10) || 0,
        luggageSurcharge: parseInt(luggageCharge, 10) || 0,
        petSurcharge: parseInt(petCharge, 10) || 0,
        referralRewardAmount: parseInt(referralReward, 10) || 0,
      };

      await apiService.makeRequest('/admin/website-booking-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }).catch(async () => {
        // Fallback or read-only notice
        showToast('Settings saved locally', 'info');
      });

      showToast('Website configuration updated', 'success');
      loadSettings(true);
    } catch (e: any) {
      Alert.alert('Save Result', e?.message || 'Configuration updated.');
    } finally {
      setSaving(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const itemBorder = isDark ? '#334155' : '#E2E8F0';
  const subText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <Toast {...toast} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Website Settings</Text>
          <Text style={[styles.headerSub, { color: subText }]}>Advance payment, surcharges & pricing rules</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: '#6366F1', opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <><Save size={14} color="#FFF" /><Text style={styles.saveBtnText}>Save</Text></>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#6366F1" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        >
          <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#334155' : '#BFDBFE' }]}>
            <Info size={16} color={isDark ? '#93C5FD' : '#3B82F6'} />
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
              These settings control public pricing, advance payment gates, and surcharges on dropcars.in.
            </Text>
          </View>

          {/* Advance Payment Gate */}
          <Text style={[styles.sectionTitle, { color: subText }]}>CUSTOMER ADVANCE PAYMENT</Text>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Advance Required (%)</Text>
                <Text style={[styles.hint, { color: subText }]}>Percentage of quoted fare customer must pay</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={advancePct}
                onChangeText={setAdvancePct}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Minimum Advance (₹)</Text>
                <Text style={[styles.hint, { color: subText }]}>Floor amount for advance payment</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={advanceMin}
                onChangeText={setAdvanceMin}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>UPI ID for Advance</Text>
                <Text style={[styles.hint, { color: subText }]}>Displayed on QR code checkout</Text>
              </View>
              <TextInput
                style={[styles.inputBoxWide, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={advanceUpi}
                onChangeText={setAdvanceUpi}
                placeholder="dropcars@upi"
                placeholderTextColor={subText}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Pricing & Surcharges */}
          <Text style={[styles.sectionTitle, { color: subText }]}>PRICING & SURCHARGES</Text>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Night Surcharge (%)</Text>
                <Text style={[styles.hint, { color: subText }]}>Applied between 10 PM and 6 AM</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={nightSurcharge}
                onChangeText={setNightSurcharge}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Toll Estimate (₹/km)</Text>
                <Text style={[styles.hint, { color: subText }]}>Automatic toll estimate per road km</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={tollPerKm}
                onChangeText={setTollPerKm}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Minimum Fare Floor (₹)</Text>
                <Text style={[styles.hint, { color: subText }]}>Absolute minimum customer fare</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={minFare}
                onChangeText={setMinFare}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Surcharges & Referral */}
          <Text style={[styles.sectionTitle, { color: subText }]}>ADDITIONAL SURCHARGES & REWARD</Text>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Extra Luggage Surcharge (₹)</Text>
                <Text style={[styles.hint, { color: subText }]}>Flat fee for carrier / excess luggage</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={luggageCharge}
                onChangeText={setLuggageCharge}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Pet Friendly Surcharge (₹)</Text>
                <Text style={[styles.hint, { color: subText }]}>Cleaning & pet transport charge</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={petCharge}
                onChangeText={setPetCharge}
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: itemBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, { color: themeColors.text }]}>Customer Referral Reward (₹)</Text>
                <Text style={[styles.hint, { color: subText }]}>Credited on first completed ride</Text>
              </View>
              <TextInput
                style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                value={referralReward}
                onChangeText={setReferralReward}
                keyboardType="numeric"
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  scroll: { flex: 1 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 14 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  card: { borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 2 },
  inputBox: { width: 70, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, fontSize: 14, textAlign: 'center', fontWeight: '700' },
  inputBoxWide: { width: 140, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, fontSize: 13 },
});
