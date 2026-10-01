// Copy of components/chat/VoiceNote.tsx kept inside the inbox on purpose (see InboxComposer).
// WhatsApp-style voice note: play / pause, drag or tap the bar to seek,
// 1x / 1.5x / 2x speed, elapsed / total time. Only one voice note plays at a
// time - starting one pauses whichever was playing.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent, ActivityIndicator } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

type Player = ReturnType<typeof useAudioPlayer>;
let currentlyPlaying: Player | null = null;

const SPEEDS = [1, 1.5, 2];
const BARS = 28;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Stable pseudo-waveform per URL so every note has its own shape.
function waveform(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: BARS }, (_, i) => {
    h = (h * 1103515245 + 12345 + i) | 0;
    return 0.25 + (Math.abs(h) % 75) / 100;
  });
}

export default function InboxVoiceNote({ uri, mine, tint }: { uri: string; mine: boolean; tint: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);
  const [trackWidth, setTrackWidth] = useState(1);
  const bars = useRef(waveform(uri)).current;

  useEffect(() => () => {
    if (currentlyPlaying === player) currentlyPlaying = null;
  }, [player]);

  const total = status.duration || 0;
  const pos = Math.min(status.currentTime || 0, total || Infinity);
  const pct = total > 0 ? pos / total : 0;
  const loading = !status.isLoaded;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch {}
    if (currentlyPlaying && currentlyPlaying !== player) {
      try { currentlyPlaying.pause(); } catch {}
    }
    currentlyPlaying = player;
    if (status.didJustFinish || (total > 0 && pos >= total - 0.05)) {
      await player.seekTo(0);
    }
    player.setPlaybackRate(speed);
    player.play();
  };

  const seekFromEvent = (e: GestureResponderEvent) => {
    if (!total) return;
    const x = Math.max(0, Math.min(e.nativeEvent.locationX, trackWidth));
    player.seekTo((x / trackWidth) * total);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    player.setPlaybackRate(next);
  };

  const fg = mine ? '#FFFFFF' : tint;
  const dim = mine ? 'rgba(255,255,255,0.4)' : 'rgba(100,116,139,0.35)';

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={toggle}
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        style={[styles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : `${tint}22` }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : status.playing ? (
          <Pause size={16} color={fg} fill={fg} />
        ) : (
          <Play size={16} color={fg} fill={fg} />
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View
          style={styles.wave}
          onLayout={(e) => setTrackWidth(Math.max(1, e.nativeEvent.layout.width))}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={seekFromEvent}
          onResponderMove={seekFromEvent}
          accessibilityLabel="Seek voice message"
        >
          {bars.map((h, i) => (
            <View
              key={i}
              style={[styles.bar, { height: 4 + h * 18, backgroundColor: i / BARS <= pct ? fg : dim }]}
            />
          ))}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: mine ? 'rgba(255,255,255,0.85)' : '#64748B' }]}>
            {status.playing || pos > 0 ? `${fmt(pos)} / ${fmt(total)}` : fmt(total)}
          </Text>
          <TouchableOpacity onPress={cycleSpeed} accessibilityLabel="Playback speed" style={[styles.speed, { borderColor: dim }]}>
            <Text style={[styles.speedText, { color: fg }]}>{speed}x</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingVertical: 2 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 26 },
  bar: { flex: 1, borderRadius: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  time: { fontSize: 10.5, fontFamily: 'Inter-Medium' },
  speed: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  speedText: { fontSize: 10, fontFamily: 'Inter-Bold' },
});
