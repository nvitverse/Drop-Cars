import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, CreditCard, FileText, Link2, Plus, Receipt, RefreshCw, Search, Send, Trash2, X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { billingApi, BillingBrand, BillingDoc, BillingTotals, RateCard, RuleSuggestion, TariffMethod } from '@/services/billingApi';

type Line = { id: string; label: string; amount: string; kind: 'FARE' | 'CHARGE'; included: boolean; note?: string | null; gen?: boolean; rule?: string };
const uid = () => Math.random().toString(36).slice(2, 9);
const num = (s: string) => parseInt(String(s || '').replace(/[^0-9]/g, ''), 10) || 0;
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const CHIPS = ['Toll', 'State permit', 'Parking', 'Hill / ghat charges', 'Night allowance', 'Waiting charges', 'Extra km', 'Carrier', 'Pet friendly', 'Non-CNG vehicle', 'Convenience fee'];
const TRIP_TYPES = ['Oneway', 'Round Trip', 'Multy City'];
const PAY_MODES = ['Cash', 'UPI', 'Bank transfer', 'Card', 'Cheque', 'Adjusted / waived'];
const METHOD_NAMES: Record<TariffMethod, string> = {
  KM_BATA: 'Km + bata', SLAB_DROP: 'Drop slab', SLAB_ROUND: 'Round trip', LOCAL: 'Local hours', DAY_RENT: 'Day rent', PACKAGE: 'Package',
};
const METHOD_HELP: Record<TariffMethod, string> = {
  KM_BATA: 'Km x rate per km + driver bata per day. Toll, parking and permit are added below as extra charges.',
  SLAB_DROP: 'Drop trip priced like the Arunachala website: base fare for the first km, then the per-km rate steps up as the distance grows.',
  SLAB_ROUND: 'Round trip: minimum km per day x round rate + driver allowance per day (website formula).',
  LOCAL: 'Local rental: one flat price for 5 / 8 / 12 hours.',
  DAY_RENT: 'Rent per day with a km limit. Extra km at the extra rate, plus fuel per km.',
  PACKAGE: 'One all-inclusive amount for a tour / package, with the itinerary and what is included.',
};

export default function BillingEditor() {
  const router = useRouter();
  const { themeColors: c, isDark } = useTheme();
  const params = useLocalSearchParams<{ id?: string; ref?: string; type?: string }>();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [docId, setDocId] = useState<string | null>(params.id ? String(params.id) : null);
  const [docType, setDocType] = useState<'INVOICE' | 'ESTIMATE'>(String(params.type).toUpperCase() === 'ESTIMATE' ? 'ESTIMATE' : 'INVOICE');
  const [brands, setBrands] = useState<BillingBrand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [number, setNumber] = useState('');
  const [bookingRef, setBookingRef] = useState(params.ref ? String(params.ref) : '');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [cust, setCust] = useState({ name: '', phone: '', email: '', company: '', gstin: '', address: '', state: '' });
  const [trip, setTrip] = useState<Record<string, any>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [gstMode, setGstMode] = useState<'NONE' | 'EXTRA' | 'INCLUDED'>('NONE');
  const [gstCollection, setGstCollection] = useState<'COLLECT' | 'SHOW_ONLY' | 'PAY_LATER'>('COLLECT');
  const [gstRate, setGstRate] = useState('5');
  const [interstate, setInterstate] = useState(false);
  const [gstOverride, setGstOverride] = useState<number | null>(null);
  const [discount, setDiscount] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [advance, setAdvance] = useState('');
  const [notes, setNotes] = useState('');
  const [termsOverride, setTermsOverride] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [totals, setTotals] = useState<BillingTotals | null>(null);
  const [calc, setCalc] = useState({ km: '', rate: '', extra: '', bata: '', days: '1', hours: '8hrs', amount: '' });
  const [method, setMethod] = useState<TariffMethod>('KM_BATA');
  const [cards, setCards] = useState<RateCard[]>([]);
  const [cardId, setCardId] = useState('');
  const [rent, setRent] = useState({ rent: '', limit: '', extra: '', fuel: '', fuelOn: 'ALL' });
  const [tariffNotes, setTariffNotes] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<{ name?: string | null; phone?: string | null }>({});
  const [sharedBy, setSharedBy] = useState<{ name?: string | null; at?: string | null }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sugg, setSugg] = useState<RuleSuggestion[]>([]);
  const [applied, setApplied] = useState<Record<string, RuleSuggestion>>({});
  const [needsRecalc, setNeedsRecalc] = useState(false);
  const autoDone = useRef<Set<string>>(new Set());
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ amount: '', mode: 'UPI', ref: '', purpose: 'PAYMENT' });
  const [showLink, setShowLink] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(true);
  const [showTerms, setShowTerms] = useState(false);

  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brands, brandId]);
  const locked = !!docId && status !== 'DRAFT';
  const cancelled = status === 'CANCELLED';

  const fillFromDoc = useCallback((d: BillingDoc) => {
    setDocId(d.id); setDocType(d.doc_type); setStatus(d.status); setNumber(d.number); setBrandId(d.brand_id || '');
    setBookingRef(d.booking_ref || ''); setOrderId(d.order_id || null);
    setCust({ name: d.customer.name || '', phone: d.customer.phone || '', email: d.customer.email || '', company: d.customer.company || '', gstin: d.customer.gstin || '', address: d.customer.address || '', state: d.customer.state || '' });
    setTrip(d.trip || {});
    setLines((d.lines || []).map((l) => ({ id: uid(), label: l.label, amount: l.amount ? String(l.amount) : '', kind: l.kind === 'FARE' ? 'FARE' : 'CHARGE', included: l.included !== false, note: l.note || null })));
    setPrepared(d.prepared_by || {}); setSharedBy(d.shared_by || []); setHistory(d.history || []);
    setGstMode(d.gst.mode); setGstCollection(d.gst.collection); setGstRate(String(d.gst.rate || 5)); setInterstate(!!d.gst.interstate); setGstOverride(d.gst.override ?? null);
    setDiscount(d.discount ? String(d.discount) : ''); setDiscountLabel(d.discount_label || ''); setAdvance(d.advance_requested ? String(d.advance_requested) : '');
    setNotes(d.notes || ''); setTermsOverride(d.terms_override || ''); setValidUntil(d.valid_until || '');
    setPayments(d.payments || []); setLinks(d.payment_links || []); setTotals(d.totals);
  }, []);

  const applyPrefill = useCallback((p: any) => {
    if (p.from_document && p.id) { fillFromDoc(p as BillingDoc); return; }
    setOrderId(p.order_id || null);
    setCust((x) => ({ ...x, name: p.customer?.name || x.name, phone: p.customer?.phone || x.phone, email: p.customer?.email || x.email }));
    setTrip(p.trip || {});
    setLines((p.lines || []).map((l: any) => ({ id: uid(), label: l.label, amount: l.amount ? String(l.amount) : '', kind: l.kind === 'FARE' ? 'FARE' : 'CHARGE', included: l.included !== false })));
    setPayments(p.payments || []);
    if (p.gst?.mode) { setGstMode(p.gst.mode); setGstOverride(p.gst.override ?? null); }
  }, [fillFromDoc]);

  // first load: brands, options, then either the document being edited or a booking id to pre-fill from
  useEffect(() => {
    (async () => {
      try {
        const [bs, opts] = await Promise.all([billingApi.brands(), billingApi.options().catch(() => null)]);
        setBrands(bs.filter((b) => b.is_active));
        if (opts) setRazorpayReady(!!opts.razorpay_ready);
        const def = bs.find((b) => b.is_default) || bs[0];
        if (docId) {
          fillFromDoc(await billingApi.get(docId));
        } else {
          setBrandId(def?.id || '');
          if (def) { setGstRate(String(def.gst_rate || 5)); }
          if (params.ref) {
            const p = await billingApi.prefill(String(params.ref), def?.id);
            applyPrefill(p);
          }
        }
      } catch (e: any) {
        Alert.alert('Could not open', e?.message || 'Try again');
      } finally {
        setLoading(false);
      }
    })();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (brand && !docId) { setGstRate(String(brand.gst_rate || 5)); if (docType === 'ESTIMATE' && !validUntil) setValidUntil(''); } }, [brandId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const paymentsTotal = useMemo(() => payments.reduce((n, p) => n + (Number(p.amount) || 0), 0), [payments]);
  const linePayload = useMemo(() => lines.map((l) => ({ label: l.label.trim(), amount: num(l.amount), kind: l.kind, included: l.included, note: l.note || null })).filter((l) => l.label), [lines]);

  // pricing rules (state / place / route / hill ...) that fit this trip - suggested, never applied behind the staff's back (unless a rule is set to auto-apply)
  const fareTotal = useMemo(() => lines.filter((l) => l.included && l.kind === 'FARE').reduce((n, l) => n + num(l.amount), 0), [lines]);
  const adjustNow = useMemo(() => {
    const adj: Record<string, number> = {};
    Object.values(applied).filter((x) => x.kind === 'ADJUST').forEach((x) => Object.entries(x.adjust || {}).forEach(([k, v]) => {
      if (k === 'discount') return;
      adj[k] = k.startsWith('min_km') ? Math.max(adj[k] || 0, v) : (adj[k] || 0) + v;
    }));
    return adj;
  }, [applied]);
  const sTimer = useRef<any>(null);
  useEffect(() => {
    if (locked || (!trip.pickup && !trip.drop)) { setSugg([]); return; }
    clearTimeout(sTimer.current);
    sTimer.current = setTimeout(async () => {
      try {
        const r = await billingApi.suggestRules({ brand_id: brandId || undefined, pickup: trip.pickup, drop: trip.drop, trip_type: trip.trip_type, days: Number(calc.days) || 1, km: Number(calc.km) || Number(trip.km) || 0, vehicle: trip.vehicle, fare_total: fareTotal });
        setSugg(r.suggestions);
        r.suggestions.filter((x) => x.auto_apply && !autoDone.current.has(x.rule.id)).forEach((x) => { autoDone.current.add(x.rule.id); applyRule(x); });
      } catch { setSugg([]); }
    }, 600);
    return () => clearTimeout(sTimer.current);
  }, [trip.pickup, trip.drop, trip.trip_type, trip.vehicle, calc.days, brandId, Math.round(fareTotal / 100), locked]);   // eslint-disable-line react-hooks/exhaustive-deps

  const applyRule = (x: RuleSuggestion) => {
    setApplied((a) => ({ ...a, [x.rule.id]: x }));
    if (x.kind === 'CHARGE' && x.line) setLines((ls) => [...ls.filter((l) => l.rule !== x.rule.id), { id: uid(), label: x.line!.label, amount: String(x.line!.amount), kind: 'CHARGE', included: x.line!.included, rule: x.rule.id }]);
    if (x.adjust?.discount) { setDiscount(String(x.adjust.discount)); setDiscountLabel(x.rule.label || x.rule.name); }
    if (x.kind === 'ADJUST' && !x.adjust?.discount) setNeedsRecalc(true);
  };
  const removeRule = (x: RuleSuggestion) => {
    setApplied((a) => { const n = { ...a }; delete n[x.rule.id]; return n; });
    setLines((ls) => ls.filter((l) => l.rule !== x.rule.id));
    if (x.kind === 'ADJUST') setNeedsRecalc(true);
  };

  // the brand's tariffs (rate cards) for the estimate calculator
  useEffect(() => {
    if (!brandId) return;
    billingApi.rateCards(brandId).then((r) => { setCards(r); setCardId(''); }).catch(() => setCards([]));
  }, [brandId]);
  const methodCards = useMemo(() => cards.filter((x) => x.method === method), [cards, method]);
  const methods = useMemo<TariffMethod[]>(() => {
    const have = new Set(cards.map((x) => x.method));
    return (['KM_BATA', 'SLAB_DROP', 'SLAB_ROUND', 'LOCAL', 'DAY_RENT', 'PACKAGE'] as TariffMethod[]).filter((m) => ['KM_BATA', 'DAY_RENT', 'PACKAGE'].includes(m) || have.has(m));
  }, [cards]);
  const pickCard = (card: RateCard | null) => {
    setCardId(card?.id || '');
    if (!card) return;
    const p = card.params || {};
    if (card.method === 'KM_BATA') setCalc((x) => ({ ...x, rate: String(p.rate_per_km ?? ''), extra: String(p.extra_rate_per_km ?? ''), bata: String(p.bata_per_day ?? '') }));
    if (card.method === 'DAY_RENT') setRent({ rent: String(p.rent_per_day ?? ''), limit: String(p.km_limit_per_day ?? ''), extra: String(p.extra_km_rate ?? ''), fuel: String(p.fuel_per_km ?? ''), fuelOn: String(p.fuel_applies || 'ALL') });
    if (card.method === 'PACKAGE') setCalc((x) => ({ ...x, amount: p.amount ? String(p.amount) : x.amount, days: p.days ? String(p.days) : x.days }));
    if (card.method === 'LOCAL') { const k = Object.keys(p.packages || {}); if (k.length && !k.includes(calc.hours)) setCalc((x) => ({ ...x, hours: k[0] })); }
    if (card.vehicle_name && !trip.vehicle && card.vehicle_key !== 'tour') setTrip((t0) => ({ ...t0, vehicle: card.vehicle_name }));
  };

  // live totals from the server (the PDF and the customer link use exactly the same calculation)
  const calcTimer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(async () => {
      try {
        setTotals(await billingApi.calc({
          lines: linePayload, gst_mode: gstMode, gst_rate: Number(gstRate) || 0, gst_collection: gstCollection, applies_to: brand?.gst_applies_to || 'KM_FARE',
          interstate, discount: num(discount), gst_override: gstOverride, payments_total: paymentsTotal, advance_requested: num(advance),
        }));
      } catch { /* the last good totals stay on screen */ }
    }, 300);
    return () => clearTimeout(calcTimer.current);
  }, [linePayload, gstMode, gstRate, gstCollection, interstate, discount, gstOverride, paymentsTotal, advance, brand?.gst_applies_to]);

  const fetchBooking = async () => {
    if (!bookingRef.trim()) return Alert.alert('Booking id', 'Type the booking id first.');
    setFetching(true);
    try { applyPrefill(await billingApi.prefill(bookingRef.trim(), brandId)); }
    catch (e: any) { Alert.alert('Could not fetch', e?.message || 'No booking with that id'); }
    finally { setFetching(false); }
  };

  const addChip = (label: string) => {
    const exists = lines.find((l) => l.label.toLowerCase() === label.toLowerCase());
    if (exists) { setLines(lines.filter((l) => l.id !== exists.id)); return; }       // tap again to remove
    setLines([...lines, { id: uid(), label, amount: '', kind: label === 'Extra km' ? 'FARE' : 'CHARGE', included: true }]);
  };
  const setLine = (id: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const calculateFare = async () => {
    try {
      const km = Number(calc.km) || 0;
      let res: { lines: any[]; notes?: string[]; meta?: Record<string, any> };
      if (method === 'KM_BATA') {
        res = await billingApi.fareLines({ trip_type: trip.trip_type || 'Oneway', km, rate_per_km: Number(calc.rate) || 0, extra_rate_per_km: Number(calc.extra) || 0, bata_per_day: Number(calc.bata) || 0, days: Number(calc.days) || 1, adjust: adjustNow });
      } else {
        if (['SLAB_DROP', 'SLAB_ROUND', 'LOCAL'].includes(method) && !cardId) return Alert.alert('Vehicle', 'Choose the vehicle tariff first.');
        if (method !== 'PACKAGE' && method !== 'LOCAL' && km <= 0) return Alert.alert('Distance', 'Enter the km.');
        const body: any = { method, rate_card_id: cardId || undefined, km, days: Number(calc.days) || 1, hours: calc.hours, trip_type: trip.trip_type || 'oneway', adjust: adjustNow };
        if (method === 'DAY_RENT') body.params = { rent_per_day: Number(rent.rent) || 0, km_limit_per_day: Number(rent.limit) || 0, extra_km_rate: Number(rent.extra) || 0, fuel_per_km: Number(rent.fuel) || 0, fuel_applies: rent.fuelOn };
        if (method === 'PACKAGE') { body.amount = Number(calc.amount) || 0; body.name = methodCards.find((x) => x.id === cardId)?.name || undefined; if (!body.amount) return Alert.alert('Amount', 'Enter the package amount.'); }
        res = await billingApi.estimateLines(body);
      }
      if (!res.lines.length) return Alert.alert('Nothing to add', 'Enter the distance and the rate.');
      const keep = lines.filter((l) => !l.gen && !/^Km fare|^Driver bata/.test(l.label));
      setLines([...res.lines.map((l: any) => ({ id: uid(), label: l.label, amount: String(l.amount), kind: (l.kind === 'FARE' ? 'FARE' : 'CHARGE') as 'FARE' | 'CHARGE', included: true, note: l.note || null, gen: true })), ...keep]);
      setTariffNotes(res.notes || []);
      setNeedsRecalc(false);
      const pkg = res.meta?.package;
      const nextTrip: Record<string, any> = { ...trip };
      if (pkg) nextTrip.package = pkg; else delete nextTrip.package;
      if (km && !nextTrip.km) nextTrip.km = km;
      setTrip(nextTrip);
    } catch (e: any) { Alert.alert('Could not calculate', e?.message || 'Try again'); }
  };

  const buildPayload = (issueNow: boolean) => ({
    doc_type: docType, brand_id: brandId, booking_ref: bookingRef.trim() || null, order_id: orderId,
    customer: { name: cust.name.trim(), phone: cust.phone.trim(), email: cust.email.trim(), company: cust.company.trim(), gstin: cust.gstin.trim(), address: cust.address.trim(), state: cust.state.trim() },
    trip, lines: linePayload, gst: { mode: gstMode, rate: Number(gstRate) || 0, collection: gstCollection, interstate, override: gstOverride },
    discount: num(discount), discount_label: discountLabel.trim() || null, advance_requested: num(advance), notes: notes.trim() || null,
    terms_override: termsOverride.trim() || null, valid_until: validUntil || null, ...(docId ? {} : { payments }), issue: issueNow,
  });

  const save = async (issueNow: boolean) => {
    if (!brandId) return Alert.alert('Brand', 'Choose a brand.');
    if (!cust.name.trim()) return Alert.alert('Customer', 'Enter the customer name.');
    if (!linePayload.some((l) => l.included && l.amount > 0)) return Alert.alert('Charges', 'Add at least one charge with an amount.');
    setBusy(true);
    try {
      let d: BillingDoc;
      if (docId) { d = await billingApi.update(docId, buildPayload(false)); if (issueNow && d.status === 'DRAFT') d = await billingApi.issue(d.id); }
      else d = await billingApi.create(buildPayload(issueNow));
      fillFromDoc(d);
      Alert.alert(issueNow ? `${d.doc_type === 'ESTIMATE' ? 'Estimate' : 'Invoice'} issued` : 'Saved', issueNow ? d.number : 'Draft saved. Issue it when it is ready.');
    } catch (e: any) { Alert.alert('Could not save', e?.message || 'Try again'); }
    finally { setBusy(false); }
  };

  const share = async () => {
    if (!docId) return;
    try {
      const s = await billingApi.share(docId);
      if (s.whatsapp_url && Platform.OS !== 'web') await Linking.openURL(s.whatsapp_url).catch(() => Share.share({ message: s.message }));
      else await Share.share({ message: s.message });
    } catch (e: any) { Alert.alert('Could not share', e?.message || 'Try again'); }
  };
  const openPdf = async () => { if (!docId) return; try { const s = await billingApi.share(docId); await Linking.openURL(s.pdf_url); } catch (e: any) { Alert.alert('Could not open', e?.message || ''); } };
  const openPage = async () => { if (!docId) return; try { const s = await billingApi.share(docId); await Linking.openURL(s.public_url); } catch (e: any) { Alert.alert('Could not open', e?.message || ''); } };

  const recordPayment = async () => {
    if (!docId) return;
    const amount = num(pay.amount);
    if (amount <= 0) return Alert.alert('Amount', 'Enter the amount received.');
    setBusy(true);
    try { fillFromDoc(await billingApi.addPayment(docId, { amount, mode: pay.mode, ref: pay.ref.trim() || undefined, purpose: pay.purpose })); setShowPay(false); setPay({ amount: '', mode: 'UPI', ref: '', purpose: 'PAYMENT' }); }
    catch (e: any) { Alert.alert('Could not record', e?.message || 'Try again'); }
    finally { setBusy(false); }
  };

  const makeLink = async (purpose: string) => {
    if (!docId) return;
    setBusy(true);
    try {
      const r = await billingApi.createLink(docId, purpose);
      fillFromDoc(r.document);
      setShowLink(false);
      const msg = `Hello ${cust.name}, please pay ${inr(r.link.amount)} (${purpose.toLowerCase()}) for ${number}: ${r.link.url}`;
      const phone = cust.phone.replace(/\D/g, '').slice(-10);
      if (phone.length === 10 && Platform.OS !== 'web') await Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`).catch(() => Share.share({ message: msg }));
      else await Share.share({ message: msg });
    } catch (e: any) { Alert.alert('Could not create the link', e?.message || 'Try again'); }
    finally { setBusy(false); }
  };

  const checkLinks = async () => {
    if (!docId) return;
    setBusy(true);
    try { const r = await billingApi.checkLinks(docId); fillFromDoc(r.document); Alert.alert(r.newly_paid ? 'Payment received' : 'Not paid yet', r.newly_paid ? `${r.newly_paid} link payment(s) recorded.` : 'It is recorded automatically as soon as the customer pays.'); }
    catch (e: any) { Alert.alert('Could not check', e?.message || 'Try again'); }
    finally { setBusy(false); }
  };

  const convert = async () => {
    if (!docId) return;
    setBusy(true);
    try { const inv = await billingApi.convert(docId); router.replace({ pathname: '/billing-editor', params: { id: inv.id } } as any); }
    catch (e: any) { Alert.alert('Could not convert', e?.message || 'Try again'); setBusy(false); }
  };

  const cancelDoc = () => {
    if (!docId) return;
    Alert.alert('Cancel this document?', 'It stays in the list marked CANCELLED. Money already received is not returned automatically.', [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: async () => { try { fillFromDoc(await billingApi.cancel(docId, 'Cancelled from the app')); } catch (e: any) { Alert.alert('Could not cancel', e?.message || ''); } } },
    ]);
  };

  // ---------------------------------------------------------------- UI helpers
  const card = [s.card, { backgroundColor: c.surface, borderColor: c.border }];
  const inp = [s.input, { color: c.text, borderColor: c.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }];
  const lbl = [s.label, { color: c.textSecondary }];
  const Seg = ({ items, value, onChange, disabled }: { items: { key: string; label: string }[]; value: string; onChange: (k: any) => void; disabled?: boolean }) => (
    <View style={s.seg}>
      {items.map((i) => (
        <TouchableOpacity key={i.key} disabled={disabled} onPress={() => onChange(i.key)}
          style={[s.segBtn, { borderColor: value === i.key ? c.primary : c.border, backgroundColor: value === i.key ? c.primary : 'transparent', opacity: disabled ? 0.6 : 1 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: value === i.key ? '#FFFFFF' : c.text }} numberOfLines={2}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) return <SafeAreaView style={[s.root, { backgroundColor: c.background }]}><ActivityIndicator style={{ marginTop: 80 }} color={c.primary} /></SafeAreaView>;

  const t = totals;
  const noGstin = brand && !brand.gstin && gstMode !== 'NONE';

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{docId ? (number || 'Draft') : docType === 'ESTIMATE' ? 'New estimate' : 'New invoice'}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5 }}>
            {docType === 'ESTIMATE' ? 'Estimate / quotation' : 'Invoice'} · {status}{!!docId && docType === 'INVOICE' && !cancelled ? ` · ${totals?.payment_status === 'PAID' ? 'PAID' : totals?.payment_status === 'PARTIAL' ? 'PART PAID' : 'UNPAID'}` : ''}
          </Text>
        </View>
        {!!docId && !cancelled && (
          <TouchableOpacity onPress={cancelDoc} style={{ padding: 6 }}><X size={20} color="#DC2626" /></TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 140, gap: 12 }} keyboardShouldPersistTaps="handled">
        {/* 1. type + brand + booking id */}
        <View style={card}>
          {!docId && <Seg items={[{ key: 'INVOICE', label: 'Invoice' }, { key: 'ESTIMATE', label: 'Estimate' }]} value={docType} onChange={setDocType} />}
          <Text style={[lbl, { marginTop: docId ? 0 : 10 }]}>BRAND (its name, GSTIN, address, bank, terms and rules are applied)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {brands.map((b) => (
              <TouchableOpacity key={b.id} disabled={locked} onPress={() => setBrandId(b.id)}
                style={[s.brandChip, { borderColor: brandId === b.id ? (b.primary_color || c.primary) : c.border, backgroundColor: brandId === b.id ? (b.primary_color || c.primary) + '22' : 'transparent', opacity: locked && brandId !== b.id ? 0.4 : 1 }]}>
                <View style={[s.dot, { backgroundColor: b.primary_color || c.primary }]} />
                <Text style={{ color: c.text, fontWeight: brandId === b.id ? '800' : '600', fontSize: 12.5 }}>{b.name}</Text>
                {!b.gstin && <Text style={{ color: '#B45309', fontSize: 10 }}> no GSTIN</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => router.push('/billing-brands' as any)} style={[s.brandChip, { borderColor: c.border }]}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 12 }}>Manage brands</Text></TouchableOpacity>
          </ScrollView>
          {!locked && (
            <>
              <Text style={[lbl, { marginTop: 10 }]}>BOOKING ID (fills everything below)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[...inp, { flex: 1 }]} value={bookingRef} onChangeText={setBookingRef} placeholder="Order id / website booking id / old invoice no." placeholderTextColor={c.textMuted} autoCapitalize="characters" />
                <TouchableOpacity onPress={fetchBooking} disabled={fetching} style={[s.fetchBtn, { backgroundColor: c.primary }]}>
                  {fetching ? <ActivityIndicator color="#FFFFFF" size="small" /> : <><Search size={15} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Fetch</Text></>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {!!docId && (prepared.name || sharedBy.length > 0) && (
          <View style={[card, { paddingVertical: 10 }]}>
            <Text style={{ color: c.text, fontSize: 13 }}>Prepared by <Text style={{ fontWeight: '800' }}>{prepared.name || '-'}</Text>{prepared.phone ? ` · ${prepared.phone}` : ''}</Text>
            {sharedBy.length > 0 && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 3 }}>Shared by {Array.from(new Set(sharedBy.map((x) => x.name).filter(Boolean))).join(', ')}{sharedBy[sharedBy.length - 1]?.at ? ` · last ${new Date(String(sharedBy[sharedBy.length - 1].at)).toLocaleString()}` : ''}</Text>}
            <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 3 }}>This name is printed at the bottom of the document so the customer knows who to ask.</Text>
          </View>
        )}

        {/* 2. customer */}
        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>Customer</Text>
          <TextInput style={inp} value={cust.name} onChangeText={(v) => setCust({ ...cust, name: v })} placeholder="Customer name *" placeholderTextColor={c.textMuted} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[...inp, { flex: 1 }]} value={cust.phone} onChangeText={(v) => setCust({ ...cust, phone: v })} placeholder="Mobile" keyboardType="phone-pad" placeholderTextColor={c.textMuted} />
            <TextInput style={[...inp, { flex: 1 }]} value={cust.email} onChangeText={(v) => setCust({ ...cust, email: v })} placeholder="Email" autoCapitalize="none" keyboardType="email-address" placeholderTextColor={c.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[...inp, { flex: 1 }]} value={cust.company} onChangeText={(v) => setCust({ ...cust, company: v })} placeholder="Company (optional)" placeholderTextColor={c.textMuted} />
            <TextInput style={[...inp, { flex: 1 }]} value={cust.gstin} onChangeText={(v) => setCust({ ...cust, gstin: v.toUpperCase() })} placeholder="Customer GSTIN (optional)" autoCapitalize="characters" placeholderTextColor={c.textMuted} />
          </View>
          <TextInput style={inp} value={cust.address} onChangeText={(v) => setCust({ ...cust, address: v })} placeholder="Address (optional)" placeholderTextColor={c.textMuted} />
          <TextInput style={inp} value={cust.state} onChangeText={(v) => { setCust({ ...cust, state: v }); setInterstate(!!v.trim() && !!brand?.state && v.trim().toLowerCase() !== (brand.state || '').toLowerCase()); }} placeholder={`Customer state (IGST if not ${brand?.state || 'brand state'})`} placeholderTextColor={c.textMuted} />
        </View>

        {/* 3. trip */}
        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>Trip</Text>
          {[['pickup', 'From'], ['drop', 'To'], ['vehicle', 'Vehicle'], ['start_at', 'Pickup date & time'], ['driver_name', 'Driver'], ['vehicle_number', 'Vehicle number']].map(([k, label]) => (
            <TextInput key={k} style={inp} value={String(trip[k] ?? '')} onChangeText={(v) => setTrip({ ...trip, [k]: v })} placeholder={label} placeholderTextColor={c.textMuted} />
          ))}
          <Seg items={TRIP_TYPES.map((x) => ({ key: x, label: x }))} value={String(trip.trip_type || '')} onChange={(v) => setTrip({ ...trip, trip_type: v })} />
        </View>

        {/* 3b. pricing rules that fit this trip */}
        {!locked && (trip.pickup || trip.drop) && (
          <View style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.title, { color: c.text, flex: 1, marginBottom: 2 }]}>Pricing rules for this trip</Text>
              <TouchableOpacity onPress={() => router.push('/billing-brands' as any)}><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Manage rules</Text></TouchableOpacity>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, marginBottom: 8 }}>Suggested from your state, place, route and hill rules. Nothing changes until you tap Apply.</Text>
            {sugg.length === 0 && <Text style={{ color: c.textMuted, fontSize: 12 }}>No rule matches this trip.</Text>}
            {sugg.map((x) => {
              const on = !!applied[x.rule.id];
              return (
                <View key={x.rule.id} style={[s.ruleRow, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary + '14' : 'transparent' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>{x.rule.name}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 12 }}>{x.summary}</Text>
                    {x.matched.length > 0 && x.rule.scope !== 'ALL' && <Text style={{ color: c.textMuted, fontSize: 10.5 }}>matched: {x.matched.join(', ')}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => (on ? removeRule(x) : applyRule(x))} style={[s.applyBtn, { backgroundColor: on ? 'transparent' : c.primary, borderColor: c.primary }]}>
                    <Text style={{ color: on ? c.primary : '#FFFFFF', fontWeight: '800', fontSize: 12 }}>{on ? '✓ Applied' : 'Apply'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {needsRecalc && (
              <TouchableOpacity onPress={calculateFare} style={[s.ghostBtn, { borderColor: '#B45309' }]}><RefreshCw size={14} color="#B45309" /><Text style={{ color: '#B45309', fontWeight: '800' }}>Recalculate the fare with these rules</Text></TouchableOpacity>
            )}
          </View>
        )}

        {/* 4. tariff calculator - the brand's own ways of pricing a trip */}
        {!locked && (
          <View style={card}>
            <Text style={[s.title, { color: c.text }]}>Fare calculator</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
              {methods.map((m) => (
                <TouchableOpacity key={m} onPress={() => { setMethod(m); setCardId(''); setTariffNotes([]); }} style={[s.chip, { borderColor: method === m ? c.primary : c.border, backgroundColor: method === m ? c.primary + '22' : 'transparent' }]}>
                  <Text style={{ fontSize: 12, color: method === m ? c.primary : c.text, fontWeight: '700' }}>{METHOD_NAMES[m]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={{ color: c.textSecondary, fontSize: 11.5, marginBottom: 8 }}>{METHOD_HELP[method]}</Text>

            {methodCards.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
                {methodCards.map((k) => (
                  <TouchableOpacity key={k.id} onPress={() => pickCard(k)} style={[s.chip, { borderColor: cardId === k.id ? c.primary : c.border, backgroundColor: cardId === k.id ? c.primary + '22' : 'transparent' }]}>
                    <Text style={{ fontSize: 12, color: c.text, fontWeight: cardId === k.id ? '800' : '600' }}>{method === 'PACKAGE' ? k.name : (k.vehicle_name || k.name)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {methodCards.length === 0 && ['SLAB_DROP', 'SLAB_ROUND', 'LOCAL'].includes(method) && <Text style={{ color: '#B45309', fontSize: 12 }}>No tariff set up for this brand yet. Add one in Brands.</Text>}

            {method === 'KM_BATA' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[['km', 'Km'], ['rate', 'Rate / km'], ['extra', 'Extra rate'], ['bata', 'Bata / day'], ['days', 'Days']].map(([k, label]) => (
                  <TextInput key={k} style={[...inp, { flex: 1, paddingHorizontal: 6, textAlign: 'center' }]} value={(calc as any)[k]} onChangeText={(v) => setCalc({ ...calc, [k]: v.replace(/[^0-9.]/g, '') })} placeholder={label} keyboardType="numeric" placeholderTextColor={c.textMuted} />
                ))}
              </View>
            )}
            {(method === 'SLAB_DROP' || method === 'SLAB_ROUND') && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[...inp, { flex: 1 }]} value={calc.km} onChangeText={(v) => setCalc({ ...calc, km: v.replace(/[^0-9.]/g, '') })} placeholder="One-way km" keyboardType="numeric" placeholderTextColor={c.textMuted} />
                {method === 'SLAB_ROUND' && <TextInput style={[...inp, { flex: 1 }]} value={calc.days} onChangeText={(v) => setCalc({ ...calc, days: v.replace(/[^0-9]/g, '') })} placeholder="Days" keyboardType="numeric" placeholderTextColor={c.textMuted} />}
              </View>
            )}
            {method === 'LOCAL' && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                {Object.keys(methodCards.find((x) => x.id === cardId)?.params?.packages || { '5hrs': 1, '8hrs': 1, '12hrs': 1 }).map((h) => (
                  <TouchableOpacity key={h} onPress={() => setCalc({ ...calc, hours: h })} style={[s.chip, { borderColor: calc.hours === h ? c.primary : c.border, backgroundColor: calc.hours === h ? c.primary + '22' : 'transparent' }]}>
                    <Text style={{ fontSize: 12, color: c.text, fontWeight: '700' }}>{h.replace('hrs', ' hours')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {method === 'DAY_RENT' && (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[...inp, { flex: 1 }]} value={calc.km} onChangeText={(v) => setCalc({ ...calc, km: v.replace(/[^0-9.]/g, '') })} placeholder="Total km" keyboardType="numeric" placeholderTextColor={c.textMuted} />
                  <TextInput style={[...inp, { flex: 1 }]} value={calc.days} onChangeText={(v) => setCalc({ ...calc, days: v.replace(/[^0-9]/g, '') })} placeholder="Days" keyboardType="numeric" placeholderTextColor={c.textMuted} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[['rent', 'Rent / day'], ['limit', 'Km limit / day'], ['extra', 'Extra km rate'], ['fuel', 'Fuel / km']].map(([k, label]) => (
                    <TextInput key={k} style={[...inp, { flex: 1, paddingHorizontal: 6, textAlign: 'center' }]} value={(rent as any)[k]} onChangeText={(v) => setRent({ ...rent, [k]: v.replace(/[^0-9.]/g, '') })} placeholder={label} keyboardType="numeric" placeholderTextColor={c.textMuted} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>Fuel charge on</Text>
                  {[['ALL', 'all km'], ['EXTRA', 'extra km only']].map(([k, label]) => (
                    <TouchableOpacity key={k} onPress={() => setRent({ ...rent, fuelOn: k })} style={[s.chip, { borderColor: rent.fuelOn === k ? c.primary : c.border, backgroundColor: rent.fuelOn === k ? c.primary + '22' : 'transparent' }]}><Text style={{ fontSize: 12, color: c.text }}>{label}</Text></TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            {method === 'PACKAGE' && (
              <>
                {!!cardId && (() => { const k = methodCards.find((x) => x.id === cardId); const p = k?.params || {}; return (
                  <Text style={{ color: c.textSecondary, fontSize: 11.5, marginBottom: 6 }}>
                    {(p.itinerary || []).length ? `Itinerary: ${(p.itinerary || []).join(' > ')}. ` : ''}{(p.includes || []).length ? `Includes: ${(p.includes || []).join(', ')}. ` : ''}{(p.excludes || []).length ? `Not included: ${(p.excludes || []).join(', ')}.` : ''}
                  </Text>); })()}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[...inp, { flex: 1.4 }]} value={calc.amount} onChangeText={(v) => setCalc({ ...calc, amount: v.replace(/[^0-9]/g, '') })} placeholder="All-inclusive amount ₹" keyboardType="numeric" placeholderTextColor={c.textMuted} />
                  <TextInput style={[...inp, { flex: 0.7 }]} value={calc.days} onChangeText={(v) => setCalc({ ...calc, days: v.replace(/[^0-9]/g, '') })} placeholder="Days" keyboardType="numeric" placeholderTextColor={c.textMuted} />
                </View>
              </>
            )}
            <TouchableOpacity onPress={calculateFare} style={[s.ghostBtn, { borderColor: c.primary }]}><RefreshCw size={14} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '800' }}>Add fare lines</Text></TouchableOpacity>
            {tariffNotes.map((n, i) => <Text key={i} style={{ color: c.textMuted, fontSize: 11, marginTop: 4 }}>{n}</Text>)}
          </View>
        )}

        {/* 5. charges */}
        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>Charges</Text>
          <Text style={{ color: c.textSecondary, fontSize: 11.5, marginBottom: 8 }}>
            Ticked + amount = included in the total. Ticked with ₹0 = left out. Unticked = shown as "Not included - paid on actuals".
          </Text>
          {lines.map((l) => (
            <View key={l.id} style={[s.lineRow, { borderColor: l.included ? c.border : '#F59E0B' }]}>
              <TouchableOpacity disabled={locked} onPress={() => setLine(l.id, { included: !l.included })} style={[s.check, { borderColor: l.included ? c.primary : '#F59E0B', backgroundColor: l.included ? c.primary : 'transparent' }]}>
                {l.included && <Check size={13} color="#FFFFFF" />}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <TextInput editable={!locked} style={[s.lineLabel, { color: c.text }]} value={l.label} onChangeText={(v) => setLine(l.id, { label: v })} placeholder="Description" placeholderTextColor={c.textMuted} />
                <Text style={{ fontSize: 10.5, color: l.included ? c.textMuted : '#B45309' }}>
                  {l.included ? (l.kind === 'FARE' ? 'Fare (GST applies)' : 'Charge') : 'Not included - paid on actuals'}
                </Text>
              </View>
              <TextInput editable={!locked} style={[s.lineAmt, { color: c.text, borderColor: c.border }]} value={l.amount} onChangeText={(v) => setLine(l.id, { amount: v.replace(/[^0-9]/g, '') })} placeholder="₹" keyboardType="numeric" placeholderTextColor={c.textMuted} />
              {!locked && (
                <TouchableOpacity onPress={() => setLine(l.id, { kind: l.kind === 'FARE' ? 'CHARGE' : 'FARE' })} style={{ paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: l.kind === 'FARE' ? c.primary : c.textMuted }}>{l.kind === 'FARE' ? 'FARE' : 'CHG'}</Text>
                </TouchableOpacity>
              )}
              {!locked && <TouchableOpacity onPress={() => setLines(lines.filter((x) => x.id !== l.id))}><Trash2 size={16} color="#DC2626" /></TouchableOpacity>}
            </View>
          ))}
          {!locked && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
                {CHIPS.map((x) => {
                  const on = lines.some((l) => l.label.toLowerCase() === x.toLowerCase());
                  return (
                    <TouchableOpacity key={x} onPress={() => addChip(x)} style={[s.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary + '22' : 'transparent' }]}>
                      <Text style={{ fontSize: 12, color: on ? c.primary : c.text, fontWeight: '600' }}>{on ? '✓ ' : '+ '}{x}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => setLines([...lines, { id: uid(), label: '', amount: '', kind: 'CHARGE', included: true }])} style={[s.chip, { borderColor: c.primary }]}><Plus size={13} color={c.primary} /><Text style={{ fontSize: 12, color: c.primary, fontWeight: '700' }}> Custom</Text></TouchableOpacity>
              </ScrollView>
            </>
          )}
        </View>

        {/* 6. GST */}
        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>GST</Text>
          <Seg disabled={locked} items={[{ key: 'NONE', label: 'No GST' }, { key: 'EXTRA', label: 'GST extra' }, { key: 'INCLUDED', label: 'GST included' }]} value={gstMode} onChange={setGstMode} />
          {noGstin && (
            <TouchableOpacity onPress={() => router.push('/billing-brands' as any)} style={[s.warn]}>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '700' }}>{brand?.name} has no GSTIN. Add it in Brands before issuing a GST invoice (or choose No GST).</Text>
            </TouchableOpacity>
          )}
          {gstMode !== 'NONE' && (
            <>
              <Text style={[lbl, { marginTop: 10 }]}>WHAT THE CUSTOMER PAYS FOR THE GST</Text>
              <Seg disabled={locked} items={[{ key: 'COLLECT', label: 'Collect with invoice' }, { key: 'SHOW_ONLY', label: 'Show, do not charge' }, { key: 'PAY_LATER', label: 'Pays later by link' }]} value={gstCollection} onChange={setGstCollection} />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>Rate %</Text>
                <TextInput editable={!locked} style={[...inp, { width: 70, textAlign: 'center' }]} value={gstRate} onChangeText={(v) => setGstRate(v.replace(/[^0-9.]/g, ''))} keyboardType="numeric" />
                <TouchableOpacity disabled={locked} onPress={() => setInterstate(!interstate)} style={[s.chip, { borderColor: interstate ? c.primary : c.border, backgroundColor: interstate ? c.primary + '22' : 'transparent' }]}>
                  <Text style={{ fontSize: 12, color: c.text }}>{interstate ? '✓ IGST (other state)' : 'CGST + SGST'}</Text>
                </TouchableOpacity>
                {gstOverride != null && <TouchableOpacity onPress={() => setGstOverride(null)}><Text style={{ color: c.primary, fontSize: 11.5, fontWeight: '700' }}>GST ₹{gstOverride} from booking · auto</Text></TouchableOpacity>}
              </View>
              <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 6 }}>
                {gstCollection === 'SHOW_ONLY' ? 'The invoice shows the GST but the customer is not charged for it.' : gstCollection === 'PAY_LATER' ? 'The trip amount is payable now; the GST can be paid later with a GST payment link. An unpaid GST never blocks the invoice.' : 'The GST is part of what the customer pays.'}
              </Text>
            </>
          )}
        </View>

        {/* 7. discount, advance, notes */}
        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>Discount, advance & notes</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput editable={!locked} style={[...inp, { flex: 1 }]} value={discount} onChangeText={(v) => setDiscount(v.replace(/[^0-9]/g, ''))} placeholder="Discount ₹" keyboardType="numeric" placeholderTextColor={c.textMuted} />
            <TextInput editable={!locked} style={[...inp, { flex: 1.4 }]} value={discountLabel} onChangeText={setDiscountLabel} placeholder="Discount reason" placeholderTextColor={c.textMuted} />
          </View>
          {docType === 'ESTIMATE' && (
            <>
              <TextInput style={inp} value={advance} onChangeText={(v) => setAdvance(v.replace(/[^0-9]/g, ''))} placeholder={`Advance to confirm the booking ₹${brand?.advance_percent ? ` (brand default ${brand.advance_percent}%)` : ''}`} keyboardType="numeric" placeholderTextColor={c.textMuted} />
              <TextInput style={inp} value={validUntil} onChangeText={setValidUntil} placeholder={`Valid until (YYYY-MM-DD) - default ${brand?.estimate_valid_days || 7} days`} placeholderTextColor={c.textMuted} />
            </>
          )}
          <TextInput style={[...inp, { minHeight: 56 }]} value={notes} onChangeText={setNotes} placeholder="Notes for the customer (optional)" multiline placeholderTextColor={c.textMuted} />
          <TouchableOpacity onPress={() => setShowTerms(!showTerms)}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>{showTerms ? 'Hide' : 'Terms & rules'} (from {brand?.name || 'the brand'}{termsOverride ? ' - edited' : ''})</Text></TouchableOpacity>
          {showTerms && (
            <>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 6 }}>{(docType === 'ESTIMATE' ? brand?.terms_estimate : brand?.terms_invoice) || 'No terms set for this brand.'}</Text>
              <TextInput editable={!locked} style={[...inp, { minHeight: 70, marginTop: 8 }]} value={termsOverride} onChangeText={setTermsOverride} placeholder="Write different terms for THIS document only (one per line)" multiline placeholderTextColor={c.textMuted} />
            </>
          )}
        </View>

        {/* 8. totals */}
        {t && (
          <View style={[card, { borderColor: c.primary }]}>
            <Text style={[s.title, { color: c.text }]}>Totals</Text>
            {[['Sub total', t.subtotal + t.discount], t.discount ? ['Discount', -t.discount] : null,
              gstMode !== 'NONE' ? [`Taxable value`, t.taxable_value] : null,
              gstMode !== 'NONE' ? [interstate ? `IGST ${gstRate}%` : `CGST + SGST ${gstRate}%`, t.gst_amount] : null].filter(Boolean).map((r: any) => (
              <View key={r[0]} style={s.tRow}><Text style={{ color: c.textSecondary }}>{r[0]}</Text><Text style={{ color: c.text }}>{r[1] < 0 ? '- ' : ''}{inr(Math.abs(r[1]))}</Text></View>
            ))}
            <View style={s.tRow}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Total</Text><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{inr(t.total_amount)}</Text></View>
            {gstMode !== 'NONE' && gstCollection === 'SHOW_ONLY' && <View style={s.tRow}><Text style={{ color: '#B45309' }}>GST shown, not charged</Text><Text style={{ color: '#B45309' }}>- {inr(t.gst_amount)}</Text></View>}
            {docType === 'INVOICE' && (
              <>
                {payments.map((p) => (
                  <View key={p.id} style={s.tRow}>
                    <Text style={{ color: '#047857', flex: 1 }} numberOfLines={1}>Received - {p.mode}{p.ref ? ` (${p.ref})` : ''}</Text>
                    <Text style={{ color: '#047857' }}>- {inr(p.amount)}</Text>
                    {docId && !cancelled && <TouchableOpacity onPress={() => Alert.alert('Remove this payment?', `${inr(p.amount)} via ${p.mode}`, [{ text: 'No', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { try { fillFromDoc(await billingApi.removePayment(docId, p.id)); } catch (e: any) { Alert.alert('Failed', e?.message || ''); } } }])} style={{ paddingLeft: 8 }}><X size={14} color={c.textMuted} /></TouchableOpacity>}
                  </View>
                ))}
                <View style={s.tRow}><Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 15 }}>Balance due</Text><Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 15 }}>{inr(t.balance_due)}</Text></View>
                {gstCollection === 'PAY_LATER' && t.gst_pending > 0 && <Text style={{ color: c.textSecondary, fontSize: 11.5 }}>Trip amount {inr(t.payable_now)} now · GST {inr(t.gst_pending)} later by link</Text>}
              </>
            )}
            {docType === 'ESTIMATE' && t.advance_requested > 0 && <View style={s.tRow}><Text style={{ color: c.textSecondary }}>Advance to confirm</Text><Text style={{ color: c.text }}>{inr(t.advance_requested)}</Text></View>}
            {links.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[lbl]}>PAYMENT LINKS</Text>
                {links.map((l) => <Text key={l.id} style={{ color: c.textSecondary, fontSize: 12 }}>{l.purpose} {inr(l.amount)} - {l.status}</Text>)}
                <TouchableOpacity onPress={checkLinks}><Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5, marginTop: 4 }}>Check payment status</Text></TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {!!docId && history.length > 0 && (
          <View style={card}>
            <TouchableOpacity onPress={() => setShowHistory(!showHistory)}><Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>{showHistory ? 'Hide' : 'Show'} history ({history.length})</Text></TouchableOpacity>
            {showHistory && [...history].reverse().map((h, i) => (
              <Text key={i} style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>{h.at ? new Date(h.at).toLocaleString() : ''} · {h.by || ''} · {String(h.action || '').replace(/_/g, ' ').toLowerCase()}{h.detail ? ` (${h.detail})` : ''}</Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* action bar */}
      <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {busy && <ActivityIndicator color={c.primary} />}
        {!cancelled && status === 'DRAFT' && (
          <>
            <TouchableOpacity disabled={busy} onPress={() => save(false)} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Save draft</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => save(true)} style={[s.btn, { backgroundColor: c.primary, flex: 1.4 }]}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Issue {docType === 'ESTIMATE' ? 'estimate' : 'invoice'}</Text></TouchableOpacity>
          </>
        )}
        {!!docId && status !== 'DRAFT' && !cancelled && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={share} style={[s.btn, { backgroundColor: '#25D366' }]}><Send size={15} color="#FFFFFF" /><Text style={s.btnTxt}>Share</Text></TouchableOpacity>
            <TouchableOpacity onPress={openPdf} style={[s.btn, { backgroundColor: c.primary }]}><FileText size={15} color="#FFFFFF" /><Text style={s.btnTxt}>PDF</Text></TouchableOpacity>
            <TouchableOpacity onPress={openPage} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Receipt size={15} color={c.text} /><Text style={{ color: c.text, fontWeight: '800' }}>Preview</Text></TouchableOpacity>
            {docType === 'INVOICE' && <TouchableOpacity onPress={() => { setPay({ ...pay, amount: String(totals?.payable_now || totals?.balance_due || '') }); setShowPay(true); }} style={[s.btn, { backgroundColor: '#047857' }]}><CreditCard size={15} color="#FFFFFF" /><Text style={s.btnTxt}>Record payment</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => setShowLink(true)} style={[s.btn, { backgroundColor: '#7C3AED' }]}><Link2 size={15} color="#FFFFFF" /><Text style={s.btnTxt}>Payment link</Text></TouchableOpacity>
            {docType === 'ESTIMATE' && status !== 'CONVERTED' && <TouchableOpacity onPress={convert} style={[s.btn, { backgroundColor: '#0D47A1' }]}><Text style={s.btnTxt}>Make invoice</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => save(false)} style={[s.btn, { borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Save changes</Text></TouchableOpacity>
          </ScrollView>
        )}
        {cancelled && <Text style={{ color: '#B91C1C', fontWeight: '800' }}>This document is cancelled.</Text>}
      </View>

      {/* record a payment by hand */}
      <Modal visible={showPay} transparent animationType="slide" onRequestClose={() => setShowPay(false)}>
        <View style={s.sheetWrap}><View style={[s.sheet, { backgroundColor: c.surface }]}>
          <Text style={[s.title, { color: c.text }]}>Record a payment</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12, marginBottom: 8 }}>Use this when the money was received by cash, UPI, bank or any other way. It never needs a link.</Text>
          <TextInput style={inp} value={pay.amount} onChangeText={(v) => setPay({ ...pay, amount: v.replace(/[^0-9]/g, '') })} placeholder="Amount received ₹" keyboardType="numeric" placeholderTextColor={c.textMuted} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {PAY_MODES.map((m) => <TouchableOpacity key={m} onPress={() => setPay({ ...pay, mode: m })} style={[s.chip, { borderColor: pay.mode === m ? c.primary : c.border, backgroundColor: pay.mode === m ? c.primary + '22' : 'transparent' }]}><Text style={{ fontSize: 12, color: c.text }}>{m}</Text></TouchableOpacity>)}
          </View>
          <TextInput style={inp} value={pay.ref} onChangeText={(v) => setPay({ ...pay, ref: v })} placeholder="Reference / UTR (optional)" placeholderTextColor={c.textMuted} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {[['PAYMENT', 'Payment'], ['ADVANCE', 'Advance'], ['BALANCE', 'Balance'], ['GST', 'GST']].map(([k, l]) => <TouchableOpacity key={k} onPress={() => setPay({ ...pay, purpose: k })} style={[s.chip, { borderColor: pay.purpose === k ? c.primary : c.border, backgroundColor: pay.purpose === k ? c.primary + '22' : 'transparent' }]}><Text style={{ fontSize: 12, color: c.text }}>{l}</Text></TouchableOpacity>)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setShowPay(false)} style={[s.btn, { flex: 1, borderWidth: 1, borderColor: c.border }]}><Text style={{ color: c.text, fontWeight: '800' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={recordPayment} disabled={busy} style={[s.btn, { flex: 1.4, backgroundColor: '#047857' }]}><Text style={s.btnTxt}>Save payment</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* payment links: advance, GST, balance */}
      <Modal visible={showLink} transparent animationType="slide" onRequestClose={() => setShowLink(false)}>
        <View style={s.sheetWrap}><View style={[s.sheet, { backgroundColor: c.surface }]}>
          <Text style={[s.title, { color: c.text }]}>Send a payment link</Text>
          {!razorpayReady && <Text style={{ color: '#B45309', fontSize: 12, marginBottom: 8 }}>Online links are not switched on yet (Razorpay keys). Record the payment by hand instead.</Text>}
          {[
            docType === 'ESTIMATE' || (t && t.paid_amount === 0) ? ['ADVANCE', 'Advance', num(advance) || t?.payable_now || 0] : null,
            ['BALANCE', 'Balance (trip amount)', t?.payable_now || t?.balance_due || 0],
            gstMode !== 'NONE' ? ['GST', 'GST only', t?.gst_pending || t?.gst_amount || 0] : null,
          ].filter(Boolean).map((r: any) => (
            <TouchableOpacity key={r[0]} onPress={() => makeLink(r[0])} disabled={busy || !razorpayReady} style={[s.linkRow, { borderColor: c.border, opacity: razorpayReady ? 1 : 0.5 }]}>
              <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>{r[1]}</Text><Text style={{ color: c.textSecondary, fontSize: 12 }}>Sends a WhatsApp message with the link</Text></View>
              <Text style={{ color: c.primary, fontWeight: '800' }}>{inr(r[2])}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowLink(false)} style={[s.btn, { borderWidth: 1, borderColor: c.border, marginTop: 8 }]}><Text style={{ color: c.text, fontWeight: '800' }}>Close</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  fetchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 8 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingVertical: 9, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6 },
  lineLabel: { fontSize: 13.5, fontWeight: '600', padding: 0 },
  lineAmt: { width: 78, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'right', fontSize: 14 },
  check: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  warn: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginTop: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  applyBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  bar: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14 },
  btnTxt: { color: '#FFFFFF', fontWeight: '800' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  linkRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
});
