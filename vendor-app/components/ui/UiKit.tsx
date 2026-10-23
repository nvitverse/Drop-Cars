import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { colors } from '@/constants/theme';
import { RefreshCw } from 'lucide-react-native';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  activeOpacity?: number;
}

export function Card({ children, style, onPress, activeOpacity = 0.8 }: CardProps) {
  const ContainerComp = onPress ? TouchableOpacity : View;

  return (
    <ContainerComp
      onPress={onPress}
      activeOpacity={activeOpacity}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </ContainerComp>
  );
}

export type PillVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface PillProps {
  label: string;
  variant?: PillVariant;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Pill({ label, variant = 'primary', size = 'md', style }: PillProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          bg: '#ECFDF5',
          border: '#A7F3D0',
          text: '#047857',
        };
      case 'warning':
        return {
          bg: '#FFFBEB',
          border: '#FDE68A',
          text: '#B45309',
        };
      case 'danger':
        return {
          bg: '#FEF2F2',
          border: '#FECACA',
          text: '#B91C1C',
        };
      case 'info':
        return {
          bg: '#EFF6FF',
          border: '#BFDBFE',
          text: '#1D4ED8',
        };
      case 'neutral':
        return {
          bg: '#F1F5F9',
          border: '#E2E8F0',
          text: '#475569',
        };
      case 'primary':
      default:
        return {
          bg: '#EEF2FF',
          border: '#C7D2FE',
          text: '#4338CA',
        };
    }
  };

  const v = getVariantStyles();
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          paddingHorizontal: isSm ? 7 : 10,
          paddingVertical: isSm ? 2 : 4,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: v.text,
            fontSize: isSm ? 10.5 : 12,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, rightAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
        {!!subtitle && (
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightAction}
    </View>
  );
}

export function Shimmer({
  width = '100%',
  height = 20,
  borderRadius = 6,
  style,
}: {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.8,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: 'rgba(0,0,0,0.06)',
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

export function FadeIn({
  children,
  delay = 0,
  duration = 240,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

export interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  illustration,
  title,
  description,
  actionText,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.emptyContainer, style]}>
      {illustration && <View style={styles.emptyIllustration}>{illustration}</View>}
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {!!description && (
        <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      )}
      {onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <RefreshCw size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.emptyActionText}>{actionText || 'Refresh'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1.5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyIllustration: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    marginBottom: 14,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
});
