import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Compass } from 'lucide-react-native';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { useTheme } from '@/contexts/ThemeContext';
import CarDriverDashboardScreen from '../car-driver/dashboard';
import QuickDashboardScreen from '../quick-dashboard';

// The owner's own driving lives here, inside the fleet app: "My Trips" = the bookings assigned to them (upcoming /
// assigned, Start Trip, History) and "Live Radar" = the nearby local-booking dispatch. No separate login screen -
// the duty session is opened for them automatically.
export default function DutyTabScreen() {
  const { signinAsOwner, isAuthenticated, clearError } = useCarDriver();
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'trips' | 'radar'>('trips');

  useEffect(() => {
    if (clearError) clearError();
    if (!isAuthenticated) {
      signinAsOwner().catch((err) => console.warn('Duty mode signin attempt:', err));
    }
  }, [isAuthenticated]);

  const tabs = [
    { key: 'trips' as const, label: 'My Trips', Icon: Car },
    { key: 'radar' as const, label: 'Live Radar', Icon: Compass },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.switchBar, { paddingTop: insets.top + 6, backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderBottomColor: colors.border }]}>
        {tabs.map(({ key, label, Icon }) => {
          const on = tab === key;
          return (
            <TouchableOpacity key={key} style={styles.tab} onPress={() => setTab(key)} activeOpacity={0.8}>
              <View style={styles.tabInner}>
                <Icon size={16} color={on ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabLabel, { color: on ? colors.primary : colors.textSecondary, fontFamily: on ? 'Inter-Bold' : 'Inter-SemiBold' }]}>{label}</Text>
              </View>
              <View style={[styles.indicator, { backgroundColor: on ? colors.primary : 'transparent' }]} />
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'trips' ? <QuickDashboardScreen embedded /> : <CarDriverDashboardScreen embedded />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  switchBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  tabLabel: { fontSize: 14 },
  indicator: { height: 3, width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
});
