/**
 * Shared design system for the Drop Cars Customer App.
 *
 * This consolidates the two brand-blue values that had drifted apart in the
 * codebase (#3B82F6/#1E40AF used only in components/LoadingScreen.tsx and
 * app.json's adaptive icon, vs #0EA5E9/#0284C7 "sky" blue used everywhere in
 * the live screens) into a single canonical primary color. #0EA5E9/#0284C7
 * was picked because it is the value actually rendered across the real app
 * (headers, buttons, tab bar, links, etc.) - #3B82F6/#1E40AF was dead/unused
 * outside the never-rendered LoadingScreen and the adaptive icon background.
 */

export const colors = {
  // Canonical Indigo Brand Palette
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',
  primaryDeep: '#3730A3',

  // Elite brand accents (warm amber/gold reserved for active selection & primary CTA).
  accent: '#F59E0B',
  accentDark: '#D97706',
  accentLight: '#FBBF24',
  accentGlow: 'rgba(245, 158, 11, 0.18)',
  accentBorder: 'rgba(245, 158, 11, 0.4)',

  // Deep Navy Obsidian palette for hero headers & elite cards.
  navy900: '#070B12',
  navy800: '#0E1726',
  navy700: '#152238',
  navy600: '#1E2D4A',

  // Semantic colors, used consistently for status/feedback across screens.
  success: '#10B981',
  successDark: '#059669',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',
  info: '#3B82F6',

  // Semantic Tints
  primaryTint: '#EEF2FF',
  successTint: '#F0FDF4',
  warningTint: '#FFFBEB',
  dangerTint: '#FEE2E2',

  // Surfaces & Text
  background: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  white: '#FFFFFF',
  black: '#000000',
};

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  placeholder: string;
  accent: string;
  accentGlow: string;
  accentBorder: string;
  primaryBrand: string;
  primaryGlow: string;
  headerGradient: [string, string, string];
  headerText: string;
  b2bHeaderGradient: [string, string, string];
  cardBg: string;
  stepDivider: string;
}

// Neutral scale shared by both themes (Tailwind slate palette), named by role
// so screens don't hard-code hex values for the same conceptual color.
export const light: ThemePalette = {
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#E2E8F0',
  border: '#CBD5E1',
  divider: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#1E293B',
  textMuted: '#64748B',
  placeholder: '#94A3B8',
  accent: '#D97706',
  accentGlow: 'rgba(217, 119, 6, 0.14)',
  accentBorder: 'rgba(217, 119, 6, 0.4)',
  primaryBrand: '#6366F1',
  primaryGlow: 'rgba(99, 102, 241, 0.14)',
  headerGradient: ['#6366F1', '#4F46E5', '#3730A3'],
  headerText: '#FFFFFF',
  b2bHeaderGradient: ['#0F172A', '#1E293B', '#4F46E5'],
  cardBg: '#FFFFFF',
  stepDivider: 'rgba(15, 23, 42, 0.12)',
};

export const dark: ThemePalette = {
  background: '#0B0F17',
  surface: '#151D2A',
  surfaceAlt: '#0F1726',
  border: '#243247',
  divider: '#1E2A3C',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  placeholder: '#64748B',
  accent: '#F59E0B',
  accentGlow: 'rgba(245, 158, 11, 0.18)',
  accentBorder: 'rgba(245, 158, 11, 0.45)',
  primaryBrand: '#6366F1',
  primaryGlow: 'rgba(99, 102, 241, 0.18)',
  headerGradient: ['#070B12', '#0E1726', '#152238'],
  headerText: '#FFFFFF',
  b2bHeaderGradient: ['#0A192F', '#0F2942', '#1E3A5F'],
  cardBg: '#151D2A',
  stepDivider: 'rgba(255, 255, 255, 0.14)',
};

export function getPalette(isDark: boolean): ThemePalette {
  return isDark ? dark : light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 28,
  },
  fontWeight: {
    regular: '500',
    medium: '600',
    bold: '700',
    heavy: '800',
    black: '900',
  },
} as const;

export const theme = {
  colors,
  light,
  dark,
  spacing,
  radius,
  typography,
  getPalette,
};

export default theme;
