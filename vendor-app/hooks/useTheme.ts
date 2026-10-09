import { colors } from '@/constants/theme';

// The Vendor App is light-only today; the help components read the theme through this one hook so dark mode can be added in one place.
export function useTheme() {
  return { isDark: false, colors: { primary: colors.primary, background: colors.background, surface: colors.surface, border: colors.border, text: colors.text, textSecondary: colors.textSecondary } };
}
