import { Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';

let audioCtx: any = null;
let alarmInterval: any = null;
let isRinging = false;
let safetyTimeout: any = null;

let alarmsAllowed = true;

// Phone (Android / iOS): the alarm used to be vibration only - the siren was written for the web build and never played a sound
// on a real phone, so enquiry / booking alarms were silent. A bundled siren file now loops until the alarm is stopped.
let nativePlayer: any = null;

function startNativeSiren() {
  if (Platform.OS === 'web' || nativePlayer) return;
  try {
    nativePlayer = createAudioPlayer(require('../assets/sounds/alarm_siren.wav'));
    nativePlayer.loop = true;
    nativePlayer.volume = 1.0;
    nativePlayer.play();
  } catch (e) {
    nativePlayer = null;
    console.warn('Alarm siren could not start:', e);
  }
}

function stopNativeSiren() {
  if (!nativePlayer) return;
  try {
    nativePlayer.pause();
    nativePlayer.remove?.();
  } catch (e) {}
  nativePlayer = null;
}

export function setAlarmsAllowed(allowed: boolean) {
  alarmsAllowed = allowed;
  if (!allowed) {
    forceStopAlarmSound();
  }
}

export function areAlarmsAllowed(): boolean {
  return alarmsAllowed;
}

// Reference-counted by caller (e.g. 'enquiry', 'booking')
const activeSources = new Set<string>();

const MAX_CONTINUOUS_RING_MS = 90000;

// Helper to detect if user screen is OFF, app is backgrounded, or tab is hidden
export function isScreenOffOrBackground(): boolean {
  if (AppState.currentState !== 'active') {
    return true;
  }
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    if (document.hidden || document.visibilityState === 'hidden') {
      return true;
    }
  }
  return false;
}

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

export function unlockAudioContext() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch {}
  }
}

// Web Audio user-interaction unlock listener setup
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  ['click', 'touchstart', 'keydown', 'pointerdown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudioContext, { once: false, passive: true });
  });
}

// Adaptive notification chime:
// - Screen ON: Soft & gentle chime (0.16 volume) so staff is not startled/annoyed
// - Screen OFF / Background: Louder & dual-burst chime (0.60 volume) so staff hears from distance/pocket
export function playMildNotificationSound(forceLoud?: boolean) {
  const isOffOrBg = forceLoud ?? isScreenOffOrBackground();

  try {
    if (isOffOrBg) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (e) {}

  // Phones: play the chime for real (before this the phone only vibrated; the synthesised chime below is web-only).
  if (Platform.OS !== 'web') {
    try {
      const chime: any = createAudioPlayer(require('../assets/sounds/notify_chime.wav'));
      chime.volume = isOffOrBg ? 1.0 : 0.4;
      chime.play();
      setTimeout(() => { try { chime.remove?.(); } catch (e) {} }, 3000);
    } catch (e) {}
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      const playTone = () => {
        try {
          const now = audioCtx.currentTime;
          // Dynamic volume based on screen state
          const baseGain1 = isOffOrBg ? 0.55 : 0.16;
          const baseGain2 = isOffOrBg ? 0.65 : 0.20;

          // Note 1: E5 (659.25 Hz)
          const osc1 = audioCtx.createOscillator();
          const gain1 = audioCtx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(659.25, now);
          gain1.gain.setValueAtTime(baseGain1, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + (isOffOrBg ? 0.55 : 0.40));
          osc1.connect(gain1);
          gain1.connect(audioCtx.destination);
          osc1.start(now);
          osc1.stop(now + (isOffOrBg ? 0.55 : 0.40));

          // Note 2: A5 (880 Hz) (Chime sustain)
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880, now + 0.22);
          gain2.gain.setValueAtTime(baseGain2, now + 0.22);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + (isOffOrBg ? 2.2 : 1.5));
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start(now + 0.22);
          osc2.stop(now + (isOffOrBg ? 2.2 : 1.5));

          // If screen is OFF / background tab, play second confirmation note so it carries through
          if (isOffOrBg) {
            const now2 = now + 0.65;
            const osc3 = audioCtx.createOscillator();
            const gain3 = audioCtx.createGain();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(987.77, now2); // B5 note
            gain3.gain.setValueAtTime(0.50, now2);
            gain3.gain.exponentialRampToValueAtTime(0.001, now2 + 1.2);
            osc3.connect(gain3);
            gain3.connect(audioCtx.destination);
            osc3.start(now2);
            osc3.stop(now2 + 1.2);
          }
        } catch {}
      };

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(playTone).catch(() => {});
      } else {
        playTone();
      }
    } catch (e) {}
  }
}

// Dual-tone emergency alarm synthesizer with screen-adaptive volume
export function playAlarmSound(source: string = 'default') {
  if (!alarmsAllowed) return;
  activeSources.add(source);
  if (isRinging) return;
  isRinging = true;

  ensureAudioMode();
  unlockAudioContext();

  safetyTimeout = setTimeout(() => {
    console.warn('Alarm sound force-stopped by MAX_CONTINUOUS_RING_MS safety backstop.');
    forceStopAlarmSound();
  }, MAX_CONTINUOUS_RING_MS);

  // Haptic feedback on supported native devices
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (e) {}

  startNativeSiren();

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }

        const triggerBeepPair = () => {
          if (!isRinging || !audioCtx) return;

          if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
              if (isRinging && audioCtx && audioCtx.state === 'running') {
                triggerBeepPair();
              }
            }).catch(() => {});
            return;
          }

          if (audioCtx.state !== 'running') return;

          try {
            const now = audioCtx.currentTime;
            const isOffOrBg = isScreenOffOrBackground();
            // Adaptive volume: Low (0.16) if user looking at screen, Loud (0.45) if screen OFF/background
            const tone1Gain = isOffOrBg ? 0.45 : 0.16;
            const tone2Gain = isOffOrBg ? 0.35 : 0.12;

            // Tone 1: High pitch siren (920 Hz)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(920, now);
            gain1.gain.setValueAtTime(tone1Gain, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // Tone 2: Secondary siren tone (700 Hz)
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(700, now + 0.15);
            gain2.gain.setValueAtTime(tone2Gain, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
          } catch (err) {}
        };

        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            if (isRinging) triggerBeepPair();
          }).catch(() => {});
        } else {
          triggerBeepPair();
        }

        alarmInterval = setInterval(() => {
          if (isRinging) {
            triggerBeepPair();
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } catch (e) {}
          } else {
            clearInterval(alarmInterval);
          }
        }, 750);
      }
    } catch (e) {
      console.warn('Alarm Audio Context initialization error:', e);
    }
  }
}

function hardStop() {
  isRinging = false;
  stopNativeSiren();
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
