import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

// One full "Customize" screen for a booking: who, where, when, which vehicle, how many km, what the DRIVER gets, the extras and charges, the
// customer's price and the advance. Used by Website Approvals (a booking that has not posted yet) and by Operations > Bookings (a posted one),
// so both open the SAME options - the old Customize / Edit only offered the fare boxes.

export interface FullCustomizeValues {
  customer_name: string; customer_number: string; pickup: string; drop: string; date: string; time: string; trip_type: string; car_type: string; trip_distance: string;
  cost_per_km: string; extra_cost_per_km: string; driver_allowance: string; extra_driver_allowance: string; permit_charges: string; extra_permit_charges: string;
  hill_charges: string; toll_charges: string; night_charges: string; customer_total: string; advance: string;
}

export const EMPTY_FULL_VALUES: FullCustomizeValues = {
  customer_name: '', customer_number: '', pickup: '', drop: '', date: '', time: '', trip_type: '', car_type: '', trip_distance: '',
  cost_per_km: '', extra_cost_per_km: '', driver_allowance: '', extra_driver_allowance: '', permit_charges: '', extra_permit_charges: '',
  hill_charges: '', toll_charges: '', night_charges: '', customer_total: '', advance: '',
};

export const TRIP_TYPES = ['Oneway', 'Round Trip', 'Multy City', 'Hourly Rental'];
export const CAR_TYPES: { label: string; value: string }[] = [
  { label: 'Hatchback', value: 'HATCHBACK' }, { label: 'Sedan', value: 'SEDAN_4_PLUS_1' }, { label: 'New sedan 2022+', value: 'NEW_SEDAN_2022_MODEL' },
  { label: 'Etios', value: 'ETIOS_4_PLUS_1' }, { label: 'SUV', value: 'SUV' }, { label: 'SUV 6+1', value: 'SUV_6_PLUS_1' }, { label: 'SUV 7+1', value: 'SUV_7_PLUS_1' },
  { label: 'Innova', value: 'INNOVA' }, { label: 'Innova 6+1', value: 'INNOVA_6_PLUS_1' }, { label: 'Innova 7+1', value: 'INNOVA_7_PLUS_1' },
  { label: 'Crysta', value: 'INNOVA_CRYSTA' }, { label: 'Crysta 6+1', value: 'INNOVA_CRYSTA_6_PLUS_1' }, { label: 'Crysta 7+1', value: 'INNOVA_CRYSTA_7_PLUS_1' },
  { label: 'Tempo 12', value: 'TEMPO_TRAVELLER_12' }, { label: 'Tempo 14', value: 'TEMPO_TRAVELLER_14' }, { label: 'Tempo 18', value: 'TEMPO_TRAVELLER_18' },
  { label: 'Urbania 12', value: 'URBANIA_12' }, { label: 'Urbania 14', value: 'URBANIA_14' }, { label: 'Urbania 16', value: 'URBANIA_16' },
];

/** Puts a new pickup / drop into a pickup_drop_location of either shape ({pickup,drop} or {"0":..,"1":..}) without disturbing the other stops. */
export function setRoute(loc: any, pickup: string, drop: string): any {
  const put = (cur: any, v: string) => (cur && typeof cur === 'object' ? { ...cur, address: v } : v);
  if (loc && typeof loc === 'object' && ('pickup' in loc || 'drop' in loc)) {
    const next = { ...loc };
    if (pickup) next.pickup = put(loc.pickup, pickup);
    if (drop) next.drop = put(loc.drop, drop);
    return next;
  }
  const keys = loc && typeof loc === 'object' ? Object.keys(loc).sort((a, b) => Number(a) - Number(b)) : [];
  const next: Record<string, any> = { ...(loc || {}) };
  if (keys.length === 0) { next['0'] = pickup; next['1'] = drop; return next; }
  if (pickup) next[keys[0]] = put(loc[keys[0]], pickup);
  if (drop) { const lastKey = keys.length > 1 ? keys[keys.length - 1] : String(Number(keys[0]) + 1); next[lastKey] = put(loc[lastKey], drop); }
  return next;
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  initial: FullCustomizeValues;
  saving?: boolean;
  /** website bookings can change trip type and vehicle (they are not posted yet); a posted booking shows them read-only */
  editableTripAndVehicle: boolean;
  /** the customer's price now, for the hint; the "Customer total" box overrides it */
  customerTotalNow?: number | null;
  showCustomerTotal?: boolean;
  showAdvance?: boolean;
  onClose: () => void;
  onSave: (v: FullCustomizeValues, changed: Partial<FullCustomizeValues>) => void;
  onReset?: () => void;
}

const NUM_KEYS: (keyof FullCustomizeValues)[] = ['trip_distance', 'cost_per_km', 'extra_cost_per_km', 'driver_allowance', 'extra_driver_allowance', 'permit_charges', 'extra_permit_charges',
  'hill_charges', 'toll_charges', 'night_charges', 'customer_total', 'advance'];

export default function FullCustomizeModal({ visible, title, subtitle, initial, saving, editableTripAndVehicle, customerTotalNow, showCustomerTotal, showAdvance, onClose, onSave, onReset }: Props) {
  const { themeColors: c, isDark } = useTheme();
  const [v, setV] = useState<FullCustomizeValues>(initial);
  useEffect(() => { if (visible) setV(initial); }, [visible, initial]);
  if (!visible) return null;

  const set = (k: keyof FullCustomizeValues, val: string) => setV((x) => ({ ...x, [k]: NUM_KEYS.includes(k) ? val.replace(/[^0-9]/g, '') : val }));
  const inp = [s.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }];
  const lbl = [s.label, { color: c.textSecondary }];
  const chip = (on: boolean) => [s.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary + '22' : 'transparent' }];
  const Field = ({ k, label, kb, flex = 1, ph }: { k: keyof FullCustomizeValues; label: string; kb?: 'numeric' | 'phone-pad'; flex?: number; ph?: string }) => (
    <View style={{ flex }}>
      <Text style={lbl}>{label}</Text>
      <TextInput style={inp} value={v[k]} onChangeText={(t) => set(k, t)} keyboardType={kb || (NUM_KEYS.includes(k) ? 'numeric' : 'default')} placeholder={ph || (NUM_KEYS.includes(k) ? '0' : '')} placeholderTextColor={c.textMuted} />
    </View>
  );
  const Title = ({ t }: { t: string }) => <Text style={[s.section, { color: c.primary, borderBottomColor: c.border }]}>{t}</Text>;

  const save = () => {
    const changed: Partial<FullCustomizeValues> = {};
    (Object.keys(v) as (keyof FullCustomizeValues)[]).forEach((k) => { if (v[k] !== initial[k]) (changed as any)[k] = v[k]; });
    onSave(v, changed);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: c.surface }]}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
              {!!subtitle && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}><X size={20} color={c.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <Title t="Customer" />
            <View style={s.row}><Field k="customer_name" label="Name" flex={1.3} /><Field k="customer_number" label="Mobile" kb="phone-pad" /></View>

            <Title t="Trip" />
            <Field k="pickup" label="Pickup" />
            <Field k="drop" label="Drop" />
            <View style={s.row}><Field k="date" label="Date (YYYY-MM-DD)" ph="2026-10-12" /><Field k="time" label="Time (HH:MM)" ph="06:30" /></View>
            <Field k="trip_distance" label="Distance (km)" />
            <Text style={lbl}>Trip type</Text>
            <View style={s.wrap}>
              {editableTripAndVehicle
                ? TRIP_TYPES.map((x) => <TouchableOpacity key={x} onPress={() => set('trip_type', x)} style={chip(v.trip_type === x)}><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '700' }}>{x}</Text></TouchableOpacity>)
                : <Text style={{ color: c.text, fontSize: 13.5, marginBottom: 8 }}>{v.trip_type || '-'}</Text>}
            </View>
            <Text style={lbl}>Vehicle</Text>
            <View style={s.wrap}>
              {editableTripAndVehicle
                ? CAR_TYPES.map((x) => <TouchableOpacity key={x.value} onPress={() => set('car_type', x.value)} style={chip(v.car_type === x.value)}><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{x.label}</Text></TouchableOpacity>)
                : <Text style={{ color: c.text, fontSize: 13.5, marginBottom: 8 }}>{CAR_TYPES.find((x) => x.value === v.car_type)?.label || v.car_type || '-'}</Text>}
            </View>
            {editableTripAndVehicle && <Text style={{ color: c.textMuted, fontSize: 11, marginBottom: 6 }}>Changing the route, vehicle or distance does not re-price the quote - set the rates and the customer total below yourself.</Text>}

            <Title t="What the driver gets" />
            <View style={s.row}><Field k="cost_per_km" label="Driver fare / km ₹" /><Field k="driver_allowance" label="Driver bata ₹" /></View>
            <View style={s.row}><Field k="permit_charges" label="Driver permit ₹" /><Field k="hill_charges" label="Hill charges ₹" /></View>
            <View style={s.row}><Field k="toll_charges" label="Toll charges ₹" /><Field k="night_charges" label="Night charges ₹" /></View>

            <Title t="Extra (goes to the vendor / platform, not the driver)" />
            <View style={s.row}><Field k="extra_cost_per_km" label="Extra / km ₹" /><Field k="extra_driver_allowance" label="Extra bata ₹" /><Field k="extra_permit_charges" label="Extra permit ₹" /></View>

            {(showCustomerTotal || showAdvance) && <Title t="Customer price" />}
            {showCustomerTotal && (
              <>
                <Field k="customer_total" label={`Customer total ₹ (now ${customerTotalNow != null ? '₹' + Number(customerTotalNow).toLocaleString('en-IN') : '-'}; leave as it is unless you want to fix it)`} />
              </>
            )}
            {showAdvance && <Field k="advance" label="Advance received ₹" />}
          </ScrollView>
          <View style={s.buttons}>
            <TouchableOpacity onPress={onClose} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={[s.btn, { flex: 1.5, backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save changes</Text>}
            </TouchableOpacity>
          </View>
          {!!onReset && (
            <TouchableOpacity onPress={onReset} style={{ alignItems: 'center', paddingTop: 10 }}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>Back to the driver tariff</Text></TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: { maxHeight: '94%', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 22 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 13 },
});
