import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  overlay?: boolean;
  fullScreen?: boolean;
}

export default function LoadingSpinner({
  size = 'large',
  color,
  overlay = false,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const { isDark, themeColors } = useTheme();
  const spinnerColor = color || (isDark ? '#60A5FA' : colors.primary);

  if (overlay) {
    return (
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.75)' }]} pointerEvents="auto">
        <ActivityIndicator size={size} color={spinnerColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: fullScreen ? themeColors.background : 'transparent' }]}>
      <ActivityIndicator size={size} color={spinnerColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
});
