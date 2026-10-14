import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardTypeOptions } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Building2, ReceiptText, Landmark, FileText, Palette, Info } from 'lucide-react-native';
import { vendorBilling, BusinessProfile } from '../../services/vendorBillingApi';

const COLORS = ['#1D4ED8', '#0EA5E9', '#059669', '#B45309', '#BE123C', '#7C3AED', '#0F172A'];
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

function Field({ label, value, onChange, placeholder, keyboard, multiline, autoCap, maxLength, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: KeyboardTypeOptions; multiline?: boolean;
  autoCap?: 'none' | 'characters' | 'words' | 'sentences'; maxLength?: number; hint?: string;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]} value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor="#9CA3AF" keyboardType={keyboard} multiline={multiline} autoCapitalize={autoCap || 'none'} maxLength={maxLength} autoCorrect={false}
      />
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

// The name, address, GSTIN, UPI / bank and terms printed on every estimate and invoice the vendor makes (never Drop Cars' details).
export default function BusinessProfileScreen() {
  const [p, setP] = useState<BusinessProfile | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [rate, setRate] = useState(5);
  const [appliesTo, setAppliesTo] = useState<'KM_FARE' | 'ALL'>('KM_FARE');
  const [color, setColor] = useState('#1D4ED8');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await vendorBilling.profile();
      setP(d);
      setF({
        name: d.name || '', legal_name: d.legal_name || '', phone: d.phone || '', email: d.email || '', address: d.address || '', state: d.state || '',
        gstin: d.gstin || '', upi_id: d.upi_id || '', bank_account_name: d.bank_account_name || '', bank_name: d.bank_name || '',
        bank_account_number: d.bank_account_number || '', bank_ifsc: d.bank_ifsc || '', invoice_prefix: d.invoice_prefix || '', signatory: d.signatory || '',
        footer_note: d.footer_note || '', terms_invoice: d.terms_invoice || '', terms_estimate: d.terms_estimate || '', estimate_valid_days: String(d.estimate_valid_days || 7),
      });
      setRate(d.gst_rate || 5); setAppliesTo(d.gst_applies_to || 'KM_FARE'); setColor(d.primary_color || '#1D4ED8');
    } catch (e: any) {
      setError(e?.message || 'Could not load. Please try again.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const save = async () => {
    const g = (f.gstin || '').trim().toUpperCase();
    if (!f.name.trim()) { Alert.alert('Business name needed', 'This name is printed at the top of every estimate and invoice.'); return; }
    if (g && !GSTIN_RE.test(g)) { Alert.alert('GSTIN looks wrong', 'A GSTIN has 15 characters, like 33ABCDE1234F1Z5. Leave it empty if you are not GST registered.'); return; }
    if (f.bank_account_number && !/^\d{9,18}$/.test(f.bank_account_number.trim())) { Alert.alert('Account number looks wrong', 'Bank account numbers are 9 to 18 digits.'); return; }
    if (f.bank_ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.bank_ifsc.trim())) { Alert.alert('IFSC looks wrong', 'It is 11 characters, like SBIN0001234.'); return; }
    setSaving(true);
    try {
      const saved = await vendorBilling.saveProfile({
        name: f.name, legal_name: f.legal_name, phone: f.phone, whatsapp: f.phone, email: f.email, address: f.address, state: f.state, gstin: g,
        gst_rate: rate, gst_applies_to: appliesTo, upi_id: f.upi_id, bank_account_name: f.bank_account_name, bank_name: f.bank_name,
        bank_account_number: f.bank_account_number, bank_ifsc: (f.bank_ifsc || '').toUpperCase(), invoice_prefix: f.invoice_prefix, signatory: f.signatory,
        footer_note: f.footer_note, terms_invoice: f.terms_invoice, terms_estimate: f.terms_estimate, primary_color: color,
        estimate_valid_days: Math.max(1, Math.min(90, parseInt(f.estimate_valid_days, 10) || 7)),
      });
      setP(saved);
      Alert.alert('Saved', 'Your new estimates and invoices will use these details. Documents you already issued keep the details they were issued with.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={s.headerTitle}>My business details</Text>
        <View style={{ width: 40 }} />
      </View>
      {!p ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          {error ? (<><Text style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</Text><TouchableOpacity style={s.primary} onPress={load}><Text style={s.primaryText}>Try again</Text></TouchableOpacity></>) : <ActivityIndicator size="large" color="#1D4ED8" />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.note}><Info size={16} color="#1E40AF" /><Text style={s.noteText}>These details are printed on the estimates and invoices you give your customers - in your name, not Drop Cars'.</Text></View>

          <View style={s.card}>
            <View style={s.cardHead}><Building2 size={18} color="#1D4ED8" /><Text style={s.cardTitle}>Business</Text></View>
            <Field label="Business name *" value={f.name} onChange={set('name')} placeholder="Raja Cabs" autoCap="words" maxLength={120} />
            <Field label="Registered name (if different)" value={f.legal_name} onChange={set('legal_name')} autoCap="words" maxLength={160} />
            <Field label="Phone" value={f.phone} onChange={set('phone')} keyboard="phone-pad" maxLength={15} />
            <Field label="E-mail" value={f.email} onChange={set('email')} keyboard="email-address" />
            <Field label="Address" value={f.address} onChange={set('address')} multiline autoCap="words" maxLength={400} />
            <Field label="State" value={f.state} onChange={set('state')} autoCap="words" hint="Decides CGST + SGST or IGST when you charge GST." />
            <Field label="Name for the signature" value={f.signatory} onChange={set('signatory')} autoCap="words" maxLength={80} />
          </View>

          <View style={s.card}>
            <View style={s.cardHead}><ReceiptText size={18} color="#1D4ED8" /><Text style={s.cardTitle}>GST</Text></View>
            <Field label="GSTIN" value={f.gstin} onChange={(v) => set('gstin')(v.toUpperCase())} placeholder="33ABCDE1234F1Z5" autoCap="characters" maxLength={15}
              hint="Leave empty if you are not GST registered - then your invoices have no GST. With a GSTIN you can add GST to the bill." />
            {!!f.gstin.trim() && (
              <>
                <Text style={[s.label, { marginTop: 14 }]}>GST rate</Text>
                <View style={s.chipRow}>
                  {[5, 12, 18].map((r) => (
                    <TouchableOpacity key={r} style={[s.chip, rate === r && s.chipOn]} onPress={() => setRate(r)}><Text style={[s.chipText, rate === r && s.chipTextOn]}>{r}%</Text></TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.label, { marginTop: 14 }]}>GST is charged on</Text>
                <View style={s.chipRow}>
                  <TouchableOpacity style={[s.chip, appliesTo === 'KM_FARE' && s.chipOn]} onPress={() => setAppliesTo('KM_FARE')}><Text style={[s.chipText, appliesTo === 'KM_FARE' && s.chipTextOn]}>Km fare only</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.chip, appliesTo === 'ALL' && s.chipOn]} onPress={() => setAppliesTo('ALL')}><Text style={[s.chipText, appliesTo === 'ALL' && s.chipTextOn]}>Every charge</Text></TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={s.card}>
            <View style={s.cardHead}><Landmark size={18} color="#1D4ED8" /><Text style={s.cardTitle}>How customers pay you</Text></View>
            <Field label="UPI ID" value={f.upi_id} onChange={set('upi_id')} placeholder="name@okaxis" hint="A payment QR is printed on your invoices when a UPI ID is saved." />
            <Field label="Account holder name" value={f.bank_account_name} onChange={set('bank_account_name')} autoCap="words" />
            <Field label="Bank name" value={f.bank_name} onChange={set('bank_name')} autoCap="words" />
            <Field label="Account number" value={f.bank_account_number} onChange={(v) => set('bank_account_number')(v.replace(/[^0-9]/g, ''))} keyboard="number-pad" maxLength={18} />
            <Field label="IFSC code" value={f.bank_ifsc} onChange={(v) => set('bank_ifsc')(v.toUpperCase())} autoCap="characters" maxLength={11} placeholder="SBIN0001234" />
          </View>

          <View style={s.card}>
            <View style={s.cardHead}><FileText size={18} color="#1D4ED8" /><Text style={s.cardTitle}>Numbering and terms</Text></View>
            <Field label="Invoice number prefix" value={f.invoice_prefix} onChange={(v) => set('invoice_prefix')(v.toUpperCase())} autoCap="characters" maxLength={6}
              hint={`Your invoices are numbered like ${f.invoice_prefix || 'RC'}/26-27/0001 and estimates ${f.invoice_prefix || 'RC'}-EST/26-27/0001.`} />
            <Field label="Estimate is valid for (days)" value={f.estimate_valid_days} onChange={(v) => set('estimate_valid_days')(v.replace(/[^0-9]/g, ''))} keyboard="number-pad" maxLength={2} />
            <Field label="Terms on invoices" value={f.terms_invoice} onChange={set('terms_invoice')} multiline autoCap="sentences" />
            <Field label="Terms on estimates" value={f.terms_estimate} onChange={set('terms_estimate')} multiline />
            <Field label="Line at the bottom" value={f.footer_note} onChange={set('footer_note')} autoCap="words" maxLength={160} />
          </View>

          <View style={s.card}>
            <View style={s.cardHead}><Palette size={18} color="#1D4ED8" /><Text style={s.cardTitle}>Colour</Text></View>
            <View style={[s.chipRow, { marginTop: 8 }]}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} accessibilityLabel={`Colour ${c}`} style={[s.swatch, { backgroundColor: c }, color === c && s.swatchOn]} />
              ))}
            </View>
          </View>

          <TouchableOpacity style={[s.primary, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Save details</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  content: { padding: 16, paddingBottom: 56 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 14 },
  noteText: { flex: 1, color: '#1E40AF', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  label: { fontSize: 12.5, fontWeight: '700', color: '#4B5563', marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  hint: { fontSize: 12, color: '#6B7280', marginTop: 5, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  chipOn: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  chipText: { fontSize: 13.5, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#FFFFFF' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: '#111827' },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
});
