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
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Image as ImageIcon, Plus, Trash2 } from 'lucide-react-native';
import { bannersApi, WebsiteBanner } from '@/services/bannersApi';
import { couponsApi, WebsiteCoupon } from '@/services/couponsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Promotional banners shown on the website - mirrors admin/pages/banners.php
// (same `banners` MySQL table, reached via the bannersApi shared-key bridge,
// same pattern as coupons.tsx/blocked-ips.tsx).
const emptyForm = (): Partial<WebsiteBanner> => ({
  type: 'image',
  content: '',
  link_url: '',
  coupon_code: '',
  is_popup: false,
  is_active: true,
});

export default function BannersScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [banners, setBanners] = useState<WebsiteBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<Partial<WebsiteBanner>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [festival, setFestival] = useState<any>({
    festivalEnabled: false,
    festivalName: '',
    festivalMessage: '',
    festivalDiscountPct: 0,
    festivalStartsAt: '',
    festivalEndsAt: '',
    festivalPromoCode: '',
  });
  const [savingFestival, setSavingFestival] = useState(false);

  // Active coupons to pick from instead of hand-typing a code into this
  // field (which had no link to the actual coupons list at all before -
  // easy to typo or reference an expired/deleted code). Owner feedback
  // 2026-09-30: connect Promotions and Coupons properly, like the website
  // admin panel's single promotions.php flow does.
  const [activeCoupons, setActiveCoupons] = useState<WebsiteCoupon[]>([]);

  const load = useCallback(async () => {
    try {
      const [data, festData, couponsData] = await Promise.all([
        bannersApi.list(),
        bannersApi.getFestivalSettings().catch(() => ({ success: false, festival: null })),
        couponsApi.list().catch(() => ({ coupons: [] } as any)),
      ]);
      setBanners(data.banners);
      if (festData?.festival) {
        setFestival(festData.festival);
      }
      setActiveCoupons((couponsData.coupons || []).filter((c: WebsiteCoupon) => c.is_active));
    } catch (error: any) {
      console.error('Failed to load banners:', error);
      Alert.alert('Error', error?.message || 'Failed to load banners');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleSaveFestival = async () => {
    setSavingFestival(true);
    try {
      await bannersApi.saveFestivalSettings(festival);
      showToast('Festival mode settings saved live to website!', 'success');
      Alert.alert('Saved!', 'Festival promotion settings saved live on dropcars.in.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save festival settings');
    } finally {
      setSavingFestival(false);
    }
  };

  const openNew = () => {
    setForm(emptyForm());
    setFormVisible(true);
  };

  const openEdit = (banner: WebsiteBanner) => {
    setForm({ ...banner });
    setFormVisible(true);
  };

  const handleToggle = async (banner: WebsiteBanner) => {
    setTogglingId(banner.id);
    const next = !banner.is_active;
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: next } : b)));
    try {
      await bannersApi.toggle(banner.id, next);
    } catch (error: any) {
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: banner.is_active } : b)));
      Alert.alert('Error', error?.message || 'Failed to update banner');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (banner: WebsiteBanner) => {
    Alert.alert('Delete Banner', 'Permanently delete this banner? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await bannersApi.remove(banner.id);
            setBanners((prev) => prev.filter((b) => b.id !== banner.id));
            showToast('Banner deleted', 'success');
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to delete banner');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form.content?.trim()) {
      Alert.alert('Required', 'Enter a message or an image URL.');
      return;
    }
    setSaving(true);
    try {
      await bannersApi.save(form as any);
      setFormVisible(false);
      showToast(form.id ? 'Banner updated' : 'Banner created', 'success');
      load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save banner');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Marketing & Banners</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{banners.length} banner{banners.length === 1 ? '' : 's'} · website sync</Text>
        </View>
        <ThemeToggle size={20} />
        <TouchableOpacity style={styles.newBtn} onPress={openNew}>
          <Plus size={18} color="white" />
        </TouchableOpacity>
      </View>

      {/* FESTIVAL MODE MASTER SWITCH */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.card, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: '#6366F1', gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#C7D2FE' : '#312E81' }}>
                🎆 Festival & Holiday Mode
              </Text>
              <Text style={{ fontSize: 12, color: isDark ? '#A5B4FC' : '#4338CA' }}>
                Auto-displays festive popup banner and discount code on website
              </Text>
            </View>
            <Switch
              value={!!festival.festivalEnabled}
              onValueChange={(v) => setFestival((prev: any) => ({ ...prev, festivalEnabled: v }))}
              trackColor={{ true: '#6366F1' }}
            />
          </View>

          {festival.festivalEnabled && (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: isDark ? '#312E81' : '#C7D2FE', paddingTop: 8 }}>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border, height: 38 }]}
                placeholder="Festival Name (e.g. Diwali Mega Offer)"
                placeholderTextColor={themeColors.textMuted}
                value={festival.festivalName}
                onChangeText={(v) => setFestival((prev: any) => ({ ...prev, festivalName: v }))}
              />
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border, height: 38 }]}
                placeholder="Banner Message (e.g. Flat 10% Off on All Outstation Cabs!)"
                placeholderTextColor={themeColors.textMuted}
                value={festival.festivalMessage}
                onChangeText={(v) => setFestival((prev: any) => ({ ...prev, festivalMessage: v }))}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border, height: 38 }]}
                  placeholder="Promo Code (e.g. DIWALI2026)"
                  placeholderTextColor={themeColors.textMuted}
                  value={festival.festivalPromoCode}
                  onChangeText={(v) => setFestival((prev: any) => ({ ...prev, festivalPromoCode: v.toUpperCase() }))}
                />
                <TextInput
                  style={[styles.input, { width: 90, backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border, height: 38 }]}
                  placeholder="Disc %"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="numeric"
                  value={String(festival.festivalDiscountPct || '')}
                  onChangeText={(v) => setFestival((prev: any) => ({ ...prev, festivalDiscountPct: Number(v) || 0 }))}
                />
              </View>

              <TouchableOpacity
                style={{ backgroundColor: '#4F46E5', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginTop: 4 }}
                onPress={handleSaveFestival}
                disabled={savingFestival}>
                {savingFestival ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>💾 Save Festival Settings Live</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={banners}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ImageIcon size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>No banners yet. Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.7}>
            <View style={styles.cardTop}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{item.type === 'image' ? 'IMAGE' : 'TEXT'}</Text>
              </View>
              {item.is_popup && (
                <View style={styles.popupBadge}>
                  <Text style={styles.popupBadgeText}>POPUP</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <Switch
                value={item.is_active}
                onValueChange={() => handleToggle(item)}
                disabled={togglingId === item.id}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
            {item.coupon_code && <Text style={styles.meta}>Code: {item.coupon_code}</Text>}
            {item.link_url && <Text style={styles.meta} numberOfLines={1}>Links to: {item.link_url}</Text>}
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Trash2 size={15} color="#EF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{form.id ? 'Edit Banner' : 'New Banner'}</Text>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Type</Text>
              <View style={styles.chipRow}>
                {(['image', 'text'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.type === t && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, type: t }))}
                  >
                    <Text style={[styles.chipText, { color: themeColors.textSecondary }, form.type === t && styles.chipTextActive]}>
                      {t === 'image' ? 'Image' : 'Text Message'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>{form.type === 'image' ? 'Image URL' : 'Message'}</Text>
              <TextInput
                style={[styles.inputMultiline, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder={form.type === 'image' ? 'https://...' : 'e.g. Flat 20% off this weekend!'}
                placeholderTextColor={themeColors.textMuted}
                value={form.content || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, content: v }))}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Link URL (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="https://www.dropcars.in/..."
                placeholderTextColor={themeColors.textMuted}
                autoCapitalize="none"
                value={form.link_url || ''}
                onChangeText={(v) => setForm((f) => ({ ...f, link_url: v }))}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Coupon Code (optional)</Text>
              {activeCoupons.length > 0 ? (
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, !form.coupon_code && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, coupon_code: '' }))}
                  >
                    <Text style={[styles.chipText, !form.coupon_code && styles.chipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {activeCoupons.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, form.coupon_code === c.code && styles.chipActive]}
                      onPress={() => setForm((f) => ({ ...f, coupon_code: c.code }))}
                    >
                      <Text style={[styles.chipText, form.coupon_code === c.code && styles.chipTextActive]}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: themeColors.textMuted, marginBottom: 10 }}>
                  No active coupons yet - create one on the Promotions screen first.
                </Text>
              )}

              <View style={styles.switchRow}>
                <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Show as Popup</Text>
                <Switch
                  value={!!form.is_popup}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_popup: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  typeBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#2563EB' },
  popupBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  popupBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#B45309' },
  content: { fontSize: 14, color: '#1F2937', fontWeight: '500', marginBottom: 4 },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  deleteBtn: { position: 'absolute', top: 14, right: 56, padding: 4 },
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
  inputMultiline: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
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
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
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
