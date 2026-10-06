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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  IndianRupee,
  Percent,
  Navigation,
  Shield,
  Clock,
  Zap,
  Save,
  RefreshCw,
  Info,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import WebsitePostModeCard from '@/components/WebsitePostModeCard';
import { useTheme } from '@/context/ThemeContext';

interface SystemSettings {
  registration_fee: number;
  platform_commission_pct: number;
  gps_spoof_speed_kmh: number;
  otp_rate_limit_max: number;
  driver_search_radius_km: number;
  yearly_fee: number;
  monthly_fee: number;
  suspend_threshold: number;
  driver_auto_acceptance_timeout_minutes: number;
  phone_reveal_hours_before_pickup: number;
  platform_fee_pct: number;
  platform_share_pct: number;
  platform_share_min: number;
  commission_min: number;
  convenience_fee: number;
  platform_all_inclusive_pct: number;
  min_driver_hold: number;
  drop_bid_fee_pct: number;
  gst_number: string;
  gst_business_name: string;
  gst_business_address: string;
}

interface FieldConfig {
  key: string;
  label: string;
  hint: string;
  unit: string;
  iconColor: string;
  dangerous?: boolean;
}

const FIELD_GROUPS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: 'Financial Settings',
    fields: [
      { key: 'registration_fee', label: 'Registration Fee', hint: 'One-time fee on new fleet-owner signup', unit: '₹', iconColor: '#10B981' },
      { key: 'yearly_fee', label: 'Yearly Subscription Fee', hint: 'Annual fee debited from fleet-owner wallet each cycle', unit: '₹', iconColor: '#3B82F6' },
      { key: 'monthly_fee', label: 'Monthly Subscription Fee', hint: 'Monthly Preferred-tier auto-debit amount', unit: '₹', iconColor: '#6366F1' },
      { key: 'suspend_threshold', label: 'Auto-Suspend Wallet Threshold', hint: 'Account suspended when wallet falls below this (can be negative)', unit: '₹', iconColor: '#EF4444', dangerous: true },
      { key: 'platform_commission_pct', label: 'Platform Commission', hint: 'Percentage of trip fare collected as platform fee', unit: '%', iconColor: '#F59E0B' },
      { key: 'commission_min', label: 'Minimum Commission (Outstation)', hint: 'Naveen only. The driver pays 10% of the km fare as commission, but at least this much on Standard Outstation bookings. Local bookings have no minimum', unit: '₹', iconColor: '#F59E0B' },
      { key: 'platform_share_pct', label: 'Platform Share of Commission', hint: 'Naveen only. % of the km fare the platform keeps OUT of the commission; the vendor / poster gets the rest plus all extras. Nothing extra is taken from the driver', unit: '%', iconColor: '#F59E0B' },
      { key: 'platform_share_min', label: 'Minimum Platform Share', hint: 'Naveen only. The platform share is at least this many rupees (never more than the commission itself)', unit: '₹', iconColor: '#F59E0B' },
      { key: 'convenience_fee', label: 'Convenience Fee (every booking)', hint: 'Naveen only. Flat amount added to the customer bill on EVERY booking, collected by the driver and settled to the platform from the driver wallet', unit: '₹', iconColor: '#F59E0B' },
      { key: 'platform_all_inclusive_pct', label: 'Website / Admin All-Inclusive Cut', hint: 'Naveen only. % of the all-inclusive amount the platform keeps on website and admin all-inclusive bookings (driver gets the rest)', unit: '%', iconColor: '#F59E0B' },
      { key: 'drop_bid_fee_pct', label: 'Drop Bid Platform Cut', hint: 'Naveen only. % of the negotiated fare the platform keeps on confirmed Drop Bid trips', unit: '%', iconColor: '#F59E0B' },
      { key: 'min_driver_hold', label: 'Minimum Driver Hold', hint: 'Naveen only. Least amount held from the accepting driver\'s wallet at accept - forfeited as penalty if the trip is not executed, returned on completion', unit: '₹', iconColor: '#EF4444' },
    ],
  },
  {
    title: 'Operational Limits',
    fields: [
      { key: 'driver_search_radius_km', label: 'Driver Search Radius', hint: 'Max km to broadcast a new booking to nearby drivers', unit: 'km', iconColor: '#0EA5E9' },
      { key: 'driver_auto_acceptance_timeout_minutes', label: 'Driver Acceptance Timeout', hint: 'Minutes a driver has to accept before the booking auto-cancels', unit: 'min', iconColor: '#8B5CF6' },
    ],
  },
  {
    title: 'Safety & Security',
    fields: [
      { key: 'gps_spoof_speed_kmh', label: 'GPS Spoof Detection Speed', hint: 'Speed above which a location ping is flagged as spoofed', unit: 'km/h', iconColor: '#EC4899', dangerous: true },
      { key: 'otp_rate_limit_max', label: 'OTP / Trip Rate-Limit (per 10 min)', hint: 'Max OTP or trip-start/end requests per IP per 10 minutes', unit: 'req', iconColor: '#F97316', dangerous: true },
      { key: 'phone_reveal_hours_before_pickup', label: 'Customer Number Reveal Window', hint: 'Hours before pickup the assigned driver can see the customer\'s real phone number (urgent bookings always reveal it immediately)', unit: 'hrs', iconColor: '#14B8A6' },
    ],
  },
];

export default function SystemConfigScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<SystemSettings | null>(null);

  // GST / Business Details - text fields (GSTIN, name, address), kept
  // separate from the numeric-only settings above (their save path rejects
  // anything that isn't a number). Printed on every real tax invoice the
  // Website issues - see backend GET /api/public/gst-business-info.
  const [gstValues, setGstValues] = useState({ gst_number: '', gst_business_name: '', gst_business_address: '' });
  const [gstOriginal, setGstOriginal] = useState({ gst_number: '', gst_business_name: '', gst_business_address: '' });
  const [gstSaving, setGstSaving] = useState(false);
  // Owner-editable text settings for the Standard -> Trusted upgrade screen and staff permissions (kept out of the numeric map).
  const TEXT_SETTING_FIELDS = [
    { key: 'fleet_payment_channels', label: 'Payment channels', hint: 'Comma separated. "Wallet" debits the partner wallet.', placeholder: 'Wallet,GPay,PhonePe,Bank Transfer,Cash in Hand' },
    { key: 'fleet_payment_link_message', label: 'WhatsApp link message', hint: 'Use {name} {plan} {amount} {link}. {link} is required.', placeholder: 'Hello {name}, please pay Rs.{amount} ... {link}' },
    { key: 'fleet_payment_link_expiry_hours', label: 'Link valid for (hours)', hint: '1 to 720', placeholder: '48' },
    { key: 'staff_permission_keys', label: 'Extra staff permission keys', hint: 'Comma separated. Lets a new section be granted to staff without an app update.', placeholder: 'reports,audit' },
  ] as const;
  const TEXT_SETTING_KEYS = new Set<string>(TEXT_SETTING_FIELDS.map((f) => f.key));
  const [txtValues, setTxtValues] = useState<Record<string, string>>({});
  const [txtOriginal, setTxtOriginal] = useState<Record<string, string>>({});
  const [txtSaving, setTxtSaving] = useState(false);
  const txtHasChanges = TEXT_SETTING_FIELDS.some((f) => (txtValues[f.key] ?? '') !== (txtOriginal[f.key] ?? ''));
  const handleSaveTxt = async () => {
    setTxtSaving(true);
    try {
      const updates: Record<string, string> = {};
      TEXT_SETTING_FIELDS.forEach((f) => { if ((txtValues[f.key] ?? '') !== (txtOriginal[f.key] ?? '')) updates[f.key] = (txtValues[f.key] ?? '').trim(); });
      const res = await apiService.updateSystemSettings(updates);
      const next: Record<string, string> = {};
      TEXT_SETTING_FIELDS.forEach((f) => { next[f.key] = String((res.settings as any)[f.key] ?? ''); });
      setTxtOriginal(next);
      setTxtValues(next);
      showToast('Saved', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save', 'error');
    } finally {
      setTxtSaving(false);
    }
  };

  const gstHasChanges = gstValues.gst_number !== gstOriginal.gst_number
    || gstValues.gst_business_name !== gstOriginal.gst_business_name
    || gstValues.gst_business_address !== gstOriginal.gst_business_address;

  const handleSaveGst = async () => {
    const gstin = gstValues.gst_number.trim().toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(gstin)) {
      showToast('That doesn\'t look like a valid 15-character GSTIN', 'error');
      return;
    }
    setGstSaving(true);
    try {
      const res = await apiService.updateSystemSettings({
        gst_number: gstin,
        gst_business_name: gstValues.gst_business_name.trim(),
        gst_business_address: gstValues.gst_business_address.trim(),
      });
      const s: any = res.settings;
      const next = {
        gst_number: String(s.gst_number ?? ''),
        gst_business_name: String(s.gst_business_name ?? ''),
        gst_business_address: String(s.gst_business_address ?? ''),
      };
      setGstOriginal(next);
      setGstValues(next);
      showToast('GST / business details saved', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save GST details', 'error');
    } finally {
      setGstSaving(false);
    }
  };

  const fetchSettings = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const data = await apiService.getSystemSettings();
      setOriginal(data as SystemSettings);
      // gst_number/business_name/address are text, not numbers - kept out
      // of this numeric-only values map so the main "Save All Changes"
      // button's number validation never rejects them.
      const GST_TEXT_KEYS = new Set(['gst_number', 'gst_business_name', 'gst_business_address', ...Array.from(TEXT_SETTING_KEYS)]);
      const strMap: Record<string, string> = {};
      Object.entries(data).forEach(([k, v]) => { if (!GST_TEXT_KEYS.has(k)) strMap[k] = String(v); });
      setValues(strMap);
      const txtNext: Record<string, string> = {};
      TEXT_SETTING_FIELDS.forEach((f) => { txtNext[f.key] = String((data as any)[f.key] ?? ''); });
      setTxtOriginal(txtNext);
      setTxtValues(txtNext);
      const gstNext = {
        gst_number: String((data as any).gst_number ?? ''),
        gst_business_name: String((data as any).gst_business_name ?? ''),
        gst_business_address: String((data as any).gst_business_address ?? ''),
      };
      setGstOriginal(gstNext);
      setGstValues(gstNext);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load system settings', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchSettings(true); };

  const handleSave = async () => {
    for (const key of Object.keys(values)) {
      if (values[key].trim() === '' || isNaN(Number(values[key]))) {
        showToast(key + ' must be a valid number', 'error'); return;
      }
    }
    const updates: Record<string, number> = {};
    Object.entries(values).forEach(([k, v]) => {
      const parsed = Number(v);
      if (!original || parsed !== (original as any)[k]) updates[k] = parsed;
    });
    if (Object.keys(updates).length === 0) { showToast('No changes to save', 'info'); return; }
    const dangerousKeys = ['gps_spoof_speed_kmh', 'otp_rate_limit_max', 'suspend_threshold'];
    const hasDangerous = Object.keys(updates).some(k => dangerousKeys.includes(k));
    const doSave = async () => {
      setSaving(true);
      try {
        const res = await apiService.updateSystemSettings(updates);
        setOriginal(res.settings as SystemSettings);
        const GST_TEXT_KEYS = new Set(['gst_number', 'gst_business_name', 'gst_business_address', ...Array.from(TEXT_SETTING_KEYS)]);
        const strMap: Record<string, string> = {};
        Object.entries(res.settings).forEach(([k, v]) => { if (!GST_TEXT_KEYS.has(k)) strMap[k] = String(v); });
        setValues(strMap);
        showToast('System settings saved', 'success');
      } catch (e: any) {
        showToast(e?.message || 'Failed to save settings', 'error');
      } finally { setSaving(false); }
    };
    if (hasDangerous) {
      Alert.alert('Confirm Safety Changes',
        'You are modifying GPS spoof detection, OTP rate limits, or wallet suspend thresholds. These affect live operations. Proceed?',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Save Changes', style: 'destructive', onPress: doSave }]);
    } else { doSave(); }
  };

  const hasChanges = original !== null && Object.entries(values).some(([k, v]) => String((original as any)[k]) !== v);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color={themeColors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>App setup</Text>
        </View>
        <View style={styles.centered}><ActivityIndicator size="large" color="#6366F1" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <Toast {...toast} />
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color={themeColors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>App setup</Text>
          <Text style={[styles.headerSub, { color: themeColors.textSecondary }]}>Live platform parameters — changes take effect immediately</Text>
        </View>
        {hasChanges && (
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Save size={16} color="#FFFFFF" /><Text style={styles.saveBtnText}> Save</Text></>}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#334155' : '#BFDBFE' }]}>
          <Info size={15} color={isDark ? '#93C5FD' : '#3B82F6'} />
          <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>Values override code defaults. Indigo border = unsaved change. Pull to refresh.</Text>
        </View>

        <WebsitePostModeCard />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>GST / BUSINESS DETAILS</Text>
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.fieldHint, { color: themeColors.textSecondary, padding: 12, paddingBottom: 0 }]}>
              Naveen only. Printed on every real GST tax invoice the Website issues to customers - get this wrong and a real customer sees a wrong/fake tax document.
            </Text>
            {[
              { key: 'gst_number' as const, label: 'GSTIN', placeholder: '33BBVPN8562P1ZJ', autoCapitalize: 'characters' as const },
              { key: 'gst_business_name' as const, label: 'Business Name', placeholder: 'Drop Cars', autoCapitalize: 'words' as const },
              { key: 'gst_business_address' as const, label: 'Business Address', placeholder: 'Registered address for the invoice', autoCapitalize: 'sentences' as const },
            ].map((f, idx, arr) => {
              const changed = gstValues[f.key] !== gstOriginal[f.key];
              return (
                <View key={f.key} style={[styles.fieldRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.colorDot, { backgroundColor: '#10B981' }]} />
                      <Text style={[styles.fieldLabel, { color: themeColors.text }]}>{f.label}</Text>
                      {changed && <View style={styles.changedDot} />}
                    </View>
                  </View>
                  <View style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: changed ? '#6366F1' : themeColors.border, minWidth: 170 }]}>
                    <TextInput
                      value={gstValues[f.key]}
                      onChangeText={(t) => setGstValues((prev) => ({ ...prev, [f.key]: t }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize={f.autoCapitalize}
                      style={[styles.input, { color: changed ? '#6366F1' : themeColors.text }]}
                    />
                  </View>
                </View>
              );
            })}
            {gstHasChanges && (
              <TouchableOpacity onPress={handleSaveGst} disabled={gstSaving} style={[styles.saveBtn, { alignSelf: 'flex-end', margin: 12 }]}>
                {gstSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Save size={16} color="#FFFFFF" /><Text style={styles.saveBtnText}> Save GST Details</Text></>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>PARTNER UPGRADE & STAFF</Text>
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            {TEXT_SETTING_FIELDS.map((f, idx, arr) => {
              const changed = (txtValues[f.key] ?? '') !== (txtOriginal[f.key] ?? '');
              return (
                <View key={f.key} style={[{ padding: 12 }, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]}>
                  <Text style={[styles.fieldLabel, { color: themeColors.text }]}>{f.label}{changed ? '  •' : ''}</Text>
                  <Text style={[styles.fieldHint, { color: themeColors.textSecondary, marginBottom: 6 }]}>{f.hint}</Text>
                  <View style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: changed ? '#6366F1' : themeColors.border }]}>
                    <TextInput
                      value={txtValues[f.key] ?? ''}
                      onChangeText={(v) => setTxtValues((prev) => ({ ...prev, [f.key]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={themeColors.textSecondary}
                      multiline={f.key === 'fleet_payment_link_message'}
                      autoCapitalize="none"
                      style={[styles.input, { color: changed ? '#6366F1' : themeColors.text }]}
                    />
                  </View>
                </View>
              );
            })}
            {txtHasChanges && (
              <TouchableOpacity onPress={handleSaveTxt} disabled={txtSaving} style={[styles.saveBtn, { alignSelf: 'flex-end', margin: 12 }]}>
                {txtSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Save size={16} color="#FFFFFF" /><Text style={styles.saveBtnText}> Save</Text></>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {FIELD_GROUPS.map((group) => (
          <View key={group.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>{group.title.toUpperCase()}</Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              {group.fields.map((field, idx) => {
                const isChanged = original && String((original as any)[field.key]) !== values[field.key];
                return (
                  <View key={field.key} style={[styles.fieldRow, idx < group.fields.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.colorDot, { backgroundColor: field.iconColor }]} />
                        <Text style={[styles.fieldLabel, { color: themeColors.text }]}>{field.label}</Text>
                        {field.dangerous && <Text style={styles.dangerBadge}>⚠</Text>}
                        {isChanged && <View style={styles.changedDot} />}
                      </View>
                      <Text style={[styles.fieldHint, { color: themeColors.textSecondary }]}>{field.hint}</Text>
                    </View>
                    <View style={[styles.inputBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isChanged ? '#6366F1' : themeColors.border }]}>
                      <TextInput
                        value={values[field.key] ?? ''}
                        onChangeText={(t) => setValues(prev => ({ ...prev, [field.key]: t }))}
                        keyboardType="numeric"
                        style={[styles.input, { color: isChanged ? '#6366F1' : themeColors.text }]}
                        selectTextOnFocus
                      />
                      <Text style={[styles.unit, { color: themeColors.textSecondary }]}>{field.unit}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.bottomSave, { opacity: hasChanges ? 1 : 0.4 }]} onPress={handleSave} disabled={!hasChanges || saving}>
          {saving
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Save size={18} color="#FFFFFF" /><Text style={styles.bottomSaveText}>{hasChanges ? 'Save All Changes' : 'No Changes'}</Text></View>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetHint} onPress={() => { setRefreshing(true); fetchSettings(true); }}>
          <RefreshCw size={13} color={themeColors.textSecondary} />
          <Text style={[styles.resetHintText, { color: themeColors.textSecondary }]}>Discard changes & reload from server</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 11, marginTop: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, padding: 12, borderRadius: 6, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  section: { paddingHorizontal: 16, marginBottom: 18 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  card: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  fieldHint: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  dangerBadge: { fontSize: 11, color: '#EF4444' },
  changedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366F1' },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 },
  input: { fontSize: 17, fontWeight: '700', minWidth: 56, textAlign: 'right' },
  unit: { fontSize: 12, marginLeft: 4, fontWeight: '500' },
  bottomSave: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#6366F1', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  bottomSaveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  resetHint: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 14 },
  resetHintText: { fontSize: 12 },
});
