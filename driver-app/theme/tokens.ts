export const colors = {
  primary: {
    main: '#1D4ED8',
    dark: '#1E3A8A',
    light: '#3B82F6',
    subtle: '#EFF6FF',
    glow: '#2563EB',
  },
  success: {
    main: '#059669',
    light: '#10B981',
    subtle: '#F0FDF4',
    border: '#A7F3D0',
  },
  warning: {
    main: '#D97706',
    light: '#F59E0B',
    subtle: '#FFFBEB',
    border: '#FDE68A',
  },
  error: {
    main: '#DC2626',
    light: '#EF4444',
    subtle: '#FEF2F2',
    border: '#FECACA',
  },
  surface: {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    darkCard: '#0F172A',
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    darkBorder: '#1E293B',
  },
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#94A3B8',
    light: '#FFFFFF',
    darkMuted: '#64748B',
  },
  brand: {
    gold: '#D97706',
    purple: '#7C3AED',
    purpleSubtle: '#F5F3FF',
  }
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  fontSizes: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;
