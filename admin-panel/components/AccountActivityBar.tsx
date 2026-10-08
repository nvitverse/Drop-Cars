import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiService } from '@/services/api';

interface Props {
  kind: 'car' | 'driver' | 'partner' | 'vendor';
  entityId: string;
  isDark?: boolean;
}

/**
 * Active / Inactive (may work or not) and Verified (paperwork really checked) for one account - two different things.
 * Inactive is automatic while a document is expired / invalid or the rating is too low; staff can also switch an account off
 * with a reason (the owner sees the reason in the Driver App) and back on.
 */
export default function AccountActivityBar({ kind, entityId, isDark }: Props) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    try {
      setInfo(await apiService.getAccountActivity(kind, entityId));
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [kind, entityId]);

  useEffect(() => { load(); }, [load]);

  const apply = async (active: boolean, why?: string) => {
    setBusy(true);
    try {
      setInfo(await apiService.setAccountActive(kind, entityId, active, why));
      setAskReason(false);
    } catch (e: any) {
      Alert.alert('Could not change it', e?.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginVertical: 8 }} />;
  if (!info) return null;

  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#CBD5E1';
  const chip = (label: string, bg: string, fg: string) => (
    <View style={{ backgroundColor: bg, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: fg }}>{label}</Text>
    </View>
  );
  const manual = !!info.manual_inactive_reason;

  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: isDark ? '#111827' : '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {info.active ? chip('ACTIVE', '#DCFCE7', '#166534') : chip('INACTIVE', '#FEE2E2', '#B91C1C')}
        {'verified' in info && (info.verified ? chip('VERIFIED', '#DBEAFE', '#1D4ED8') : chip('NOT VERIFIED YET', isDark ? '#1E293B' : '#F1F5F9', sub))}
        <View style={{ flex: 1 }} />
        {manual || !info.active ? (
          manual ? (
            <TouchableOpacity onPress={() => apply(true)} disabled={busy} style={{ borderWidth: 1, borderColor: '#059669', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: '#059669', fontWeight: '800', fontSize: 12 }}>Switch ON</Text>
            </TouchableOpacity>
          ) : null
        ) : (
          <TouchableOpacity onPress={() => { setReason(''); setAskReason(true); }} disabled={busy} style={{ borderWidth: 1, borderColor: '#DC2626', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 12 }}>Switch OFF…</Text>
          </TouchableOpacity>
        )}
      </View>
      {!info.active && (info.inactive_reasons || []).map((r: string) => (
        <Text key={r} style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 6 }}>• {r}</Text>
      ))}
      {!!info.not_verified?.length && (
        <Text style={{ color: sub, fontSize: 12, marginTop: 6 }}>Not verified yet: {info.not_verified.join(', ')}</Text>
      )}
      {!info.active && !manual && (
        <Text style={{ color: sub, fontSize: 11.5, marginTop: 6 }}>Inactive automatically - it turns Active again once the problem above is fixed.</Text>
      )}

      <Modal visible={askReason} transparent animationType="fade" onRequestClose={() => setAskReason(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: text }}>Switch this {kind} OFF</Text>
            <Text style={{ fontSize: 12.5, color: sub, marginVertical: 6 }}>The owner is shown this reason in the Driver App.</Text>
            <TextInput
              value={reason} onChangeText={setReason} multiline placeholder="e.g. Car quality complaints - seat torn, AC not working"
              placeholderTextColor={sub}
              style={{ borderWidth: 1, borderColor: border, borderRadius: 6, padding: 10, minHeight: 70, color: text, marginBottom: 12 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setAskReason(false)} style={{ flex: 1, borderWidth: 1, borderColor: border, borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => (reason.trim().length >= 3 ? apply(false, reason.trim()) : Alert.alert('Reason needed', 'Write why you are switching it off.'))}
                disabled={busy} style={{ flex: 1.2, backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Switch OFF</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
