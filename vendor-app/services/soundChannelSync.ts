// Admin-uploaded notification MP3s that play even when the Vendor App is
// closed. GET /notification-sounds?app=vendor -> the native SoundChannels
// module creates one Android channel per MP3 -> report them to the backend so
// pushes to this phone use them. Runs once per app start (tabs mounted).
// No-op on builds without the native module.
import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import api from '../app/api/api';

type SoundEntry = { event_key: string; label: string; sound_url: string; channel_id: string; urgent?: boolean };

const SoundChannels: undefined | {
  ensureChannel(id: string, name: string, url: string, urgent: boolean): Promise<boolean>;
  listChannels(): Promise<string[]>;
  deleteChannel(id: string): Promise<boolean>;
} = (NativeModules as any).SoundChannels;

let running: Promise<void> | null = null;

export function syncNotificationSounds(): Promise<void> {
  if (Platform.OS !== 'android' || !SoundChannels) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pushToken = (await Notifications.getExpoPushTokenAsync()).data;
      const res = await api.get('/notification-sounds', { params: { app: 'vendor' } });
      const made: Record<string, string> = {};
      for (const s of (res.data?.sounds ?? []) as SoundEntry[]) {
        try {
          if (await SoundChannels.ensureChannel(s.channel_id, `Drop Cars - ${s.label}`, s.sound_url, !!s.urgent)) {
            made[s.event_key] = s.channel_id;
          }
        } catch (e: any) {
          console.warn(`Notification sound for "${s.label}" not set up:`, e?.message || e);
        }
      }
      const keep = new Set(Object.values(made));
      for (const id of await SoundChannels.listChannels()) {
        if (!keep.has(id)) await SoundChannels.deleteChannel(id);
      }
      await api.post('/notification-sounds/device-channels', { token: pushToken, channels: made });
    } catch (e: any) {
      console.warn('Notification sound sync skipped:', e?.message || e);
    } finally {
      running = null;
    }
  })();
  return running;
}
