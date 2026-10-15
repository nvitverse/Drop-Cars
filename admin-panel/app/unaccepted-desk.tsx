import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Bell, Clock, Send, Share2, UserCheck, XCircle, ChevronDown, ChevronUp, CheckCircle2, Link2, MapPin } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { openWaUrl } from '@/utils/whatsapp';

// Unaccepted bookings: every posted booking nobody has accepted, with what to do about it. The alarm repeats at half of the time that is left
// (so it keeps coming without nagging), can be snoozed, and each booking can be shared to a group, handed to a vendor / fleet, marked as executed
// somewhere else (who, where, driver, cab, commission) or cancelled - the customer then gets a detailed e-mail with the refund position.

type Case = {
  order_id: number; status: string; route: string; customer_name?: string; customer_number?: string; car_type?: string; trip_type?: string; start_date_time?: string;
  mins_to_pickup?: number | null; posted_at?: string; vendor_price?: number | null; advance_received?: number | null; alarms_fired: number; alarm_due: boolean;
  next_alarm_at?: string | null; snoozed_until?: string | null; critical: boolean; shared_count: number; last_shared_by?: string | null;
  exec: { platform?: string | null; by?: string | null; driver_name?: string | null; driver_phone?: string | null; vehicle_number?: string | null; note?: string | null; commission_due?: number | null; commission_received: boolean; follow_up_at?: string | null; follow_up_done: boolean };
  cancel_reason?: string | null; customer_emailed?: boolean; history: { at: string; by: string; action: string; detail: string }[];
};

const inr = (n?: number | null) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const hm = (m?: number | null) => (m == null ? '' : m < 0 ? 'time has passed' : m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const clock = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');
const CANCEL_REASONS = ['No vehicle available at that time', 'Driver is not available', 'Could not reach a driver for this route', 'Customer asked to cancel', 'Duplicate booking'];
const PLATFORMS = ['Another fleet\'s app', 'A vendor', 'Another platform', 'Our own driver'];

export default function UnacceptedDesk() {
  const router = useRouter();
  const { themeColors: c, isDark } = useTheme();
  const [cases, setCases] = useState<Case[]>([]);
  const [snoozeOptions, setSnoozeOptions] = useState<number[]>([15, 30, 60]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [exec, setExec] = useState<Case | null>(null);
  const [cancel, setCancel] = useState<Case | null>(null);
  const [form, setForm] = useState({ platform: '', by: '', driver_name: '', driver_phone: '', vehicle_number: '', note: '', commission: '' });
  const [reason, setReason] = useState('');
  const [mailCustomer, setMailCustomer] = useState(true);
  const [portal, setPortal] = useState<Record<number, any>>({});          // the web link of a booking: status, link, OTP message, location

  const load = useCallback(async () => {
    try {
      const r = await apiService.makeRequest('/admin/unaccepted-desk');
      setCases(r.cases || []);
      if (r.snooze_options?.length) setSnoozeOptions(r.snooze_options);
    } catch (e: any) { Alert.alert('Could not load', e?.message || 'Try again'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]));

  const call = async (order_id: number, path: string, body?: any) => {
    setBusy(order_id);
    try {
      const r = await apiService.makeRequest(`/admin/unaccepted-desk/${order_id}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load();
      return r;
    } catch (e: any) { Alert.alert('Could not do that', e?.message || 'Try again'); return null; }
    finally { setBusy(null); }
  };

  const active = useMemo(() => cases.filter((x) => x.status === 'OPEN' || x.status === 'SHARED'), [cases]);
  const handled = useMemo(() => cases.filter((x) => x.status === 'EXECUTED_ELSEWHERE'), [cases]);
  const needAction = active.filter((x) => x.alarm_due || x.critical).length;

  const share = async (cs: Case) => {
    const r = await call(cs.order_id, 'share');
    if (!r) return;
    openPortal(cs.order_id, false);
    const opened = await openWaUrl(r.whatsapp_url);
    if (!opened) await Share.share({ message: r.message });
  };

  // Web execution link: someone outside the apps takes the booking, pays the commission and runs the trip from a phone browser
  const openPortal = async (id: number, create: boolean) => {
    setBusy(id);
    try {
      const r = await apiService.makeRequest(`/admin/portal/${id}${create ? '' : '?create=false'}`, create ? { method: 'POST', body: JSON.stringify({}) } : undefined);
      setPortal((p) => ({ ...p, [id]: r }));
    } catch (e: any) { Alert.alert('Could not open the web link', e?.message || 'Try again'); }
    finally { setBusy(null); }
  };
  const confirmPay = async (id: number, received: boolean) => {
    setBusy(id);
    try {
      const r = await apiService.makeRequest(`/admin/portal/${id}/confirm-payment`, { method: 'POST', body: JSON.stringify({ received }) });
      setPortal((p) => ({ ...p, [id]: { ...r, customer_message: p[id]?.customer_message } }));
      await load();
    } catch (e: any) { Alert.alert('Could not update', e?.message || 'Try again'); }
    finally { setBusy(null); }
  };
  const sendCustomer = async (id: number) => {
    const m = portal[id]?.customer_message;
    if (!m) return;
    const opened = await openWaUrl(m.whatsapp_url);
    if (!opened) await Share.share({ message: m.message });
  };

  const renderPortal = (x: Case) => {
    const p = portal[x.order_id];
    if (!p) return (
      <TouchableOpacity disabled={busy === x.order_id} onPress={() => openPortal(x.order_id, true)} style={[s.act, { backgroundColor: '#0F766E', alignSelf: 'flex-start', marginTop: 8 }]}>
        <Link2 size={14} color="#FFFFFF" /><Text style={s.actTxt}>Web link (no-app executor)</Text>
      </TouchableOpacity>
    );
    const stateTxt: Record<string, string> = { OPEN: 'Waiting for someone to take it', TAKEN: 'Taken - not started', STARTED: 'Trip running', ENDED: 'Trip ended', CANCELLED: 'Cancelled' };
    return (
      <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: isDark ? '#0F172A' : '#F0FDFA', gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>Web link · {stateTxt[p.status] || p.status}</Text>
        {!!p.executor && <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{p.executor.name} · {p.executor.phone} · {p.executor.vehicle_number}{p.executor.vehicle_model ? ` (${p.executor.vehicle_model})` : ''}</Text>}
        <View style={s.wrap}>
          <TouchableOpacity onPress={() => Share.share({ message: p.link })} style={[s.chip, { borderColor: c.border }]}><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>Share / copy link</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => openPortal(x.order_id, false)} style={[s.chip, { borderColor: c.border }]}><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>Refresh</Text></TouchableOpacity>
        </View>
        {!!p.executor && (
          <View style={s.rowBetween}>
            <Text style={{ color: c.text, fontSize: 12.5, flex: 1 }}>Commission {inr(p.commission_due)} · {p.commission_status === 'CONFIRMED' ? 'received' : p.commission_status === 'REPORTED' ? `UTR ${p.commission_utr || ''} - check your bank` : 'not paid yet'}</Text>
            <TouchableOpacity disabled={busy === x.order_id} onPress={() => confirmPay(x.order_id, p.commission_status !== 'CONFIRMED')} style={[s.chip, { borderColor: p.commission_status === 'CONFIRMED' ? '#16A34A' : '#F59E0B' }]}>
              <CheckCircle2 size={12} color={p.commission_status === 'CONFIRMED' ? '#16A34A' : '#F59E0B'} /><Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{p.commission_status === 'CONFIRMED' ? 'Undo' : 'Money received'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!p.executor && <TouchableOpacity onPress={() => sendCustomer(x.order_id)} style={[s.act, { backgroundColor: '#25D366', alignSelf: 'flex-start' }]}><Send size={14} color="#FFFFFF" /><Text style={s.actTxt}>Send driver + OTPs to customer</Text></TouchableOpacity>}
        {p.start_km != null && <Text style={{ color: c.textSecondary, fontSize: 12 }}>Start {p.start_km} km{p.end_km != null ? ` · End ${p.end_km} km (${p.end_km - p.start_km} km)` : ''}</Text>}
        {!!p.location && <TouchableOpacity onPress={() => openWaUrl(p.location.map)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MapPin size={13} color={c.primary} /><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Last location {clock(p.location.at)}</Text></TouchableOpacity>}
        {p.rating != null && <Text style={{ color: p.rating <= 2 ? '#DC2626' : c.text, fontSize: 12.5, fontWeight: '700' }}>Customer rating {p.rating}/5{p.feedback ? ` - ${p.feedback}` : ''}</Text>}
      </View>
    );
  };

  const submitExec = async () => {
    if (!exec) return;
    if (!form.platform.trim()) return Alert.alert('Where?', 'Choose or type where this booking is being executed.');
    const r = await call(exec.order_id, 'executed-elsewhere', {
      platform: form.platform.trim(), by: form.by.trim(), driver_name: form.driver_name.trim(), driver_phone: form.driver_phone.trim(), vehicle_number: form.vehicle_number.trim(),
      note: form.note.trim(), commission_due: form.commission.trim() === '' ? undefined : parseInt(form.commission, 10) || 0,
    });
    if (r) { setExec(null); Alert.alert('Saved', 'The booking is marked as executed elsewhere. A follow-up appears after the trip so someone reports how it went.'); }
  };

  const submitCancel = async () => {
    if (!cancel) return;
    if (!reason.trim()) return Alert.alert('Reason', 'Choose or type why this booking is being cancelled.');
    const r = await call(cancel.order_id, 'cancel', { reason: reason.trim(), email_customer: mailCustomer });
    if (r) {
      setCancel(null);
      Alert.alert('Cancelled', r.email?.sent ? `The customer was e-mailed (${r.email.to}).` : `The booking is cancelled. The customer was NOT e-mailed: ${r.email?.why || 'no e-mail on file'}. Please tell them yourself.`);
    }
  };

  const card = [s.card, { backgroundColor: c.surface, borderColor: c.border }];
  const inp = [s.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }];

  const renderCase = ({ item: x }: { item: Case }) => {
    const live = x.status === 'OPEN' || x.status === 'SHARED';
    const red = x.critical || x.alarm_due;
    const expanded = !!open[x.order_id];
    return (
      <View style={[card, { borderColor: red ? '#EF4444' : c.border, borderWidth: red ? 2 : 1 }]}>
        <View style={s.rowBetween}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>#{x.order_id} · {String(x.car_type || '').replace(/_/g, ' ')}</Text>
          <View style={[s.pill, { backgroundColor: x.status === 'SHARED' ? '#DBEAFE' : x.status === 'EXECUTED_ELSEWHERE' ? '#DCFCE7' : '#FEE2E2' }]}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: x.status === 'SHARED' ? '#1E40AF' : x.status === 'EXECUTED_ELSEWHERE' ? '#166534' : '#991B1B' }}>{x.status.replace('_', ' ')}</Text>
          </View>
        </View>
        <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '700', marginTop: 4 }}>{x.route || 'Route not available'}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 2 }}>
          Pickup {clock(x.start_date_time)} · <Text style={{ color: red ? '#DC2626' : c.text, fontWeight: '800' }}>in {hm(x.mins_to_pickup)}</Text> · {inr(x.vendor_price)}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 11.5, marginTop: 2 }}>{x.customer_name || 'Customer'} · posted {clock(x.posted_at)}{x.advance_received ? ` · advance ${inr(x.advance_received)}` : ''}</Text>

        {live && (
          <View style={{ marginTop: 8 }}>
            {x.alarm_due ? (
              <View style={s.alarm}>
                <Bell size={14} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontWeight: '800', flex: 1, marginLeft: 6 }}>Alarm due{x.alarms_fired ? ` (reminder ${x.alarms_fired + 1})` : ''}</Text>
                <TouchableOpacity onPress={() => call(x.order_id, 'seen')} style={s.ackBtn}><Text style={{ color: '#991B1B', fontWeight: '800', fontSize: 12 }}>Got it</Text></TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {x.snoozed_until ? `Snoozed until ${clock(x.snoozed_until)}` : x.next_alarm_at ? `Next alarm ${clock(x.next_alarm_at)}` : 'No more automatic alarms - act on this now'}
                {x.alarms_fired ? ` · ${x.alarms_fired} rang` : ''}{x.shared_count ? ` · shared ${x.shared_count}x${x.last_shared_by ? ` (${x.last_shared_by})` : ''}` : ''}
              </Text>
            )}
            <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 6, fontWeight: '700' }}>SNOOZE</Text>
            <View style={s.wrap}>
              {snoozeOptions.map((m) => (
                <TouchableOpacity key={m} disabled={busy === x.order_id} onPress={() => call(x.order_id, 'snooze', { minutes: m })} style={[s.chip, { borderColor: c.border }]}>
                  <Clock size={12} color={c.text} /><Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{m} min</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.wrap}>
              <TouchableOpacity onPress={() => share(x)} style={[s.act, { backgroundColor: '#25D366' }]}><Share2 size={14} color="#FFFFFF" /><Text style={s.actTxt}>Share to group</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'unassigned', allocate: String(x.order_id) } } as any)} style={[s.act, { backgroundColor: c.primary }]}><Send size={14} color="#FFFFFF" /><Text style={s.actTxt}>Assign vendor</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setForm({ platform: '', by: '', driver_name: '', driver_phone: '', vehicle_number: '', note: '', commission: String(Math.max(200, Math.round((x.vendor_price || 0) * 0.1))) }); setExec(x); }} style={[s.act, { backgroundColor: '#7C3AED' }]}><UserCheck size={14} color="#FFFFFF" /><Text style={s.actTxt}>Executed elsewhere</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setReason(''); setMailCustomer(true); setCancel(x); }} style={[s.act, { backgroundColor: '#DC2626' }]}><XCircle size={14} color="#FFFFFF" /><Text style={s.actTxt}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {(live || x.status === 'EXECUTED_ELSEWHERE') && renderPortal(x)}

        {x.status === 'EXECUTED_ELSEWHERE' && (
          <View style={{ marginTop: 8, gap: 4 }}>
            <Text style={{ color: c.text, fontSize: 13 }}>Executed on <Text style={{ fontWeight: '800' }}>{x.exec.platform}</Text>{x.exec.by ? ` by ${x.exec.by}` : ''}</Text>
            {!!(x.exec.driver_name || x.exec.vehicle_number) && <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{x.exec.driver_name || '-'} {x.exec.driver_phone ? `· ${x.exec.driver_phone}` : ''} · {x.exec.vehicle_number || '-'}</Text>}
            {!!x.exec.note && <Text style={{ color: c.textMuted, fontSize: 12 }}>{x.exec.note}</Text>}
            <View style={s.rowBetween}>
              <Text style={{ color: c.text, fontSize: 13 }}>Commission due <Text style={{ fontWeight: '800' }}>{inr(x.exec.commission_due)}</Text></Text>
              <TouchableOpacity onPress={() => call(x.order_id, 'commission', { received: !x.exec.commission_received })} style={[s.chip, { borderColor: x.exec.commission_received ? '#16A34A' : '#F59E0B' }]}>
                <CheckCircle2 size={12} color={x.exec.commission_received ? '#16A34A' : '#F59E0B'} /><Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{x.exec.commission_received ? 'Received' : 'Mark received'}</Text>
              </TouchableOpacity>
            </View>
            {!x.exec.follow_up_done && (
              <TouchableOpacity onPress={() => Alert.prompt ? Alert.prompt('How did the trip go?', 'One line for the record (done, cancelled, given to someone else ...)', (t) => call(x.order_id, 'follow-up-done', { outcome: t || '' })) : call(x.order_id, 'follow-up-done', { outcome: 'done' })} style={[s.act, { backgroundColor: '#0EA5E9', alignSelf: 'flex-start' }]}>
                <AlertTriangle size={14} color="#FFFFFF" /><Text style={s.actTxt}>Report outcome (due {clock(x.exec.follow_up_at)})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity onPress={() => setOpen({ ...open, [x.order_id]: !expanded })} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {expanded ? <ChevronUp size={14} color={c.textMuted} /> : <ChevronDown size={14} color={c.textMuted} />}<Text style={{ color: c.textMuted, fontSize: 11.5, marginLeft: 4 }}>History ({x.history.length})</Text>
        </TouchableOpacity>
        {expanded && [...x.history].reverse().map((h, i) => <Text key={i} style={{ color: c.textSecondary, fontSize: 11.5, marginTop: 3 }}>{clock(h.at)} · {h.by} · {h.action.replace(/_/g, ' ').toLowerCase()}{h.detail ? ` (${h.detail})` : ''}</Text>)}
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Unaccepted bookings</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5 }}>{active.length} open · {needAction} need action now{handled.length ? ` · ${handled.length} executed elsewhere` : ''}</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={c.primary} /> : (
        <FlatList
          data={[...active, ...handled]} keyExtractor={(x) => String(x.order_id)} renderItem={renderCase} contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
          ListHeaderComponent={<Text style={{ color: c.textMuted, fontSize: 11.5, marginBottom: 2 }}>The alarm rings 2 hours before pickup (or half way for a late booking), then again after half of the time that is left - it keeps coming without nagging. Snooze if you are already on it.</Text>}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 24 }}><CheckCircle2 size={34} color="#16A34A" /><Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 8 }}>Every posted booking has been accepted. Nothing to do here.</Text></View>}
        />
      )}

      <Modal visible={!!exec} transparent animationType="slide" onRequestClose={() => setExec(null)}>
        <View style={s.sheetWrap}><View style={[s.sheet, { backgroundColor: c.surface }]}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Executed elsewhere - #{exec?.order_id}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 8 }}>Record where and by whom this trip is being done, so the customer, the website and the follow-up all know.</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
            <Text style={s.lbl}>WHERE</Text>
            <View style={s.wrap}>{PLATFORMS.map((p) => <TouchableOpacity key={p} onPress={() => setForm({ ...form, platform: p })} style={[s.chip, { borderColor: form.platform === p ? c.primary : c.border, backgroundColor: form.platform === p ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '700' }}>{p}</Text></TouchableOpacity>)}</View>
            <TextInput style={inp} value={form.platform} onChangeText={(t) => setForm({ ...form, platform: t })} placeholder="Platform / app name" placeholderTextColor={c.textMuted} />
            <TextInput style={inp} value={form.by} onChangeText={(t) => setForm({ ...form, by: t })} placeholder="Who put it there (fleet / vendor / person)" placeholderTextColor={c.textMuted} />
            <TextInput style={inp} value={form.driver_name} onChangeText={(t) => setForm({ ...form, driver_name: t })} placeholder="Driver name" placeholderTextColor={c.textMuted} />
            <TextInput style={inp} value={form.driver_phone} onChangeText={(t) => setForm({ ...form, driver_phone: t })} placeholder="Driver phone" keyboardType="phone-pad" placeholderTextColor={c.textMuted} />
            <TextInput style={inp} value={form.vehicle_number} onChangeText={(t) => setForm({ ...form, vehicle_number: t.toUpperCase() })} placeholder="Vehicle number" autoCapitalize="characters" placeholderTextColor={c.textMuted} />
            <TextInput style={inp} value={form.commission} onChangeText={(t) => setForm({ ...form, commission: t.replace(/[^0-9]/g, '') })} placeholder="Commission due ₹ (10%, minimum 200 - change if needed)" keyboardType="numeric" placeholderTextColor={c.textMuted} />
            <TextInput style={[...inp, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={form.note} onChangeText={(t) => setForm({ ...form, note: t })} placeholder="Note" placeholderTextColor={c.textMuted} />
          </ScrollView>
          <View style={s.btnRow}>
            <TouchableOpacity onPress={() => setExec(null)} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Close</Text></TouchableOpacity>
            <TouchableOpacity onPress={submitExec} style={[s.btn, { flex: 1.5, backgroundColor: '#7C3AED' }]}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={!!cancel} transparent animationType="slide" onRequestClose={() => setCancel(null)}>
        <View style={s.sheetWrap}><View style={[s.sheet, { backgroundColor: c.surface }]}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Cancel booking #{cancel?.order_id}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 8 }}>
            {cancel?.advance_received ? `The customer paid ${inr(cancel.advance_received)}: the e-mail promises a refund within 7 working days.` : 'No advance was paid: the e-mail says advance paid ₹0, so no refund applies.'}
          </Text>
          <View style={s.wrap}>{CANCEL_REASONS.map((r) => <TouchableOpacity key={r} onPress={() => setReason(r)} style={[s.chip, { borderColor: reason === r ? '#DC2626' : c.border, backgroundColor: reason === r ? '#DC262622' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '700' }}>{r}</Text></TouchableOpacity>)}</View>
          <TextInput style={inp} value={reason} onChangeText={setReason} placeholder="Reason (the customer reads this in plain words)" placeholderTextColor={c.textMuted} />
          <View style={s.rowBetween}><Text style={{ color: c.text, flex: 1 }}>E-mail the customer a detailed apology</Text><Switch value={mailCustomer} onValueChange={setMailCustomer} /></View>
          <View style={s.btnRow}>
            <TouchableOpacity onPress={() => setCancel(null)} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Keep booking</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert('Cancel this booking?', 'This cannot be undone.', [{ text: 'No', style: 'cancel' }, { text: 'Cancel it', style: 'destructive', onPress: submitCancel }])} style={[s.btn, { flex: 1.5, backgroundColor: '#DC2626' }]}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Cancel booking</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  card: { borderRadius: 12, padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  alarm: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  ackBtn: { backgroundColor: '#FFFFFF', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  actTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  lbl: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: '#64748B', marginBottom: 4 },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 26 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 13 },
});
