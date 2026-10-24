import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Ban, CheckCircle2, Clock, Phone, Send, UserX, Wrench } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import ManualCloseTripModal from '@/components/ManualCloseTripModal';

// Everything that needs a person to decide - nothing here is ever closed by a timer:
//  1. a driver was assigned but never started the trip after pickup,
//  2. a driver says the customer cancelled / did not turn up (only the office or the poster can confirm it),
//  3. a booking whose driver was penalised is waiting to go back to all drivers.
type Item = { order_id: number; route: string; pickup?: string | null; driver_name?: string | null; driver_phone?: string | null; minutes_late?: number; reason?: string; requested_at?: string; goes_out_at?: string; held?: number; allocated_by?: string };
type Data = { not_started: Item[]; no_show_requests: Item[]; repost_waiting: Item[]; waiting_for_driver?: Item[]; total: number };

const clock = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');
const late = (m?: number) => (m == null ? '' : m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h late` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m late` : `${m} min late`);

export default function NeedsAttention() {
  const router = useRouter();
  const { themeColors: c, isDark } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [closing, setClosing] = useState<Item | null>(null);
  const [ask, setAsk] = useState<{ item: Item; kind: 'noshow' | 'cancel' | 'cancel-repost' } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { setData(await apiService.makeRequest('/admin/attention/trips')); }
    catch (e: any) { Alert.alert('Could not load', e?.message || 'Try again'); }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]));

  const post = async (path: string, body?: any, method = 'POST') => {
    try { return await apiService.makeRequest(path, { method, body: JSON.stringify(body || {}) }); }
    catch (e: any) { Alert.alert('Could not do that', e?.message || 'Try again'); return null; }
  };
  const run = async (id: number, fn: () => Promise<any>, ok: string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (r) { Alert.alert('Done', r.message || ok); load(); }
  };

  const confirmAsk = () => {
    if (!ask) return;
    const { item, kind } = ask;
    setAsk(null);
    const n = note.trim();
    setNote('');
    if (kind === 'noshow') run(item.order_id, () => post(`/admin/orders/${item.order_id}/no-show`, { note: n || undefined }), 'Closed as no-show');
    else if (kind === 'cancel') run(item.order_id, () => post(`/admin/orders/${item.order_id}/cancel`, { reason: n || 'Cancelled by the office - trip was not started' }, 'PATCH'), 'Cancelled and refunded');
    else run(item.order_id, () => post(`/admin/orders/${item.order_id}/repost-cancel`, { note: n || undefined }), 'Cancelled');
  };

  const card = { backgroundColor: c.surface, borderColor: c.border } as const;
  const Btn = ({ label, color, onPress, icon: Icon, disabled }: any) => (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={[s.btn, { backgroundColor: color, opacity: disabled ? 0.6 : 1 }]}>
      <Icon size={14} color="#FFFFFF" /><Text style={s.btnTxt}>{label}</Text>
    </TouchableOpacity>
  );
  const driverLine = (x: Item) => (
    <View style={s.row}>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, flex: 1 }}>{x.driver_name || 'Driver'}{x.driver_phone ? ` · ${x.driver_phone}` : ''}</Text>
      {!!x.driver_phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${x.driver_phone}`)} style={[s.call, { borderColor: c.border }]}><Phone size={13} color={c.text} /><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>Call</Text></TouchableOpacity>}
    </View>
  );

  const section = (title: string, hint: string, items: Item[], render: (x: Item) => React.ReactNode) => (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{title} ({items.length})</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 2, marginBottom: 8 }}>{hint}</Text>
      {items.length === 0 ? <Text style={{ color: c.textSecondary, fontSize: 13, paddingVertical: 6 }}>Nothing here.</Text> : items.map((x) => <View key={`${title}-${x.order_id}`} style={[s.card, card]}>{render(x)}</View>)}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={[s.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Needs attention</Text>
        <View style={s.back} />
      </View>
      {!data ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#DC2626" /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>A booking is never closed by a timer. When something stops mid-way it appears here and you decide.</Text>

          {section('Trips not started after pickup', 'The driver was assigned but never started the trip. Close it by hand, mark a no-show, or cancel with a refund.', data.not_started, (x) => (
            <>
              <Text style={[s.title, { color: c.text }]}>#{x.order_id} · {x.route}</Text>
              <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '700' }}>Pickup {clock(x.pickup)} · {late(x.minutes_late)}</Text>
              {driverLine(x)}
              <View style={s.wrap}>
                <Btn label="Close trip" color="#1D4ED8" icon={Wrench} disabled={busy === x.order_id} onPress={() => setClosing(x)} />
                <Btn label="No-show" color="#B45309" icon={UserX} disabled={busy === x.order_id} onPress={() => setAsk({ item: x, kind: 'noshow' })} />
                <Btn label="Cancel + refund" color="#DC2626" icon={Ban} disabled={busy === x.order_id} onPress={() => setAsk({ item: x, kind: 'cancel' })} />
              </View>
            </>
          ))}

          {section('Accepted, but no driver & car yet', 'Allocated by the office or a vendor, or accepted with no deadline, so nothing cancels it by itself. Call the fleet owner, or cancel it and give the held amount back.', data.waiting_for_driver || [], (x) => (
            <>
              <Text style={[s.title, { color: c.text }]}>#{x.order_id} · {x.route}</Text>
              <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '700' }}>Pickup {clock(x.pickup)} · {late(x.minutes_late)}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>Fleet owner (not the driver): held ₹{x.held || 0}{x.allocated_by ? ` · allocated by ${x.allocated_by}` : ''}</Text>
              {driverLine(x)}
              <View style={s.wrap}>
                <Btn label="Cancel + refund" color="#DC2626" icon={Ban} disabled={busy === x.order_id} onPress={() => setAsk({ item: x, kind: 'cancel' })} />
              </View>
            </>
          ))}

          {section('Driver says: customer cancelled / not there', 'Only you (or the vendor who posted it) can confirm a no-show. The driver\'s held amount goes back in full.', data.no_show_requests, (x) => (
            <>
              <Text style={[s.title, { color: c.text }]}>#{x.order_id} · {x.route}</Text>
              <Text style={{ color: c.text, fontSize: 13, marginTop: 2 }}>"{x.reason}"</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>Pickup {clock(x.pickup)} · asked {clock(x.requested_at)}</Text>
              {driverLine(x)}
              <View style={s.wrap}>
                <Btn label="Confirm no-show" color="#B45309" icon={UserX} disabled={busy === x.order_id} onPress={() => setAsk({ item: x, kind: 'noshow' })} />
                <Btn label="Trip carries on" color="#475569" icon={CheckCircle2} disabled={busy === x.order_id} onPress={() => run(x.order_id, () => post(`/admin/orders/${x.order_id}/no-show-dismiss`), 'Dismissed')} />
              </View>
            </>
          ))}

          {section('Waiting to go back to drivers', 'Its driver was penalised (no driver & car in time). It goes out to all drivers by itself at the time shown, unless you send it sooner or cancel it.', data.repost_waiting, (x) => (
            <>
              <Text style={[s.title, { color: c.text }]}>#{x.order_id} · {x.route}</Text>
              <View style={s.row}><Clock size={13} color={c.textSecondary} /><Text style={{ color: c.textSecondary, fontSize: 12.5 }}>Pickup {clock(x.pickup)} · goes out at {clock(x.goes_out_at)}</Text></View>
              <View style={s.wrap}>
                <Btn label="Send to drivers now" color="#059669" icon={Send} disabled={busy === x.order_id} onPress={() => run(x.order_id, () => post(`/admin/orders/${x.order_id}/repost-approve`), 'Sent')} />
                <Btn label="Cancel booking" color="#DC2626" icon={Ban} disabled={busy === x.order_id} onPress={() => setAsk({ item: x, kind: 'cancel-repost' })} />
              </View>
            </>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => setAsk(null)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>
              {ask?.kind === 'noshow' ? `Mark #${ask?.item.order_id} as customer no-show?` : ask?.kind === 'cancel' ? `Cancel #${ask?.item.order_id} and refund the driver?` : `Cancel #${ask?.item.order_id}?`}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              {ask?.kind === 'noshow' ? 'The booking is closed, the driver\'s held amount is returned to their wallet, and the driver and the poster are told.' : 'The booking is cancelled and the driver\'s held amount is returned. The poster is told.'}
            </Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Note (saved on the booking) - optional" placeholderTextColor={c.textSecondary}
              style={[s.input, { borderColor: c.border, color: c.text, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]} multiline />
            <View style={[s.wrap, { justifyContent: 'flex-end', marginTop: 12 }]}>
              <TouchableOpacity onPress={() => { setAsk(null); setNote(''); }} style={[s.btn, { backgroundColor: '#64748B' }]}><Text style={s.btnTxt}>Back</Text></TouchableOpacity>
              <TouchableOpacity onPress={confirmAsk} style={[s.btn, { backgroundColor: '#DC2626' }]}><Text style={s.btnTxt}>Yes, do it</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ManualCloseTripModal
        visible={!!closing} orderId={closing?.order_id ?? null} needsStartKm isDark={isDark}
        onClose={() => setClosing(null)}
        onDone={(res) => { const id = closing?.order_id; setClosing(null); Alert.alert('Closed', `Booking #${id} closed and settled.`); load(); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10, gap: 4 },
  title: { fontSize: 14.5, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  btn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnTxt: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  call: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderWidth: 1, borderRadius: 16, padding: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12, minHeight: 60, textAlignVertical: 'top' },
});
