import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync } from 'expo-audio';

let audioCtx: any = null;
let alarmInterval: any = null;
let isRinging = false;
let safetyTimeout: any = null;

// Reference-counted by caller (e.g. 'enquiry', 'booking')
const activeSources = new Set<string>();

const MAX_CONTINUOUS_RING_MS = 90000;

// Setup native audio session mode
async function ensureAudioMode() {
  if (Platform.OS !== 'web') {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
      });
    } catch (e) {}
  }
}

// Single soft "ping"
export function playMildNotificationSound() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {}

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      osc.onended = () => { try { ctx.close(); } catch (e) {} };
    } catch (e) {}
  }
}

// Dual-tone emergency alarm synthesizer
export function playAlarmSound(source: string = 'default') {
  activeSources.add(source);
  if (isRinging) return;
  isRinging = true;

  ensureAudioMode();

  safetyTimeout = setTimeout(() => {
    console.warn('Alarm sound force-stopped by MAX_CONTINUOUS_RING_MS safety backstop.');
    forceStopAlarmSound();
  }, MAX_CONTINUOUS_RING_MS);

  // Haptic feedback on supported native devices
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (e) {}

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }

        const triggerBeepPair = () => {
          if (!isRinging || !audioCtx || audioCtx.state !== 'running') return;

          try {
            const now = audioCtx.currentTime;

            // Tone 1: High pitch alarm (880 Hz)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, now);
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // Tone 2: Secondary tone (660 Hz)
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(660, now + 0.15);
            gain2.gain.setValueAtTime(0.2, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
          } catch (err) {}
        };

        triggerBeepPair();
        alarmInterval = setInterval(() => {
          if (isRinging) {
            triggerBeepPair();
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } catch (e) {}
          } else {
            clearInterval(alarmInterval);
          }
        }, 800);
      }
    } catch (e) {
      console.warn('Alarm Audio Context initialization error:', e);
    }
  }
}

function hardStop() {
  isRinging = false;
  if (safetyTimeout) {
    clearTimeout(safetyTimeout);
    safetyTimeout = null;
  }
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try {
      audioCtx.suspend();
    } catch (e) {}
  }
}

export function stopAlarmSound(source: string = 'default') {
  activeSources.delete(source);
  if (activeSources.size > 0) return;
  hardStop();
}

export function forceStopAlarmSound() {
  activeSources.clear();
  hardStop();
}
