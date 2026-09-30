// Shared design tokens for the admin app (Prompt 11 - High-End Premium Theme).
// Consolidates colors, typography, elevations, and radii across all screens.

export const colors = {
  // Primary Brand Palette
  primary: '#4338CA',
  primaryDark: '#312E81',
  primaryLight: '#6366F1',

  // Semantic Palette
  success: '#12A150',
  successDark: '#0E7A3D',
  warning: '#D98A00',
  warningDark: '#B26F00',
  danger: '#E5484D',
  dangerDark: '#C7383D',
  error: '#E5484D',
  info: '#2F6FED',

  // Text
  text: '#0E1320',
  textPrimary: '#0E1320',
  textSecondary: '#5B657A',
  textMuted: '#8A94A8',

  // Surfaces & Ground
  background: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFD',
  border: '#E4E8F0',

  // Semantic Tints (12-14% alpha equivalent)
  primaryTint: '#EEF0FF',
  successTint: '#E7F7ED',
  warningTint: '#FEF4E2',
  dangerTint: '#FDECEC',
  errorTint: '#FDECEC',
  infoTint: '#EAF1FD',
};

export type ColorToken = keyof typeof colors;

export const radii = {
  xs: 3,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  pill: 999,
} as const;

export const radius = radii;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  display: { fontSize: 26, fontFamily: 'Inter-ExtraBold' as const, fontVariant: ['tabular-nums'] as any },
  hero: { fontSize: 24, fontFamily: 'Inter-ExtraBold' as const, fontVariant: ['tabular-nums'] as any },
  title: { fontSize: 18, fontFamily: 'Inter-Bold' as const },
  sectionLabel: { fontSize: 11, fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  body: { fontSize: 14, fontWeight: '500' as const },
  rowTitle: { fontSize: 14.5, fontWeight: '600' as const },
  label: { fontSize: 12, fontWeight: '700' as const },
  caption: { fontSize: 11.5, fontWeight: '600' as const },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
