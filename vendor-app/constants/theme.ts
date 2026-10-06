// Shared design tokens for the Vendor App.
//
// Canonical brand gradient is the indigo -> purple pair used on the main
// dashboard header (app/(tabs)/index.tsx). Other screens previously invented
// their own header gradients (teal, navy/purple, blue, etc.) - new/updated
// screens should reference `gradients.primary` instead of hardcoding colors
// so the app reads as one consistent brand.

export const colors = {
  // Primary Brand Palette
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',
  secondary: '#8B5CF6',

  // Semantic Palette
  success: '#10B981',
  successDark: '#059669',
  warning: '#F59E0B',
  warningDark: '#D97706',
  danger: '#EF4444',
  dangerDark: '#DC2626',
  error: '#EF4444',
  info: '#3B82F6',

  // Text
  textPrimary: '#1F2937',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E5E7EB',

  // Semantic Tints
  primaryTint: '#EEF2FF',
  successTint: '#F0FDF4',
  warningTint: '#FFFBEB',
  dangerTint: '#FEE2E2',
};

export const gradients = {
  primary: ['#6366F1', '#8B5CF6'] as const,
};

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
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: 'bold' as const },
  h2: { fontSize: 24, fontWeight: 'bold' as const },
  h3: { fontSize: 20, fontWeight: 'bold' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
};

const theme = { colors, gradients, spacing, radius, typography };

export default theme;
