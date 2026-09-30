import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Zap, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Edge-to-edge "Drop Market" top segment switcher (Drop Bid | Drop Connect).
 * Uses underline indicator tabs that span the full screen width.
 */
export default function DropMarketSwitcher({ active }: { active: 'bid' | 'connect' }) {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();

  const tabs = [
    { key: 'bid' as const, label: 'Drop Bid', Icon: Zap, route: '/drop-bid', activeColor: colors.primary },
    { key: 'connect' as const, label: 'Drop Connect', Icon: Users, route: '/drop-connect', activeColor: '#10B981' },
  ];

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
          borderBottomColor: colors.border,
        },
      ]}
    >
      {tabs.map(({ key, label, Icon, route, activeColor }) => {
        const isActive = active === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.tab}
            onPress={() => !isActive && router.replace(route as any)}
            activeOpacity={0.75}
          >
            <View style={styles.tabInner}>
              <Icon
                size={15}
                color={isActive ? activeColor : colors.textSecondary}
                fill={key === 'bid' && isActive ? activeColor : 'transparent'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? activeColor : colors.textSecondary,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-SemiBold',
                  },
                ]}
              >
                {label}
              </Text>
            </View>
            {/* Colored underline indicator */}
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
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabLabel: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  indicator: {
    height: 3,
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
