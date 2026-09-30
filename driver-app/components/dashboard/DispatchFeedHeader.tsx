import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';

export type MainTabType = 'new_bookings' | 'upcoming' | 'running';

export interface DispatchFeedHeaderProps {
  activeTab: MainTabType;
  newBookingsCount: number;
  upcomingCount: number;
  runningCount: number;
  isDarkMode?: boolean;
  onTabChange: (tab: MainTabType) => void;
}

const TAB_CONFIG: { key: MainTabType; label: (count: number) => string; activeColor: string }[] = [
  { key: 'new_bookings', label: (n) => `New (${n})`, activeColor: '#6366F1' },
  { key: 'upcoming', label: (n) => `Upcoming (${n})`, activeColor: '#F59E0B' },
  { key: 'running', label: (n) => `Running (${n})`, activeColor: '#10B981' },
];

export const DispatchFeedHeader: React.FC<DispatchFeedHeaderProps> = ({
  activeTab = 'new_bookings',
  newBookingsCount = 0,
  upcomingCount = 0,
  runningCount = 0,
  isDarkMode = false,
  onTabChange,
}) => {
  const { colors } = useTheme();
  const counts = [newBookingsCount, upcomingCount, runningCount];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderBottomColor: isDarkMode ? '#1E293B' : '#E2E8F0' },
      ]}
    >
      {TAB_CONFIG.map(({ key, label, activeColor }, idx) => {
        const isActive = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onTabChange(key)}
            style={styles.tab}
            activeOpacity={0.75}
          >
            <View style={styles.tabInner}>
              <AppText
                variant="label"
                weight={isActive ? 'bold' : 'medium'}
                numberOfLines={1}
                style={{ fontSize: 12, color: isActive ? activeColor : (isDarkMode ? '#94A3B8' : '#64748B') }}
              >
                {label(counts[idx])}
              </AppText>
            </View>
            <View
              style={[
                styles.indicator,
                { backgroundColor: isActive ? activeColor : 'transparent' },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    height: 3,
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});

export default DispatchFeedHeader;
