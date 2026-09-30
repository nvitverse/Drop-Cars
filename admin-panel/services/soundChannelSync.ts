// Admin-uploaded notification MP3s that play even when the Admin App is
// closed. Same design as the Driver App (see its soundChannelSync.ts):
// GET /notification-sounds?app=admin -> create one Android channel per MP3
// with the native SoundChannels module -> report them to the backend so
// pushes to this phone use them. No-op on builds without the native module.
import { NativeModules, Platform } from 'react-native';
import { apiService } from './api';

type SoundEntry = { event_key: string; label: string; sound_url: string; channel_id: string; urgent?: boolean };

const SoundChannels: undefined | {
  ensureChannel(id: string, name: string, url: string, urgent: boolean): Promise<boolean>;
  listChannels(): Promise<string[]>;
  deleteChannel(id: string): Promise<boolean>;
} = (NativeModules as any).SoundChannels;

let running: Promise<void> | null = null;

export function syncNotificationSounds(pushToken: string | null): Promise<void> {
  if (Platform.OS !== 'android' || !SoundChannels || !pushToken) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const res = await apiService.makeRequest<{ sounds: SoundEntry[] }>('/notification-sounds?app=admin');
      const made: Record<string, string> = {};
      for (const s of res?.sounds ?? []) {
        try {
          if (await SoundChannels.ensureChannel(s.channel_id, `Drop Cars Admin - ${s.label}`, s.sound_url, !!s.urgent)) {
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
      await apiService.makeRequest('/notification-sounds/device-channels', {
        method: 'POST',
        body: JSON.stringify({ token: pushToken, channels: made }),
      });
    } catch (e: any) {
      console.warn('Notification sound sync skipped:', e?.message || e);
    } finally {
      running = null;
    }
  })();
  return running;
}
