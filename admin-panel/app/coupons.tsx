import { openWaUrl } from '@/utils/whatsapp';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Switch,
  ScrollView,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ticket, Plus, Trash2, Share2 } from 'lucide-react-native';
import { couponsApi, WebsiteCoupon } from '@/services/couponsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import DatePickButton from '@/components/DatePickButton';

// Discount codes/promotions - mirrors admin/pages/coupons.php on the
// website (same `coupons` MySQL table, reached via the couponsApi shared-key
// bridge, same as enquiries.tsx does for the enquiries table).
const TRIP_TYPE_OPTIONS: Array<{ value: WebsiteCoupon['apply_to_trip_type']; label: string }> = [
  { value: 'all', label: 'All Trips' },
  { value: 'one_way', label: 'One-Way' },
  { value: 'round_trip', label: 'Round Trip' },
  { value: 'hourly_rental', label: 'Hourly Rental' },
];

const emptyForm = (): Partial<WebsiteCoupon> => ({
  title: '',
  code: '',
  discount_type: 'flat',
  discount_value: 0,
  expiry_date: '',
  apply_to_trip_type: 'all',
  min_booking_amount: 0,
  is_active: true,
});

export default function CouponsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [coupons, setCoupons] = useState<WebsiteCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<Partial<WebsiteCoupon>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await couponsApi.list(1);
      setCoupons(data.coupons || []);
    } catch (e: any) {
      console.warn('Failed to load coupons:', e);
      showToast(e?.message || 'Failed to fetch promotions', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openNew = () => {
    setForm(emptyForm());
    setFormVisible(true);
  };

  const openEdit = (coupon: WebsiteCoupon) => {
    setForm({ ...coupon, expiry_date: coupon.expiry_date || '' });
    setFormVisible(true);
  };

  const handleToggle = async (coupon: WebsiteCoupon) => {
    setTogglingId(coupon.id);
    const next = !coupon.is_active;
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: next } : c)));
    try {
      await couponsApi.toggle(coupon.id, next);
    } catch (error: any) {
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: coupon.is_active } : c)));
      Alert.alert('Error', error?.message || 'Failed to update promotion');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (coupon: WebsiteCoupon) => {
    Alert.alert('Delete Promotion', `Permanently delete "${coupon.code}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await couponsApi.remove(coupon.id);
            setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
            showToast('Promotion deleted', 'success');
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to delete promotion');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.title?.trim() || !form.code?.trim()) {
      Alert.alert('Required', 'Title and code are required.');
      return;
    }
    setSaving(true);
    try {
      await couponsApi.save(form as any);
      setFormVisible(false);
      showToast(form.id ? 'Promotion updated' : 'Promotion created', 'success');
      load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save promotion');
    } finally {
      setSaving(false);
    }
  };

  const discountLabel = (c: WebsiteCoupon) =>
    c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`;

  // Website admin panel's promotions.php generates a ready-to-send WhatsApp
  // promo message with a one-tap coupon link - this screen never had that,
  // staff had to hand-type promo messages themselves (owner feedback
  // 2026-09-30: build the Admin App's version "more advanced" than the
  // website's).
  const handleShareWhatsApp = (c: WebsiteCoupon) => {
    const message =
      `🌟 *DROP CARS* 🌟\n` +
      `_Exclusive Travel Offer_\n\n` +
      `Get *${discountLabel(c)}* on your next intercity ride with Drop Cars!\n\n` +
      `🎟️ *Coupon Code:* *${c.code}*\n` +
      (c.min_booking_amount > 0 ? `💰 *Min Booking:* ₹${c.min_booking_amount.toLocaleString('en-IN')}\n` : '') +
      (c.expiry_date ? `⏰ *Valid till:* ${new Date(c.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}\n` : '') +
      `\n👉 https://dropcars.in/?coupon=${c.code}\n\n` +
      `Tap the link to auto-apply the coupon and get an instant fare estimate!`;
    openWaUrl(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Coupons & Promotions</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{coupons.length} promotion{coupons.length === 1 ? '' : 's'}</Text>
        </View>
        <ThemeToggle size={20} />
        <TouchableOpacity style={styles.newBtn} onPress={openNew}>
          <Plus size={18} color="white" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={coupons}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ticket size={32} color={themeColors.textMuted} />
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No promotions yet. Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{item.code}</Text>
                <Text style={styles.couponTitle}>{item.title}</Text>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggle(item)}
                disabled={togglingId === item.id}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <View style={styles.badgeRow}>
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>{discountLabel(item)}</Text>
              </View>
              <Text style={styles.meta}>
                {TRIP_TYPE_OPTIONS.find((t) => t.value === item.apply_to_trip_type)?.label || item.apply_to_trip_type}
              </Text>
            </View>
            {item.min_booking_amount > 0 && (
              <Text style={styles.meta}>Min booking: ₹{item.min_booking_amount.toLocaleString('en-IN')}</Text>
            )}
            {item.expiry_date && (
              <Text style={styles.meta}>
                Expires {new Date(item.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.shareBtn} onPress={() => handleShareWhatsApp(item)}>
                <Share2 size={14} color="#10B981" />
                <Text style={styles.shareBtnText}>Share via WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtnInline} onPress={() => handleDelete(item)}>
                <Trash2 size={15} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{form.id ? 'Edit Promotion' : 'New Promotion'}</Text>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. Diwali Special"
                placeholderTextColor={themeColors.textMuted}
                value={form.title || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Coupon Code</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="e.g. DIWALI25"
                placeholderTextColor={themeColors.textMuted}
                autoCapitalize="characters"
                value={form.code || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Discount Type</Text>
              <View style={styles.chipRow}>
                {(['flat', 'percentage'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.discount_type === t && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, discount_type: t }))}
                  >
                    <Text style={[styles.chipText, { color: themeColors.textSecondary }, form.discount_type === t && styles.chipTextActive]}>
                      {t === 'flat' ? 'Flat (₹)' : 'Percentage (%)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Discount Value</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder={form.discount_type === 'percentage' ? 'e.g. 10' : 'e.g. 200'}
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                value={form.discount_value != null ? String(form.discount_value) : ''}
                onChangeText={(v) => setForm((f) => ({ ...f, discount_value: parseFloat(v) || 0 }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Applies To</Text>
              <View style={styles.chipRow}>
                {TRIP_TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.apply_to_trip_type === opt.value && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, apply_to_trip_type: opt.value }))}
                  >
                    <Text style={[styles.chipText, { color: themeColors.textSecondary }, form.apply_to_trip_type === opt.value && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Minimum Booking Amount (₹, optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="0"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                value={form.min_booking_amount != null ? String(form.min_booking_amount) : ''}
                onChangeText={(v) => setForm((f) => ({ ...f, min_booking_amount: parseFloat(v) || 0 }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Expiry Date (optional)</Text>
              <DatePickButton
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, justifyContent: 'center' }]}
                textStyle={{ color: themeColors.text, fontSize: 14 }}
                placeholder="No expiry - tap to pick a date"
                placeholderColor={themeColors.textMuted}
                title="Coupon expiry date"
                minimumDate={new Date()}
                value={form.expiry_date || ''}
                onChange={(v) => setForm((f) => ({ ...f, expiry_date: v }))}
                />

              <View style={styles.switchRow}>
                <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Active</Text>
                <Switch
                  value={!!form.is_active}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]} onPress={() => setFormVisible(false)}>
                  <Text style={[styles.modalCancelButtonText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalSaveButton, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSaveButtonText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
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
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 30 },
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  couponCode: { fontSize: 17, fontWeight: '800', color: '#1F2937', letterSpacing: 0.5 },
  couponTitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  discountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountBadgeText: { fontSize: 12.5, fontWeight: '800', color: '#059669' },
  meta: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#ECFDF5', borderRadius: 6, paddingVertical: 8,
  },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  deleteBtnInline: { padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  chipText: { fontSize: 12.5, color: '#1F2937', fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: { backgroundColor: '#F3F4F6' },
  modalCancelButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  modalSaveButton: { backgroundColor: colors.primary },
  modalSaveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
