import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import axiosInstance from '@/app/api/axiosInstance';

/**
 * Stops an app that is too old to work properly: a blocking popup "Update required" with an Update button.
 * The server decides (platform setting min_app_build_<app>, set from the Admin App > Settings) - nothing is
 * hardcoded here. Silent when the setting is empty, when the app is new enough, or when there is no internet.
 * Over-the-air JS updates are handled by OtaUpdateGate; this is for installed apps whose native part is outdated.
 */
export default function ForceUpdateGate({ app = 'driver' }: { app?: string }) {
  const [info, setInfo] = useState<{ message: string; url: string | null } | null>(null);
  const lastCheck = useRef(0);

  useEffect(() => {
    const check = async () => {
      if (Date.now() - lastCheck.current < 5 * 60 * 1000) return;
      lastCheck.current = Date.now();
      try {
        const build = parseInt(String((Constants as any).nativeBuildVersion || ''), 10);
        if (isNaN(build)) return;   // not a real installed build (dev / web) - nothing to compare
        const res = await axiosInstance.get(`/api/app-updates/${app}/version-check`, { params: { build } });
        if (res.data?.force_update) setInfo({ message: res.data.message, url: res.data.download_url || null });
        else setInfo(null);
      } catch {
        // offline / server busy - never block the app because of that
      }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [app]);

  if (!info) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8 }}>Update required</Text>
          <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20, marginBottom: 16 }}>{info.message}</Text>
          <TouchableOpacity
            onPress={() => { if (info.url) Linking.openURL(info.url).catch(() => {}); }}
            style={{ backgroundColor: '#0EA5E9', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{info.url ? 'Update now' : 'Please update the app'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
