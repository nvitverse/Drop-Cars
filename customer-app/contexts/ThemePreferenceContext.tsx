import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// App-wide manual light/dark override. 'system' (default) follows the
// device setting like before this context existed; 'light'/'dark' pin the
// whole app to that theme regardless of device setting. Read by
// useScreenTheme() (components/SafeArea.tsx) so every screen that already
// calls that shared hook picks this up automatically - no per-screen wiring
// needed.
export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemePreferenceContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
}

const THEME_MODE_KEY = 'dropcars.themeMode';

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then(v => {
        if (v === 'light' || v === 'dark' || v === 'system') setThemeModeState(v);
      })
      .catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  }, []);

  const cycleThemeMode = useCallback(() => {
    setThemeModeState(prev => {
      const next: ThemeMode = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
      AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({ themeMode, setThemeMode, cycleThemeMode }),
    [themeMode, setThemeMode, cycleThemeMode]
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    // Safe fallback for anything rendered outside the provider tree - keeps
    // behaving like "always system" rather than crashing.
    return { themeMode: 'system', setThemeMode: () => {}, cycleThemeMode: () => {} };
  }
  return ctx;
}
