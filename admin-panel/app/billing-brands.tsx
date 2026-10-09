import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { billingApi, BillingBrand, PricingRule, RateCard, TariffMethod } from '@/services/billingApi';

// Brands: everything a document prints for a brand (name, GSTIN, bank, colour, terms, rules) and the brand's tariffs.
// Writing is Owner-only on the server; staff can open the screen but a save will be refused with a clear message.

type Tab = 'details' | 'tax' | 'terms' | 'tariffs' | 'rules';
const TABS: { key: Tab; label: string }[] = [{ key: 'details', label: 'Details' }, { key: 'tax', label: 'Tax & bank' }, { key: 'terms', label: 'Terms & rules' }, { key: 'tariffs', label: 'Tariffs' }, { key: 'rules', label: 'Rules' }];
const SCOPES: { key: PricingRule['scope']; label: string; hint: string }[] = [
  { key: 'STATE', label: 'State', hint: 'Places / state words found in the pickup, drop or stops' },
  { key: 'LOCATION', label: 'Location', hint: 'A city, town or area word' },
  { key: 'ROUTE', label: 'Route', hint: 'From one place to another (works both ways)' },
  { key: 'HILL', label: 'Hills', hint: 'Hill stations - charged per hill' },
  { key: 'ALL', label: 'All trips', hint: 'Every trip of the chosen trip types' },
];
const EFFECTS: { key: string; label: string; unit: string }[] = [
  { key: 'MIN_KM_PER_DAY', label: 'Minimum km / day', unit: 'km per day (round / multi-city)' },
  { key: 'MIN_KM_ONEWAY', label: 'Minimum km (one way)', unit: 'km' },
  { key: 'RATE_DELTA', label: 'Rate / km +/-', unit: '₹ per km (use - to reduce)' },
  { key: 'BATA_DELTA', label: 'Bata / day +/-', unit: '₹ per day (use - to reduce)' },
  { key: 'CHARGE', label: 'Extra charge', unit: '₹ amount' },
  { key: 'HILL_CHARGE', label: 'Hill charge', unit: '' },
  { key: 'PERCENT', label: '% on fare', unit: '% (use - for a discount)' },
];
const TRIP_KINDS = ['oneway', 'round', 'multicity'];
const csv = (v: any) => (Array.isArray(v) ? v.join(', ') : String(v || ''));
const COLORS = ['#0EA5E9', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#EAB308', '#10B981', '#14B8A6', '#475569'];
const METHODS: { key: TariffMethod; label: string; template: Record<string, any> }[] = [
  { key: 'KM_BATA', label: 'Km + bata', template: { rate_per_km: 12, extra_rate_per_km: 0, bata_per_day: 300 } },
  { key: 'SLAB_DROP', label: 'Drop slab', template: { base_fare: 1500, base_coverage_km: 50, min_chargeable_km: 50, start_rate: 11.5, increment_by: 1, increment_every_km: 200, max_increments: null } },
  { key: 'SLAB_ROUND', label: 'Round trip', template: { round_rate: 12.5, min_km_per_day: 250, driver_allowance: 400, increment_by: 1, increment_every_km: 200, max_increments: null } },
  { key: 'LOCAL', label: 'Local hours', template: { packages: { '5hrs': 1400, '8hrs': 2000, '12hrs': 2800 }, km_limit_by_package: { '5hrs': 50, '8hrs': 80, '12hrs': 120 } } },
  { key: 'DAY_RENT', label: 'Day rent', template: { rent_per_day: 2200, km_limit_per_day: 250, extra_km_rate: 12, fuel_per_km: 0, fuel_applies: 'ALL' } },
  { key: 'PACKAGE', label: 'Package', template: { amount: 0, days: 1, itinerary: [], includes: [], excludes: [] } },
];
const NICE: Record<string, string> = {
  rate_per_km: 'Rate per km ₹', extra_rate_per_km: 'Extra rate per km ₹', bata_per_day: 'Driver bata per day ₹', base_fare: 'Base fare ₹', base_coverage_km: 'Km covered by base fare',
  min_chargeable_km: 'Minimum km charged', start_rate: 'Starting rate per km ₹', increment_by: 'Rate rises by ₹', increment_every_km: '... for every (km)', max_increments: 'Max rise steps (blank = no limit)',
  round_rate: 'Round trip rate per km ₹', min_km_per_day: 'Minimum km per day', driver_allowance: 'Driver allowance per day ₹', rent_per_day: 'Rent per day ₹', km_limit_per_day: 'Km limit per day',
  extra_km_rate: 'Extra km rate ₹', fuel_per_km: 'Fuel charge per km ₹', fuel_applies: 'Fuel on (ALL / EXTRA)', amount: 'Package amount ₹', days: 'Days',
  itinerary: 'Itinerary (one stop per line)', includes: 'Included (one per line)', excludes: 'Not included (one per line)', packages: 'Hour packages ₹', km_limit_by_package: 'Km included in each package',
};

const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^0-9.]/g, '')));

export default function BillingBrands() {
  const router = useRouter();
  const { themeColors: c, isDark } = useTheme();
  const [brands, setBrands] = useState<BillingBrand[]>([]);
  const [sel, setSel] = useState<BillingBrand | null>(null);
  const [tab, setTab] = useState<Tab>('details');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<RateCard[]>([]);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [rd, setRd] = useState<Record<string, any> | null>(null);

  const loadBrands = useCallback(async () => { try { setBrands(await billingApi.brands()); } catch (e: any) { Alert.alert('Could not load', e?.message || ''); } finally { setLoading(false); } }, []);
  useEffect(() => { loadBrands(); }, [loadBrands]);
  const loadCards = useCallback(async (b: BillingBrand) => { try { setCards(await billingApi.rateCards(b.id, true)); } catch { setCards([]); } }, []);
  const loadRules = useCallback(async (b: BillingBrand) => { try { setRules((await billingApi.rules(b.id || undefined)).rules); } catch { setRules([]); } }, []);
  const open = (b: BillingBrand) => { setSel({ ...b }); setTab('details'); setOpenCard(null); setRd(null); loadCards(b); loadRules(b); };
  const set = (k: keyof BillingBrand, v: any) => setSel((x) => (x ? { ...x, [k]: v } : x));

  const inp = [s.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }];
  const lbl = [s.label, { color: c.textSecondary }];
  const card = [s.card, { backgroundColor: c.surface, borderColor: c.border }];

  const field = (k: keyof BillingBrand, label: string, opts: { multiline?: boolean; keyboard?: any; caps?: boolean; placeholder?: string } = {}) => (
    <View key={String(k)}>
      <Text style={lbl}>{label}</Text>
      <TextInput style={[...inp, opts.multiline && { minHeight: 90, textAlignVertical: 'top' }]} value={sel?.[k] == null ? '' : String(sel[k])} multiline={opts.multiline}
        onChangeText={(v) => set(k, opts.keyboard === 'numeric' ? (v === '' ? ('' as any) : Number(v.replace(/[^0-9]/g, ''))) : opts.caps ? v.toUpperCase() : v)}
        keyboardType={opts.keyboard} autoCapitalize={opts.caps ? 'characters' : 'none'} placeholder={opts.placeholder} placeholderTextColor={c.textMuted} />
    </View>
  );

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const { id, code, ...body } = sel as any;
      const saved = id ? await billingApi.updateBrand(id, body) : await billingApi.createBrand({ ...body, code });
      setSel(saved);
      await loadBrands();
      Alert.alert('Saved', `${saved.name} is updated. New documents use these details; old ones keep what they were issued with.`);
    } catch (e: any) { Alert.alert('Could not save', e?.message || 'Only the Owner can change brands.'); }
    finally { setSaving(false); }
  };

  const newBrand = () => setSel({ id: '', code: '', name: '', gst_rate: 5, gst_applies_to: 'KM_FARE', invoice_prefix: 'INV', estimate_prefix: 'EST', estimate_valid_days: 7, advance_percent: 0, payment_links_enabled: true, is_default: false, is_active: true, primary_color: '#0EA5E9' } as BillingBrand);

  // ---- tariffs
  const startEdit = (k: RateCard) => { setOpenCard(openCard === k.id ? null : k.id); setDraft(JSON.parse(JSON.stringify({ __name: k.name || '', __vehicle: k.vehicle_name || '', __active: k.is_active, ...k.params }))); };
  const saveCard = async (k: RateCard) => {
    const { __name, __vehicle, __active, ...params } = draft;
    try {
      const u = await billingApi.updateRateCard(k.id, { name: __name, vehicle_name: __vehicle, is_active: __active, params });
      setCards((cs) => cs.map((x) => (x.id === k.id ? u : x)));
      setOpenCard(null);
    } catch (e: any) { Alert.alert('Could not save', e?.message || 'Only the Owner can change tariffs.'); }
  };
  const delCard = (k: RateCard) => Alert.alert('Delete this tariff?', k.name || '', [{ text: 'No', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await billingApi.deleteRateCard(k.id); setCards((cs) => cs.filter((x) => x.id !== k.id)); } catch (e: any) { Alert.alert('Failed', e?.message || ''); } } }]);
  const addCard = async (m: typeof METHODS[number]) => {
    if (!sel?.id) return Alert.alert('Save the brand first', 'Then add its tariffs.');
    try {
      const created = await billingApi.createRateCard({ brand_id: sel.id, method: m.key, name: `New ${m.label.toLowerCase()} tariff`, vehicle_name: '', params: m.template } as any);
      setCards((cs) => [...cs, created]);
      startEdit(created);
    } catch (e: any) { Alert.alert('Could not add', e?.message || 'Only the Owner can change tariffs.'); }
  };

  const paramEditor = () => {
    const keys = Object.keys(draft).filter((k) => !k.startsWith('__'));
    return keys.map((k) => {
      const v = draft[k];
      const label = NICE[k] || k;
      if (Array.isArray(v)) {
        return <View key={k}><Text style={lbl}>{label}</Text><TextInput style={[...inp, { minHeight: 70, textAlignVertical: 'top' }]} multiline value={v.join('\n')} onChangeText={(t) => setDraft({ ...draft, [k]: t.split('\n') })} placeholderTextColor={c.textMuted} /></View>;
      }
      if (v && typeof v === 'object') {
        return (
          <View key={k}>
            <Text style={lbl}>{label}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(v).map((sub) => (
                <View key={sub} style={{ width: '30%' }}>
                  <Text style={{ color: c.textMuted, fontSize: 10.5 }}>{sub}</Text>
                  <TextInput style={inp} keyboardType="numeric" value={String(v[sub] ?? '')} onChangeText={(t) => setDraft({ ...draft, [k]: { ...v, [sub]: toNum(t) } })} />
                </View>
              ))}
            </View>
          </View>
        );
      }
      const isText = typeof v === 'string';
      return <View key={k}><Text style={lbl}>{label}</Text><TextInput style={inp} keyboardType={isText ? 'default' : 'numeric'} value={v == null ? '' : String(v)} autoCapitalize={isText ? 'characters' : 'none'}
        onChangeText={(t) => setDraft({ ...draft, [k]: isText ? t : toNum(t) })} placeholderTextColor={c.textMuted} /></View>;
    });
  };

  const saveRule = async () => {
    if (!rd) return;
    const body: any = {
      name: rd.name, scope: rd.scope, effect: rd.effect, match_on: rd.match_on, keywords: rd.keywords, route_from: rd.route_from, route_to: rd.route_to,
      value: rd.value === '' || rd.value == null ? null : Number(rd.value), label: rd.label, params: rd.params || {}, trip_types: rd.trip_types || [], vehicles: rd.vehicles,
      valid_from: rd.valid_from || null, valid_to: rd.valid_to || null, auto_apply: !!rd.auto_apply, is_active: rd.is_active !== false, priority: Number(rd.priority) || 100, note: rd.note,
      brand_id: rd.allBrands ? null : (sel?.id || null),
    };
    try {
      if (rd.id) await billingApi.updateRule(rd.id, body); else await billingApi.createRule(body);
      setRd(null);
      if (sel) loadRules(sel);
    } catch (e: any) { Alert.alert('Could not save the rule', e?.message || 'Only the Owner can change rules.'); }
  };

  const missing = useMemo(() => (sel ? [!sel.gstin && 'GSTIN', !sel.address && 'address', !sel.bank_account_number && !sel.upi_id && 'bank / UPI'].filter(Boolean) as string[] : []), [sel]);

  if (loading) return <SafeAreaView style={[s.root, { backgroundColor: c.background }]}><ActivityIndicator style={{ marginTop: 80 }} color={c.primary} /></SafeAreaView>;

  // ---------------------------------------------------------------- list of brands
  if (!sel) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
        <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
          <Text style={{ flex: 1, marginLeft: 8, color: c.text, fontSize: 17, fontWeight: '800' }}>Brands & tariffs</Text>
          <TouchableOpacity onPress={newBrand} style={{ padding: 6 }}><Plus size={22} color={c.primary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>Each brand prints its own name, colours, GSTIN, bank details, terms and rules on its estimates and invoices. Fill in the GSTIN and bank details once - a made-up value is never printed.</Text>
          {brands.map((b) => (
            <TouchableOpacity key={b.id} onPress={() => open(b)} style={[s.brandRow, { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: b.primary_color || c.primary }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>{b.name}{b.is_default ? '  · default' : ''}{!b.is_active ? '  · off' : ''}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>{b.invoice_prefix} / {b.estimate_prefix} · GST {b.gst_rate}% · {b.gstin ? b.gstin : 'no GSTIN yet'}</Text>
              </View>
              <ChevronRight size={18} color={c.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- one brand
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => setSel(null)} style={{ padding: 6 }}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <Text style={{ flex: 1, marginLeft: 8, color: c.text, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{sel.name || 'New brand'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={[s.saveBtn, { backgroundColor: c.primary }]}>{saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save</Text>}</TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, padding: 10 }}>
        {TABS.map((t) => <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[s.tab, { borderColor: tab === t.key ? c.primary : c.border, backgroundColor: tab === t.key ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontWeight: tab === t.key ? '800' : '600', fontSize: 13 }}>{t.label}</Text></TouchableOpacity>)}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 80, gap: 10 }} keyboardShouldPersistTaps="handled">
        {missing.length > 0 && <View style={s.warn}><Text style={{ color: '#92400E', fontSize: 12, fontWeight: '700' }}>Still missing for GST invoices: {missing.join(', ')}.</Text></View>}

        {tab === 'details' && (
          <View style={card}>
            <View style={s.hint}><Text style={{ color: c.textSecondary, fontSize: 11.5 }}>
              The top of every estimate and invoice prints exactly what you type here: the NAME (nothing is added to it), the line under it, the highlights, and the slogan at the bottom. Change any of it whenever you like.
            </Text></View>
            {field('name', 'Name printed on the document (big)')}
            {field('tagline', 'Line under the name (e.g. Dedicated to Spiritual Journeys)')}
            {field('highlights', 'Highlights strip - one short point per line', { multiline: true })}
            {field('footer_note', 'Slogan at the bottom of the document')}
            {!sel.id && field('code', 'Short code (letters only, cannot change later)', { placeholder: 'e.g. dropcars' })}
            {field('legal_name', 'Registered business name (owner of the GSTIN)')}
            {field('domain', 'Website')}
            {field('phone', 'Phone', { keyboard: 'phone-pad' })}
            {field('whatsapp', 'WhatsApp number (with 91)', { keyboard: 'phone-pad' })}
            {field('email', 'Email')}
            {field('address', 'Address', { multiline: true })}
            <Text style={lbl}>Document colour</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {COLORS.map((x) => <TouchableOpacity key={x} onPress={() => set('primary_color', x)} style={[s.swatch, { backgroundColor: x, borderWidth: sel.primary_color === x ? 3 : 0, borderColor: c.text }]} />)}
            </View>
            {field('primary_color', 'Colour code (#RRGGBB)', { caps: true })}
            {field('signatory', 'Signatory text')}
            <View style={s.switchRow}><Text style={{ color: c.text }}>Default brand</Text><Switch value={!!sel.is_default} onValueChange={(v) => set('is_default', v)} /></View>
            <View style={s.switchRow}><Text style={{ color: c.text }}>Active (shown when making documents)</Text><Switch value={sel.is_active !== false} onValueChange={(v) => set('is_active', v)} /></View>
          </View>
        )}

        {tab === 'tax' && (
          <View style={card}>
            {field('gstin', 'GSTIN (15 characters)', { caps: true })}
            {field('pan', 'PAN', { caps: true })}
            {field('state', 'State of the business (CGST+SGST inside it, IGST outside)')}
            {field('state_code', 'State code', { keyboard: 'numeric' })}
            {field('sac_code', 'SAC code', { keyboard: 'numeric' })}
            {field('gst_rate', 'GST rate %', { keyboard: 'numeric' })}
            <Text style={lbl}>GST applies to</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {[['KM_FARE', 'Km fare only'], ['ALL', 'Every charge']].map(([k, l]) => <TouchableOpacity key={k} onPress={() => set('gst_applies_to', k as any)} style={[s.tab, { flex: 1, alignItems: 'center', borderColor: sel.gst_applies_to === k ? c.primary : c.border, backgroundColor: sel.gst_applies_to === k ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '700' }}>{l}</Text></TouchableOpacity>)}
            </View>
            {field('invoice_prefix', 'Invoice number prefix', { caps: true })}
            {field('estimate_prefix', 'Estimate number prefix', { caps: true })}
            {field('estimate_valid_days', 'Estimate valid for (days)', { keyboard: 'numeric' })}
            {field('advance_percent', 'Default advance on estimates (%)', { keyboard: 'numeric' })}
            {field('bank_account_name', 'Bank account name')}
            {field('bank_name', 'Bank')}
            {field('bank_account_number', 'Account number', { keyboard: 'numeric' })}
            {field('bank_ifsc', 'IFSC', { caps: true })}
            {field('bank_branch', 'Branch')}
            {field('upi_id', 'UPI id')}
            <View style={s.switchRow}><Text style={{ color: c.text }}>Allow online payment links</Text><Switch value={sel.payment_links_enabled !== false} onValueChange={(v) => set('payment_links_enabled', v)} /></View>
          </View>
        )}

        {tab === 'terms' && (
          <View style={card}>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, marginBottom: 8 }}>One point per line. These print on every document of this brand (a single document can still use its own wording).</Text>
            {field('terms_estimate', 'Terms on ESTIMATES', { multiline: true })}
            {field('terms_invoice', 'Terms on INVOICES', { multiline: true })}
            {field('rules_text', 'Rules, policies & regulations (cancellation, refund, belongings, safety, liability ...)', { multiline: true })}
          </View>
        )}

        {tab === 'rules' && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              Pricing rules by state, place, route or hills - for example "Karnataka round trip: minimum 300 km a day", "Chennai to Madurai: ₹1 less per km", "Hill charges ₹300 one way / ₹500 round trip a day". In an estimate they appear as suggestions; the staff taps Apply. Nothing changes by itself unless you switch on Auto-apply.
            </Text>
            {rd === null && (
              <>
                {rules.map((r) => (
                  <TouchableOpacity key={r.id} onPress={() => setRd({ ...r, keywords: csv(r.keywords), route_from: csv(r.route_from), route_to: csv(r.route_to), trip_types: r.trip_types || [], vehicles: csv(r.vehicles), value: r.value == null ? '' : String(r.value), priority: String(r.priority ?? 100), allBrands: !r.brand_id })} style={[card, { opacity: r.is_active ? 1 : 0.55 }]}>
                    <Text style={{ color: c.text, fontWeight: '800' }}>{r.name}{r.auto_apply ? '  · auto' : ''}{!r.is_active ? '  · off' : ''}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>{r.effect_label}{r.value != null ? ` · ${r.value}` : ''}{r.effect === 'HILL_CHARGE' ? ` · ₹${r.params?.one_way ?? 0} one way / ₹${r.params?.round_amount ?? 0} round trip day` : ''}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 11.5 }}>
                      {r.scope === 'ROUTE' ? `${csv(r.route_from)} ⇄ ${csv(r.route_to)}` : r.scope === 'ALL' ? 'All trips' : csv(r.keywords)}{r.trip_types?.length ? ` · ${r.trip_types.join('/')}` : ''}{r.brand_id ? '' : ' · all brands'}
                    </Text>
                  </TouchableOpacity>
                ))}
                {rules.length === 0 && <Text style={{ color: c.textMuted, textAlign: 'center', marginVertical: 14 }}>No rules yet.</Text>}
                <TouchableOpacity onPress={() => setRd({ name: '', scope: 'LOCATION', keywords: '', route_from: '', route_to: '', match_on: 'ANY', effect: 'RATE_DELTA', value: '', label: '', params: {}, trip_types: [], vehicles: '', valid_from: '', valid_to: '', auto_apply: false, is_active: true, priority: '100', note: '', allBrands: false })} style={[s.btn, { backgroundColor: c.primary }]}>
                  <Plus size={16} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Add a rule</Text>
                </TouchableOpacity>
              </>
            )}
            {rd !== null && (
              <View style={card}>
                <Text style={lbl}>RULE NAME</Text>
                <TextInput style={inp} value={String(rd.name || '')} onChangeText={(t) => setRd({ ...rd, name: t })} placeholder="e.g. Karnataka round trip minimum" placeholderTextColor={c.textMuted} />
                <Text style={lbl}>APPLIES TO</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  {SCOPES.map((x) => <TouchableOpacity key={x.key} onPress={() => setRd({ ...rd, scope: x.key })} style={[s.tab, { paddingVertical: 6, borderColor: rd.scope === x.key ? c.primary : c.border, backgroundColor: rd.scope === x.key ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12.5, fontWeight: '700' }}>{x.label}</Text></TouchableOpacity>)}
                </View>
                <Text style={{ color: c.textMuted, fontSize: 11, marginBottom: 8 }}>{SCOPES.find((x) => x.key === rd.scope)?.hint}</Text>
                {rd.scope === 'ROUTE' ? (
                  <>
                    <Text style={lbl}>FROM (places, comma separated)</Text>
                    <TextInput style={inp} value={rd.route_from} onChangeText={(t) => setRd({ ...rd, route_from: t })} placeholder="chennai" placeholderTextColor={c.textMuted} />
                    <Text style={lbl}>TO</Text>
                    <TextInput style={inp} value={rd.route_to} onChangeText={(t) => setRd({ ...rd, route_to: t })} placeholder="madurai" placeholderTextColor={c.textMuted} />
                  </>
                ) : rd.scope !== 'ALL' && (
                  <>
                    <Text style={lbl}>PLACE / STATE WORDS (comma separated; use | for other spellings)</Text>
                    <TextInput style={[...inp, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={rd.keywords} onChangeText={(t) => setRd({ ...rd, keywords: t })} placeholder="karnataka, bengaluru|bangalore, mysuru|mysore" placeholderTextColor={c.textMuted} />
                    <Text style={lbl}>LOOK AT</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {[['ANY', 'Any stop'], ['PICKUP', 'Pickup'], ['DROP', 'Drop'], ['BOTH', 'Pickup and drop']].map(([k, l]) => <TouchableOpacity key={k} onPress={() => setRd({ ...rd, match_on: k })} style={[s.tab, { paddingVertical: 6, borderColor: rd.match_on === k ? c.primary : c.border, backgroundColor: rd.match_on === k ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12 }}>{l}</Text></TouchableOpacity>)}
                    </View>
                  </>
                )}
                <Text style={lbl}>WHAT IT DOES</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {EFFECTS.map((x) => <TouchableOpacity key={x.key} onPress={() => setRd({ ...rd, effect: x.key })} style={[s.tab, { paddingVertical: 6, borderColor: rd.effect === x.key ? c.primary : c.border, backgroundColor: rd.effect === x.key ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{x.label}</Text></TouchableOpacity>)}
                </View>
                {rd.effect === 'HILL_CHARGE' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Text style={lbl}>ONE WAY, PER HILL ₹</Text><TextInput style={inp} keyboardType="numeric" value={String(rd.params?.one_way ?? '')} onChangeText={(t) => setRd({ ...rd, params: { ...rd.params, one_way: toNum(t) } })} /></View>
                      <View style={{ flex: 1 }}><Text style={lbl}>ROUND TRIP, PER DAY ₹</Text><TextInput style={inp} keyboardType="numeric" value={String(rd.params?.round_amount ?? '')} onChangeText={(t) => setRd({ ...rd, params: { ...rd.params, round_amount: toNum(t) } })} /></View>
                    </View>
                    <Text style={lbl}>ROUND TRIP CHARGE IS PER</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      {[['DAY', 'Day'], ['HILL_DAY', 'Hill per day']].map(([k, l]) => <TouchableOpacity key={k} onPress={() => setRd({ ...rd, params: { ...rd.params, round_basis: k } })} style={[s.tab, { paddingVertical: 6, borderColor: (rd.params?.round_basis || 'DAY') === k ? c.primary : c.border, backgroundColor: (rd.params?.round_basis || 'DAY') === k ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12 }}>{l}</Text></TouchableOpacity>)}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={lbl}>VALUE — {EFFECTS.find((x) => x.key === rd.effect)?.unit}</Text>
                    <TextInput style={inp} keyboardType="numbers-and-punctuation" value={String(rd.value ?? '')} onChangeText={(t) => setRd({ ...rd, value: t.replace(/[^0-9.\-]/g, '') })} placeholderTextColor={c.textMuted} />
                  </>
                )}
                {(rd.effect === 'CHARGE' || rd.effect === 'PERCENT' || rd.effect === 'HILL_CHARGE') && (
                  <>
                    <Text style={lbl}>LINE TEXT ON THE DOCUMENT</Text>
                    <TextInput style={inp} value={String(rd.label || '')} onChangeText={(t) => setRd({ ...rd, label: t })} placeholder="e.g. Night halt allowance" placeholderTextColor={c.textMuted} />
                  </>
                )}
                {rd.effect === 'CHARGE' && (
                  <>
                    <Text style={lbl}>CHARGE IS</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {[['TRIP', 'Once per trip'], ['DAY', 'Per day'], ['MATCH', 'Per matching place']].map(([k, l]) => <TouchableOpacity key={k} onPress={() => setRd({ ...rd, params: { ...rd.params, basis: k } })} style={[s.tab, { paddingVertical: 6, borderColor: (rd.params?.basis || 'TRIP') === k ? c.primary : c.border, backgroundColor: (rd.params?.basis || 'TRIP') === k ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12 }}>{l}</Text></TouchableOpacity>)}
                    </View>
                    <View style={s.switchRow}><Text style={{ color: c.text }}>Included in the total</Text><Switch value={rd.params?.included !== false} onValueChange={(v) => setRd({ ...rd, params: { ...rd.params, included: v } })} /></View>
                  </>
                )}
                <Text style={lbl}>ONLY FOR TRIP TYPES (none = all)</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {TRIP_KINDS.map((k) => { const on = (rd.trip_types || []).includes(k); return <TouchableOpacity key={k} onPress={() => setRd({ ...rd, trip_types: on ? rd.trip_types.filter((x: string) => x !== k) : [...(rd.trip_types || []), k] })} style={[s.tab, { paddingVertical: 6, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary + '22' : 'transparent' }]}><Text style={{ color: c.text, fontSize: 12 }}>{k === 'oneway' ? 'One way' : k === 'round' ? 'Round trip' : 'Multi city'}</Text></TouchableOpacity>; })}
                </View>
                <Text style={lbl}>ONLY FOR VEHICLES (words, none = all)</Text>
                <TextInput style={inp} value={rd.vehicles} onChangeText={(t) => setRd({ ...rd, vehicles: t })} placeholder="suv, innova" placeholderTextColor={c.textMuted} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Text style={lbl}>VALID FROM</Text><TextInput style={inp} value={String(rd.valid_from || '')} onChangeText={(t) => setRd({ ...rd, valid_from: t })} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} /></View>
                  <View style={{ flex: 1 }}><Text style={lbl}>VALID TO</Text><TextInput style={inp} value={String(rd.valid_to || '')} onChangeText={(t) => setRd({ ...rd, valid_to: t })} placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} /></View>
                </View>
                <Text style={lbl}>NOTE (only staff see this)</Text>
                <TextInput style={inp} value={String(rd.note || '')} onChangeText={(t) => setRd({ ...rd, note: t })} placeholderTextColor={c.textMuted} />
                <View style={s.switchRow}><Text style={{ color: c.text }}>Same rule for all brands</Text><Switch value={!!rd.allBrands} onValueChange={(v) => setRd({ ...rd, allBrands: v })} /></View>
                <View style={s.switchRow}><Text style={{ color: c.text }}>Auto-apply (otherwise only suggested)</Text><Switch value={!!rd.auto_apply} onValueChange={(v) => setRd({ ...rd, auto_apply: v })} /></View>
                <View style={s.switchRow}><Text style={{ color: c.text }}>Active</Text><Switch value={rd.is_active !== false} onValueChange={(v) => setRd({ ...rd, is_active: v })} /></View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  {!!rd.id && <TouchableOpacity onPress={() => Alert.alert('Delete this rule?', rd.name, [{ text: 'No', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await billingApi.deleteRule(rd.id); setRd(null); if (sel) loadRules(sel); } catch (e: any) { Alert.alert('Failed', e?.message || 'Only the Owner can change rules.'); } } }])} style={[s.btn, { borderWidth: 1, borderColor: '#DC2626' }]}><Trash2 size={15} color="#DC2626" /></TouchableOpacity>}
                  <TouchableOpacity onPress={() => setRd(null)} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Close</Text></TouchableOpacity>
                  <TouchableOpacity onPress={saveRule} style={[s.btn, { flex: 1, backgroundColor: c.primary }]}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save rule</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {tab === 'tariffs' && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>The rates behind the estimate calculator. Change a number here and every new estimate uses it.</Text>
            {cards.map((k) => (
              <View key={k.id} style={card}>
                <TouchableOpacity onPress={() => startEdit(k)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '800', opacity: k.is_active ? 1 : 0.5 }}>{k.name || k.vehicle_name}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 11.5 }}>{k.method_label}{k.is_active ? '' : ' · off'}</Text>
                  </View>
                  <ChevronRight size={16} color={c.textMuted} style={{ transform: [{ rotate: openCard === k.id ? '90deg' : '0deg' }] }} />
                </TouchableOpacity>
                {openCard === k.id && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={lbl}>Name</Text><TextInput style={inp} value={String(draft.__name || '')} onChangeText={(t) => setDraft({ ...draft, __name: t })} />
                    <Text style={lbl}>Vehicle</Text><TextInput style={inp} value={String(draft.__vehicle || '')} onChangeText={(t) => setDraft({ ...draft, __vehicle: t })} />
                    {paramEditor()}
                    <View style={s.switchRow}><Text style={{ color: c.text }}>Active</Text><Switch value={!!draft.__active} onValueChange={(v) => setDraft({ ...draft, __active: v })} /></View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => delCard(k)} style={[s.btn, { borderWidth: 1, borderColor: '#DC2626' }]}><Trash2 size={15} color="#DC2626" /></TouchableOpacity>
                      <TouchableOpacity onPress={() => saveCard(k)} style={[s.btn, { flex: 1, backgroundColor: c.primary }]}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save tariff</Text></TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
            {cards.length === 0 && <Text style={{ color: c.textMuted, textAlign: 'center', marginVertical: 14 }}>No tariffs for this brand yet.</Text>}
            <Text style={lbl}>ADD A TARIFF</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {METHODS.map((m) => <TouchableOpacity key={m.key} onPress={() => addCard(m)} style={[s.tab, { borderColor: c.primary }]}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>+ {m.label}</Text></TouchableOpacity>)}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderLeftWidth: 5, borderRadius: 10, padding: 12 },
  tab: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  warn: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10 },
  hint: { backgroundColor: '#E0F2FE33', borderRadius: 8, padding: 8, marginBottom: 8 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16 },
});
