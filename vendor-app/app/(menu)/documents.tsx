import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Image, RefreshControl } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Camera, Image as ImageIcon, CircleCheck as CheckCircle, Clock, TriangleAlert, ShieldCheck } from 'lucide-react-native';
import api from '../api/api';
import { getCurrentApiBaseUrl } from '../../config/environment';
import { pickImage, takePhoto, ImageInfo } from '../../utils/imageUtils';
import { appendFileToFormData } from '../../utils/formDataFile';

type DocState = { status: string; image_url?: string | null } | null;

// The vendor's Aadhaar: see its status, and send a new photo if the office could not read it. Only the Drop Cars team can mark it Verified.
export default function DocumentsScreen() {
  const [doc, setDoc] = useState<DocState | undefined>(undefined);   // undefined = loading, null = nothing uploaded
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ImageInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/users/vendor/document-status');
      setDoc(r.data?.documents?.aadhar || null);
    } catch (e: any) {
      setError(e?.message || 'Could not load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const choose = async (fromCamera: boolean) => {
    try {
      const img = fromCamera ? await takePhoto() : await pickImage();
      if (img) setPicked(img);
    } catch (e: any) {
      Alert.alert('Could not open the photo', e?.message || 'Please try again.');
    }
  };

  const upload = async () => {
    if (!picked) return;
    setUploading(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const fd = new FormData();
      fd.append('document_type', 'aadhar');
      await appendFileToFormData(fd, 'aadhar_image', picked.uri, picked.name, picked.type);
      const res = await fetch(`${getCurrentApiBaseUrl()}/api/users/vendor/update-document`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Upload failed. Please try again.');
      setPicked(null);
      await load();
      Alert.alert('Photo sent', 'Our team will check it. You will see the result here.');
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message || 'Please check your internet and try again.');
    } finally {
      setUploading(false);
    }
  };

  const st = String(doc?.status || '').toUpperCase();
  const view = !doc ? { Icon: TriangleAlert, c: '#B45309', bg: '#FEF3C7', t: 'Not uploaded', m: 'Please send a clear photo of the FRONT of your Aadhaar card.' }
    : st === 'VERIFIED' ? { Icon: CheckCircle, c: '#047857', bg: '#D1FAE5', t: 'Verified', m: 'Your Aadhaar is verified. Nothing more to do.' }
    : st === 'INVALID' || st === 'REJECTED' ? { Icon: TriangleAlert, c: '#B91C1C', bg: '#FEE2E2', t: 'Could not be accepted', m: 'The photo was not clear or does not match your details. Please send a new photo: all four corners visible, no glare, text readable.' }
    : { Icon: Clock, c: '#B45309', bg: '#FEF3C7', t: 'Being checked', m: 'We are checking your photo. This is usually done within a day; you can keep using the app.' };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft size={22} color="#1F2937" /></TouchableOpacity>
        <Text style={s.headerTitle}>My documents</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={s.card}><Text style={{ color: '#B91C1C', marginBottom: 10 }}>{error}</Text><TouchableOpacity style={s.btn} onPress={load}><Text style={s.btnText}>Try again</Text></TouchableOpacity></View>
        ) : doc === undefined ? (
          <View style={{ paddingVertical: 60 }}><ActivityIndicator size="large" color="#1D4ED8" /></View>
        ) : (
          <>
            <View style={s.card}>
              <View style={s.rowCenter}><ShieldCheck size={20} color="#1D4ED8" /><Text style={s.cardTitle}>Aadhaar card</Text></View>
              <View style={[s.status, { backgroundColor: view.bg }]}><view.Icon size={16} color={view.c} /><Text style={[s.statusText, { color: view.c }]}>{view.t}</Text></View>
              <Text style={s.msg}>{view.m}</Text>
              {!!doc?.image_url && !picked && <Image source={{ uri: doc.image_url }} style={s.preview} resizeMode="cover" />}
              {!!picked && <Image source={{ uri: picked.uri }} style={s.preview} resizeMode="cover" />}
            </View>

            {st !== 'VERIFIED' && (
              <View style={s.card}>
                <Text style={s.cardTitle}>{doc ? 'Send a new photo' : 'Send the photo'}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity style={[s.opt, { flex: 1 }]} onPress={() => choose(true)} activeOpacity={0.85}><Camera size={20} color="#1D4ED8" /><Text style={s.optText}>Take photo</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.opt, { flex: 1 }]} onPress={() => choose(false)} activeOpacity={0.85}><ImageIcon size={20} color="#1D4ED8" /><Text style={s.optText}>From gallery</Text></TouchableOpacity>
                </View>
                <Text style={s.tips}>Good photo: card flat on a table, all four corners visible, bright light, no flash glare, text sharp.</Text>
                <TouchableOpacity style={[s.btn, { marginTop: 14 }, (!picked || uploading) && { opacity: 0.45 }]} onPress={upload} disabled={!picked || uploading} activeOpacity={0.85}>
                  {uploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.btnText}>Send for checking</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginTop: 12 },
  statusText: { fontSize: 13, fontWeight: '800' },
  msg: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginTop: 10 },
  preview: { width: '100%', height: 190, borderRadius: 12, marginTop: 12, backgroundColor: '#E5E7EB' },
  opt: { minHeight: 56, borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', gap: 4 },
  optText: { color: '#1D4ED8', fontWeight: '800', fontSize: 13.5 },
  tips: { fontSize: 12.5, color: '#6B7280', lineHeight: 18, marginTop: 12 },
  btn: { minHeight: 50, borderRadius: 14, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
