import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
}

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

  if (!visible || items.length === 0) return null;
  const bad = items.some((i) => i.severity === 'bad');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
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
  );
}
