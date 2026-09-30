/**
 * Drop Cars Design Tokens & Motion Specs
 * Inspired by modern driver cockpits (Uber Driver, Grab, Lyft)
 * Tailored for glanceability at arm's length on car dashboard mounts.
 */

export const DesignTokens = {
  colors: {
    // Brand Electric Primary
    primary: '#4F46E5',         // Indigo Primary
    primaryLight: '#6366F1',    // Vibrant Accent
    primaryDark: '#3730A3',     // Deep Contrast
    primaryGlow: 'rgba(79, 70, 229, 0.15)',

    // Cyber AI & Intelligence Core (DropBot)
    cyberViolet: '#7C3AED',
    cyberCyan: '#06B6D4',
    cyberGlow: 'rgba(124, 58, 237, 0.2)',

    // Operations & Dispatch Desk
    dispatchBlue: '#2563EB',
    dispatchTint: '#EFF6FF',
    dispatchDarkTint: 'rgba(37, 99, 235, 0.15)',

    // Financials & Success
    emeraldSuccess: '#10B981',
    emeraldDark: '#059669',
    emeraldTint: '#ECFDF5',
    emeraldDarkTint: 'rgba(16, 185, 129, 0.15)',

    // Urgent Alerts & Countdown (HUD / Penalties)
    amberWarning: '#F59E0B',
    amberTint: '#FFFBEB',
    crimsonDanger: '#EF4444',
    crimsonTint: '#FEF2F2',

    // Dark Mode Surfaces (OLED Pure Blacks & Deep Slate)
    darkBg: '#090D16',          // Deepest Cyber Navy
    darkSurface: '#111827',     // Card Surface
    darkElevated: '#1F2937',    // Floating Sheet Surface
    darkBorder: 'rgba(255, 255, 255, 0.08)',
    darkBorderHighlight: 'rgba(255, 255, 255, 0.15)',

    // Light Mode Surfaces
    lightBg: '#F8FAFC',
    lightSurface: '#FFFFFF',
    lightElevated: '#FFFFFF',
    lightBorder: '#E2E8F0',
    lightBorderHighlight: '#CBD5E1',
  },
  typography: {
    hero: { fontSize: 24, fontFamily: 'Inter-Bold', lineHeight: 30 },
    title: { fontSize: 18, fontFamily: 'Inter-Bold', lineHeight: 24 },
    subtitle: { fontSize: 14, fontFamily: 'Inter-SemiBold', lineHeight: 20 },
    body: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
    caption: { fontSize: 11, fontFamily: 'Inter-Medium', lineHeight: 14 },
    monoRate: { fontSize: 18, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
    cockpitFare: { fontSize: 26, fontFamily: 'Inter-Bold', letterSpacing: -0.5 },
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 8,
    },
    glow: (color: string) => ({
      shadowColor: color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    }),
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 22,
    sheet: 28,
    pill: 999,
  },
  spring: {
    damping: 18,
    stiffness: 140,
    mass: 1,
  },
} as const;

export default DesignTokens;
