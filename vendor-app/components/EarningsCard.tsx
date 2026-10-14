import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { router, useFocusEffect } from 'expo-router';
import { TrendingUp, ChevronRight } from 'lucide-react-native';
import api from '../app/api/api';

interface Summary { this_month: { earned: number; trips_with_earnings: number }; last_month: { earned: number }; wallet_balance: number; open_bookings: number }
const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

// "How am I doing?" at the top of the Dashboard: this month's earnings from the wallet ledger. A dash while loading - never a made-up 0.
export default function EarningsCard() {
  const [d, setD] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    api.get('/users/vendor/reports/earnings-summary').then((r) => { if (alive) { setD(r.data); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []));

  const delta = d ? d.this_month.earned - d.last_month.earned : 0;
  return (
    <TouchableOpacity style={s.card} onPress={() => router.push('/(menu)/monthly-statement' as any)} activeOpacity={0.85}>
      <View style={s.head}>
        <View style={s.headLeft}><TrendingUp size={16} color="#BFDBFE" /><Text style={s.headText}>Earned this month</Text></View>
        <View style={s.headLeft}><Text style={s.link}>Statement</Text><ChevronRight size={16} color="#BFDBFE" /></View>
      </View>
      <Text style={s.value}>{d ? rupees(d.this_month.earned) : failed ? 'Not available' : '-'}</Text>
      <View style={s.row}>
        <View style={s.cell}><Text style={s.cellValue}>{d ? d.this_month.trips_with_earnings : '-'}</Text><Text style={s.cellLabel}>trips paid</Text></View>
        <View style={s.cell}><Text style={s.cellValue}>{d ? d.open_bookings : '-'}</Text><Text style={s.cellLabel}>open bookings</Text></View>
        <View style={s.cell}>
          <Text style={[s.cellValue, d && delta !== 0 ? { color: delta > 0 ? '#86EFAC' : '#FCA5A5' } : null]}>{d ? `${delta >= 0 ? '+' : '-'}${rupees(Math.abs(delta))}` : '-'}</Text>
          <Text style={s.cellLabel}>vs last month</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#1E3A8A', borderRadius: 18, padding: 16, marginHorizontal: 16, marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { color: '#BFDBFE', fontSize: 13, fontWeight: '600' },
  link: { color: '#BFDBFE', fontSize: 12.5, fontWeight: '700' },
  value: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 6, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 12 },
  cell: { flex: 1 },
  cellValue: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  cellLabel: { color: '#BFDBFE', fontSize: 11.5, marginTop: 2 },
});
