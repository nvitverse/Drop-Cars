import { useScreenTheme } from '@/components/SafeArea';
import { colors as brand } from '@/constants/theme';

// The help components (components/help/*) read the theme through this one hook; it follows the same light/dark choice as every screen.
const light = { primary: brand.primary, background: brand.background, surface: brand.surface, border: brand.border, text: '#0F172A', textSecondary: brand.textSecondary };
const dark = { primary: '#818CF8', background: '#0B1220', surface: '#111827', border: '#1F2937', text: '#F1F5F9', textSecondary: '#94A3B8' };

export function useTheme() {
  const { isDark } = useScreenTheme();
  return { isDark, colors: isDark ? dark : light };
}
