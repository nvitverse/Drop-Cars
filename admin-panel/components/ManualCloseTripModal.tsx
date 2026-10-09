import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { apiService } from '@/services/api';

interface Props {
  visible: boolean;
  orderId: number | string | null;
  /** true when the driver never started the trip in the app, so the start km is needed too */
  needsStartKm: boolean;
  tollMustBeEntered?: boolean;
  isMultiCity?: boolean;
  isDark?: boolean;
  onClose: () => void;
  onDone: (result: any) => void;
}

/**
 * Close a trip by hand when the driver cannot. The server runs the same closing code as the Driver App (same fare rules, same
 * commission split, same wallet settlement) - this form only collects what the driver would have entered.
 */
export default function ManualCloseTripModal({ visible, orderId, needsStartKm, tollMustBeEntered, isMultiCity, isDark, onClose, onDone }: Props) {
  const [startKm, setStartKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [cash, setCash] = useState('');
  const [toll, setToll] = useState('');
  const [waiting, setWaiting] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setStartKm(''); setEndKm(''); setCash(''); setToll(''); setWaiting(''); setReason(''); }
  }, [visible, orderId]);

  const bg = isDark ? '#0F172A' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#CBD5E1';
  const input = { borderWidth: 1, borderColor: border, borderRadius: 6, padding: 10, color: text, marginBottom: 10, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' } as const;
  const num = (v: string) => (v.trim() === '' ? undefined : parseInt(v, 10));

  const submit = async () => {
    if (!orderId) return;
    if (num(endKm) === undefined || isNaN(num(endKm) as number)) return Alert.alert('End km needed', 'Enter the odometer reading at the end of the trip.');
    if (needsStartKm && (num(startKm) === undefined || isNaN(num(startKm) as number))) return Alert.alert('Start km needed', 'The driver never started this trip in the app - enter the start km.');
    if (tollMustBeEntered && num(toll) === undefined) return Alert.alert('Toll needed', 'This booking asked for the actual toll to be entered at close.');
    if (reason.trim().length < 3) return Alert.alert('Reason needed', 'Write why you are closing it (it is saved on the trip).');
    setBusy(true);
    try {
      const res = await apiService.manualCloseTrip(orderId, {
        end_km: num(endKm) as number,
        start_km: needsStartKm ? num(startKm) : undefined,
        cash_collection: num(cash),
        updated_toll_charges: num(toll),
        waiting_minutes: num(waiting),
        reason: reason.trim(),
      });
      onDone(res);
    } catch (e: any) {
      Alert.alert('Could not close the trip', e?.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: bg, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 16, maxHeight: '90%' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: text }}>Close Booking #{orderId} manually</Text>
          <Text style={{ fontSize: 12.5, color: sub, marginVertical: 6, lineHeight: 18 }}>
            Uses the same fare, commission and wallet settlement as the driver closing it. The driver is paid what he is owed, Drop Cars gets its share,
            and any advance already collected is settled against the poster's share.
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {needsStartKm && (
              <>
                <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Start km *</Text>
                <TextInput style={input} keyboardType="number-pad" value={startKm} onChangeText={setStartKm} placeholder="Odometer at start" placeholderTextColor={sub} />
              </>
            )}
            <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>End km *</Text>
            <TextInput style={input} keyboardType="number-pad" value={endKm} onChangeText={setEndKm} placeholder="Odometer at end" placeholderTextColor={sub} />
            <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Cash collected from the customer (₹)</Text>
            <TextInput style={input} keyboardType="number-pad" value={cash} onChangeText={setCash} placeholder="Blank = the expected amount (total - advance)" placeholderTextColor={sub} />
            <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Actual toll (₹){tollMustBeEntered ? ' *' : ''}</Text>
            <TextInput style={input} keyboardType="number-pad" value={toll} onChangeText={setToll} placeholder="Only if the toll was different from the quote" placeholderTextColor={sub} />
            {isMultiCity && (
              <>
                <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Waiting minutes</Text>
                <TextInput style={input} keyboardType="number-pad" value={waiting} onChangeText={setWaiting} placeholder="Billed per the waiting setting" placeholderTextColor={sub} />
              </>
            )}
            <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Why are you closing it? *</Text>
            <TextInput style={[input, { minHeight: 60 }]} multiline value={reason} onChangeText={setReason} placeholder="e.g. Driver's phone switched off, customer confirmed the trip ended" placeholderTextColor={sub} />
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={{ flex: 1, borderWidth: 1, borderColor: border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: text, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={busy} style={{ flex: 1.4, backgroundColor: '#0D47A1', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Close Trip & Settle</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
