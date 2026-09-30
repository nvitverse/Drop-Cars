export const colors = {
  // Primary Brand Palette
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',

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
  text: '#1F2937',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Surfaces
  background: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#E5E7EB',

  // Semantic Tints
  primaryTint: '#EEF2FF',
  successTint: '#F0FDF4',
  warningTint: '#FFFBEB',
  dangerTint: '#FEE2E2',
  errorTint: '#FEE2E2',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const theme = {
  colors,
  radius,
  spacing,
};

export default theme;
