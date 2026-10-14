import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, FileText, ReceiptText, Search, Settings2, Wallet } from 'lucide-react-native';
import { vendorBilling, BillRow } from '../../services/vendorBillingApi';

const FILTERS: { key: string; label: string; q: { doc_type?: string; status?: string } }[] = [
  { key: 'all', label: 'All', q: {} },
  { key: 'est', label: 'Estimates', q: { doc_type: 'ESTIMATE' } },
  { key: 'inv', label: 'Invoices', q: { doc_type: 'INVOICE' } },
  { key: 'unpaid', label: 'Not paid', q: { status: 'UNPAID' } },
  { key: 'draft', label: 'Drafts', q: { status: 'DRAFT' } },
];
const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function statusChip(r: BillRow) {
  if (r.status === 'CANCELLED') return { t: 'Cancelled', c: '#6B7280', bg: '#F3F4F6' };
  if (r.status === 'DRAFT') return { t: 'Draft', c: '#92400E', bg: '#FEF3C7' };
  if (r.doc_type === 'ESTIMATE') return r.status === 'CONVERTED' ? { t: 'Invoiced', c: '#047857', bg: '#D1FAE5' } : { t: 'Sent', c: '#1D4ED8', bg: '#DBEAFE' };
  if (r.payment_status === 'PAID') return { t: 'Paid', c: '#047857', bg: '#D1FAE5' };
  if (r.payment_status === 'PARTIAL') return { t: 'Part paid', c: '#B45309', bg: '#FEF3C7' };
  return { t: 'Not paid', c: '#B91C1C', bg: '#FEE2E2' };
}

// Estimates and invoices the vendor made for their own customers, in their own name.
export default function InvoicesHub() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BillRow[] | null>(null);
  const [sum, setSum] = useState<{ to_collect: number; billed: number; invoices: number; estimates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(true);       // the office can switch invoicing off for a vendor (or for everyone)

  const load = useCallback(async () => {
    setError(null);
    try {
      const f = FILTERS.find((x) => x.key === filter)!;
      const [list, s] = await Promise.all([vendorBilling.list({ ...f.q, search: search.trim() || undefined }), vendorBilling.summary()]);
      setRows(list); setSum(s);
      vendorBilling.options().then((o) => setEnabled(o.enabled !== false)).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Could not load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [filter, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [search]);   // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id?: string, type?: string) => router.push({ pathname: '/(menu)/invoice-editor' as any, params: id ? { id } : { type: type || 'ESTIMATE' } });

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={s.headerTitle}>Invoices & estimates</Text>
        <TouchableOpacity style={s.back} onPress={() => router.push('/(menu)/business-profile' as any)} accessibilityLabel="My business details"><Settings2 size={20} color="#1D4ED8" /></TouchableOpacity>
      </View>

      <FlatList
        data={rows || []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={
          <View>
            <View style={s.hero}>
              <View style={s.rowCenter}><Wallet size={18} color="#BFDBFE" /><Text style={s.heroLabel}>Still to collect from customers</Text></View>
              <Text style={s.heroValue}>{sum ? rupees(sum.to_collect) : '-'}</Text>
              <Text style={s.heroSub}>{sum ? `${sum.invoices} invoices · ${sum.estimates} estimates · ${rupees(sum.billed)} billed` : ' '}</Text>
            </View>

            {!enabled && <Text style={s.error}>Making new invoices is switched off for your account right now. Please contact Drop Cars support. You can still see what you made earlier.</Text>}
            <View style={s.actions}>
              <TouchableOpacity style={[s.action, { backgroundColor: '#1D4ED8' }]} onPress={() => open(undefined, 'ESTIMATE')} activeOpacity={0.85}>
                <FileText size={18} color="#FFFFFF" /><Text style={s.actionText}>New estimate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.action, { backgroundColor: '#059669' }]} onPress={() => open(undefined, 'INVOICE')} activeOpacity={0.85}>
                <ReceiptText size={18} color="#FFFFFF" /><Text style={s.actionText}>New invoice</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.tip}>Tip: open a booking and tap "Make invoice" - the customer and trip fill in by themselves.</Text>

            <View style={s.searchBox}>
              <Search size={18} color="#9CA3AF" />
              <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search name, phone, number, booking" placeholderTextColor="#9CA3AF" />
            </View>
            <View style={s.chipRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.key} style={[s.chip, filter === f.key && s.chipOn]} onPress={() => setFilter(f.key)}>
                  <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {error && <Text style={s.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => {
          const c = statusChip(item);
          return (
            <TouchableOpacity style={s.row} onPress={() => open(item.id)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowNum} numberOfLines={1}>{item.status === 'DRAFT' ? `${item.doc_type === 'ESTIMATE' ? 'Estimate' : 'Invoice'} draft` : item.number}</Text>
                <Text style={s.rowName} numberOfLines={1}>{item.customer_name || 'No customer name'}{item.customer_phone ? ` · ${item.customer_phone}` : ''}</Text>
                {item.doc_type === 'INVOICE' && item.status !== 'DRAFT' && item.status !== 'CANCELLED' && item.balance_due > 0 && <Text style={s.rowDue}>{rupees(item.balance_due)} to collect</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.rowAmount}>{rupees(item.total_amount)}</Text>
                <View style={[s.status, { backgroundColor: c.bg }]}><Text style={[s.statusText, { color: c.c }]}>{c.t}</Text></View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={rows === null ? <View style={{ paddingVertical: 40 }}><ActivityIndicator size="large" color="#1D4ED8" /></View> : (
          <View style={s.empty}>
            <ReceiptText size={42} color="#9CA3AF" />
            <Text style={s.emptyTitle}>Nothing here yet</Text>
            <Text style={s.emptyText}>Make an estimate to send before the trip, or an invoice after it - with your own business name, GST and payment details.</Text>
            <TouchableOpacity style={[s.action, { backgroundColor: '#1D4ED8', marginTop: 14, flex: 0, paddingHorizontal: 22 }]} onPress={() => router.push('/(menu)/business-profile' as any)}>
              <Text style={s.actionText}>Set up my business details</Text>
            </TouchableOpacity>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  list: { padding: 16, paddingBottom: 48 },
  hero: { backgroundColor: '#1E3A8A', borderRadius: 16, padding: 16, marginBottom: 14 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroLabel: { color: '#BFDBFE', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 4 },
  heroSub: { color: '#BFDBFE', fontSize: 12.5, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  tip: { color: '#6B7280', fontSize: 12.5, lineHeight: 18, marginTop: 10, marginBottom: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, minHeight: 46, borderWidth: 1, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, fontSize: 14.5, color: '#111827', paddingVertical: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#FFFFFF' },
  error: { color: '#B91C1C', fontSize: 13, marginBottom: 8 },
  row: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowNum: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  rowName: { fontSize: 13, color: '#4B5563', marginTop: 3 },
  rowDue: { fontSize: 12.5, color: '#B91C1C', fontWeight: '700', marginTop: 4 },
  rowAmount: { fontSize: 16, fontWeight: '800', color: '#111827' },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 12 },
  emptyText: { fontSize: 13.5, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginTop: 6 },
});
