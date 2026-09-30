import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { DesignTokens } from '@/constants/designTokens';

interface GlanceableMetricProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  onPress?: () => void;
  badge?: string;
}

export default function GlanceableMetric({
  label,
  value,
  subValue,
  icon,
  accentColor,
  onPress,
  badge,
}: GlanceableMetricProps) {
  const { colors, isDarkMode } = useTheme();
  const tint = accentColor || colors.primary;

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDarkMode ? DesignTokens.colors.darkSurface : DesignTokens.colors.lightSurface,
          borderColor: isDarkMode ? DesignTokens.colors.darkBorder : DesignTokens.colors.lightBorder,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.labelContainer}>
          <Text
            style={[
              styles.label,
              { color: isDarkMode ? DesignTokens.colors.lightBorderHighlight : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: tint + '18' }]}>
              <Text style={[styles.badgeText, { color: tint }]}>{badge}</Text>
            </View>
          )}
        </View>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: tint + '15' }]}>
            {icon}
          </View>
        )}
      </View>

      <Text
        style={[
          styles.value,
          { color: isDarkMode ? '#FFFFFF' : colors.text },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>

      {subValue && (
        <Text
          style={[
            styles.subValue,
            { color: isDarkMode ? DesignTokens.colors.emeraldSuccess : DesignTokens.colors.emeraldDark },
          ]}
          numberOfLines={1}
        >
          {subValue}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={styles.touchable}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.touchable}>{content}</View>;
}

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
  },
  card: {
    padding: 14,
    borderRadius: DesignTokens.radius.lg,
    borderWidth: 1,
    ...DesignTokens.shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  label: {
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: DesignTokens.radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
  },
  subValue: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
});
