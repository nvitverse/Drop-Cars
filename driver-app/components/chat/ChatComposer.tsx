// WhatsApp-style chat composer.
//
//  - Type and send like normal (send button appears when there is text).
//  - Mic: HOLD to record, release to send.
//      slide LEFT  -> cancel (nothing is sent)
//      slide UP    -> lock: keeps recording hands-free; then pause/resume,
//                     delete, or send.
//  - A live level meter and timer while recording.
//  - "Replying to ..." strip when the user picked Reply on a message.
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, PanResponder, Animated, Alert, ActivityIndicator, Vibration,
} from 'react-native';
import { Send, Mic, Lock, Trash2, Pause, Play, X, ChevronLeft, ChevronUp } from 'lucide-react-native';
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';

export interface ReplyTarget {
  id: number | string;
  text: string;
  senderName?: string;
  kind?: string;
}

interface Props {
  colors: any;
  placeholder?: string;
  disabled?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  onSendText: (text: string) => Promise<void> | void;
  /** Omit to hide the mic (e.g. chats that can't take voice). */
  onSendVoice?: (uri: string, durationMs: number) => Promise<void> | void;
  /** e.g. a "+" button that opens the quick-questions sheet */
  leftAccessory?: React.ReactNode;
}

type Mode = 'idle' | 'holding' | 'locked';

const CANCEL_DX = -110;
const LOCK_DY = -70;
const MIN_MS = 700;

const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function ChatComposer({
  colors, placeholder = 'Message', disabled, replyTo, onCancelReply, onSendText, onSendVoice, leftAccessory,
}: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dx, setDx] = useState(0);

  const recorder = useAudioRecorder(RECORDING);
  const rec = useAudioRecorderState(recorder, 120);

  const modeRef = useRef<Mode>('idle');
  // The PanResponder is created once; it reads the latest values via refs.
  const durationRef = useRef(0);
  durationRef.current = rec.durationMillis || 0;
  const finishRef = useRef<(send: boolean) => void>(() => {});
  const startPromise = useRef<Promise<boolean> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };

  useEffect(() => {
    if (mode === 'idle') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mode, pulse]);

  const startRecording = async (): Promise<boolean> => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to send voice messages.');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Vibration.vibrate(30);
      return true;
    } catch {
      Alert.alert('Could not record', 'Please try again.');
      return false;
    }
  };

  const stopRecording = async (): Promise<{ uri: string | null; ms: number }> => {
    const ms = durationRef.current;
    try {
      await recorder.stop();
    } catch {}
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
    return { uri: recorder.uri, ms };
  };

  const finish = async (send: boolean) => {
    const started = await (startPromise.current || Promise.resolve(false));
    startPromise.current = null;
    setModeBoth('idle');
    setPaused(false);
    setDx(0);
    if (!started) return;
    const { uri, ms } = await stopRecording();
    if (!send) {
      Vibration.vibrate(20);
      return;
    }
    if (!uri || ms < MIN_MS) {
      Alert.alert('Hold to record', 'Hold the mic to record and release to send.');
      return;
    }
    if (!onSendVoice) return;
    setBusy(true);
    try {
      await onSendVoice(uri, ms);
    } finally {
      setBusy(false);
    }
  };

  finishRef.current = finish;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (modeRef.current !== 'idle') return;
        setModeBoth('holding');
        startPromise.current = startRecording().then((ok) => {
          if (!ok) setModeBoth('idle');
          return ok;
        });
      },
      onPanResponderMove: (_e, g) => {
        if (modeRef.current !== 'holding') return;
        setDx(Math.min(0, g.dx));
        if (g.dy < LOCK_DY) {
          setModeBoth('locked');
          setDx(0);
          Vibration.vibrate(25);
        } else if (g.dx < CANCEL_DX) {
          finishRef.current(false);
        }
      },
      onPanResponderRelease: () => {
        if (modeRef.current === 'holding') finishRef.current(true);
      },
      onPanResponderTerminate: () => {
        if (modeRef.current === 'holding') finishRef.current(false);
      },
    })
  ).current;

  const togglePause = () => {
    try {
      if (paused) {
        recorder.record();
        setPaused(false);
      } else {
        recorder.pause();
        setPaused(true);
      }
    } catch {}
  };

  const sendText = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setText('');
    try {
      await onSendText(t);
    } finally {
      setBusy(false);
    }
  };

  // metering: roughly -60 (silence) .. 0 dB (loud)
  const level = Math.max(0.08, Math.min(1, ((rec.metering ?? -60) + 60) / 60));

  return (
    <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
      {!!replyTo && mode === 'idle' && (
        <View style={[styles.replyStrip, { borderLeftColor: colors.primary, backgroundColor: colors.background }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Inter-Bold' }}>
              Replying to {replyTo.senderName || 'message'}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12.5 }}>
              {replyTo.kind === 'VOICE' ? '🎤 Voice message' : replyTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} accessibilityLabel="Cancel reply" style={{ padding: 6 }}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {mode === 'locked' ? (
        <View style={styles.lockedBar}>
          <TouchableOpacity onPress={() => finish(false)} accessibilityLabel="Delete recording" style={styles.iconBtn}>
            <Trash2 size={22} color="#EF4444" />
          </TouchableOpacity>
          <Animated.View style={[styles.recDot, { opacity: paused ? 1 : pulse }]} />
          <Text style={[styles.timer, { color: colors.text }]}>{fmt(rec.durationMillis || 0)}</Text>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${Math.round(level * 100)}%`, backgroundColor: paused ? colors.textSecondary : colors.primary }]} />
          </View>
          <TouchableOpacity onPress={togglePause} accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'} style={styles.iconBtn}>
            {paused ? <Play size={22} color={colors.primary} /> : <Pause size={22} color={colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(true)} accessibilityLabel="Send voice message" style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
            {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.row}>
          {mode === 'holding' ? (
            <View style={[styles.holdingBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Animated.View style={[styles.recDot, { opacity: pulse }]} />
              <Text style={[styles.timer, { color: colors.text }]}>{fmt(rec.durationMillis || 0)}</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: dx / 2 }] }}>
                <ChevronLeft size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Slide to cancel</Text>
              </View>
            </View>
          ) : (
            <>
              {leftAccessory}
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={1000}
                editable={!disabled}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            </>
          )}

          {text.trim() || !onSendVoice ? (
            <TouchableOpacity
              disabled={disabled || busy || !text.trim()}
              onPress={sendText}
              accessibilityLabel="Send message"
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: disabled || !text.trim() ? 0.5 : 1 }]}
            >
              {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          ) : (
            <View>
              {mode === 'holding' && (
                <View style={[styles.lockHint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Lock size={14} color={colors.textSecondary} />
                  <ChevronUp size={14} color={colors.textSecondary} />
                </View>
              )}
              <View
                {...(disabled ? {} : pan.panHandlers)}
                accessibilityLabel="Hold to record a voice message"
                style={[styles.micBtn, { backgroundColor: mode === 'holding' ? '#EF4444' : colors.primary, transform: [{ scale: mode === 'holding' ? 1.25 : 1 }] }]}
              >
                {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Mic size={20} color="#FFFFFF" />}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: { flex: 1, maxHeight: 110, minHeight: 42, borderWidth: 1, borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lockHint: { position: 'absolute', bottom: 62, left: 6, width: 32, paddingVertical: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 2 },
  holdingBar: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  lockedBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { padding: 6 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  timer: { fontSize: 15, fontFamily: 'Inter-Bold', minWidth: 44 },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(148,163,184,0.3)', overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  replyStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 4, borderRadius: 8 },
});
