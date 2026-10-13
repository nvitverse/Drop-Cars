import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { CheckCircle2, Clock, ImageUp, X, XCircle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { appendFileToFormData } from '@/utils/formDataFile';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';

/**
 * "I paid directly (UPI / bank) - tell us". Razorpay confirms by itself; money sent straight to our UPI ID does not, so the person reports it
 * here (amount + the 12-digit UTR from their payment app) and Drop Cars staff credit it after checking the bank. Also lists past reports with
 * what happened to each, so nobody is left wondering.
 */
type Purpose = 'WALLET' | 'SUBSCRIPTION_MONTHLY' | 'SUBSCRIPTION_YEARLY';
const PURPOSES: { key: Purpose; label: string }[] = [
  { key: 'WALLET', label: 'Add to wallet' },
  { key: 'SUBSCRIPTION_MONTHLY', label: 'Trusted plan - monthly' },
  { key: 'SUBSCRIPTION_YEARLY', label: 'Trusted plan - yearly' },
];

interface Claim { id: string; amount: number; utr: string; purpose: string; status: string; decision_note?: string | null; created_at?: string | null }

export default function PaymentReportModal({ visible, onClose, defaultAmount, defaultPurpose }: { visible: boolean; onClose: () => void; defaultAmount?: string; defaultPurpose?: Purpose }) {
  const { colors } = useTheme() as any;
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('WALLET');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [shot, setShot] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  const loadClaims = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/wallet/payment-claims');
      setClaims(res.data?.claims || []);
    } catch { /* the list is a convenience - the form still works */ }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setAmount(defaultAmount || '');
    setPurpose(defaultPurpose || 'WALLET');
    setUtr('');
    setNote('');
    setError(null);
    setShot(null);
    setReadNote(null);
    loadClaims();
  }, [visible, defaultAmount, defaultPurpose, loadClaims]);

  // Pick the payment screenshot: we read the UTR and amount out of it so nothing has to be typed (the person can still correct them)
  const pickScreenshot = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const file = { uri: a.uri, name: a.uri.split('/').pop() || 'payment.jpg', type: a.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' };
      setShot(file);
      setReading(true);
      setReadNote(null);
      setError(null);
      const fd = new FormData();
      await appendFileToFormData(fd, 'screenshot', file.uri, file.name, file.type);
      const r = await axiosInstance.post('/api/wallet/payment-claims/scan', fd);
      const d = r.data || {};
      if (d.utr) setUtr(String(d.utr));
      if (d.amount) setAmount(String(Math.round(Number(d.amount))));
      setReadNote(d.utr || d.amount
        ? `Read from your screenshot${d.utr ? `: UTR ${d.utr}` : ''}${d.amount ? `, Rs ${Math.round(Number(d.amount))}` : ''}. Please check they are right.${d.success === false ? ' (The screenshot does not look like a completed payment.)' : ''}`
        : 'We could not read the numbers from this screenshot - please type the UTR below.');
    } catch (e: any) {
      setReadNote('We could not read this screenshot - please type the UTR below.');
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { setError('Enter the amount you paid, in rupees.'); return; }
    if (!/^[A-Za-z0-9]{6,30}$/.test(utr.replace(/\s/g, ''))) { setError('Enter the UPI transaction ID / UTR exactly as shown in your payment app (usually 12 digits).'); return; }
    setBusy(true);
    setError(null);
    try {
      let res;
      if (shot) {
        const fd = new FormData();
        fd.append('amount', String(amt));
        fd.append('utr', utr.trim());
        fd.append('purpose', purpose);
        fd.append('method', 'UPI');
        if (note.trim()) fd.append('note', note.trim());
        await appendFileToFormData(fd, 'screenshot', shot.uri, shot.name, shot.type);
        res = await axiosInstance.post('/api/wallet/payment-claims/with-screenshot', fd);
      } else {
        res = await axiosInstance.post('/api/wallet/payment-claims', { amount: amt, utr: utr.trim(), purpose, method: 'UPI', note: note.trim() || undefined });
      }
      Alert.alert('Payment reported', res.data?.message || 'We will check it and credit it soon.');
      setUtr('');
      setNote('');
      setShot(null);
      setReadNote(null);
      await loadClaims();
    } catch (e: any) {
      setError(String(e?.response?.data?.detail || 'Could not send the report. Check your internet and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const badge = (s: string) => s === 'APPROVED' ? { c: '#16A34A', Icon: CheckCircle2, t: 'Credited' } : s === 'REJECTED' ? { c: '#DC2626', Icon: XCircle, t: 'Not accepted' } : { c: '#D97706', Icon: Clock, t: 'Being checked' };
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, fontSize: 16, backgroundColor: colors.surface } as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '92%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 19, fontFamily: 'Inter-Bold', color: colors.text }}>I paid by UPI / bank</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><X color={colors.textSecondary} size={24} /></TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
            Money sent straight to our UPI ID is not matched to your account automatically. Tell us the amount and the transaction ID (UTR) from your payment app - we check our bank and credit it, usually within a few hours.
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={pickScreenshot} disabled={reading} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 10, paddingVertical: 14, marginBottom: 8 }}>
              {reading ? <ActivityIndicator color={colors.primary} /> : <ImageUp size={20} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter-SemiBold' }}>{shot ? 'Change screenshot' : 'Upload payment screenshot (we read the UTR for you)'}</Text>
            </TouchableOpacity>
            {readNote ? <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 12, lineHeight: 17 }}>{readNote}</Text> : null}
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>What was it for?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {PURPOSES.map((p) => (
                <TouchableOpacity key={p.key} onPress={() => setPurpose(p.key)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: purpose === p.key ? colors.primary : colors.border, backgroundColor: purpose === p.key ? colors.primary : 'transparent' }}>
                  <Text style={{ color: purpose === p.key ? '#fff' : colors.text, fontSize: 13, fontFamily: 'Inter-Medium' }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>Amount you paid (Rs)</Text>
            <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="210" placeholderTextColor={colors.textSecondary} style={{ ...input, marginBottom: 12 }} />
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>UPI transaction ID / UTR</Text>
            <TextInput value={utr} onChangeText={setUtr} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. 628553733041" placeholderTextColor={colors.textSecondary} style={{ ...input, marginBottom: 12 }} />
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>Anything we should know? (optional)</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. paid from my wife's account" placeholderTextColor={colors.textSecondary} style={{ ...input, marginBottom: 12 }} />
            {error ? <Text style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</Text> : null}
            <TouchableOpacity onPress={submit} disabled={busy} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Inter-SemiBold' }}>Send payment report</Text>}
            </TouchableOpacity>

            {claims.length > 0 ? (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 8 }}>My payment reports</Text>
                {claims.map((c) => {
                  const b = badge(c.status);
                  return (
                    <View key={c.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: colors.text }}>Rs {c.amount}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><b.Icon size={16} color={b.c} /><Text style={{ color: b.c, fontSize: 13, fontFamily: 'Inter-Medium' }}>{b.t}</Text></View>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>UTR {c.utr}{c.created_at ? ` - ${new Date(c.created_at).toLocaleDateString()}` : ''}</Text>
                      {c.decision_note ? <Text style={{ fontSize: 12, color: colors.text, marginTop: 4 }}>{c.decision_note}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
