import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Car } from 'lucide-react-native';
import { colors, dark } from '@/constants/theme';

export function LoadingScreen() {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      style={styles.container}
    >
      <View style={styles.content}>
        <Car color={colors.white} size={64} strokeWidth={2} />
        <Text style={styles.title}>Drop Cars</Text>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.white,
    marginTop: 24,
  },
  subtitle: {
    fontSize: 16,
    color: dark.textSecondary,
    marginTop: 8,
  },
});