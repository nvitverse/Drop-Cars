import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, RotateCcw, Bot, FileText, LayoutList, Sparkles } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

type Tab = 'cards' | 'terms' | 'fees' | 'bot' | 'ai';
type LangMap = Record<string, string>;
type Card = { icon: string; color: string; title: LangMap; subtitle: LangMap; description: LangMap };

const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'ta', label: 'தமிழ்' }, { code: 'te', label: 'తెలుగు' }, { code: 'kn', label: 'ಕನ್ನಡ' }, { code: 'hi', label: 'हिन्दी' },
];
const COLOR_HEX: Record<string, string> = {
  emerald: '#10B981', blue: '#3B82F6', purple: '#8B5CF6', red: '#EF4444', indigo: '#6366F1', amber: '#F59E0B', teal: '#14B8A6', rose: '#F43F5E',
};

export default function AppContentScreen() {
  const router = useRouter();
  const { isDark, themeColors: c } = useTheme();
  const [tab, setTab] = useState<Tab>('cards');
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [meta, setMeta] = useState<{ icons: string[]; colors: string[]; placeholders: string[] }>({ icons: [], colors: [], placeholders: [] });
  const [cards, setCards] = useState<Card[]>([]);
  const [termsTitle, setTermsTitle] = useState<LangMap>({});
  const [termsBody, setTermsBody] = useState<LangMap>({});
  const [feeTitle, setFeeTitle] = useState<LangMap>({});
  const [feeBody, setFeeBody] = useState<LangMap>({});
  const [botText, setBotText] = useState('');
  const [bump, setBump] = useState(false);
  const [isDefault, setIsDefault] = useState<Record<string, boolean>>({});
  const [ai, setAi] = useState({ ai_bot_enabled: true, ai_bot_daily_limit: '30', ai_bot_global_daily_limit: '3000', doc_ai_enabled: false, doc_ai_daily_limit: '2000' });
  const [aiDirty, setAiDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, t, b, s, f]: any[] = await Promise.all([
        apiService.getAppContent('driver_onboarding'), apiService.getAppContent('driver_terms'), apiService.getAppContent('bot_knowledge'),
        apiService.getSystemSettings(), apiService.getAppContent('driver_fee_info'),
      ]);
      setFeeTitle(f.content?.title || {});
      setFeeBody(f.content?.body || {});
      setMeta({ icons: o.icons || [], colors: o.colors || [], placeholders: o.placeholders || [] });
      setCanEdit(!!o.can_edit);
      setCards(o.content?.steps || []);
      setTermsTitle(t.content?.title || {});
      setTermsBody(t.content?.body || {});
      setBotText(b.content?.text || '');
      setIsDefault({ driver_onboarding: o.is_default, driver_terms: t.is_default, driver_fee_info: f.is_default, bot_knowledge: b.is_default });
      setAi({
        ai_bot_enabled: Number(s?.ai_bot_enabled ?? 1) === 1,
        ai_bot_daily_limit: String(s?.ai_bot_daily_limit ?? 30),
        ai_bot_global_daily_limit: String(s?.ai_bot_global_daily_limit ?? 3000),
        doc_ai_enabled: Number(s?.doc_ai_enabled ?? 0) === 1,
        doc_ai_daily_limit: String(s?.doc_ai_daily_limit ?? 2000),
      });
    } catch (e: any) {
      Alert.alert('Could not load', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const key = tab === 'cards' ? 'driver_onboarding' : tab === 'terms' ? 'driver_terms' : tab === 'fees' ? 'driver_fee_info' : 'bot_knowledge';

  const save = async () => {
    setSaving(true);
    try {
      const content = tab === 'cards' ? { steps: cards } : tab === 'terms' ? { title: termsTitle, body: termsBody } : tab === 'fees' ? { title: feeTitle, body: feeBody } : { text: botText };
      const res: any = await apiService.saveAppContent(key, content, bump && tab !== 'bot');
      Alert.alert('Saved', bump && tab !== 'bot' ? `Saved as version ${res.version}. Drivers will see it again on their next login.` : 'Saved. Drivers get the new text the next time they open the app.');
      setBump(false);
      load();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    Alert.alert('Go back to the built-in text?', 'Your edited version of this section will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => { try { await apiService.resetAppContent(key); load(); } catch (e: any) { Alert.alert('Could not reset', e?.message || ''); } } },
    ]);
  };

  const saveAi = async () => {
    setSaving(true);
    try {
      await apiService.updateSystemSettings({
        ai_bot_enabled: ai.ai_bot_enabled ? 1 : 0, ai_bot_daily_limit: Number(ai.ai_bot_daily_limit) || 30, ai_bot_global_daily_limit: Number(ai.ai_bot_global_daily_limit) || 3000,
        doc_ai_enabled: ai.doc_ai_enabled ? 1 : 0, doc_ai_daily_limit: Number(ai.doc_ai_daily_limit) || 2000,
      });
      setAiDirty(false);
      Alert.alert('Saved', 'AI settings updated.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Only the owner account can change these.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (i: number, field: 'title' | 'subtitle' | 'description', value: string) =>
    setCards((prev) => prev.map((cd, idx) => (idx === i ? { ...cd, [field]: { ...(cd[field] || {}), [lang]: value } } : cd)));
  const setCard = (i: number, patch: Partial<Card>) => setCards((prev) => prev.map((cd, idx) => (idx === i ? { ...cd, ...patch } : cd)));
  const move = (i: number, d: number) => setCards((prev) => { const n = [...prev]; const j = i + d; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (i: number) => Alert.alert('Delete this card?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => setCards((p) => p.filter((_, idx) => idx !== i)) }]);
  const add = () => setCards((p) => [...p, { icon: 'shield', color: 'indigo', title: { en: 'New card' }, subtitle: {}, description: {} }]);

  const card = { backgroundColor: c.surface, borderColor: c.border };
  const inputStyle = [styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }];
  const missing = useMemo(() => (lang === 'en' ? 0 : cards.filter((cd) => !cd.title?.[lang]).length), [cards, lang]);

  const Tabs = () => (
    <View style={[styles.tabs, { borderColor: c.border }]}>
      {([['cards', 'Cards', LayoutList], ['terms', 'Terms', FileText], ['fees', 'Fees', FileText], ['bot', 'Bot', Bot], ['ai', 'AI', Sparkles]] as const).map(([k, label, Icon]) => (
        <TouchableOpacity key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: '#6366F1' }]}>
          <Icon size={15} color={tab === k ? '#FFF' : c.textSecondary} />
          <Text style={[styles.tabText, { color: tab === k ? '#FFF' : c.textSecondary }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const LangPicker = () => (
    <View style={styles.langRow}>
      {LANGS.map((l) => (
        <TouchableOpacity key={l.code} onPress={() => setLang(l.code)} style={[styles.langChip, { borderColor: c.border }, lang === l.code && { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}>
          <Text style={{ color: lang === l.code ? '#4338CA' : c.textSecondary, fontWeight: '700', fontSize: 12.5 }}>{l.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>App Content</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>First-login cards, Terms and Help Bot - edit without a new app release</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 60 }} color="#6366F1" /> : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <Tabs />

            {tab !== 'ai' && !canEdit && <Text style={[styles.warn]}>You can read this, but only the owner or a manager can save changes.</Text>}

            {tab === 'cards' && (
              <>
                <Text style={[styles.help, { color: c.textSecondary }]}>
                  These cards are shown to a driver on first login (and again when you publish a new version). Numbers written like {'{commission_min}'}, {'{convenience_fee}'}, {'{min_driver_hold}'}, {'{support_phone}'}, {'{support_email}'} are filled in automatically from your live settings - use them instead of typing amounts.
                </Text>
                <LangPicker />
                {missing > 0 && <Text style={styles.warn}>{missing} card(s) have no {lang.toUpperCase()} title yet - drivers using this language will see English for them.</Text>}
                {cards.map((cd, i) => (
                  <View key={i} style={[styles.box, card]}>
                    <View style={styles.boxHead}>
                      <View style={[styles.dot, { backgroundColor: COLOR_HEX[cd.color] || '#6366F1' }]} />
                      <Text style={[styles.boxTitle, { color: c.text }]} numberOfLines={1}>Card {i + 1}: {cd.title?.en || '(no title)'}</Text>
                      <TouchableOpacity onPress={() => move(i, -1)} style={styles.iconBtn}><ChevronUp size={18} color={c.textSecondary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => move(i, 1)} style={styles.iconBtn}><ChevronDown size={18} color={c.textSecondary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(i)} style={styles.iconBtn}><Trash2 size={18} color="#DC2626" /></TouchableOpacity>
                    </View>
                    <Text style={[styles.label, { color: c.textSecondary }]}>Colour</Text>
                    <View style={styles.chips}>
                      {meta.colors.map((col) => (
                        <TouchableOpacity key={col} onPress={() => setCard(i, { color: col })} style={[styles.colorChip, { backgroundColor: COLOR_HEX[col] }, cd.color === col && styles.colorChipOn]} />
                      ))}
                    </View>
                    <Text style={[styles.label, { color: c.textSecondary }]}>Icon</Text>
                    <View style={styles.chips}>
                      {meta.icons.map((ic) => (
                        <TouchableOpacity key={ic} onPress={() => setCard(i, { icon: ic })} style={[styles.iconChip, { borderColor: c.border }, cd.icon === ic && { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}>
                          <Text style={{ fontSize: 11.5, color: cd.icon === ic ? '#4338CA' : c.textSecondary }}>{ic}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[styles.label, { color: c.textSecondary }]}>Title ({lang.toUpperCase()})</Text>
                    <TextInput value={cd.title?.[lang] || ''} onChangeText={(v) => setField(i, 'title', v)} style={inputStyle} placeholder="Title" placeholderTextColor={c.textSecondary} />
                    <Text style={[styles.label, { color: c.textSecondary }]}>Sub-title ({lang.toUpperCase()})</Text>
                    <TextInput value={cd.subtitle?.[lang] || ''} onChangeText={(v) => setField(i, 'subtitle', v)} style={inputStyle} placeholder="One short line" placeholderTextColor={c.textSecondary} />
                    <Text style={[styles.label, { color: c.textSecondary }]}>Text ({lang.toUpperCase()})</Text>
                    <TextInput value={cd.description?.[lang] || ''} onChangeText={(v) => setField(i, 'description', v)} style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' }]} multiline placeholder="What the driver should know" placeholderTextColor={c.textSecondary} />
                  </View>
                ))}
                <TouchableOpacity onPress={add} style={[styles.addBtn, { borderColor: '#6366F1' }]}><Plus size={16} color="#6366F1" /><Text style={{ color: '#6366F1', fontWeight: '800' }}> Add a card</Text></TouchableOpacity>
              </>
            )}

            {tab === 'terms' && (
              <>
                <Text style={[styles.help, { color: c.textSecondary }]}>
                  Shown when the driver accepts terms on first login and under Settings. Start a section with its number and title on its own line (for example "6. MONEY"), and leave a blank line between sections. A language with no text falls back to English. Have a lawyer read any legal change before publishing.
                </Text>
                <LangPicker />
                <Text style={[styles.label, { color: c.textSecondary }]}>Window title ({lang.toUpperCase()})</Text>
                <TextInput value={termsTitle[lang] || ''} onChangeText={(v) => setTermsTitle((p) => ({ ...p, [lang]: v }))} style={inputStyle} placeholderTextColor={c.textSecondary} />
                <Text style={[styles.label, { color: c.textSecondary }]}>Terms text ({lang.toUpperCase()})</Text>
                <TextInput value={termsBody[lang] || ''} onChangeText={(v) => setTermsBody((p) => ({ ...p, [lang]: v }))} style={[inputStyle, { minHeight: 380, textAlignVertical: 'top' }]} multiline placeholderTextColor={c.textSecondary} />
                {!termsBody[lang] && lang !== 'en' && <Text style={styles.warn}>No {lang.toUpperCase()} text yet - drivers in this language will read the English terms.</Text>}
              </>
            )}

            {tab === 'fees' && (
              <>
                <Text style={[styles.help, { color: c.textSecondary }]}>
                  The "Fees & Commission" page inside the Driver App (Menu). Put the commission and fee details here - they are deliberately NOT on the first-login cards or the Terms. Numbers written like {'{commission_min}'}, {'{convenience_fee}'}, {'{min_driver_hold}'} are filled from your live settings.
                </Text>
                <LangPicker />
                <Text style={[styles.label, { color: c.textSecondary }]}>Page title ({lang.toUpperCase()})</Text>
                <TextInput value={feeTitle[lang] || ''} onChangeText={(v) => setFeeTitle((p) => ({ ...p, [lang]: v }))} style={inputStyle} placeholderTextColor={c.textSecondary} />
                <Text style={[styles.label, { color: c.textSecondary }]}>Text ({lang.toUpperCase()})</Text>
                <TextInput value={feeBody[lang] || ''} onChangeText={(v) => setFeeBody((p) => ({ ...p, [lang]: v }))} style={[inputStyle, { minHeight: 380, textAlignVertical: 'top' }]} multiline placeholderTextColor={c.textSecondary} />
              </>
            )}

            {tab === 'bot' && (
              <>
                <Text style={[styles.help, { color: c.textSecondary }]}>
                  Extra knowledge and rules for the Help Bot: how the app is laid out, how to do things, what to do with off-topic questions, new policies. Write short plain sentences. The bot already knows your live commission, fee and hold settings.
                </Text>
                <TextInput value={botText} onChangeText={setBotText} style={[inputStyle, { minHeight: 380, textAlignVertical: 'top' }]} multiline placeholderTextColor={c.textSecondary} />
              </>
            )}

            {tab === 'ai' && (
              <>
                <View style={[styles.box, card]}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.boxTitle, { color: c.text }]}>AI Help Bot</Text>
                      <Text style={[styles.help, { color: c.textSecondary, marginTop: 2 }]}>Answers drivers in Tamil / English using their own wallet and trips. Needs the server key. When off, the old rule-based bot answers.</Text>
                    </View>
                    <Switch value={ai.ai_bot_enabled} onValueChange={(v) => { setAi((p) => ({ ...p, ai_bot_enabled: v })); setAiDirty(true); }} />
                  </View>
                  <Text style={[styles.label, { color: c.textSecondary }]}>AI answers per driver per day</Text>
                  <TextInput value={ai.ai_bot_daily_limit} keyboardType="numeric" onChangeText={(v) => { setAi((p) => ({ ...p, ai_bot_daily_limit: v.replace(/\D/g, '') })); setAiDirty(true); }} style={inputStyle} />
                  <Text style={[styles.label, { color: c.textSecondary }]}>AI answers for everyone per day (cost cap)</Text>
                  <TextInput value={ai.ai_bot_global_daily_limit} keyboardType="numeric" onChangeText={(v) => { setAi((p) => ({ ...p, ai_bot_global_daily_limit: v.replace(/\D/g, '') })); setAiDirty(true); }} style={inputStyle} />
                </View>
                <View style={[styles.box, card]}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.boxTitle, { color: c.text }]}>AI document reading</Text>
                      <Text style={[styles.help, { color: c.textSecondary, marginTop: 2 }]}>Reads licence / RC / insurance / Aadhaar photos accurately. It sends the photo to Google - switch on only if your Google key is on the paid plan (private).</Text>
                    </View>
                    <Switch value={ai.doc_ai_enabled} onValueChange={(v) => { setAi((p) => ({ ...p, doc_ai_enabled: v })); setAiDirty(true); }} />
                  </View>
                  <Text style={[styles.label, { color: c.textSecondary }]}>Documents read per day (cost cap)</Text>
                  <TextInput value={ai.doc_ai_daily_limit} keyboardType="numeric" onChangeText={(v) => { setAi((p) => ({ ...p, doc_ai_daily_limit: v.replace(/\D/g, '') })); setAiDirty(true); }} style={inputStyle} />
                </View>
                {aiDirty && (
                  <TouchableOpacity onPress={saveAi} disabled={saving} style={styles.saveBtn}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={16} color="#FFF" /><Text style={styles.saveText}> Save AI settings</Text></>}
                  </TouchableOpacity>
                )}
              </>
            )}

            {tab !== 'ai' && canEdit && (
              <View style={{ marginTop: 16, gap: 10 }}>
                {tab !== 'bot' && tab !== 'fees' && (
                  <View style={[styles.rowBetween, styles.box, card]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.boxTitle, { color: c.text }]}>Show again to every driver</Text>
                      <Text style={[styles.help, { color: c.textSecondary, marginTop: 2 }]}>Turn on for important changes (new rules / terms) - drivers see the cards and accept again on next login.</Text>
                    </View>
                    <Switch value={bump} onValueChange={setBump} />
                  </View>
                )}
                <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={16} color="#FFF" /><Text style={styles.saveText}> Save</Text></>}
                </TouchableOpacity>
                {!isDefault[key] && (
                  <TouchableOpacity onPress={reset} style={styles.resetBtn}><RotateCcw size={15} color="#DC2626" /><Text style={{ color: '#DC2626', fontWeight: '700' }}> Go back to built-in text</Text></TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  iconBtn: { padding: 6 },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 1 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  tabText: { fontSize: 12.5, fontWeight: '800' },
  help: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  warn: { fontSize: 12.5, color: '#B45309', backgroundColor: '#FFFBEB', borderRadius: 6, padding: 10, marginTop: 10 },
  langRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  langChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  box: { borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 12 },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  boxTitle: { fontSize: 14.5, fontWeight: '800', flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 4 },
  label: { fontSize: 11.5, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colorChip: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorChipOn: { borderColor: '#111827' },
  iconChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 12, marginTop: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 14, marginTop: 6 },
  saveText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
});
