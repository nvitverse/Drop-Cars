import { useColorScheme } from 'react-native';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { colors } from '@/constants/theme';

export function useTheme() {
  const systemScheme = useColorScheme();
  const { themeMode } = useThemePreference();

  const isDark =
    themeMode === 'dark' ? true : themeMode === 'light' ? false : systemScheme === 'dark';

  return {
    colors,
    isDark,
  };
}
