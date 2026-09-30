// Admin-uploaded notification MP3s that play even when the app is closed.
//
// Android plays a notification's sound from its channel and a channel's sound
// can never change, so for every notification type that has an uploaded MP3
// the backend gives us a channel id that changes with the MP3
// (GET /api/notification-sounds). The native SoundChannels module downloads
// the MP3 and creates that channel; we then tell the backend which channels
// this phone has, and pushes to this phone are sent on them
// (POST /api/notification-sounds/device-channels). Channels of MP3s that were
// replaced or removed are deleted. Runs after every push-token registration
// (app start / login) and again when a push arrives with an MP3 this phone
// hasn't set up yet.
import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AxiosInstance } from 'axios';

type SoundEntry = { event_key: string; label: string; sound_url: string; channel_id: string; urgent?: boolean };

const SoundChannels: undefined | {
  ensureChannel(id: string, name: string, url: string, urgent: boolean): Promise<boolean>;
  listChannels(): Promise<string[]>;
  deleteChannel(id: string): Promise<boolean>;
} = (NativeModules as any).SoundChannels;

const APP = 'driver';
let lastClient: AxiosInstance | null = null;
let running: Promise<void> | null = null;
let lastRunAt = 0;

async function pushTokenIfAllowed(): Promise<string | null> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch {
    return null;
  }
}

export function syncNotificationSounds(client?: AxiosInstance | null, token?: string | null): Promise<void> {
  if (client) lastClient = client;
  const api = client || lastClient;
  if (Platform.OS !== 'android' || !SoundChannels || !api) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const res = await api.get('/api/notification-sounds', { params: { app: APP } });
      const sounds: SoundEntry[] = res.data?.sounds ?? [];
      const made: Record<string, string> = {};
      for (const s of sounds) {
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
      const pushToken = token || (await pushTokenIfAllowed());
      if (pushToken) {
        await api.post('/api/notification-sounds/device-channels', { token: pushToken, channels: made });
      }
      lastRunAt = Date.now();
    } catch (e: any) {
      console.warn('Notification sound sync skipped:', e?.message || e);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** A push carried an uploaded MP3 but not on this phone's channel yet: set it up now (at most every 2 min). */
export function syncIfPushNeedsSound(data: any): void {
  if (!data?.custom_sound_url || data?.sound_on_channel) return;
  if (Date.now() - lastRunAt < 120000) return;
  syncNotificationSounds().catch(() => {});
}
