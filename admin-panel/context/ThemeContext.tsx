import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark';

export type AccentKey = 'indigo' | 'teal' | 'rose' | 'amber' | 'graphite';

export const ACCENTS: Record<AccentKey, { label: string; light: string; lightDark: string; lightTint: string; dark: string; darkDark: string; darkTint: string }> = {
  indigo:   { label: 'Indigo',   light: '#4338CA', lightDark: '#312E81', lightTint: '#EEF0FF', dark: '#818CF8', darkDark: '#6366F1', darkTint: '#1E1B4B' },
  teal:     { label: 'Teal',     light: '#0F766E', lightDark: '#115E59', lightTint: '#E6F6F4', dark: '#2DD4BF', darkDark: '#14B8A6', darkTint: '#0B3B37' },
  rose:     { label: 'Rose',     light: '#BE123C', lightDark: '#9F1239', lightTint: '#FDECF1', dark: '#FB7185', darkDark: '#F43F5E', darkTint: '#4C0519' },
  amber:    { label: 'Amber',    light: '#B45309', lightDark: '#92400E', lightTint: '#FEF3E2', dark: '#FBBF24', darkDark: '#F59E0B', darkTint: '#451A03' },
  graphite: { label: 'Graphite', light: '#1F2937', lightDark: '#111827', lightTint: '#EDEFF2', dark: '#CBD5E1', darkDark: '#94A3B8', darkTint: '#1E293B' },
};
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  success: string;
  successLight: string;
  error: string;
  errorLight: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  border: string;
  borderLight: string;
  primaryTint: string;
  successTint: string;
  errorTint: string;
  warningTint: string;
  infoTint: string;
  cardBg: string;
  inputBg: string;
  onPrimary: string;
}

function buildColors(mode: ThemeMode, accent: AccentKey): ThemeColors {
  const a = ACCENTS[accent] || ACCENTS.indigo;
  if (mode === 'dark') {
    return {
      primary: a.dark,
      primaryDark: a.darkDark,
      primaryLight: a.darkTint,
      success: '#12A150',
      successLight: '#083D1F',
      error: '#E5484D',
      errorLight: '#431215',
      warning: '#D98A00',
      warningLight: '#402800',
      info: '#2F6FED',
      infoLight: '#0E234D',
      text: '#EAF0FF',
      textSecondary: '#9AA7C0',
      textMuted: '#66738D',
      background: '#0A0E16',
      surface: '#111826',
      surfaceAlt: '#161F30',
      surfaceRaised: '#1A2438',
      border: '#1F2A3D',
      borderLight: '#28364F',
      primaryTint: a.darkTint,
      successTint: '#083D1F',
      errorTint: '#431215',
      warningTint: '#402800',
      infoTint: '#0E234D',
      cardBg: '#111826',
      inputBg: '#0E1420',
      onPrimary: '#FFFFFF',
    };
  }
  return {
    primary: a.light,
    primaryDark: a.lightDark,
    primaryLight: a.lightTint,
    success: '#12A150',
    successLight: '#E7F7ED',
    error: '#E5484D',
    errorLight: '#FDECEC',
    warning: '#D98A00',
    warningLight: '#FEF4E2',
    info: '#2F6FED',
    infoLight: '#EAF1FD',
    text: '#0E1320',
    textSecondary: '#5B657A',
    textMuted: '#8A94A8',
    background: '#F3F5F9',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFD',
    surfaceRaised: '#FFFFFF',
    border: '#E4E8F0',
    borderLight: '#F0F3F8',
    primaryTint: a.lightTint,
    successTint: '#E7F7ED',
    errorTint: '#FDECEC',
    warningTint: '#FEF4E2',
    infoTint: '#EAF1FD',
    cardBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    onPrimary: '#FFFFFF',
  };
}

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  accent: AccentKey;
  themeColors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  setAccent: (accent: AccentKey) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  accent: 'indigo',
  themeColors: buildColors('light', 'indigo'),
  toggleTheme: () => {},
  setTheme: () => {},
  setAccent: () => {},
});

const THEME_STORAGE_KEY = '@dropcars_admin_theme';
const ACCENT_STORAGE_KEY = '@dropcars_admin_accent';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [accent, setAccentState] = useState<AccentKey>('indigo');

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedAccent] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(ACCENT_STORAGE_KEY),
        ]);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeState(savedTheme);
        }
        if (savedAccent && (ACCENT_KEYS as string[]).includes(savedAccent)) {
          setAccentState(savedAccent as AccentKey);
        }
      } catch (e) {
        // Fall back to defaults
      }
    })();
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const setAccent = (key: AccentKey) => {
    setAccentState(key);
    AsyncStorage.setItem(ACCENT_STORAGE_KEY, key).catch(() => {});
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const isDark = theme === 'dark';
  const themeColors = buildColors(theme, accent);

  return (
    <ThemeContext.Provider value={{ theme, isDark, accent, themeColors, toggleTheme, setTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
