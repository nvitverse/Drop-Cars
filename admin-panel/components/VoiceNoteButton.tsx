import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/context/ThemeContext';

interface VoiceNoteButtonProps {
  url: string;
  size?: number;
}

// Small reusable play/pause control for a remote voice-note URL (Staff
// Directives feature - Owner broadcast voice notes). Each instance owns its
// own expo-audio player instance bound to `url`, so it can be dropped into
// a list (directive feed on Staff Management, "Today's messages" card on
// the Dashboard) without instances stepping on each other's state.
export default function VoiceNoteButton({ url, size = 16 }: VoiceNoteButtonProps) {
  const { themeColors } = useTheme();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: themeColors.primary }]}
      onPress={toggle}
      accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
    >
      {!status.isLoaded ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : status.playing ? (
        <Pause size={size} color="#FFFFFF" fill="#FFFFFF" />
      ) : (
        <Play size={size} color="#FFFFFF" fill="#FFFFFF" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
