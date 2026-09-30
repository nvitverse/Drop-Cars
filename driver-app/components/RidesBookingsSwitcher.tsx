import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Briefcase, Info } from 'lucide-react-native';
import PageInfoModal from '@/components/PageInfoModal';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Edge-to-edge top segment switcher: Unifies "My Rides" (active.tsx)
 * and "Direct Bookings" (my-bookings.tsx) into a single operational hub.
 * Tabs are edge-to-edge, attached with a full-width underline indicator.
 */
export default function RidesBookingsSwitcher({ active }: { active: 'rides' | 'bookings' }) {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Both host screens already sit inside a SafeAreaView (top inset applied) -
  // adding the status-bar height again here left a big empty band above the header.
  const paddingTop = 6;
  const [showInfo, setShowInfo] = useState(false);

  // The header title + the (i) explanation follow whichever tab is selected.
  const header =
    active === 'rides'
      ? {
          title: 'My Rides',
          Icon: Car,
          info: {
            title: 'My Rides - Drop Cars Trips',
            description:
              'Every trip you accepted from the Drop Cars booking market, from acceptance to completion, in one place.',
            pipelineText: 'Pipeline: 1. Upcoming -> 2. Running -> 3. Executed',
            workflowSteps: [
              'Upcoming: trips you accepted that have not started yet - assign a car and driver here.',
              'Running: trips that are on the road right now, with live status.',
              'Executed: completed trips with fare and commission details.',
            ],
            tips: [
              'Use the search box to find a trip by ID, customer, city or location.',
              'Pull down to refresh the list.',
            ],
          },
        }
      : {
          title: 'My Bookings',
          Icon: Briefcase,
          info: {
            title: 'My Bookings - Bookings You Posted',
            description:
              'Bookings that you posted yourself for other Drop Cars partners to take, and their live status.',
            pipelineText: 'Pipeline: 1. Waiting for Accept -> 2. Accepted -> 3. Driver Assigned -> 4. Completed',
            workflowSteps: [
              'Post a booking with the + button; nearby partners are notified.',
              'When a partner accepts, they assign a car and driver and you can see the OTPs.',
              'Share the Start OTP with your customer - the driver asks for it at pickup.',
            ],
            tips: [
              'You can cancel a booking that has not started from its card.',
              'Check the status badge on each booking to see where it is.',
            ],
          },
        };
  const HeaderIcon = header.Icon;

  const tabs = [
    { key: 'rides' as const, label: 'Drop Cars', Icon: Car, route: '/active' },
    { key: 'bookings' as const, label: 'My Bookings', Icon: Briefcase, route: '/my-bookings' },
  ];

  return (
    <View
      style={{
        backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF',
        paddingTop,
      }}
    >
      {/* Compact header - same look as the other sections' title bars */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary + '22' }]}>
          <HeaderIcon size={18} color={colors.primary} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{header.title}</Text>
        <TouchableOpacity
          onPress={() => setShowInfo(true)}
          style={[styles.infoBtn, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}
          activeOpacity={0.7}
        >
          <Info size={13} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <PageInfoModal
        visible={showInfo}
        title={header.info.title}
        description={header.info.description}
        pipelineText={header.info.pipelineText}
        workflowSteps={header.info.workflowSteps}
        tips={header.info.tips}
        onClose={() => setShowInfo(false)}
      />

    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      {tabs.map(({ key, label, Icon, route }) => {
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
                color={isActive ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primary : colors.textSecondary,
                    fontFamily: isActive ? 'Inter-Bold' : 'Inter-SemiBold',
                  },
                ]}
              >
                {label}
              </Text>
            </View>
            {/* Active underline indicator */}
            <View
              style={[
                styles.indicator,
                { backgroundColor: isActive ? colors.primary : 'transparent' },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    flexShrink: 1,
  },
  infoBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  wrap: {
    flexDirection: 'row',
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
    fontSize: 13.5,
  },
  indicator: {
    height: 3,
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
