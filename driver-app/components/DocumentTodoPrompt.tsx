import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { AlertTriangle, FileWarning } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';

const SNOOZE_KEY = 'document_todo_snoozed_at';
const SNOOZE_MS = 3 * 60 * 60 * 1000;   // "Remind me later" hides it for 3 hours; it keeps coming back until the documents are fixed

interface TodoItem {
  kind: 'car' | 'driver';
  entity_id: string;
  entity_name: string;
  document: string;
  problem: string;
  action: string;
  severity: 'warn' | 'bad';
  fix?: 'date' | 'upload';        // 'date' = the owner just types the date printed on the document (no new photo)
  doc_key?: string;
}

// "10052022" -> "10/05/2022" as the owner types
const formatDateInput = (raw: string) => {
  const d = raw.replace(/[^0-9]/g, '').slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
// "10/05/2022" -> "2022-05-10" (null when it is not a real calendar date)
const toIso = (text: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const day = +m[1], month = +m[2], year = +m[3];
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/**
 * "Documents that need you" popup, shown when the owner opens the app (and when they come back to it) for as long as anything is
 * pending: a date that was never entered, a document that was rejected (with the reason and "upload the ORIGINAL"), an expired one,
 * a driver without the police verification certificate. The list comes from the server (GET /vehicle-owner/document-todos), so
 * the rules are never duplicated in the app. Renders nothing when there is nothing to do.
 */
export default function DocumentTodoPrompt() {
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<TodoItem[]>([]);
  const [visible, setVisible] = useState(false);
  const busy = useRef(false);
  const [dateFor, setDateFor] = useState<TodoItem | null>(null);
  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const snoozedAt = parseInt((await AsyncStorage.getItem(SNOOZE_KEY)) || '0', 10) || 0;
      if (Date.now() - snoozedAt < SNOOZE_MS) return;
      const res = await axiosInstance.get('/api/users/vehicle-owner/document-todos');
      const list: TodoItem[] = res.data?.items || [];
      setItems(list);
      setVisible(list.length > 0);
    } catch {
      // not an owner session / offline - never block the dashboard
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 2500);          // let the dashboard (and any announcement) show first
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [load]);

  const later = async () => {
    setVisible(false);
    try { await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* shows again next open */ }
  };

  const fixNow = () => {
    setVisible(false);
    const firstCar = items.find((i) => i.kind === 'car');
    router.push((firstCar ? '/my-cars' : '/my-drivers') as any);
  };

  const refreshList = async () => {
    try {
      const res = await axiosInstance.get('/api/users/vehicle-owner/document-todos');
      const list: TodoItem[] = res.data?.items || [];
      setItems(list);
      setVisible(list.length > 0);
    } catch { /* the list is refreshed again when the app is opened next */ }
  };

  const saveDate = async () => {
    if (!dateFor) return;
    const iso = toIso(dateText);
    if (!iso) { setDateError('Type the date as day / month / year, for example 25/08/2027'); return; }
    setSavingDate(true);
    setDateError('');
    try {
      await axiosInstance.post('/api/users/vehicle-owner/document-date', { kind: dateFor.kind, entity_id: dateFor.entity_id, document: dateFor.doc_key, date: iso });
      Keyboard.dismiss();
      setDateFor(null);
      setDateText('');
      await refreshList();
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setDateError(typeof d === 'string' ? d : 'Could not save the date. Please check it and try again.');
    } finally {
      setSavingDate(false);
    }
  };

  if (!visible || items.length === 0) return null;
  const bad = items.some((i) => i.severity === 'bad');
  const isRc = dateFor?.doc_key === 'rc';

  return (
    <>
      <Modal visible={!dateFor} transparent animationType="fade" onRequestClose={later}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, maxHeight: '82%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {bad ? <AlertTriangle size={20} color="#DC2626" /> : <FileWarning size={20} color="#D97706" />}
              <Text style={{ flex: 1, fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>
                {items.length} document {items.length === 1 ? 'item needs' : 'items need'} your attention
              </Text>
            </View>
            <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 10 }}>
              Keep your documents current so your cars and drivers stay Active and you keep getting bookings.
            </Text>
            <ScrollView style={{ marginBottom: 12 }}>
              {items.map((it, idx) => (
                <View
                  key={`${it.entity_id}-${it.document}-${idx}`}
                  style={{
                    borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8,
                    borderColor: it.severity === 'bad' ? '#FCA5A5' : '#FCD34D',
                    backgroundColor: it.severity === 'bad' ? '#FEF2F2' : '#FFFBEB',
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#111827' }}>{it.entity_name} - {it.document}</Text>
                  <Text style={{ fontSize: 12.5, color: it.severity === 'bad' ? '#B91C1C' : '#92400E', marginTop: 2 }}>{it.problem}</Text>
                  <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{it.action}</Text>
                  {it.fix === 'date' && !!it.doc_key && (
                    <TouchableOpacity
                      onPress={() => { setDateFor(it); setDateText(''); setDateError(''); }}
                      style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 13 }}>Enter the date</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={later} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold' }}>Remind me later</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={fixNow} style={{ flex: 1.2, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold' }}>Fix now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Type the date printed on a document that is already uploaded - no new photo needed */}
      <Modal visible={!!dateFor} transparent animationType="fade" onRequestClose={() => setDateFor(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }}>{isRc ? 'Registration date' : 'Expiry date'}</Text>
            <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2, marginBottom: 10 }}>
              {dateFor?.entity_name} - {dateFor?.document}
            </Text>
            <Text style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 8 }}>
              {isRc ? 'Type the registration date printed on the RC (day / month / year).' : 'Type the date printed on the document, the day it is valid until (day / month / year).'}
            </Text>
            <TextInput
              value={dateText}
              onChangeText={(v) => { setDateText(formatDateInput(v)); setDateError(''); }}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
              style={{ borderWidth: 1.5, borderColor: dateError ? '#DC2626' : colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: colors.text, letterSpacing: 1 }}
            />
            {!!dateError && <Text style={{ color: '#DC2626', fontSize: 12.5, marginTop: 6 }}>{dateError}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setDateFor(null); }} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveDate} disabled={savingDate} style={{ flex: 1.2, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', opacity: savingDate ? 0.7 : 1 }}>
                {savingDate ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold' }}>Save date</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
