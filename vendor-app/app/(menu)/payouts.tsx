import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Wallet, Landmark, Pencil, Send, Clock, CircleCheck as CheckCircle, CircleX as XCircle, Info } from 'lucide-react-native';
import api from '../api/api';
import { useSupportContact } from '@/utils/supportContact';

interface PayoutInfo {
  balance: number;
  keep_in_wallet: number;
  max_redeemable: number;
  pending_request: { id: number; amount: number; requested_at: string | null } | null;
  payment_details_saved: boolean;
}
interface PaymentDetails { bank_account_number: string | null; bank_ifsc: string | null; bank_account_holder_name: string | null; upi_id: string | null }
interface PayoutRow { id: number; amount: number; status: 'PENDING' | 'PAID' | 'REJECTED'; requested_at: string; processed_at?: string | null; notes?: string | null; paid_via?: string | null }

const UPI_RE = /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/;
const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const mask = (v?: string | null) => (v ? `${'•'.repeat(Math.max(v.length - 4, 0))}${v.slice(-4)}` : '');

// Withdraw money: see what can be taken out, keep the bank / UPI details, ask for a payout and follow each request to "paid".
export default function PayoutsScreen() {
  const { contact, call } = useSupportContact();
  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [upi, setUpi] = useState('');
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [i, d, r] = await Promise.all([
        api.get('/users/vendor/payout-info'),
        api.get('/users/vendor/payment-details'),
        api.get('/users/vendor/payout-requests'),
      ]);
      setInfo(i.data); setDetails(d.data); setRows(r.data);
      setAmount((prev) => prev || (i.data.max_redeemable > 0 ? String(i.data.max_redeemable) : ''));
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    setUpi(details?.upi_id || ''); setHolder(details?.bank_account_holder_name || '');
    setAccount(details?.bank_account_number || ''); setIfsc(details?.bank_ifsc || '');
    setEditing(true);
  };

  const saveDetails = async () => {
    const u = upi.trim(); const a = account.trim(); const f = ifsc.trim().toUpperCase(); const h = holder.trim();
    if (!u && !a) { Alert.alert('Add one way to get paid', 'Enter a UPI ID, or your bank account number and IFSC.'); return; }
    if (u && !UPI_RE.test(u)) { Alert.alert('UPI ID looks wrong', 'It looks like name@bank, for example 9876543210@okaxis.'); return; }
    if (a || f) {
      if (!/^\d{9,18}$/.test(a)) { Alert.alert('Account number looks wrong', 'Bank account numbers are 9 to 18 digits.'); return; }
      if (!IFSC_RE.test(f)) { Alert.alert('IFSC looks wrong', 'It is 11 characters, like SBIN0001234 (the 5th one is a zero).'); return; }
      if (h.length < 3) { Alert.alert('Account holder name needed', 'Type the name exactly as it is on the bank account.'); return; }
    }
    setSaving(true);
    try {
      await api.put('/users/vendor/payment-details', {
        upi_id: u || null,
        bank_account_number: a || null,
        bank_ifsc: a ? f : null,
        bank_account_holder_name: a ? h : null,
      });
      setEditing(false);
      await load();
      Alert.alert('Saved', 'Your payout details are saved.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const amountNum = Number(amount.replace(/[^0-9]/g, '')) || 0;
  const blocker = useMemo(() => {
    if (!info) return 'Loading...';
    if (!info.payment_details_saved) return 'First add your UPI ID or bank details above.';
    if (info.pending_request) return `Your request for ${rupees(info.pending_request.amount)} is being processed. You can ask again after it is paid.`;
    if (info.max_redeemable <= 0) return `You can withdraw once your balance is above ${rupees(info.keep_in_wallet)} (that amount stays in your wallet).`;
    if (amountNum <= 0) return 'Enter the amount to withdraw.';
    if (amountNum > info.max_redeemable) return `You can withdraw at most ${rupees(info.max_redeemable)} right now.`;
    return null;
  }, [info, amountNum]);

  const requestPayout = () => {
    if (blocker || !info) return;
    Alert.alert('Request payout?', `${rupees(amountNum)} will be sent to ${details?.upi_id ? `UPI ${details.upi_id}` : `bank account ${mask(details?.bank_account_number)}`} after our accounts team checks it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request',
        onPress: async () => {
          setRequesting(true);
          try {
            await api.post('/users/vendor/payout-request', { amount: amountNum });
            setAmount('');
            await load();
            Alert.alert('Request sent', 'We will pay you soon. You will see the status below.');
          } catch (e: any) {
            Alert.alert('Could not request', e?.message || 'Please try again.');
          } finally {
            setRequesting(false);
          }
        },
      },
    ]);
  };

  const statusChip = (s: PayoutRow['status']) => {
    if (s === 'PAID') return { label: 'Paid', color: '#047857', bg: '#D1FAE5', Icon: CheckCircle };
    if (s === 'REJECTED') return { label: 'Not paid', color: '#B91C1C', bg: '#FEE2E2', Icon: XCircle };
    return { label: 'Processing', color: '#B45309', bg: '#FEF3C7', Icon: Clock };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw money</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {loadError && !info ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.primary} onPress={load}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : !info ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator size="large" color="#1D4ED8" /></View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: '#1E3A8A' }]}>
              <View style={styles.rowCenter}><Wallet size={18} color="#BFDBFE" /><Text style={styles.balLabel}>Your wallet balance</Text></View>
              <Text style={styles.balValue}>{rupees(info.balance)}</Text>
              <View style={styles.balSplit}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balSmallLabel}>You can withdraw</Text>
                  <Text style={styles.balSmallValue}>{rupees(info.max_redeemable)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balSmallLabel}>Stays in wallet</Text>
                  <Text style={styles.balSmallValue}>{rupees(info.keep_in_wallet)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.rowCenter}><Landmark size={18} color="#1D4ED8" /><Text style={styles.cardTitle}>Where to send the money</Text></View>
                {!editing && (
                  <TouchableOpacity style={styles.editBtn} onPress={startEdit} accessibilityLabel="Edit payout details">
                    <Pencil size={14} color="#1D4ED8" /><Text style={styles.editText}>{info.payment_details_saved ? 'Change' : 'Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!editing ? (
                info.payment_details_saved ? (
                  <View>
                    {!!details?.upi_id && <Text style={styles.detailLine}>UPI: <Text style={styles.detailStrong}>{details.upi_id}</Text></Text>}
                    {!!details?.bank_account_number && (
                      <Text style={styles.detailLine}>Bank: <Text style={styles.detailStrong}>{details.bank_account_holder_name} · {mask(details.bank_account_number)} · {details.bank_ifsc}</Text></Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.muted}>Nothing saved yet. Add a UPI ID or your bank account to receive payouts.</Text>
                )
              ) : (
                <View>
                  <Text style={styles.label}>UPI ID</Text>
                  <TextInput style={styles.input} value={upi} onChangeText={setUpi} placeholder="9876543210@okaxis" autoCapitalize="none" autoCorrect={false} placeholderTextColor="#9CA3AF" />
                  <Text style={styles.or}>or bank account</Text>
                  <Text style={styles.label}>Account holder name</Text>
                  <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="Name as on the bank account" placeholderTextColor="#9CA3AF" />
                  <Text style={styles.label}>Account number</Text>
                  <TextInput style={styles.input} value={account} onChangeText={(v) => setAccount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={18} placeholder="Account number" placeholderTextColor="#9CA3AF" />
                  <Text style={styles.label}>IFSC code</Text>
                  <TextInput style={styles.input} value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="SBIN0001234" placeholderTextColor="#9CA3AF" />
                  <View style={styles.rowGap}>
                    <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => setEditing(false)} disabled={saving}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.primary, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={saveDetails} disabled={saving}>
                      {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Request a payout</Text>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Amount" placeholderTextColor="#9CA3AF" editable={!info.pending_request} />
              {!!blocker && (
                <View style={styles.notice}><Info size={16} color="#92400E" /><Text style={styles.noticeText}>{blocker}</Text></View>
              )}
              <TouchableOpacity style={[styles.primary, (!!blocker || requesting) && { opacity: 0.45 }]} onPress={requestPayout} disabled={!!blocker || requesting} activeOpacity={0.85}>
                {requesting ? <ActivityIndicator color="#FFFFFF" /> : <><Send size={16} color="#FFFFFF" /><Text style={styles.primaryText}>Request payout</Text></>}
              </TouchableOpacity>
              <Text style={styles.footnote}>Our accounts team pays requests on working days. Only one request can be open at a time. Questions? Call {contact.phone}.</Text>
              <TouchableOpacity onPress={call} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={styles.link}>Call support</Text></TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Your payout requests</Text>
            {rows === null ? null : rows.length === 0 ? (
              <View style={styles.card}><Text style={styles.muted}>No payout requests yet.</Text></View>
            ) : (
              rows.map((r) => {
                const c = statusChip(r.status);
                return (
                  <View key={r.id} style={styles.histCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histAmount}>{rupees(r.amount)}</Text>
                      <Text style={styles.histDate}>{new Date(r.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{r.paid_via ? ` · via ${r.paid_via}` : ''}</Text>
                      {!!r.notes && <Text style={styles.histNote} numberOfLines={3}>{r.notes}</Text>}
                    </View>
                    <View style={[styles.chip, { backgroundColor: c.bg }]}>
                      <c.Icon size={13} color={c.color} /><Text style={[styles.chipText, { color: c.color }]}>{c.label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  rowGap: { flexDirection: 'row', gap: 10, marginTop: 14 },
  balLabel: { color: '#BFDBFE', fontSize: 13, fontWeight: '600' },
  balValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginTop: 6, marginBottom: 14 },
  balSplit: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 12 },
  balSmallLabel: { color: '#BFDBFE', fontSize: 12 },
  balSmallValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 2 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#EFF6FF' },
  editText: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  detailLine: { fontSize: 14, color: '#374151', marginTop: 4, lineHeight: 20 },
  detailStrong: { fontWeight: '800', color: '#111827' },
  muted: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  label: { fontSize: 12.5, fontWeight: '700', color: '#4B5563', marginTop: 12, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  or: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 14 },
  primary: { minHeight: 50, borderRadius: 13, backgroundColor: '#1D4ED8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 50, borderRadius: 13, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginTop: 12 },
  noticeText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
  footnote: { color: '#6B7280', fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  link: { color: '#1D4ED8', fontWeight: '700', fontSize: 13.5 },
  errorText: { color: '#B91C1C', fontSize: 14, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 4, marginBottom: 10 },
  histCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  histAmount: { fontSize: 18, fontWeight: '800', color: '#111827' },
  histDate: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  histNote: { fontSize: 12.5, color: '#4B5563', marginTop: 6, lineHeight: 17 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  chipText: { fontSize: 12, fontWeight: '800' },
});
