import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch, Linking, Share } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Search, Plus, Trash2, Send, CircleCheck as CheckCircle, FileDown, Ban, Repeat, IndianRupee, Calculator, Info } from 'lucide-react-native';
import { vendorBilling, BillDoc, BillOptions, BillTotals, BusinessProfile } from '../../services/vendorBillingApi';

interface Row { label: string; amount: string; included: boolean; kind: 'FARE' | 'CHARGE' }
const num = (v: string | number | undefined | null) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0));
const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function Input(p: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; phone?: boolean; multiline?: boolean; flex?: number; editable?: boolean }) {
  return (
    <View style={{ marginTop: 10, flex: p.flex }}>
      <Text style={s.label}>{p.label}</Text>
      <TextInput
        style={[s.input, p.multiline && { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }, p.editable === false && { opacity: 0.6 }]} value={p.value} onChangeText={p.onChange}
        placeholder={p.placeholder} placeholderTextColor="#9CA3AF" keyboardType={p.numeric ? 'number-pad' : p.phone ? 'phone-pad' : 'default'} multiline={p.multiline}
        autoCorrect={false} editable={p.editable !== false}
      />
    </View>
  );
}

// One screen for an estimate or an invoice in the vendor's own name: type a booking id to fill it in, add charges, choose GST (only with a GSTIN),
// issue, share on WhatsApp, record the money received. An unpaid invoice is never blocked.
export default function InvoiceEditor() {
  const params = useLocalSearchParams<{ id?: string; type?: string; ref?: string }>();
  const [docId, setDocId] = useState<string | null>(params.id ? String(params.id) : null);
  const [doc, setDoc] = useState<BillDoc | null>(null);
  const [type, setType] = useState<'ESTIMATE' | 'INVOICE'>(String(params.type).toUpperCase() === 'INVOICE' ? 'INVOICE' : 'ESTIMATE');
  const [opts, setOpts] = useState<BillOptions | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [booking, setBooking] = useState(params.ref ? String(params.ref) : '');
  const [cust, setCust] = useState({ name: '', phone: '', company: '', gstin: '', address: '', state: '' });
  const [showMore, setShowMore] = useState(false);
  const [trip, setTrip] = useState({ pickup: '', drop: '', start_at: '', vehicle: '', km: '' });
  const [tripExtra, setTripExtra] = useState<Record<string, any>>({});
  const [rows, setRows] = useState<Row[]>([{ label: 'Trip fare', amount: '', included: true, kind: 'FARE' }]);
  const [gstMode, setGstMode] = useState<'NONE' | 'EXTRA' | 'INCLUDED'>('NONE');
  const [gstCollection, setGstCollection] = useState<'COLLECT' | 'SHOW_ONLY'>('COLLECT');
  const [discount, setDiscount] = useState('');
  const [advance, setAdvance] = useState('');
  const [notes, setNotes] = useState('');
  const [prefPayments, setPrefPayments] = useState<any[]>([]);
  const [calc, setCalc] = useState({ km: '', rate: '', bata: '', days: '1' });
  const [totals, setTotals] = useState<BillTotals | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState('');
  const [payMode, setPayMode] = useState('UPI');
  const [payRef, setPayRef] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const locked = !!doc && doc.status !== 'DRAFT';       // issued documents can still be corrected, but the type and number are fixed
  const issuedOrCancelled = !!doc && (doc.status === 'CANCELLED');

  const fill = useCallback((d: BillDoc) => {
    setDoc(d); setDocId(d.id); setType(d.doc_type);
    setBooking(d.booking_ref || '');
    setCust({ name: d.customer?.name || '', phone: d.customer?.phone || '', company: d.customer?.company || '', gstin: d.customer?.gstin || '', address: d.customer?.address || '', state: d.customer?.state || '' });
    const t = d.trip || {};
    setTrip({ pickup: t.pickup || '', drop: t.drop || '', start_at: t.start_at || '', vehicle: t.vehicle || '', km: t.km ? String(t.km) : '' });
    const { pickup, drop, start_at, vehicle, km, ...rest } = t as any;
    setTripExtra(rest);
    setRows((d.lines || []).map((l) => ({ label: l.label, amount: String(l.amount || ''), included: l.included !== false, kind: (l.kind as any) || 'CHARGE' })));
    setGstMode(d.gst?.mode || 'NONE'); setGstCollection((d.gst?.collection as any) === 'SHOW_ONLY' ? 'SHOW_ONLY' : 'COLLECT');
    setDiscount(d.discount ? String(d.discount) : ''); setAdvance(d.advance_requested ? String(d.advance_requested) : ''); setNotes(d.notes || '');
    setTotals(d.totals);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const p = await vendorBilling.profile();          // first: it creates the business profile the other calls read
        const o = await vendorBilling.options();
        setOpts(o); setProfile(p);
        if (o.enabled === false && !params.id) Alert.alert('Invoicing is switched off', 'Making new invoices is switched off for your account right now. Please contact Drop Cars support.', [{ text: 'Back', onPress: () => router.back() }]);
        if (params.id) fill(await vendorBilling.get(String(params.id)));
        else if (params.ref) await doFetch(String(params.ref), true);
      } catch (e: any) {
        Alert.alert('Could not open', e?.message || 'Please try again.', [{ text: 'Back', onPress: () => router.back() }]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const doFetch = async (ref: string, silent = false) => {
    if (!ref.trim()) { Alert.alert('Enter the booking number', 'Type the booking id of one of your bookings.'); return; }
    setBusy('fetch');
    try {
      const d = await vendorBilling.prefill(ref.trim());
      setCust((c) => ({ ...c, name: d.customer?.name || c.name, phone: d.customer?.phone || c.phone, company: d.customer?.company || c.company }));
      const t = d.trip || {};
      setTrip({ pickup: t.pickup || '', drop: t.drop || '', start_at: t.start_at || '', vehicle: t.vehicle || '', km: t.km ? String(t.km) : '' });
      const { pickup, drop, start_at, vehicle, km, ...rest } = t;
      setTripExtra(rest);
      if ((d.lines || []).length) setRows(d.lines.map((l: any) => ({ label: l.label, amount: String(l.amount || ''), included: l.included !== false, kind: l.kind || 'CHARGE' })));
      setPrefPayments(d.payments || []);
      setBooking(String(d.booking_ref || ref.trim()));
      if (!silent) Alert.alert('Booking found', 'Customer, trip and charges are filled in. Please check the amounts - change them to what YOU charge your customer.');
    } catch (e: any) {
      Alert.alert('Not found', e?.message || 'No booking of yours has this number.');
    } finally {
      setBusy(null);
    }
  };

  const payload = useCallback(() => ({
    doc_type: type, booking_ref: booking.trim() || undefined,
    customer: { name: cust.name.trim(), phone: cust.phone.trim(), company: cust.company.trim(), gstin: cust.gstin.trim(), address: cust.address.trim(), state: cust.state.trim() },
    trip: { ...tripExtra, pickup: trip.pickup.trim(), drop: trip.drop.trim(), start_at: trip.start_at.trim(), vehicle: trip.vehicle.trim(), km: trip.km ? num(trip.km) : undefined },
    lines: rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), amount: num(r.amount), kind: r.kind, included: r.included })),
    gst: { mode: gstMode, rate: profile?.gst_rate || 5, collection: gstCollection, applies_to: profile?.gst_applies_to || 'KM_FARE' },
    discount: num(discount), advance_requested: num(advance), notes: notes.trim(),
    ...(docId ? {} : { payments: prefPayments }),
  }), [type, booking, cust, trip, tripExtra, rows, gstMode, gstCollection, profile, discount, advance, notes, docId, prefPayments]);

  // live totals from the server (the same maths as the printed document)
  const calcTimer = useRef<any>(null);
  useEffect(() => {
    if (!profile) return;
    clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(async () => {
      try {
        const p = payload();
        const paid = (doc?.payments || prefPayments || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0);
        setTotals(await vendorBilling.calc({ lines: p.lines, gst_mode: gstMode, gst_rate: p.gst.rate, gst_collection: gstCollection, applies_to: p.gst.applies_to,
          discount: p.discount, payments_total: paid, advance_requested: p.advance_requested }));
      } catch { /* keep the last totals */ }
    }, 350);
    return () => clearTimeout(calcTimer.current);
  }, [rows, gstMode, gstCollection, discount, advance, profile, doc, prefPayments]);   // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    if (!cust.name.trim()) { Alert.alert('Customer name needed', 'Type the name of the person you are billing.'); return false; }
    if (!rows.some((r) => r.label.trim() && num(r.amount) > 0)) { Alert.alert('Add the fare', 'Enter the trip fare (or at least one charge with an amount).'); return false; }
    return true;
  };

  const save = async (): Promise<BillDoc | null> => {
    if (!validate()) return null;
    setBusy('save');
    try {
      const d = docId ? await vendorBilling.update(docId, payload()) : await vendorBilling.create(payload());
      fill(d);
      return d;
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const shareDoc = async (id: string) => {
    try {
      const sh = await vendorBilling.share(id);
      Alert.alert('Send to your customer', 'How do you want to send it?', [
        { text: 'WhatsApp', onPress: () => (sh.whatsapp_url ? Linking.openURL(sh.whatsapp_url) : Share.share({ message: sh.message })) },
        { text: 'Other apps', onPress: () => Share.share({ message: sh.message }) },
        { text: 'Open PDF', onPress: () => Linking.openURL(sh.pdf_url) },
        { text: 'Close', style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert('Could not share', e?.message || 'Please try again.');
    }
  };

  const issueAndShare = async () => {
    const d = await save();
    if (!d) return;
    setBusy('issue');
    try {
      const issued = d.status === 'DRAFT' ? await vendorBilling.issue(d.id) : d;
      fill(issued);
      await shareDoc(issued.id);
    } catch (e: any) {
      Alert.alert('Could not issue', e?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const savePayment = async () => {
    if (!doc) return;
    const amt = num(payAmt);
    if (amt <= 0) { Alert.alert('Enter the amount received', ''); return; }
    setBusy('pay');
    try {
      fill(await vendorBilling.addPayment(doc.id, { amount: amt, mode: payMode, ref: payRef.trim() || undefined }));
      setPayOpen(false); setPayAmt(''); setPayRef('');
    } catch (e: any) {
      Alert.alert('Could not record', e?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const convert = () => {
    if (!doc) return;
    Alert.alert('Make an invoice from this estimate?', 'The estimate stays on record. The invoice gets its own number.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Make invoice', onPress: async () => {
        setBusy('convert');
        try { fill(await vendorBilling.convert(doc.id)); Alert.alert('Invoice ready', 'You can share it now.'); }
        catch (e: any) { Alert.alert('Could not convert', e?.message || 'Please try again.'); }
        finally { setBusy(null); }
      } },
    ]);
  };

  const doCancel = async () => {
    if (!doc) return;
    setBusy('cancel');
    try { fill(await vendorBilling.cancel(doc.id, cancelReason.trim() || 'Cancelled')); setCancelOpen(false); setCancelReason(''); }
    catch (e: any) { Alert.alert('Could not cancel', e?.message || 'Please try again.'); }
    finally { setBusy(null); }
  };

  const addFare = () => {
    const km = num(calc.km), rate = num(calc.rate), bata = num(calc.bata), days = Math.max(1, num(calc.days) || 1);
    if (!km || !rate) { Alert.alert('Enter km and rate per km', 'For example 300 km at ₹14 per km.'); return; }
    const next: Row[] = [{ label: `Km fare (${km} km x Rs ${rate})`, amount: String(km * rate), included: true, kind: 'FARE' }];
    if (bata) next.push({ label: days > 1 ? `Driver bata (${days} days)` : 'Driver bata', amount: String(bata * days), included: true, kind: 'CHARGE' });
    setRows((r) => [...r.filter((x) => !(x.kind === 'FARE' && !num(x.amount))), ...next]);
    setTrip((t) => ({ ...t, km: t.km || String(km) }));
  };

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addChip = (label: string, kind: 'FARE' | 'CHARGE') => setRows((r) => [...r, { label, amount: '', included: false, kind }]);
  const standard = useMemo(() => (opts?.standard_charges || []).filter((c) => !rows.some((r) => r.label === c.label)), [opts, rows]);
  const title = doc ? (doc.status === 'DRAFT' ? `${type === 'ESTIMATE' ? 'Estimate' : 'Invoice'} draft` : doc.number) : type === 'ESTIMATE' ? 'New estimate' : 'New invoice';

  if (loading) return <SafeAreaView style={s.container}><View style={{ padding: 60 }}><ActivityIndicator size="large" color="#1D4ED8" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {issuedOrCancelled && <View style={s.banner}><Ban size={16} color="#991B1B" /><Text style={s.bannerText}>This document is cancelled{doc?.cancel_reason ? `: ${doc.cancel_reason}` : ''}.</Text></View>}

        {!locked && (
          <View style={s.seg}>
            {(['ESTIMATE', 'INVOICE'] as const).map((t) => (
              <TouchableOpacity key={t} style={[s.segBtn, type === t && s.segOn]} onPress={() => setType(t)}>
                <Text style={[s.segText, type === t && s.segTextOn]}>{t === 'ESTIMATE' ? 'Estimate (before the trip)' : 'Invoice (bill)'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!locked && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Fill from a booking (optional)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput style={[s.input, { flex: 1 }]} value={booking} onChangeText={setBooking} placeholder="Your booking number" placeholderTextColor="#9CA3AF" keyboardType="number-pad" />
              <TouchableOpacity style={s.fetch} onPress={() => doFetch(booking)} disabled={busy === 'fetch'} activeOpacity={0.85}>
                {busy === 'fetch' ? <ActivityIndicator color="#FFFFFF" /> : <><Search size={16} color="#FFFFFF" /><Text style={s.fetchText}>Fetch</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>Customer</Text>
          <Input label="Name *" value={cust.name} onChange={(v) => setCust({ ...cust, name: v })} placeholder="Customer name" />
          <Input label="Phone" value={cust.phone} onChange={(v) => setCust({ ...cust, phone: v })} phone placeholder="For sending on WhatsApp" />
          <TouchableOpacity onPress={() => setShowMore(!showMore)} style={{ paddingVertical: 10 }}><Text style={s.link}>{showMore ? 'Hide' : 'Add'} company, GSTIN, address</Text></TouchableOpacity>
          {showMore && (
            <>
              <Input label="Company" value={cust.company} onChange={(v) => setCust({ ...cust, company: v })} />
              <Input label="Customer GSTIN" value={cust.gstin} onChange={(v) => setCust({ ...cust, gstin: v.toUpperCase() })} />
              <Input label="Address" value={cust.address} onChange={(v) => setCust({ ...cust, address: v })} multiline />
              <Input label="State" value={cust.state} onChange={(v) => setCust({ ...cust, state: v })} placeholder="Decides CGST+SGST or IGST" />
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Trip</Text>
          <Input label="Pickup" value={trip.pickup} onChange={(v) => setTrip({ ...trip, pickup: v })} />
          <Input label="Drop" value={trip.drop} onChange={(v) => setTrip({ ...trip, drop: v })} />
          <Input label="Date and time" value={trip.start_at} onChange={(v) => setTrip({ ...trip, start_at: v })} placeholder="15 Oct 2026, 6:00 AM" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input label="Vehicle" value={trip.vehicle} onChange={(v) => setTrip({ ...trip, vehicle: v })} flex={1} placeholder="Sedan" />
            <Input label="Km" value={trip.km} onChange={(v) => setTrip({ ...trip, km: v })} numeric flex={1} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Fare and charges</Text>
          {!locked && (
            <View style={s.calcBox}>
              <View style={s.rowCenter}><Calculator size={16} color="#1D4ED8" /><Text style={s.calcTitle}>Quick fare</Text></View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input label="Km" value={calc.km} onChange={(v) => setCalc({ ...calc, km: v })} numeric flex={1} />
                <Input label="₹ per km" value={calc.rate} onChange={(v) => setCalc({ ...calc, rate: v })} numeric flex={1} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input label="Driver bata / day" value={calc.bata} onChange={(v) => setCalc({ ...calc, bata: v })} numeric flex={1} />
                <Input label="Days" value={calc.days} onChange={(v) => setCalc({ ...calc, days: v })} numeric flex={1} />
              </View>
              <TouchableOpacity style={s.secondary} onPress={addFare}><Text style={s.secondaryText}>Add to charges</Text></TouchableOpacity>
            </View>
          )}
          {rows.map((r, i) => (
            <View key={i} style={s.lineBox}>
              <TextInput style={s.input} value={r.label} onChangeText={(v) => setRow(i, { label: v })} placeholder="Charge name" placeholderTextColor="#9CA3AF" />
              <View style={s.lineBottom}>
                <View style={s.amountWrap}><Text style={s.rs}>₹</Text><TextInput style={s.amountInput} value={r.amount} onChangeText={(v) => setRow(i, { amount: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="0" placeholderTextColor="#9CA3AF" /></View>
                <View style={s.rowCenter}>
                  <Text style={s.incText}>{r.included ? 'In the total' : 'Pay on actuals'}</Text>
                  <Switch value={r.included} onValueChange={(v) => setRow(i, { included: v })} />
                </View>
                <TouchableOpacity onPress={() => setRows((x) => x.filter((_, idx) => idx !== i))} style={s.trash} accessibilityLabel="Remove this charge"><Trash2 size={18} color="#B91C1C" /></TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={s.hint}>"Pay on actuals" shows the charge on the bill but keeps it out of the total (for example toll or parking paid by the customer directly).</Text>
          <View style={s.chipRow}>
            {standard.map((c) => (
              <TouchableOpacity key={c.label} style={s.chip} onPress={() => addChip(c.label, c.kind as any)}><Plus size={13} color="#1D4ED8" /><Text style={s.chipText}>{c.label}</Text></TouchableOpacity>
            ))}
            <TouchableOpacity style={s.chip} onPress={() => addChip('', 'CHARGE')}><Plus size={13} color="#1D4ED8" /><Text style={s.chipText}>Other</Text></TouchableOpacity>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>GST</Text>
          {opts?.gst_registered ? (
            <>
              <View style={s.chipRow}>
                {opts.gst_modes.map((m) => (
                  <TouchableOpacity key={m.key} style={[s.chip, gstMode === m.key && s.chipOn]} onPress={() => setGstMode(m.key as any)}><Text style={[s.chipText, gstMode === m.key && { color: '#FFFFFF' }]}>{m.label}</Text></TouchableOpacity>
                ))}
              </View>
              {gstMode !== 'NONE' && (
                <View style={[s.rowCenter, { justifyContent: 'space-between', marginTop: 12 }]}>
                  <Text style={s.incText}>{gstCollection === 'COLLECT' ? `Add ${profile?.gst_rate}% GST to the bill` : 'Show the GST but do not charge it'}</Text>
                  <Switch value={gstCollection === 'COLLECT'} onValueChange={(v) => setGstCollection(v ? 'COLLECT' : 'SHOW_ONLY')} />
                </View>
              )}
            </>
          ) : (
            <View style={s.note}>
              <Info size={16} color="#1E40AF" />
              <View style={{ flex: 1 }}>
                <Text style={s.noteText}>You are not GST registered, so this bill has no GST. If you have a GSTIN, add it in your business details to charge GST.</Text>
                <TouchableOpacity onPress={() => router.push('/(menu)/business-profile' as any)}><Text style={[s.link, { marginTop: 6 }]}>Add my GSTIN</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Discount, advance and notes</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input label="Discount ₹" value={discount} onChange={(v) => setDiscount(v.replace(/[^0-9]/g, ''))} numeric flex={1} />
            {type === 'ESTIMATE' && <Input label="Advance to ask ₹" value={advance} onChange={(v) => setAdvance(v.replace(/[^0-9]/g, ''))} numeric flex={1} />}
          </View>
          <Input label="Note for the customer" value={notes} onChange={setNotes} multiline placeholder="Optional" />
        </View>

        {totals && (
          <View style={s.totals}>
            <TRow l="Total of included charges" v={rupees(totals.gross)} />
            {totals.discount > 0 && <TRow l="Discount" v={`- ${rupees(totals.discount)}`} />}
            {totals.gst_amount > 0 && <TRow l={`GST ${profile?.gst_rate}%`} v={rupees(totals.gst_amount)} />}
            <TRow l={type === 'ESTIMATE' ? 'Estimate total' : 'Invoice total'} v={rupees(totals.total_amount)} bold />
            {totals.paid_amount > 0 && <TRow l="Received" v={`- ${rupees(totals.paid_amount)}`} />}
            {type === 'INVOICE' && <TRow l="Balance to collect" v={rupees(totals.balance_due)} bold accent />}
          </View>
        )}

        {doc && (doc.payments || []).length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Money received</Text>
            {doc.payments.map((p: any) => (
              <View key={p.id} style={[s.rowCenter, { justifyContent: 'space-between', marginTop: 10 }]}>
                <Text style={s.incText}>{rupees(p.amount)} · {p.mode}{p.ref ? ` · ${p.ref}` : ''}</Text>
                {p.source !== 'BOOKING' && doc.status !== 'CANCELLED' && (
                  <TouchableOpacity onPress={async () => { try { fill(await vendorBilling.removePayment(doc.id, p.id)); } catch (e: any) { Alert.alert('Could not remove', e?.message || ''); } }}><Text style={[s.link, { color: '#B91C1C' }]}>Remove</Text></TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {!issuedOrCancelled && (
          <View style={{ gap: 10, marginTop: 4 }}>
            {!locked ? (
              <>
                <TouchableOpacity style={[s.primary, !!busy && { opacity: 0.6 }]} onPress={issueAndShare} disabled={!!busy} activeOpacity={0.85}>
                  {busy === 'issue' || busy === 'save' ? <ActivityIndicator color="#FFFFFF" /> : <><Send size={18} color="#FFFFFF" /><Text style={s.primaryText}>Issue and send to customer</Text></>}
                </TouchableOpacity>
                <TouchableOpacity style={s.secondary} onPress={save} disabled={!!busy}><Text style={s.secondaryText}>Save as draft</Text></TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.primary} onPress={() => doc && shareDoc(doc.id)} activeOpacity={0.85}><Send size={18} color="#FFFFFF" /><Text style={s.primaryText}>Send to customer</Text></TouchableOpacity>
                {type === 'INVOICE' && (totals?.balance_due || 0) > 0 && (
                  <TouchableOpacity style={[s.primary, { backgroundColor: '#059669' }]} onPress={() => { setPayAmt(String(totals?.balance_due || '')); setPayOpen(true); }}>
                    <IndianRupee size={18} color="#FFFFFF" /><Text style={s.primaryText}>Record money received</Text>
                  </TouchableOpacity>
                )}
                {type === 'ESTIMATE' && doc?.status !== 'CONVERTED' && (
                  <TouchableOpacity style={[s.primary, { backgroundColor: '#7C3AED' }]} onPress={convert}><Repeat size={18} color="#FFFFFF" /><Text style={s.primaryText}>Make invoice from this</Text></TouchableOpacity>
                )}
                <TouchableOpacity style={s.secondary} onPress={save} disabled={!!busy}><Text style={s.secondaryText}>Save changes</Text></TouchableOpacity>
                <TouchableOpacity style={s.secondary} onPress={async () => { if (doc) { try { const sh = await vendorBilling.share(doc.id); Linking.openURL(sh.pdf_url); } catch (e: any) { Alert.alert('Could not open', e?.message || ''); } } }}>
                  <View style={s.rowCenter}><FileDown size={16} color="#374151" /><Text style={s.secondaryText}>Open PDF</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCancelOpen(true)} style={{ alignItems: 'center', paddingVertical: 12 }}><Text style={{ color: '#B91C1C', fontWeight: '700' }}>Cancel this {type === 'ESTIMATE' ? 'estimate' : 'invoice'}</Text></TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={payOpen} transparent animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Money received</Text>
            <Input label="Amount ₹" value={payAmt} onChange={(v) => setPayAmt(v.replace(/[^0-9]/g, ''))} numeric />
            <Text style={[s.label, { marginTop: 12 }]}>How was it paid?</Text>
            <View style={s.chipRow}>{(opts?.payment_modes || ['Cash', 'UPI']).map((m) => (<TouchableOpacity key={m} style={[s.chip, payMode === m && s.chipOn]} onPress={() => setPayMode(m)}><Text style={[s.chipText, payMode === m && { color: '#FFFFFF' }]}>{m}</Text></TouchableOpacity>))}</View>
            <Input label="Reference (optional)" value={payRef} onChange={setPayRef} placeholder="UPI reference / cheque no." />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.secondary, { flex: 1 }]} onPress={() => setPayOpen(false)}><Text style={s.secondaryText}>Close</Text></TouchableOpacity>
              <TouchableOpacity style={[s.primary, { flex: 1 }]} onPress={savePayment} disabled={busy === 'pay'}>{busy === 'pay' ? <ActivityIndicator color="#FFFFFF" /> : <><CheckCircle size={16} color="#FFFFFF" /><Text style={s.primaryText}>Save</Text></>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cancelOpen} transparent animationType="slide" onRequestClose={() => setCancelOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Cancel this document?</Text>
            <Text style={s.hint}>It stays on record marked as cancelled. Its number is not reused.</Text>
            <Input label="Reason" value={cancelReason} onChange={setCancelReason} placeholder="Trip cancelled / wrong details" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.secondary, { flex: 1 }]} onPress={() => setCancelOpen(false)}><Text style={s.secondaryText}>Keep it</Text></TouchableOpacity>
              <TouchableOpacity style={[s.primary, { flex: 1, backgroundColor: '#B91C1C' }]} onPress={doCancel} disabled={busy === 'cancel'}>{busy === 'cancel' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Cancel it</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TRow({ l, v, bold, accent }: { l: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <View style={[s.rowCenter, { justifyContent: 'space-between', marginTop: 8 }]}>
      <Text style={[s.tl, bold && { fontWeight: '800', color: '#111827' }]}>{l}</Text>
      <Text style={[s.tv, bold && { fontWeight: '800' }, accent && { color: '#B91C1C' }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 16.5, fontWeight: '800', color: '#111827', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  content: { padding: 16, paddingBottom: 60 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerText: { color: '#991B1B', fontSize: 13, flex: 1 },
  seg: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 12 },
  segBtn: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 12.5, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  segTextOn: { color: '#1D4ED8' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  label: { fontSize: 12.5, fontWeight: '700', color: '#4B5563', marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  fetch: { minHeight: 46, borderRadius: 12, backgroundColor: '#1D4ED8', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fetchText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  link: { color: '#1D4ED8', fontWeight: '700', fontSize: 13.5 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calcBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 6 },
  calcTitle: { color: '#1E40AF', fontWeight: '800', fontSize: 13.5 },
  lineBox: { marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, gap: 8 },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 10, minHeight: 42, width: 112, backgroundColor: '#F9FAFB' },
  rs: { color: '#6B7280', fontSize: 15, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 6 },
  incText: { fontSize: 12.5, color: '#4B5563', fontWeight: '600', flexShrink: 1 },
  trash: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#DBEAFE' },
  chipOn: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  note: { flexDirection: 'row', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginTop: 10 },
  noteText: { color: '#1E40AF', fontSize: 13, lineHeight: 18 },
  totals: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#DBEAFE' },
  tl: { fontSize: 14, color: '#4B5563' },
  tv: { fontSize: 15, color: '#111827', fontWeight: '700' },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: '#1D4ED8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  secondaryText: { color: '#374151', fontSize: 14.5, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
});
