import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, FileText, Plus, Receipt, Search, Settings2 } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { billingApi, BillingBrand, BillingRow } from '@/services/billingApi';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const TYPES = [{ key: '', label: 'All' }, { key: 'INVOICE', label: 'Invoices' }, { key: 'ESTIMATE', label: 'Estimates' }];
const STATUSES = [{ key: '', label: 'Any status' }, { key: 'DRAFT', label: 'Draft' }, { key: 'ISSUED', label: 'Issued' }, { key: 'UNPAID', label: 'Unpaid' }, { key: 'PARTIAL', label: 'Part paid' }, { key: 'PAID', label: 'Paid' }, { key: 'CONVERTED', label: 'Converted' }, { key: 'CANCELLED', label: 'Cancelled' }];

export default function Invoices() {
  const router = useRouter();
  const { themeColors: c } = useTheme();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [brands, setBrands] = useState<BillingBrand[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [brandId, setBrandId] = useState('');
  const [by, setBy] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const r = await billingApi.list({ doc_type: type, status, brand_id: brandId, search: search.trim(), created_by: by });
      setRows(r);
    } catch (e: any) { setError(e?.message || 'Could not load'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [type, status, brandId, search, by]);

  useEffect(() => { billingApi.brands().then(setBrands).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { billingApi.staff().then(setStaff).catch(() => {}); }, []));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const outstanding = useMemo(() => rows.filter((r) => r.doc_type === 'INVOICE' && r.status !== 'CANCELLED' && r.status !== 'DRAFT').reduce((n, r) => n + (r.balance_due || 0), 0), [rows]);
  const openEstimates = useMemo(() => rows.filter((r) => r.doc_type === 'ESTIMATE' && (r.status === 'ISSUED' || r.status === 'ACCEPTED')).length, [rows]);

  const chip = (on: boolean) => [s.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary + '22' : 'transparent' }];
  const pill = (r: BillingRow) => {
    if (r.status === 'CANCELLED') return { t: 'CANCELLED', bg: '#FEE2E2', fg: '#991B1B' };
    if (r.status === 'DRAFT') return { t: 'DRAFT', bg: '#E2E8F0', fg: '#334155' };
    if (r.doc_type === 'ESTIMATE') return r.status === 'CONVERTED' ? { t: 'INVOICED', bg: '#DCFCE7', fg: '#166534' } : { t: 'ESTIMATE', bg: '#E0F2FE', fg: '#075985' };
    return r.payment_status === 'PAID' ? { t: 'PAID', bg: '#DCFCE7', fg: '#166534' } : r.payment_status === 'PARTIAL' ? { t: 'PART PAID', bg: '#FEF3C7', fg: '#92400E' } : { t: 'UNPAID', bg: '#FEE2E2', fg: '#991B1B' };
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Invoices & Estimates</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5 }}>{inr(outstanding)} to collect · {openEstimates} open estimate{openEstimates === 1 ? '' : 's'}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/billing-brands' as any)} style={{ padding: 6 }}><Settings2 size={21} color={c.text} /></TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 4 }}>
        <TouchableOpacity onPress={() => router.push('/billing-editor?type=ESTIMATE' as any)} style={[s.big, { backgroundColor: c.primary }]}><FileText size={17} color="#FFFFFF" /><Text style={s.bigTxt}>New estimate</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/billing-editor?type=INVOICE' as any)} style={[s.big, { backgroundColor: '#047857' }]}><Receipt size={17} color="#FFFFFF" /><Text style={s.bigTxt}>New invoice</Text></TouchableOpacity>
      </View>

      <View style={[s.search, { borderColor: c.border, backgroundColor: c.surface }]}>
        <Search size={16} color={c.textMuted} />
        <TextInput style={{ flex: 1, color: c.text, padding: 0, fontSize: 14 }} value={search} onChangeText={setSearch} placeholder="Search number, customer, phone, booking id" placeholderTextColor={c.textMuted} />
      </View>

      <View style={{ paddingHorizontal: 12, gap: 6, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{TYPES.map((x) => <TouchableOpacity key={x.key} onPress={() => setType(x.key)} style={chip(type === x.key)}><Text style={{ fontSize: 12, color: c.text, fontWeight: '700' }}>{x.label}</Text></TouchableOpacity>)}</View>
        <FlatList horizontal data={STATUSES} keyExtractor={(x) => x.key || 'any'} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => <TouchableOpacity onPress={() => setStatus(item.key)} style={chip(status === item.key)}><Text style={{ fontSize: 12, color: c.text }}>{item.label}</Text></TouchableOpacity>} />
        <FlatList horizontal data={[{ id: '', name: 'All brands', primary_color: '' } as any, ...brands]} keyExtractor={(x) => x.id || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => <TouchableOpacity onPress={() => setBrandId(item.id)} style={chip(brandId === item.id)}>{!!item.primary_color && <View style={[s.dot, { backgroundColor: item.primary_color }]} />}<Text style={{ fontSize: 12, color: c.text }}>{item.name}</Text></TouchableOpacity>} />
        {staff.length > 0 && (
          <FlatList horizontal data={['', ...staff]} keyExtractor={(x) => x || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}
            renderItem={({ item }) => <TouchableOpacity onPress={() => setBy(item)} style={chip(by === item)}><Text style={{ fontSize: 12, color: c.text }}>{item ? `By ${item}` : 'Everyone'}</Text></TouchableOpacity>} />
        )}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} /> : (
        <FlatList
          data={rows} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 12, paddingBottom: 60, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} />}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: 24 }}>
            <Text style={{ color: error ? '#B91C1C' : c.textSecondary, textAlign: 'center' }}>{error || 'Nothing here yet. Tap "New estimate" or "New invoice" - type a booking id and everything fills in.'}</Text>
          </View>}
          renderItem={({ item: r }) => {
            const p = pill(r);
            return (
              <TouchableOpacity onPress={() => router.push({ pathname: '/billing-editor', params: { id: r.id } } as any)} style={[s.row, { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: r.brand_color || c.primary }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: c.text, fontWeight: '800', fontSize: 14 }}>{r.number}</Text>
                    <View style={{ backgroundColor: p.bg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: p.fg, fontSize: 10, fontWeight: '800' }}>{p.t}</Text></View>
                  </View>
                  <Text style={{ color: c.text, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{r.customer_name || 'No name'}{r.customer_phone ? ` · ${r.customer_phone}` : ''}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                    {r.brand}{r.booking_ref ? ` · ${r.booking_ref}` : ''}{r.created_by ? ` · by ${r.created_by}` : ''}{r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{inr(r.total_amount)}</Text>
                  {r.doc_type === 'INVOICE' && r.status !== 'CANCELLED' && r.status !== 'DRAFT' && r.balance_due > 0 && <Text style={{ color: '#B91C1C', fontSize: 11.5, fontWeight: '700' }}>due {inr(r.balance_due)}</Text>}
                  {r.doc_type === 'ESTIMATE' && !!r.valid_until && r.status === 'ISSUED' && <Text style={{ color: c.textMuted, fontSize: 11 }}>till {r.valid_until}</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13 },
  bigTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 14.5 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 10, paddingVertical: 9 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', gap: 10, borderWidth: 1, borderLeftWidth: 5, borderRadius: 10, padding: 11 },
});
