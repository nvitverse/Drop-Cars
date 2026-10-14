import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { apiService } from '@/services/api';

interface Props {
  visible: boolean;
  orderId: number | string | null;
  isDark?: boolean;
  onClose: () => void;
  onDone: (result: any) => void;
}

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n || 0)).toLocaleString('en-IN')}`;
const signed = (n: number) => (n === 0 ? '₹0' : `${n > 0 ? '+' : '-'}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`);

/**
 * Correct the km of a trip that is already COMPLETED. The server works the new bill out with the same closing rules, shows exactly what
 * changes (customer bill, driver, poster, platform) BEFORE anything is saved, and - if you tick it - posts the commission difference to
 * the wallets with a plain note. Untick it to correct the record only.
 */
export default function CorrectKmModal({ visible, orderId, isDark, onClose, onDone }: Props) {
  const [endKm, setEndKm] = useState('');
  const [reason, setReason] = useState('');
  const [adjust, setAdjust] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setEndKm(''); setReason(''); setAdjust(true); setPlan(null); } }, [visible, orderId]);

  const bg = isDark ? '#0F172A' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#CBD5E1';
  const input = { borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10, color: text, marginBottom: 10, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' } as const;

  const call = async (preview: boolean) => {
    if (!orderId) return null;
    const km = parseInt(endKm, 10);
    if (isNaN(km)) { Alert.alert('End km needed', 'Enter the correct odometer reading at the end of the trip.'); return null; }
    if (reason.trim().length < 3) { Alert.alert('Reason needed', 'Write why the km is being corrected - it is saved on the trip and in the driver\'s wallet note.'); return null; }
    setBusy(true);
    try {
      return await apiService.correctTripKm(orderId, { end_km: km, reason: reason.trim(), adjust_wallet: adjust, preview });
    } catch (e: any) {
      Alert.alert('Could not do that', e?.message || 'Try again');
      return null;
    } finally { setBusy(false); }
  };

  const showPlan = async () => { const r = await call(true); if (r) setPlan(r); };
  const apply = async () => {
    const r = await call(false);
    if (r) { onDone(r); }
  };

  const Row = ({ label, o }: { label: string; o: { old: number; new: number; change: number } }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: sub, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '700' }}>{inr(o.old)} → {inr(o.new)}  ({signed(o.change)})</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: bg, borderRadius: 16, borderWidth: 1, borderColor: border, padding: 16, maxHeight: '92%' }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: text, fontSize: 17, fontWeight: '800' }}>Correct km & settle</Text>
            <Text style={{ color: sub, fontSize: 12.5, marginTop: 4, marginBottom: 12, lineHeight: 18 }}>
              For a trip that is already completed. You see the new bill and the wallet difference first; nothing is saved until you confirm.
            </Text>
            <Text style={{ color: sub, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>Correct END odometer reading</Text>
            <TextInput value={endKm} onChangeText={(t) => { setEndKm(t.replace(/[^0-9]/g, '')); setPlan(null); }} keyboardType="numeric" placeholder="e.g. 45175" placeholderTextColor={sub} style={input} />
            <Text style={{ color: sub, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>Why (saved on the trip)</Text>
            <TextInput value={reason} onChangeText={(t) => { setReason(t); setPlan(null); }} placeholder="e.g. customer extra stop, odometer photo checked" placeholderTextColor={sub} style={[input, { minHeight: 54 }]} multiline />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Switch value={adjust} onValueChange={(v) => { setAdjust(v); setPlan(null); }} />
              <Text style={{ color: text, fontSize: 13, flex: 1, lineHeight: 18 }}>Post the commission difference to the wallets (driver, poster, platform)</Text>
            </View>

            {plan && (
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }}>
                <Text style={{ color: text, fontWeight: '800', fontSize: 14, marginBottom: 6 }}>
                  Km {plan.km.old_driven} → {plan.km.new_driven}
                </Text>
                <Row label="Customer's bill" o={plan.customer_total} />
                <Row label="Driver earns" o={plan.driver_earns} />
                <Row label={plan.poster_kind === 'vendor' ? 'Vendor share' : plan.poster_kind === 'fleet_owner' ? 'Posting driver share' : 'Poster share (platform)'} o={plan.poster_share} />
                <Row label="Platform fee" o={plan.platform_fee} />
                <Text style={{ marginTop: 8, color: plan.driver_wallet_change < 0 ? '#B91C1C' : plan.driver_wallet_change > 0 ? '#047857' : sub, fontWeight: '800', fontSize: 13.5, lineHeight: 19 }}>
                  {adjust
                    ? (plan.driver_wallet_change < 0 ? `Driver's wallet: ${inr(plan.driver_wallet_change)} will be taken (extra commission).`
                      : plan.driver_wallet_change > 0 ? `Driver's wallet: ${inr(plan.driver_wallet_change)} will be returned.` : 'No wallet change.')
                    : 'Wallets will NOT be changed - only the trip record and the bill.'}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, minHeight: 46, borderRadius: 10, backgroundColor: isDark ? '#334155' : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: text, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
              {!plan ? (
                <TouchableOpacity disabled={busy} onPress={showPlan} style={{ flex: 1.4, minHeight: 46, borderRadius: 10, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Show what changes</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity disabled={busy} onPress={apply} style={{ flex: 1.4, minHeight: 46, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirm and save</Text>}
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
