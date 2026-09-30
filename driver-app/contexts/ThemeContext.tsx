import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing as canonicalSpacing, radius as canonicalRadius } from '../constants/theme';

const THEME_STORAGE_KEY = 'themeMode';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  colors: {
    background: string;
    surface: string;
    primary: string;
    primaryDark: string;
    primaryLight: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    danger: string;
  };
  spacing: typeof canonicalSpacing;
  radius: typeof canonicalRadius;
  tints: {
    primaryTint: string;
    successTint: string;
    warningTint: string;
    dangerTint: string;
  };
}

const lightColors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',
};

const darkColors = {
  background: '#111827',
  surface: '#1F2937',
  primary: '#818CF8',
  primaryDark: '#6366F1',
  primaryLight: '#A5B4FC',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  border: '#374151',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  danger: '#F87171',
};

const tints = {
  primaryTint: '#EEF2FF',
  successTint: '#F0FDF4',
  warningTint: '#FFFBEB',
  dangerTint: '#FEE2E2',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Restore the saved theme choice on launch (defaults to light if none saved).
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark') setIsDarkMode(true);
        else if (saved === 'light') setIsDarkMode(false);
      } catch {
        // Ignore storage errors; keep the default light theme.
      }
    })();
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        toggleTheme,
        colors,
        spacing: canonicalSpacing,
        radius: canonicalRadius,
        tints,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}