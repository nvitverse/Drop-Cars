import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiService } from '@/services/api';

interface Props {
  documentId: string;            // 'car_<id>_<type>' or 'account_<type>'
  accountId?: string;
  accountType?: string;
  documentName?: string;
  isDark?: boolean;
}

const SUGGESTIONS = ['Karnataka', 'Kerala', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Puducherry', 'Maharashtra'];

/**
 * "Take this as a model": after staff approved a document by hand, save it as the reference for that kind of document
 * (one per state / format). The next uploads that look like it - same kind, colours and layout - are verified automatically.
 * Also lists / removes the models already saved.
 */
export default function UseAsModelButton({ documentId, accountId, accountType, documentName, isDark }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<any[]>([]);

  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#CBD5E1';

  const show = async () => {
    setLabel('');
    setOpen(true);
    try { setModels(await apiService.listDocumentModels()); } catch { setModels([]); }
  };

  const save = async () => {
    if (label.trim().length < 3) return Alert.alert('Name the model', 'e.g. "Karnataka RC" - so you can tell the models apart.');
    setBusy(true);
    try {
      const res = await apiService.saveDocumentModel({ document_id: documentId, account_id: accountId, account_type: accountType, label: label.trim() });
      Alert.alert('Model saved', res?.message || 'Saved.');
      setModels(await apiService.listDocumentModels());
      setLabel('');
    } catch (e: any) {
      Alert.alert('Could not save the model', e?.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const remove = (m: any) => {
    Alert.alert('Remove model?', `"${m.label}" will no longer verify documents automatically.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { try { await apiService.deleteDocumentModel(m.id); setModels(await apiService.listDocumentModels()); } catch (e: any) { Alert.alert('Failed', e?.message || ''); } } },
    ]);
  };

  return (
    <>
      <TouchableOpacity onPress={show} style={{ alignSelf: 'flex-start', marginBottom: 8, borderWidth: 1, borderColor: '#0D47A1', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ color: '#0D47A1', fontWeight: '800', fontSize: 12 }}>⭐ Take this as a model</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderRadius: 12, padding: 16, maxHeight: '85%' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: text }}>Take this as a model</Text>
            <Text style={{ fontSize: 12.5, color: sub, marginVertical: 6, lineHeight: 18 }}>
              {documentName ? `"${documentName}" is approved. ` : ''}Documents of the same kind that look like this one (colours and layout) will be verified automatically from now on.
              Save one model for each state / format.
            </Text>
            <TextInput
              value={label} onChangeText={setLabel} placeholder="Name, e.g. Karnataka RC" placeholderTextColor={sub}
              style={{ borderWidth: 1, borderColor: border, borderRadius: 6, padding: 10, color: text, marginBottom: 8 }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} onPress={() => setLabel(`${s} ${(documentName || '').replace(/ - .*/, '')}`.trim())}
                  style={{ borderWidth: 1, borderColor: border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6 }}>
                  <Text style={{ color: text, fontSize: 12 }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {models.length > 0 && (
              <ScrollView style={{ maxHeight: 150, marginBottom: 10 }}>
                <Text style={{ color: sub, fontSize: 11.5, fontWeight: '700', marginBottom: 4 }}>SAVED MODELS</Text>
                {models.map((m) => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ flex: 1, color: text, fontSize: 12.5 }}>{m.label} · {m.doc_kind.toUpperCase()} · used {m.match_count}x</Text>
                    <TouchableOpacity onPress={() => remove(m)}><Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Remove</Text></TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ flex: 1, borderWidth: 1, borderColor: border, borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: text, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} disabled={busy} style={{ flex: 1.3, backgroundColor: '#0D47A1', borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Save as model</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
