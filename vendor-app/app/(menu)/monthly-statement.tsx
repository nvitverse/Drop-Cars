import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Share } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle, Share2 } from 'lucide-react-native';
import api from '../api/api';

interface Statement {
  business_name: string; period: string;
  summary: { earned: number; deducted: number; net: number; trips_with_earnings: number; paid_out_to_bank: number; opening_balance: number | null; closing_balance: number | null };
  entries: { date: string; type: 'CREDIT' | 'DEBIT'; amount: number; order_id: number | null; notes: string | null; balance_after: number }[];
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const rupees = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `₹${Math.round(n).toLocaleString('en-IN')}`);

// Everything that went into and out of the wallet in one month, from the wallet's own ledger - so it always matches the balance.
export default function MonthlyStatement() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData((await api.get('/users/vendor/reports/monthly-statement', { params: { year: ym.y, month: ym.m } })).data);
    } catch (e: any) {
      setData(null); setError(e?.message || 'Could not load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [ym]);
  useEffect(() => { setData(null); load(); }, [load]);

  const move = (d: number) => setYm((v) => {
    const t = v.y * 12 + (v.m - 1) + d;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  });
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;

  const shareText = () => {
    if (!data) return;
    const s = data.summary;
    Share.share({ message: [`${data.business_name} - wallet statement ${MONTHS[ym.m - 1]} ${ym.y}`, `Earned: ${rupees(s.earned)}`, `Deducted: ${rupees(s.deducted)}`, `Net: ${rupees(s.net)}`,
      `Trips with earnings: ${s.trips_with_earnings}`, `Paid out to bank: ${rupees(s.paid_out_to_bank)}`, `Closing balance: ${rupees(s.closing_balance)}`].join('\n') });
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <View style={st.header}>
        <TouchableOpacity style={st.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={st.headerTitle}>Monthly statement</Text>
        <TouchableOpacity style={st.back} onPress={shareText} accessibilityLabel="Share"><Share2 size={20} color="#1D4ED8" /></TouchableOpacity>
      </View>
      <View style={st.monthRow}>
        <TouchableOpacity style={st.arrow} onPress={() => move(-1)} accessibilityLabel="Previous month"><ChevronLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={st.monthText}>{MONTHS[ym.m - 1]} {ym.y}</Text>
        <TouchableOpacity style={[st.arrow, isCurrent && { opacity: 0.3 }]} onPress={() => move(1)} disabled={isCurrent} accessibilityLabel="Next month"><ChevronRight size={22} color="#1F2937" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={st.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={st.card}><Text style={{ color: '#B91C1C', marginBottom: 10 }}>{error}</Text><TouchableOpacity style={st.btn} onPress={load}><Text style={st.btnText}>Try again</Text></TouchableOpacity></View>
        ) : !data ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator size="large" color="#1D4ED8" /></View>
        ) : (
          <>
            <View style={[st.card, { backgroundColor: '#1E3A8A' }]}>
              <Text style={st.heroLabel}>Net for the month</Text>
              <Text style={st.heroValue}>{rupees(data.summary.net)}</Text>
              <View style={st.grid}>
                <View style={st.cell}><Text style={st.cellLabel}>Earned</Text><Text style={st.cellValue}>{rupees(data.summary.earned)}</Text></View>
                <View style={st.cell}><Text style={st.cellLabel}>Deducted</Text><Text style={st.cellValue}>{rupees(data.summary.deducted)}</Text></View>
                <View style={st.cell}><Text style={st.cellLabel}>Trips paid</Text><Text style={st.cellValue}>{data.summary.trips_with_earnings}</Text></View>
                <View style={st.cell}><Text style={st.cellLabel}>Paid to bank</Text><Text style={st.cellValue}>{rupees(data.summary.paid_out_to_bank)}</Text></View>
              </View>
              {data.summary.closing_balance !== null && (
                <Text style={st.heroSub}>Wallet: {rupees(data.summary.opening_balance)} at the start, {rupees(data.summary.closing_balance)} at the end</Text>
              )}
            </View>

            <Text style={st.section}>Every entry</Text>
            {data.entries.length === 0 ? (
              <View style={st.card}><Text style={{ color: '#6B7280' }}>No wallet entries in this month.</Text></View>
            ) : (
              data.entries.slice().reverse().map((e, i) => (
                <View key={i} style={st.entry}>
                  {e.type === 'CREDIT' ? <ArrowUpCircle size={22} color="#059669" /> : <ArrowDownCircle size={22} color="#DC2626" />}
                  <View style={{ flex: 1 }}>
                    <Text style={st.entryNote} numberOfLines={2}>{e.notes || (e.type === 'CREDIT' ? 'Credit' : 'Debit')}</Text>
                    <Text style={st.entryMeta}>{e.date}{e.order_id ? ` · Booking #${e.order_id}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.entryAmt, { color: e.type === 'CREDIT' ? '#059669' : '#DC2626' }]}>{e.type === 'CREDIT' ? '+' : '-'}{rupees(e.amount)}</Text>
                    <Text style={st.entryMeta}>Bal {rupees(e.balance_after)}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 16, fontWeight: '800', color: '#111827' },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  heroLabel: { color: '#BFDBFE', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 4, marginBottom: 14 },
  heroSub: { color: '#BFDBFE', fontSize: 12.5, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 12 },
  cell: { width: '46%' },
  cellLabel: { color: '#BFDBFE', fontSize: 12 },
  cellValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 2 },
  section: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  entry: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryNote: { fontSize: 13.5, fontWeight: '600', color: '#111827' },
  entryMeta: { fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  entryAmt: { fontSize: 15, fontWeight: '800' },
  btn: { minHeight: 46, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '800' },
});
