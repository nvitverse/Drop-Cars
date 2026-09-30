import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Sun, Moon } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  style?: ViewStyle;
  size?: number;
}

export default function ThemeToggle({ style, size = 18 }: ThemeToggleProps) {
  const { isDark, toggleTheme, themeColors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: isDark ? '#334155' : '#EEF2FF', borderColor: isDark ? '#475569' : '#C7D2FE' },
        style,
      ]}
      onPress={toggleTheme}
      activeOpacity={0.7}
      accessibilityLabel="Toggle Light / Dark Theme"
    >
      {isDark ? (
        <Sun size={size} color="#FBBF24" />
      ) : (
        <Moon size={size} color="#4F46E5" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
