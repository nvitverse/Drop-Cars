// Tariffs > Driver: what the DRIVER is paid, separate from what the customer pays.
// A website booking is posted with the driver fare; the rest of the customer's price goes to the "extra" fields:
//   per km  driver rate | extra      bata  driver bata | extra      permit  driver permit | extra
// Backend: GET / PUT /api/admin/driver-tariff (Owner only), see backend/app/crud/driver_tariff.py
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

interface VehicleRow { km_rate: number | null; km_rate_round?: number | null; bata: number }
interface PermitRule { label: string; keywords: string[]; vehicles: string[]; driver: number }
interface Config { vehicles: Record<string, VehicleRow>; permits: PermitRule[] }
interface Payload { config: Config; car_types: string[]; suggested_regions: Record<string, string[]>; default_bata: number }

// the vehicles drivers actually take; the rest are under "Show all vehicles"
const MAIN = ['HATCHBACK', 'SEDAN_4_PLUS_1', 'ETIOS_4_PLUS_1', 'SUV', 'SUV_6_PLUS_1', 'SUV_7_PLUS_1', 'INNOVA', 'INNOVA_6_PLUS_1', 'INNOVA_7_PLUS_1', 'INNOVA_CRYSTA', 'INNOVA_CRYSTA_6_PLUS_1', 'INNOVA_CRYSTA_7_PLUS_1'];
const label = (c: string) => c.replace(/_PLUS_/g, '+').replace(/_/g, ' ').replace('4+1', '4+1');

export default function DriverTariffEditor() {
  const { themeColors: c } = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiService.makeRequest<Payload>('/admin/driver-tariff');
      setData(d);
      setCfg(d.config);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not load the driver tariff.' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setVehicle = (car: string, patch: Partial<VehicleRow>) =>
    setCfg((p) => (p ? { ...p, vehicles: { ...p.vehicles, [car]: { ...p.vehicles[car], ...patch } } } : p));
  const setRule = (i: number, patch: Partial<PermitRule>) =>
    setCfg((p) => (p ? { ...p, permits: p.permits.map((r, k) => (k === i ? { ...r, ...patch } : r)) } : p));
  const addRule = (name = '', keywords: string[] = []) =>
    setCfg((p) => (p ? { ...p, permits: [...p.permits, { label: name, keywords, vehicles: ['*'], driver: 0 }] } : p));
  const removeRule = (i: number) => setCfg((p) => (p ? { ...p, permits: p.permits.filter((_, k) => k !== i) } : p));
  const toggleVehicle = (i: number, car: string) =>
    setCfg((p) => {
      if (!p) return p;
      const cur = p.permits[i].vehicles.filter((v) => v !== '*');
      const next = cur.includes(car) ? cur.filter((v) => v !== car) : [...cur, car];
      return { ...p, permits: p.permits.map((r, k) => (k === i ? { ...r, vehicles: next.length ? next : ['*'] } : r)) };
    });

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiService.makeRequest<{ config: Config }>('/admin/driver-tariff', { method: 'PUT', body: JSON.stringify(cfg) });
      setCfg(r.config);
      setMsg({ ok: true, text: 'Saved. New website bookings are posted with these driver amounts.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={{ padding: 40 }}><ActivityIndicator color={c.primary} /></View>;
  if (!data || !cfg) return <Text style={{ padding: 20, color: c.error }}>{msg?.text || 'Driver tariff is not available.'}</Text>;

  const cars = showAll ? data.car_types : MAIN.filter((m) => data.car_types.includes(m));
  const input = [s.input, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={[s.card, { backgroundColor: c.primaryTint, borderColor: c.primary }]}>
        <Text style={{ color: c.text, fontSize: 12.5, lineHeight: 18 }}>
          A website booking is posted with the <Text style={{ fontWeight: '800' }}>driver fare</Text>. The rest of what the customer pays goes to the extras, so the app shows e.g.{' '}
          <Text style={{ fontWeight: '800' }}>15 | 0</Text> per km, <Text style={{ fontWeight: '800' }}>300 | 100</Text> bata, <Text style={{ fontWeight: '800' }}>800 | 200</Text> permit
          (driver | extra). Driver is never shown more than the customer pays.
        </Text>
      </View>

      <Text style={[s.section, { color: c.textSecondary }]}>Per vehicle</Text>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={s.rowHead}>
          <Text style={[s.th, { flex: 1.4, color: c.textMuted }]}>Vehicle</Text>
          <Text style={[s.th, { flex: 1, color: c.textMuted }]}>One-way km</Text>
          <Text style={[s.th, { flex: 1, color: c.textMuted }]}>Round-trip km</Text>
          <Text style={[s.th, { flex: 0.8, color: c.textMuted }]}>Bata</Text>
        </View>
        {cars.map((car) => {
          const v = cfg.vehicles[car] || { km_rate: null, km_rate_round: null, bata: data.default_bata };
          return (
            <View key={car} style={s.row}>
              <Text style={{ flex: 1.4, color: c.text, fontSize: 12.5, fontWeight: '700' }}>{label(car)}</Text>
              <TextInput style={[...input, { flex: 1 }]} keyboardType="numeric" placeholder="same" placeholderTextColor={c.textMuted}
                value={v.km_rate == null ? '' : String(v.km_rate)} onChangeText={(t) => setVehicle(car, { km_rate: t.trim() === '' ? null : Number(t.replace(/[^0-9.]/g, '')) || null })} />
              <TextInput style={[...input, { flex: 1 }]} keyboardType="numeric" placeholder="same" placeholderTextColor={c.textMuted}
                value={v.km_rate_round == null ? '' : String(v.km_rate_round)} onChangeText={(t) => setVehicle(car, { km_rate_round: t.trim() === '' ? null : Number(t.replace(/[^0-9.]/g, '')) || null })} />
              <TextInput style={[...input, { flex: 0.8 }]} keyboardType="numeric" value={String(v.bata)}
                onChangeText={(t) => setVehicle(car, { bata: Number(t.replace(/[^0-9]/g, '')) || 0 })} />
            </View>
          );
        })}
        <TouchableOpacity onPress={() => setShowAll((x) => !x)} style={{ paddingTop: 8 }}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>{showAll ? 'Show main vehicles only' : 'Show all vehicles'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.section, { color: c.textSecondary }]}>Permit by destination</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 17 }}>
        What the driver gets for the permit when a stop after the pickup matches. The customer's permit comes from the booking; the difference is the extra. No matching rule = the driver gets the customer's permit. First matching rule wins.
      </Text>
      {cfg.permits.map((r, i) => (
        <View key={i} style={[s.card, { backgroundColor: c.surface, borderColor: c.border, gap: 8 }]}>
          <View style={s.row}>
            <TextInput style={[...input, { flex: 1 }]} placeholder="Name (e.g. Pondicherry 6+1)" placeholderTextColor={c.textMuted} value={r.label} onChangeText={(t) => setRule(i, { label: t })} />
            <TouchableOpacity onPress={() => removeRule(i)} hitSlop={8} accessibilityLabel="Delete rule"><Trash2 size={18} color={c.error} /></TouchableOpacity>
          </View>
          <TextInput style={input} placeholder="Places, comma separated (pondicherry, puducherry). * = any place" placeholderTextColor={c.textMuted}
            value={r.keywords.join(', ')} onChangeText={(t) => setRule(i, { keywords: t.split(',').map((x) => x.trim()).filter(Boolean) })} />
          <View style={s.chips}>
            <TouchableOpacity onPress={() => setRule(i, { vehicles: ['*'] })} style={[s.chip, { borderColor: c.border }, r.vehicles.includes('*') && { backgroundColor: c.primary, borderColor: c.primary }]}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: r.vehicles.includes('*') ? '#fff' : c.text }}>All vehicles</Text>
            </TouchableOpacity>
            {MAIN.map((car) => {
              const on = r.vehicles.includes(car);
              return (
                <TouchableOpacity key={car} onPress={() => toggleVehicle(i, car)} style={[s.chip, { borderColor: c.border }, on && { backgroundColor: c.primary, borderColor: c.primary }]}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: on ? '#fff' : c.text }}>{label(car)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.row}>
            <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>Driver gets Rs</Text>
            <TextInput style={[...input, { width: 110 }]} keyboardType="numeric" value={String(r.driver)} onChangeText={(t) => setRule(i, { driver: Number(t.replace(/[^0-9]/g, '')) || 0 })} />
          </View>
        </View>
      ))}
      <View style={s.chips}>
        <TouchableOpacity onPress={() => addRule()} style={[s.add, { backgroundColor: c.primary }]}>
          <Plus size={15} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5 }}>Add rule</Text>
        </TouchableOpacity>
        {Object.entries(data.suggested_regions).map(([name, kws]) => (
          <TouchableOpacity key={name} onPress={() => addRule(name, kws)} style={[s.chip, { borderColor: c.primary }]}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: c.primary }}>+ {name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {msg ? <Text style={{ color: msg.ok ? c.success : c.error, fontSize: 13, fontWeight: '700' }}>{msg.text}</Text> : null}
      <TouchableOpacity onPress={save} disabled={saving} style={[s.save, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save driver tariff</Text>}
      </TouchableOpacity>
      <Text style={{ color: c.textMuted, fontSize: 11.5 }}>Only the Owner can save. Changes apply to bookings posted after saving.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  section: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowHead: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  th: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  input: { height: 38, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  save: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
