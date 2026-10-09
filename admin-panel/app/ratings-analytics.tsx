import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star, ShieldAlert, Award, Search, Phone, MessageSquare, X, Gavel } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import Toast, { useToast } from '@/components/Toast';
import { apiService } from '@/services/api';

// Real feedback from both rating sources (Customer App ratings + post-trip
// review links), backed by api/routes/quality.py. This screen used to show
// hardcoded fake reviews and claimed "₹100 penalty auto-deducted" on resolve
// when nothing was deducted (found 2026-09-30).

type Filter = 'all' | 'low' | 'top';

const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n));
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function RatingsAnalyticsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [isOwner, setIsOwner] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(2);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [settings, setSettings] = useState<{ enabled: boolean; threshold: number; amount: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [noteModal, setNoteModal] = useState<null | { mode: 'resolve' | 'waive'; item: any }>(null);
  const [noteText, setNoteText] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async (f: Filter = filter, s: string = search) => {
    try {
      const [sum, fb] = await Promise.all([apiService.getQualitySummary(30), apiService.getQualityFeedback(f, s)]);
      setSummary(sum);
      setItems(fb.items || []);
      setThreshold(fb.threshold);
      if (sum?.penalty_settings) {
        setSettings({ enabled: !!sum.penalty_settings.enabled, threshold: sum.penalty_settings.threshold, amount: String(sum.penalty_settings.amount) });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load ratings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => {
    apiService.getCachedAdminRole().then((r) => setIsOwner(r === 'Owner'));
  }, []);

  useEffect(() => { load(filter, search); }, [filter]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      await apiService.updateQualityPenaltySettings({ enabled: settings.enabled, threshold: settings.threshold, amount: parseInt(settings.amount, 10) || 0 });
      showToast('Penalty rules saved', 'success');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    } finally {
      setSavingSettings(false);
    }
  };

  const submitNote = async () => {
    if (!noteModal) return;
    setActing(true);
    try {
      const { item, mode } = noteModal;
      if (mode === 'resolve') await apiService.resolveQualityFeedback(item.source, item.source_id, noteText);
      else await apiService.waiveQualityPenalty(item.source, item.source_id, noteText);
      setNoteModal(null);
      showToast(mode === 'resolve' ? 'Marked resolved' : 'Penalty waived and refunded to the wallet', 'success');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    } finally {
      setActing(false);
    }
  };

  const applyPenalty = (item: any) => {
    const amount = parseInt(settings?.amount || '100', 10) || 100;
    Alert.alert('Apply penalty', `Debit ₹${amount} from the fleet driver's wallet for booking #${item.order_id}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply', style: 'destructive', onPress: async () => {
          try {
            await apiService.applyQualityPenalty(item.source, item.source_id, amount);
            showToast(`₹${amount} penalty applied`, 'success');
            load();
          } catch (e: any) { Alert.alert('Error', e?.message || 'Could not apply penalty'); }
        },
      },
    ]);
  };

  const FilterChip = ({ value, label, icon: Icon, danger, count }: { value: Filter; label: string; icon?: any; danger?: boolean; count?: number }) => {
    const on = filter === value;
    const accent = danger ? '#DC2626' : themeColors.primary;
    return (
      <TouchableOpacity
        onPress={() => setFilter(value)}
        style={[styles.filterChip, {
          borderColor: accent,
          backgroundColor: on ? accent : danger ? (isDark ? '#450A0A' : '#FEF2F2') : 'transparent',
        }]}
      >
        {Icon && <Icon size={14} color={on ? '#FFF' : accent} />}
        <Text style={[styles.filterChipText, { color: on ? '#FFF' : accent }]}>{label}</Text>
        {count ? (
          <View style={[styles.countBadge, { backgroundColor: on ? 'rgba(255,255,255,0.3)' : accent }]}>
            <Text style={styles.countBadgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const card = { backgroundColor: themeColors.surface, borderColor: themeColors.border };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text, flex: 1 }]}>Ratings & quality</Text>
        <ThemeToggle size={20} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={themeColors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.summaryCard, { backgroundColor: isDark ? '#1E293B' : '#FFFBEB', borderColor: '#FDE68A' }]}>
            <View style={styles.scoreCircle}>
              <Star size={20} color="#FFF" fill="#FFF" />
              <Text style={styles.scoreText}>{summary?.average != null ? summary.average.toFixed(1) : '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryTitle, { color: themeColors.text }]}>Last 30 days</Text>
              <Text style={{ fontSize: 12.5, color: themeColors.textSecondary }}>
                {summary?.count
                  ? `${summary.count} ratings · ${summary.positive_pct}% positive (4★+)`
                  : 'No ratings received in the last 30 days'}
              </Text>
              {summary?.count ? (
                <Text style={{ fontSize: 12.5, color: '#DC2626', fontWeight: '700', marginTop: 2 }}>
                  {summary.unresolved_low} low ratings need follow-up · ₹{(summary.penalties_applied_total || 0).toLocaleString('en-IN')} penalties
                </Text>
              ) : null}
            </View>
          </View>

          {settings && (
            <View style={[styles.settingsCard, card]}>
              <View style={styles.settingsTop}>
                <Gavel size={16} color="#DC2626" />
                <Text style={[styles.settingsTitle, { color: themeColors.text }]}>Automatic low-rating penalty</Text>
                <Switch
                  value={settings.enabled}
                  disabled={!isOwner}
                  onValueChange={(v) => setSettings((s) => (s ? { ...s, enabled: v } : s))}
                  trackColor={{ false: '#CBD5E1', true: '#DC2626' }}
                />
              </View>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                {settings.enabled
                  ? `Ratings of ${settings.threshold}★ or lower debit ₹${settings.amount || 0} from the fleet driver's wallet and notify them instantly. Staff can waive it below.`
                  : 'Off - low ratings are only flagged here for follow-up.'}
              </Text>
              {isOwner ? (
                <>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Penalise ratings of</Text>
                  <View style={styles.chipRow}>
                    {[1, 2, 3].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setSettings((s) => (s ? { ...s, threshold: t } : s))}
                        style={[styles.smallChip, { borderColor: settings.threshold === t ? '#DC2626' : themeColors.border, backgroundColor: settings.threshold === t ? '#DC2626' : 'transparent' }]}
                      >
                        <Text style={{ color: settings.threshold === t ? '#FFF' : themeColors.text, fontWeight: '700', fontSize: 12 }}>{t}★ or lower</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.inlineRow}>
                    <Text style={[styles.label, { color: themeColors.textSecondary, marginTop: 0 }]}>Penalty ₹</Text>
                    <TextInput
                      style={[styles.amountInput, { color: themeColors.text, borderColor: themeColors.border }]}
                      keyboardType="numeric"
                      value={settings.amount}
                      onChangeText={(v) => setSettings((s) => (s ? { ...s, amount: v } : s))}
                    />
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary, opacity: savingSettings ? 0.7 : 1 }]} onPress={saveSettings} disabled={savingSettings}>
                      <Text style={styles.saveBtnText}>{savingSettings ? 'Saving...' : 'Save rules'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 11.5, color: themeColors.textMuted }}>Only the Owner can change these rules.</Text>
              )}
            </View>
          )}

          <View style={styles.chipRow}>
            <FilterChip value="all" label="All feedback" icon={MessageSquare} />
            <FilterChip value="low" label={`Low ratings (${threshold}★ or less)`} icon={ShieldAlert} danger count={summary?.unresolved_low} />
            <FilterChip value="top" label="5-star" icon={Award} />
          </View>

          <View style={[styles.searchRow, card]}>
            <Search size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Customer, driver, car number or booking #"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => load(filter, search)}
              returnKeyType="search"
              placeholderTextColor={themeColors.textMuted}
            />
            <TouchableOpacity onPress={() => load(filter, search)}>
              <Text style={{ color: themeColors.primary, fontWeight: '800', fontSize: 12.5 }}>Search</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={[styles.empty, card]}>
              <Text style={{ color: themeColors.textSecondary, textAlign: 'center' }}>
                {filter === 'low' ? 'No low ratings - great work!' : 'No feedback found for this filter.'}
              </Text>
            </View>
          ) : items.map((it) => {
            const low = it.rating <= threshold;
            const c = it.case;
            return (
              <View key={`${it.source}-${it.source_id}`} style={[styles.card, card, low && { borderColor: '#FCA5A5', borderLeftWidth: 4, borderLeftColor: '#DC2626' }]}>
                <View style={styles.cardTop}>
                  <Text style={{ color: low ? '#DC2626' : '#F59E0B', fontSize: 16, letterSpacing: 1 }}>{stars(it.rating)}</Text>
                  <Text style={{ color: themeColors.textMuted, fontSize: 11.5 }}>{when(it.created_at)}</Text>
                </View>
                {it.source === 'APP_RATING' && (
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary }}>
                    Driver {it.driver_rating}★ · Car {it.car_rating}★ · Service {it.service_rating}★
                  </Text>
                )}
                {it.comment ? <Text style={[styles.comment, { color: themeColors.text }]}>“{it.comment}”</Text> : null}

                <TouchableOpacity onPress={() => router.push(`/trip-detail?orderId=${it.order_id}` as any)}>
                  <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12.5 }}>Booking #{it.order_id} ›</Text>
                </TouchableOpacity>
                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meta, { color: themeColors.text }]}>{it.customer_name || it.reviewer_name || 'Customer'}</Text>
                    <Text style={[styles.metaSub, { color: themeColors.textSecondary }]}>
                      {it.driver_name ? `Driver: ${it.driver_name}` : 'Driver not recorded'}{it.car_number ? ` · ${it.car_number}` : ''}
                    </Text>
                  </View>
                  {it.customer_phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${it.customer_phone}`)} style={[styles.callBtn, { borderColor: themeColors.border }]}>
                      <Phone size={14} color="#059669" />
                      <Text style={{ color: '#059669', fontWeight: '700', fontSize: 12 }}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {c?.penalty_status === 'APPLIED' && (
                  <View style={[styles.statusStrip, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700', flex: 1 }}>
                      ₹{c.penalty_amount} penalty {c.penalty_applied_by === 'AUTO' ? 'auto-applied' : `applied by ${c.penalty_applied_by}`}
                    </Text>
                    <TouchableOpacity onPress={() => { setNoteText(''); setNoteModal({ mode: 'waive', item: it }); }}>
                      <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 12 }}>Waive</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {c?.penalty_status === 'WAIVED' && (
                  <Text style={{ color: '#059669', fontSize: 12, fontWeight: '700' }}>Penalty waived{c.waive_reason ? `: ${c.waive_reason}` : ''}</Text>
                )}
                {c?.resolution_note ? (
                  <Text style={{ color: '#059669', fontSize: 12 }}>Resolved by {c.resolved_by}: {c.resolution_note}</Text>
                ) : null}

                {low && (
                  <View style={styles.actionRow}>
                    {(!c || c.penalty_status === 'NONE') && (
                      <TouchableOpacity style={[styles.actionBtn, { borderColor: '#DC2626' }]} onPress={() => applyPenalty(it)}>
                        <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 12 }}>Apply penalty</Text>
                      </TouchableOpacity>
                    )}
                    {!c?.resolution_note && (
                      <TouchableOpacity style={[styles.actionBtn, { borderColor: '#059669', backgroundColor: '#059669' }]} onPress={() => { setNoteText(''); setNoteModal({ mode: 'resolve', item: it }); }}>
                        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>Mark resolved</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!noteModal} transparent animationType="fade" onRequestClose={() => setNoteModal(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.cardTop}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>
                {noteModal?.mode === 'waive' ? 'Waive penalty' : 'Mark resolved'}
              </Text>
              <TouchableOpacity onPress={() => setNoteModal(null)}><X size={20} color={themeColors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12.5, color: themeColors.textSecondary, marginVertical: 8 }}>
              {noteModal?.mode === 'waive'
                ? 'The penalty is refunded to the fleet driver\'s wallet. Say why (e.g. fake rating, customer mistake).'
                : 'What was done? (e.g. called customer, apology sent, driver warned)'}
            </Text>
            <TextInput
              style={[styles.noteInput, { color: themeColors.text, borderColor: themeColors.border }]}
              multiline
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Type here..."
              placeholderTextColor={themeColors.textMuted}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: noteModal?.mode === 'waive' ? '#DC2626' : '#059669', marginTop: 10, alignSelf: 'stretch', opacity: acting || noteText.trim().length < 3 ? 0.6 : 1 }]}
              onPress={submitNote}
              disabled={acting || noteText.trim().length < 3}
            >
              <Text style={styles.saveBtnText}>{acting ? 'Saving...' : noteModal?.mode === 'waive' ? 'Waive & refund' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  scoreCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  scoreText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  summaryTitle: { fontSize: 15, fontWeight: '800' },
  settingsCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  settingsTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsTitle: { flex: 1, fontSize: 13.5, fontWeight: '800' },
  label: { fontSize: 11.5, fontWeight: '700', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  amountInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, width: 80, fontWeight: '700' },
  saveBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', marginLeft: 'auto' },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12.5 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipText: { fontSize: 12.5, fontWeight: '800' },
  countBadge: { borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 },
  countBadgeText: { color: '#FFF', fontSize: 10.5, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 8 },
  empty: { borderWidth: 1, borderRadius: 12, padding: 20 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  comment: { fontSize: 13.5, fontStyle: 'italic', lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 13, fontWeight: '700' },
  metaSub: { fontSize: 12, marginTop: 1 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  statusStrip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 14, padding: 16 },
  noteInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
});
