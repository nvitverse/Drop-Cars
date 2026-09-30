import React, { useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette } from '@/constants/theme';
import { useServiceMode } from '@/contexts/ServiceModeContext';

// This screen always immediately redirects to /book/standard (the
// STANDARD/DROPBID selector UI it used to render - complete with fabricated
// stats like "14 Drivers Active Nearby" - never reached a real user; it
// only flashed on screen for one frame before the redirect fired). Kept as
// a plain redirect+spinner instead of dead UI code.
export default function TaxiEntryHubScreen() {
  const router = useRouter();
  const { isDark } = useScreenTheme();
  const palette = getPalette(isDark);
  const { setActiveMode } = useServiceMode();

  useFocusEffect(
    useCallback(() => {
      setActiveMode('TAXI');
      router.replace('/(customer)/book/standard' as any);
    }, [setActiveMode, router])
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background }}>
      <ActivityIndicator color={palette.accent} />
    </View>
  );
}
