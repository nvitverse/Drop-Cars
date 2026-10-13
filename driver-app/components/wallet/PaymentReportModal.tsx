import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { CheckCircle2, Clock, X, XCircle } from 'lucide-react-native';
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
    loadClaims();
  }, [visible, defaultAmount, defaultPurpose, loadClaims]);

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { setError('Enter the amount you paid, in rupees.'); return; }
    if (!/^[A-Za-z0-9]{6,30}$/.test(utr.replace(/\s/g, ''))) { setError('Enter the UPI transaction ID / UTR exactly as shown in your payment app (usually 12 digits).'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await axiosInstance.post('/api/wallet/payment-claims', { amount: amt, utr: utr.trim(), purpose, method: 'UPI', note: note.trim() || undefined });
      Alert.alert('Payment reported', res.data?.message || 'We will check it and credit it soon.');
      setUtr('');
      setNote('');
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
