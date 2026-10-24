// Owner / manager: can the office actually REACH each staff member's phone? (notification permission, push token, floating bubble, battery, last time the app was opened)
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Phone, XCircle } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';

type Staff = {
  admin_id: string; name: string; role: string; phone?: string; on_duty: boolean; reachable: boolean; problems: string[];
  reported_at?: string | null; device?: string | null; app_version?: string | null; last_seen_at?: string | null;
};

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export default function StaffAlertHealth() {
  const router = useRouter();
  const { themeColors: c } = useTheme();
  const [data, setData] = useState<{ staff: Staff[]; unreachable: number; on_duty_unreachable: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiService.makeRequest('/admin/staff/alert-health')); }
    catch (e: any) { Alert.alert('Could not load', e?.message || 'Try again'); }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={[s.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><ArrowLeft size={22} color={c.text} /></TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>Staff reachability</Text>
        <View style={s.back} />
      </View>
      {!data ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#0F766E" /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <Text style={{ color: data.on_duty_unreachable ? '#DC2626' : c.textSecondary, fontSize: 13.5, lineHeight: 20, fontWeight: data.on_duty_unreachable ? '700' : '400' }}>
            {data.on_duty_unreachable
              ? `${data.on_duty_unreachable} staff member(s) are ON DUTY but their phone cannot receive alerts. Call them now.`
              : data.unreachable
                ? `${data.unreachable} staff phone(s) cannot receive alerts. None of them is on duty right now.`
                : 'Every staff phone can receive alerts.'}
          </Text>
          {data.staff.map((m) => (
            <View key={m.admin_id} style={[s.card, { backgroundColor: c.surface, borderColor: m.reachable ? c.border : '#FCA5A5' }]}>
              <View style={s.row}>
                {m.reachable ? <CheckCircle2 size={20} color="#059669" /> : <XCircle size={20} color="#DC2626" />}
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{m.name}{m.on_duty ? '  ·  ON DUTY' : ''}</Text>
                {!!m.phone && (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${m.phone}`)} style={[s.call, { borderColor: c.border }]}>
                    <Phone size={13} color={c.text} /><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>Call</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                {m.role} · phone reported {ago(m.reported_at)}{m.device ? ` · ${m.device}` : ''}{m.app_version ? ` · v${m.app_version}` : ''}
              </Text>
              {m.problems.length === 0
                ? <Text style={{ color: '#047857', fontSize: 12.5, marginTop: 6 }}>Everything is on.</Text>
                : m.problems.map((p, i) => <Text key={i} style={{ color: '#B45309', fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>• {p}</Text>)}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1 },
  back: { width: 40, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});
