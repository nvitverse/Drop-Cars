// "Who may accept this booking": Trusted Partners first until a time, or open to every driver now.
// Self-contained: give it the booking's current values and an onChanged callback; it calls the existing backend routes
//   POST /orders/orders/{id}/release-priority        (open to everyone now, drivers are notified)
//   POST /orders/orders/{id}/update-priority         (reserve for Trusted Partners until a time, drivers are notified)
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ShieldCheck, Users } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

interface Props {
  orderId: number;
  priorityForPaid?: boolean | null;
  priorityCutoffAt?: string | null;
  onChanged?: (next: { priority_for_paid: boolean; priority_cutoff_at: string | null }) => void;
}

const fmt = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function AcceptancePreferenceCard({ orderId, priorityForPaid, priorityCutoffAt, onChanged }: Props) {
  const { themeColors: c } = useTheme();
  const [state, setState] = useState({ locked: !!priorityForPaid && !!priorityCutoffAt && new Date(priorityCutoffAt as string).getTime() > Date.now(), until: priorityCutoffAt || null });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (key: string, path: string, body?: any) => {
    setBusy(key);
    setMsg(null);
    try {
      const r: any = await apiService.makeRequest(`/orders/orders/${orderId}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      const next = { priority_for_paid: !!r.priority_for_paid, priority_cutoff_at: r.priority_cutoff_at || null };
      setState({ locked: next.priority_for_paid && !!next.priority_cutoff_at, until: next.priority_cutoff_at });
      onChanged?.(next);
      setMsg({ ok: true, text: r.message || 'Updated. Drivers were notified.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not change it.' });
    } finally {
      setBusy(null);
    }
  };

  // extend from the current cutoff when it is still in the future, otherwise from now
  const reserveFor = (hours: number) => {
    const base = state.until && new Date(state.until).getTime() > Date.now() ? new Date(state.until).getTime() : Date.now();
    return run(`h${hours}`, 'update-priority', { priority_for_paid: true, priority_cutoff_at: new Date(base + hours * 3600 * 1000).toISOString() });
  };

  const chip = (label: string, onPress: () => void, key: string, tone?: string) => (
    <TouchableOpacity key={key} disabled={!!busy} onPress={onPress} style={[s.chip, { borderColor: tone || c.border, opacity: busy ? 0.6 : 1 }]}>
      {busy === key ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={{ fontSize: 12, fontWeight: '800', color: tone || c.text }}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={s.head}>
        {state.locked ? <ShieldCheck size={16} color={c.primary} /> : <Users size={16} color={c.textMuted} />}
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
          {state.locked ? `Trusted Partners first until ${fmt(state.until)}` : 'Open to all drivers'}
        </Text>
      </View>
      <Text style={{ color: c.textMuted, fontSize: 11.5 }}>Who may accept this booking right now. Changing it notifies the drivers.</Text>
      <View style={s.row}>
        {chip('Open to all now', () => run('open', 'release-priority'), 'open', c.error)}
        {chip('Reserve +1h', () => reserveFor(1), 'h1', c.primary)}
        {chip('+3h', () => reserveFor(3), 'h3', c.primary)}
        {chip('+6h', () => reserveFor(6), 'h6', c.primary)}
      </View>
      {msg ? <Text style={{ color: msg.ok ? c.success : c.error, fontSize: 12, fontWeight: '700' }}>{msg.text}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, minWidth: 64, alignItems: 'center' },
});
