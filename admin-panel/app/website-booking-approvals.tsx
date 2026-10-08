import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Globe, Check, X, Clock, CalendarClock, Pause, Play, SlidersHorizontal, Zap } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, EmptyState } from '@/components/ui';

// Website Approvals: every confirmed website booking that is waiting to be posted to drivers.
// Each card shows when it was confirmed, the PICKUP, when it will post by itself (exact date/time and why), and the driver | extra
// numbers it will be posted with. Staff can customize the fare, move the posting time, hold, or post now. Select cards to act on many.

interface Preview {
  cost_per_km: number; extra_cost_per_km: number; driver_allowance: number; extra_driver_allowance: number;
  permit_charges: number; extra_permit_charges: number; permit_rule?: string | null;
  toll_charges?: number; hill_charges?: number; gst_amount?: number;
}
interface PendingBookingRow {
  id: string;
  customer_name: string;
  customer_number: string;
  pickup_drop_location: any;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  quoted_total_amount: number | null;
  customer_total?: number | null;
  source: string;
  created_at: string;
  confirmed_at?: string;
  is_urgent: boolean;
  auto_post_at: string | null;
  auto_post_reason?: string;
  rule_text?: string;
  is_held?: boolean;
  hold_until?: string | null;
  post_at_override?: string | null;
  latest_post_time?: string | null;
  custom_driver_fare?: boolean;
  post_preview?: Preview | null;
  trip_distance?: number | null;
}

const IST = 'Asia/Kolkata';
const HOUR = 3600000;

function locationLabel(loc: any): string {
  if (!loc) return 'N/A';
  if (loc.pickup || loc.drop) {
    const p = loc.pickup?.address || loc.pickup?.city || '?';
    const d = loc.drop?.address || loc.drop?.city || '?';
    return `${p} → ${d}`;
  }
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => loc[k]).join(' → ');
}

function fmtDay(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short' });
}
function fmtTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtFull(iso?: string | null): string {
  return iso ? `${fmtDay(iso)}, ${fmtTime(iso)}` : '-';
}

function timeUntil(iso?: string | null): string {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'posting any moment';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `in ${hrs} h ${mins % 60} min`;
  return `in ${Math.floor(hrs / 24)} d ${hrs % 24} h`;
}

const pair = (a?: number, b?: number) => (b && b > 0 ? `${a ?? 0} | ${b}` : `${a ?? 0}`);

export default function WebsiteBookingApprovalsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [items, setItems] = useState<PendingBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<PendingBookingRow | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [scheduleTarget, setScheduleTarget] = useState<PendingBookingRow | null>(null);
  const [customizeTarget, setCustomizeTarget] = useState<PendingBookingRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await apiService.getPendingWebsiteBookings()) as any as PendingBookingRow[];
      setItems(data);
      setSelected((prev) => new Set([...prev].filter((id) => data.some((b) => b.id === id))));
    } catch (error: any) {
      console.error('Failed to load pending website bookings:', error);
      Alert.alert('Error', error?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime()),
    [items]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((b) => b.id)));

  const call = async (path: string, method: string, body?: any) =>
    apiService.makeRequest(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

  const handleApproveNow = (booking: PendingBookingRow) => {
    Alert.alert('Post to drivers now?', `${locationLabel(booking.pickup_drop_location)}\nPickup ${fmtFull(booking.start_date_time)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Post Now',
        onPress: async () => {
          setBusy(booking.id);
          try {
            await apiService.approveWebsiteBooking(booking.id);
            setItems((prev) => prev.filter((b) => b.id !== booking.id));
            showToast('Posted to drivers.', 'success');
          } catch (e: any) {
            Alert.alert('Approve Failed', e?.message || 'Failed to approve booking');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const bulk = async (kind: 'post' | 'hold' | 'release') => {
    const ids = [...selected];
    if (!ids.length) return;
    const run = async () => {
      setBusy('bulk');
      try {
        if (kind === 'post') {
          const r: any = await call('/admin/website-bookings/bulk-approve', 'POST', { ids });
          showToast(`Posted ${r.approved_count}${r.failed?.length ? `, ${r.failed.length} failed` : ''}`, r.failed?.length ? 'error' : 'success');
        } else if (kind === 'hold') {
          const r: any = await call('/admin/website-bookings/bulk-hold', 'POST', { ids });
          showToast(`Held ${r.held.length}${r.failed?.length ? ` - ${r.failed.length} too close to pickup` : ''}`, r.failed?.length ? 'error' : 'success');
        } else {
          const r: any = await call('/admin/website-bookings/bulk-release', 'POST', { ids });
          showToast(`Released ${r.released.length}`, 'success');
        }
        setSelected(new Set());
        await load();
      } catch (e: any) {
        Alert.alert('Failed', e?.message || 'Could not complete the action');
      } finally {
        setBusy(null);
      }
    };
    if (kind === 'post') {
      Alert.alert(`Post ${ids.length} booking${ids.length > 1 ? 's' : ''} now?`, 'They go to drivers immediately with their driver fare.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Post Now', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) {
      Alert.alert('Reason Required', 'Enter a reason for rejecting this booking');
      return;
    }
    setBusy(rejectTarget.id);
    try {
      await apiService.rejectWebsiteBooking(rejectTarget.id, rejectNotes.trim());
      setItems((prev) => prev.filter((b) => b.id !== rejectTarget.id));
      showToast('Booking rejected.', 'success');
      setRejectTarget(null);
      setRejectNotes('');
    } catch (e: any) {
      Alert.alert('Reject Failed', e?.message || 'Failed to reject booking');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  const c = themeColors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}
          accessibilityLabel="Go back"
          style={{ padding: 6, marginRight: 8 }}
        >
          <ArrowLeft size={22} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>Website Approvals ({items.length})</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>Confirmed bookings waiting to post · by pickup date</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      {items.length > 0 && (
        <TouchableOpacity onPress={toggleAll} activeOpacity={0.7} style={[styles.selectAllRow, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
          <Box checked={allSelected} partial={selected.size > 0 && !allSelected} c={c} />
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </Text>
          {selected.size > 0 && <Text style={{ color: c.textMuted, fontSize: 12 }}> · tap a card's box to add or remove</Text>}
        </TouchableOpacity>
      )}

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: selected.size > 0 ? 120 : 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.text} />}
        ListEmptyComponent={
          <EmptyState icon={Globe} title="No Pending Approvals" message="No website bookings are waiting to be posted." />
        }
        renderItem={({ item }) => {
          const p = item.post_preview;
          const isSel = selected.has(item.id);
          const total = item.customer_total ?? item.quoted_total_amount;
          return (
            <Card style={[styles.rowCard, isSel && { borderColor: c.primary, borderWidth: 2 }]}>
              <View style={styles.cardTop}>
                <TouchableOpacity onPress={() => toggle(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Select booking">
                  <Box checked={isSel} c={c} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customerName, { color: c.text }]} numberOfLines={1}>{item.customer_name}</Text>
                  <Text style={[styles.meta, { color: c.textSecondary }]}>
                    {item.customer_number} • {item.trip_type} ({item.car_type})
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {item.is_urgent ? <StatusPill label="URGENT" variant="danger" /> : <StatusPill label="Website" variant="info" />}
                  {item.is_held ? <StatusPill label="HELD" variant="warning" /> : null}
                </View>
              </View>

              <Text style={[styles.route, { color: c.text }]}>{locationLabel(item.pickup_drop_location)}</Text>

              {/* PICKUP - the thing staff plan around */}
              <View style={[styles.pickupBox, { backgroundColor: isDark ? '#1E3A8A33' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]}>
                <Text style={[styles.pickupLabel, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>PICKUP</Text>
                <Text style={[styles.pickupValue, { color: c.text }]}>
                  {fmtDay(item.start_date_time)} · {fmtTime(item.start_date_time)}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{timeUntil(item.start_date_time)}</Text>
              </View>
              <Text style={[styles.meta, { color: c.textMuted, marginTop: 6 }]}>Confirmed {fmtFull(item.confirmed_at || item.created_at)}</Text>

              <View style={styles.amountRow}>
                {total != null && <Text style={[styles.amount, { color: c.success }]}>₹{total.toLocaleString('en-IN')}</Text>}
                {item.trip_distance ? <Text style={[styles.meta, { color: c.textMuted }]}>{Math.round(item.trip_distance)} km</Text> : null}
              </View>

              {p && (
                <View style={[styles.fareBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.fareHead, { color: c.textSecondary }]}>
                    DRIVER SEES (driver | extra){item.custom_driver_fare ? ' · customized' : ''}
                  </Text>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                    ₹/km {pair(p.cost_per_km, p.extra_cost_per_km)}   ·   Bata {pair(p.driver_allowance, p.extra_driver_allowance)}   ·   Permit {pair(p.permit_charges, p.extra_permit_charges)}
                  </Text>
                </View>
              )}

              {/* WHEN it posts, and why */}
              <View style={[styles.timerBox, { backgroundColor: isDark ? c.surfaceAlt : c.warningLight }]}>
                <Clock size={13} color={c.warning} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timerText, { color: c.warning }]}>
                    {item.auto_post_at ? `Auto-posts ${fmtFull(item.auto_post_at)} (${timeUntil(item.auto_post_at)})` : 'Will not post by itself - waits for staff'}
                  </Text>
                  {!!(item.rule_text || item.auto_post_reason) && (
                    <Text style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 2 }}>{item.rule_text || item.auto_post_reason}</Text>
                  )}
                </View>
              </View>

              <View style={styles.smallRow}>
                <TouchableOpacity style={[styles.smallBtn, { borderColor: c.border }]} onPress={() => setCustomizeTarget(item)} disabled={busy === item.id}>
                  <SlidersHorizontal size={14} color={c.primary} />
                  <Text style={[styles.smallBtnText, { color: c.primary }]}>Customize</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { borderColor: c.border }]} onPress={() => setScheduleTarget(item)} disabled={busy === item.id || !item.auto_post_at}>
                  <CalendarClock size={14} color={c.primary} />
                  <Text style={[styles.smallBtnText, { color: c.primary }]}>Change time</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: isDark ? c.errorLight : '#FEE2E2', borderWidth: StyleSheet.hairlineWidth, borderColor: c.error }]}
                  onPress={() => { setRejectTarget(item); setRejectNotes(''); }}
                  disabled={busy === item.id}
                >
                  <X size={16} color={c.error} />
                  <Text style={[styles.denyBtnText, { color: c.error }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: c.success }]} onPress={() => handleApproveNow(item)} disabled={busy === item.id}>
                  {busy === item.id ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Check size={16} color="white" />
                      <Text style={styles.approveBtnText}>Approve Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* Selection bar */}
      {selected.size > 0 && (
        <View style={[styles.selectBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 14 }}>{selected.size} selected</Text>
          <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity style={[styles.barBtn, { backgroundColor: c.success }]} onPress={() => bulk('post')} disabled={busy === 'bulk'}>
              <Zap size={14} color="#fff" />
              <Text style={styles.barBtnText}>Post now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.barBtn, { backgroundColor: c.warning }]} onPress={() => bulk('hold')} disabled={busy === 'bulk'}>
              <Pause size={14} color="#fff" />
              <Text style={styles.barBtnText}>Hold</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.barBtn, { backgroundColor: c.primary }]} onPress={() => bulk('release')} disabled={busy === 'bulk'}>
              <Play size={14} color="#fff" />
              <Text style={styles.barBtnText}>Release</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {selected.size > 0 && (
        <Text style={[styles.holdNote, { color: c.textMuted, backgroundColor: c.surface }]}>
          Hold pauses auto-post until 2 hrs before pickup; then the alarm rings and it posts by the normal rule.
        </Text>
      )}

      <ScheduleModal item={scheduleTarget} c={c} isDark={isDark} onClose={() => setScheduleTarget(null)}
        onSave={async (iso) => {
          if (!scheduleTarget) return;
          try {
            await call(`/admin/website-bookings/${scheduleTarget.id}/schedule`, 'PUT', { post_at: iso });
            showToast(iso ? 'Posting time updated.' : 'Back to the rule time.', 'success');
            setScheduleTarget(null);
            load();
          } catch (e: any) {
            Alert.alert('Could not change time', e?.message || 'Try again');
          }
        }} />

      <CustomizeModal item={customizeTarget} c={c} isDark={isDark} onClose={() => setCustomizeTarget(null)}
        onSave={async (body) => {
          if (!customizeTarget) return;
          try {
            await call(`/admin/website-bookings/${customizeTarget.id}/customize`, 'PUT', body);
            showToast(body.reset ? 'Back to the driver tariff.' : 'Driver fare saved.', 'success');
            setCustomizeTarget(null);
            load();
          } catch (e: any) {
            Alert.alert('Could not save', e?.message || 'Try again');
          }
        }} />

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Reject Website Booking</Text>
            <Text style={[styles.modalSubtitle, { color: c.textSecondary }]}>Why is this booking for {rejectTarget?.customer_name} being rejected?</Text>
            <TextInput
              style={[styles.modalInputMultiline, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
              placeholder="Reason..."
              placeholderTextColor={c.textMuted}
              value={rejectNotes}
              onChangeText={setRejectNotes}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? c.surfaceAlt : '#F3F4F6' }]} onPress={() => setRejectTarget(null)}>
                <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: c.error }, busy === rejectTarget?.id && { opacity: 0.6 }]}
                onPress={confirmReject}
                disabled={busy === rejectTarget?.id}
              >
                {busy === rejectTarget?.id ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalDenyButtonText}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

function Box({ checked, partial, c }: { checked: boolean; partial?: boolean; c: any }) {
  return (
    <View style={[styles.box, { borderColor: checked || partial ? c.primary : c.textMuted, backgroundColor: checked ? c.primary : 'transparent' }]}>
      {checked ? <Check size={14} color="#fff" /> : partial ? <View style={{ width: 10, height: 2, backgroundColor: c.primary }} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- change posting time
function ScheduleModal({ item, c, isDark, onClose, onSave }: { item: PendingBookingRow | null; c: any; isDark: boolean; onClose: () => void; onSave: (iso: string | null) => void }) {
  const [mode, setMode] = useState<'hours' | 'exact'>('hours');
  const [hours, setHours] = useState('15');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    if (!item) return;
    const pickup = new Date(item.start_date_time).getTime();
    const cur = item.auto_post_at ? new Date(item.auto_post_at).getTime() : pickup - 15 * HOUR;
    setHours(String(Math.max(2, Math.round(((pickup - cur) / HOUR) * 10) / 10)));
    const ist = new Date(cur + 5.5 * HOUR).toISOString();
    setDate(ist.slice(0, 10));
    setTime(ist.slice(11, 16));
    setMode('hours');
  }, [item]);

  if (!item) return null;
  const pickup = new Date(item.start_date_time).getTime();
  const latest = item.latest_post_time ? new Date(item.latest_post_time).getTime() : pickup - 2 * HOUR;
  let postAt: number | null = null;
  if (mode === 'hours') {
    const h = parseFloat(hours);
    postAt = Number.isFinite(h) ? pickup - h * HOUR : null;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}$/.test(time)) {
    const t = new Date(`${date}T${time.padStart(5, '0')}:00+05:30`).getTime();
    postAt = Number.isFinite(t) ? t : null;
  }
  let problem = '';
  if (postAt == null) problem = 'Enter a valid value';
  else if (postAt <= Date.now()) problem = 'That time has already passed';
  else if (postAt > latest) problem = `Latest allowed is 2 hrs before pickup (${fmtFull(new Date(latest).toISOString())})`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
          <Text style={[styles.modalTitle, { color: c.text }]}>When should it post?</Text>
          <Text style={[styles.modalSubtitle, { color: c.textSecondary }]}>
            Pickup {fmtFull(item.start_date_time)}. Now: {item.auto_post_at ? fmtFull(item.auto_post_at) : 'not scheduled'}.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['hours', 'exact'] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.chip, { borderColor: mode === m ? c.primary : c.border, backgroundColor: mode === m ? c.primary + '22' : 'transparent' }]}>
                <Text style={{ color: mode === m ? c.primary : c.textSecondary, fontWeight: '700', fontSize: 12.5 }}>{m === 'hours' ? 'Hours before pickup' : 'Exact date & time'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'hours' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.background, width: 90 }]} keyboardType="decimal-pad" value={hours} onChangeText={setHours} />
              <Text style={{ color: c.textSecondary }}>hours before pickup</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.background, flex: 1.4 }]} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} value={date} onChangeText={setDate} />
              <TextInput style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.background, flex: 1 }]} placeholder="HH:MM" placeholderTextColor={c.textMuted} value={time} onChangeText={setTime} />
            </View>
          )}
          <Text style={{ marginTop: 10, fontWeight: '700', color: problem ? c.error : c.success, fontSize: 13 }}>
            {problem || `Will post: ${fmtFull(new Date(postAt as number).toISOString())} (India time)`}
          </Text>
          <View style={[styles.modalButtonsRow, { marginTop: 16 }]}>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? c.surfaceAlt : '#F3F4F6' }]} onPress={onClose}>
              <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: c.primary, opacity: problem ? 0.5 : 1 }]} disabled={!!problem} onPress={() => onSave(new Date(postAt as number).toISOString())}>
              <Text style={styles.modalDenyButtonText}>Save time</Text>
            </TouchableOpacity>
          </View>
          {!!item.post_at_override && (
            <TouchableOpacity onPress={() => onSave(null)} style={{ alignItems: 'center', paddingTop: 12 }}>
              <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>Use the rule's time again</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------- customize driver fare
const FIELDS: Array<[keyof Preview, string]> = [
  ['cost_per_km', 'Driver ₹/km'],
  ['extra_cost_per_km', 'Extra ₹/km'],
  ['driver_allowance', 'Driver bata'],
  ['extra_driver_allowance', 'Extra bata'],
  ['permit_charges', 'Driver permit'],
  ['extra_permit_charges', 'Extra permit'],
  ['toll_charges', 'Toll charges'],
  ['hill_charges', 'Hill charges'],
  ['gst_amount', 'GST amount'],
];

function CustomizeModal({ item, c, isDark, onClose, onSave }: { item: PendingBookingRow | null; c: any; isDark: boolean; onClose: () => void; onSave: (body: any) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!item) return;
    const p: any = item.post_preview || {};
    setVals(Object.fromEntries(FIELDS.map(([k]) => [k, String(p[k] ?? 0)])));
  }, [item]);
  if (!item) return null;
  const num = (k: string) => Math.max(0, Math.round(Number(vals[k]) || 0));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, maxHeight: '90%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: c.text }]}>Customize driver fare</Text>
            <Text style={[styles.modalSubtitle, { color: c.textSecondary }]}>
              What the driver gets, and what goes to extra. The customer pays ₹{(item.customer_total ?? item.quoted_total_amount ?? 0).toLocaleString('en-IN')}; it changes only if you raise or lower the total of these.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {FIELDS.map(([k, label]) => (
                <View key={k} style={{ width: '47%' }}>
                  <Text style={{ color: c.textSecondary, fontSize: 11.5, fontWeight: '700', marginBottom: 4 }}>{label}</Text>
                  <TextInput style={[styles.input, { borderColor: c.border, color: c.text, backgroundColor: c.background }]} keyboardType="number-pad" value={vals[k] ?? ''} onChangeText={(t) => setVals((v) => ({ ...v, [k]: t.replace(/[^0-9]/g, '') }))} />
                </View>
              ))}
            </View>
            <View style={[styles.modalButtonsRow, { marginTop: 18 }]}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? c.surfaceAlt : '#F3F4F6' }]} onPress={onClose}>
                <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: c.primary }]} onPress={() => onSave(Object.fromEntries(FIELDS.map(([k]) => [k, num(k)])))}>
                <Text style={styles.modalDenyButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
            {item.custom_driver_fare && (
              <TouchableOpacity onPress={() => onSave({ reset: true })} style={{ alignItems: 'center', paddingTop: 12 }}>
                <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>Back to the driver tariff</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowCard: { padding: 16, marginBottom: 12, borderRadius: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  customerName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 2, fontWeight: '500' },
  route: { fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  pickupBox: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pickupLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  pickupValue: { fontSize: 17, fontWeight: '800', marginTop: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  amount: { fontSize: 18, fontWeight: '800' },
  fareBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginTop: 8 },
  fareHead: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 3 },
  timerBox: { flexDirection: 'row', gap: 7, marginTop: 10, padding: 10, borderRadius: 8 },
  timerText: { fontSize: 12.5, fontWeight: '800' },
  smallRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  smallBtnText: { fontSize: 13, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8 },
  denyBtnText: { fontWeight: '700', fontSize: 14 },
  approveBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  selectBar: { position: 'absolute', left: 0, right: 0, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  barBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  holdNote: { position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 10.5, textAlign: 'center', paddingVertical: 3 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  modalInputMultiline: { borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top', marginBottom: 20 },
  modalButtonsRow: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalDenyButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
