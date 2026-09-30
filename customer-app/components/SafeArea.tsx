import React from 'react';
import {
  SafeAreaView,
  Platform,
  StatusBar,
  StyleSheet,
  ScrollView,
  Text,
  View,
  ViewStyle,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPalette } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';

export function SafeArea({ style, children }: { style?: ViewStyle; children: React.ReactNode }) {
  return (
    <SafeAreaView style={[styles.safe, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    backgroundColor: '#F9FAFB',
  },
});

/**
 * Shared "isDark + safe top padding" calculation that was previously
 * copy-pasted (useColorScheme() + a manual StatusBar/inset calc) across
 * app/(customer)/index.tsx, my-trips.tsx, tariff.tsx and support.tsx.
 *
 * `overrideScheme` lets a screen with its own theme toggle (e.g. the booking
 * screen's system/light/dark selector) still resolve topPadding through the
 * same hook while deciding `isDark` itself.
 */
export function useScreenTheme(overrideScheme?: 'light' | 'dark') {
  const systemColorScheme = useColorScheme();
  const { themeMode } = useThemePreference();
  // Explicit per-screen override (e.g. book/standard.tsx's own picker) wins
  // first; then the app-wide manual choice from the dashboard's Light/Dark
  // switch; falling back to the device setting only when both are 'system'.
  const isDark = overrideScheme
    ? overrideScheme === 'dark'
    : themeMode !== 'system'
    ? themeMode === 'dark'
    : systemColorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12);
  return { systemColorScheme, isDark, topPadding };
}

interface ScreenShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
}

/**
 * Wraps the SafeAreaView + StatusBar + title header + scroll body pattern
 * that my-trips.tsx, tariff.tsx and support.tsx each duplicated identically.
 */
export function ScreenShell({ title, subtitle, children, scrollable = true, contentStyle }: ScreenShellProps) {
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = shellStyles(isDark, palette);

  const body = scrollable ? (
    <ScrollView style={[s.content, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[s.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <View style={[s.header, { paddingTop: topPadding }]}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {body}
    </SafeAreaView>
  );
}

function shellStyles(isDark: boolean, palette: ReturnType<typeof getPalette>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      padding: 20,
      // Matches each screen's original per-theme values: the dark header
      // blends into the page background with a lighter divider, while the
      // light header is a distinct white surface with a subtle border.
      backgroundColor: isDark ? palette.background : palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? palette.surface : palette.border,
    },
    title: { fontSize: 24, fontWeight: '900', color: palette.textPrimary },
    subtitle: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
    content: { flex: 1, padding: 16 },
  });
}
