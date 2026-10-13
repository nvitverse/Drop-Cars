import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, Linking } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock, Phone, XCircle } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

/**
 * Payment reports: a driver / partner paid by UPI or bank directly and sent us the UTR. Check the bank statement for that UTR, then
 * Approve (credits the wallet - and switches the Trusted plan on when it was for the plan) or Reject with a reason the person sees.
 */
type Claim = {
  id: string; amount: number; utr: string; method: string; purpose: string; note?: string | null; status: string;
  person_name?: string | null; person_phone?: string | null; created_at?: string | null; decision_note?: string | null; decided_by?: string | null; credited_amount?: number | null;
};
const PURPOSE_LABEL: Record<string, string> = { WALLET: 'Wallet top-up', SUBSCRIPTION_MONTHLY: 'Trusted plan - monthly', SUBSCRIPTION_YEARLY: 'Trusted plan - yearly', OTHER: 'Other' };

export default function PaymentClaimsScreen() {
  const router = useRouter();
  const { colors } = useTheme() as any;
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const [rows, setRows] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [reason, setReason] = useState('');
  const [approveAmount, setApproveAmount] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await apiService.getPaymentClaims(tab);
      setRows(res?.claims || []);
    } catch (e: any) {
      Alert.alert('Could not load', String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const approve = (c: Claim) => {
    const typed = parseInt(approveAmount[c.id] || '', 10);
    const amount = typed > 0 ? typed : c.amount;
    Alert.alert('Approve payment?', `Rs ${amount} for ${c.person_name || c.person_phone || 'this person'} (UTR ${c.utr}).\n\nOnly approve if you saw this UTR in the bank statement.${c.purpose.startsWith('SUBSCRIPTION') ? '\n\nThe Trusted plan will be switched on.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          setBusyId(c.id);
          try {
            const r = await apiService.approvePaymentClaim(c.id, typed > 0 && typed !== c.amount ? { credit_amount: typed } : {});
            Alert.alert('Done', r?.plan_message || `Rs ${amount} credited.`);
            await load();
          } catch (e: any) {
            Alert.alert('Could not approve', String(e?.message || e));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const doReject = async () => {
    if (!rejecting) return;
    if (!reason.trim()) { Alert.alert('Reason needed', 'The person is shown this reason.'); return; }
    setBusyId(rejecting.id);
    try {
      await apiService.rejectPaymentClaim(rejecting.id, { note: reason.trim() });
      setRejecting(null);
      setReason('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not reject', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const badge = (s: string) => s === 'APPROVED' ? { c: '#16A34A', Icon: CheckCircle2, t: 'Credited' } : s === 'REJECTED' ? { c: '#DC2626', Icon: XCircle, t: 'Rejected' } : { c: '#D97706', Icon: Clock, t: 'To check' };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Payment reports</Text>
      </View>
      <View style={styles.tabs}>
        {(['PENDING', 'ALL'] as const).map((k) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[styles.tab, { borderColor: tab === k ? colors.primary : colors.border, backgroundColor: tab === k ? colors.primary : 'transparent' }]}>
            <Text style={{ color: tab === k ? '#fff' : colors.text, fontWeight: '600' }}>{k === 'PENDING' ? 'To check' : 'All'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {rows.length === 0 ? <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>{tab === 'PENDING' ? 'Nothing waiting. 🎉' : 'No reports yet.'}</Text> : null}
          {rows.map((c) => {
            const b = badge(c.status);
            return (
              <View key={c.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.rowBetween}>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Rs {c.amount}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><b.Icon size={16} color={b.c} /><Text style={{ color: b.c, fontWeight: '600' }}>{b.t}</Text></View>
                </View>
                <Text style={{ color: colors.text, marginTop: 4, fontWeight: '600' }}>{c.person_name || 'Unknown'}</Text>
                {c.person_phone ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.person_phone}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Phone size={14} color={colors.primary} /><Text style={{ color: colors.primary }}>{c.person_phone}</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={{ color: colors.textSecondary, marginTop: 6 }}>For: {PURPOSE_LABEL[c.purpose] || c.purpose}  ·  {c.method}</Text>
                <Text selectable style={{ color: colors.text, marginTop: 2 }}>UTR: <Text style={{ fontWeight: '700' }}>{c.utr}</Text></Text>
                {c.note ? <Text style={{ color: colors.textSecondary, marginTop: 2 }}>Note: {c.note}</Text> : null}
                {c.created_at ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Reported {new Date(c.created_at).toLocaleString()}</Text> : null}
                {c.status !== 'PENDING' ? <Text style={{ color: colors.textSecondary, marginTop: 6 }}>{c.status === 'APPROVED' ? `Credited Rs ${c.credited_amount ?? c.amount}` : 'Rejected'} by {c.decided_by}: {c.decision_note}</Text> : (
                  <View style={{ marginTop: 10 }}>
                    <TextInput value={approveAmount[c.id] || ''} onChangeText={(v) => setApproveAmount((p) => ({ ...p, [c.id]: v.replace(/\D/g, '') }))} keyboardType="number-pad"
                      placeholder={`Amount to credit (default ${c.amount})`} placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TouchableOpacity disabled={busyId === c.id} onPress={() => approve(c)} style={[styles.btn, { backgroundColor: '#16A34A', opacity: busyId === c.id ? 0.6 : 1 }]}><Text style={styles.btnText}>Approve</Text></TouchableOpacity>
                      <TouchableOpacity disabled={busyId === c.id} onPress={() => { setRejecting(c); setReason(''); }} style={[styles.btn, { backgroundColor: '#DC2626' }]}><Text style={styles.btnText}>Reject</Text></TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Why is it not accepted?</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>The person sees this exactly.</Text>
            <TextInput value={reason} onChangeText={setReason} multiline placeholder="e.g. UTR not found in our bank statement" placeholderTextColor={colors.textSecondary}
              style={[styles.input, { borderColor: colors.border, color: colors.text, minHeight: 70 }]} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setRejecting(null)} style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}><Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={doReject} style={[styles.btn, { backgroundColor: '#DC2626' }]}><Text style={styles.btnText}>Reject</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  title: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  tab: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 14, padding: 18 },
});
