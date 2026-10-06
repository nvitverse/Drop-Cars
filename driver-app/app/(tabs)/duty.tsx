import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { useTheme } from '@/contexts/ThemeContext';
import QuickDashboardScreen from '../quick-dashboard';

// Duty Mode: Driver's dedicated execution cockpit for all accepted rides
// (Upcoming duties, Running live navigation & meter, and Completed history).
export default function DutyTabScreen() {
  const { signinAsOwner, isAuthenticated, clearError } = useCarDriver();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (clearError) clearError();
    if (!isAuthenticated) {
      signinAsOwner().catch((err) => console.warn('Duty mode signin attempt:', err));
    }
  }, [isAuthenticated]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <QuickDashboardScreen embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
