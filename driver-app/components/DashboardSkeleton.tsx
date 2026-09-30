import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function DashboardSkeleton() {
  const { colors, isDarkMode } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [isDarkMode ? 0.25 : 0.35, isDarkMode ? 0.65 : 0.75],
  });

  const skeletonBg = isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  return (
    <View style={styles.container}>
      {/* Quick Metrics Bar Skeleton */}
      <View style={styles.metricsRow}>
        <Animated.View
          style={[
            styles.metricCard,
            { backgroundColor: skeletonBg, opacity, borderColor: colors.border },
          ]}
        />
        <Animated.View
          style={[
            styles.metricCard,
            { backgroundColor: skeletonBg, opacity, borderColor: colors.border },
          ]}
        />
      </View>

      {/* Tabs Skeleton Header */}
      <Animated.View
        style={[
          styles.tabBar,
          { backgroundColor: skeletonBg, opacity, borderColor: colors.border },
        ]}
      />

      {/* Card 1 Skeleton */}
      <Animated.View
        style={[
          styles.bookingCard,
          { backgroundColor: colors.surface, opacity, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 80 }]} />
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 100 }]} />
        </View>

        <View style={styles.routeBox}>
          <View style={[styles.circle, { backgroundColor: '#10B981', opacity: 0.6 }]} />
          <View style={[styles.line, { backgroundColor: skeletonBg, width: '70%' }]} />
        </View>

        <View style={styles.routeBox}>
          <View style={[styles.circle, { backgroundColor: '#EF4444', opacity: 0.6 }]} />
          <View style={[styles.line, { backgroundColor: skeletonBg, width: '60%' }]} />
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 90, height: 24 }]} />
          <View style={[styles.button, { backgroundColor: colors.primary, opacity: 0.4 }]} />
        </View>
      </Animated.View>

      {/* Card 2 Skeleton */}
      <Animated.View
        style={[
          styles.bookingCard,
          { backgroundColor: colors.surface, opacity, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 90 }]} />
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 110 }]} />
        </View>

        <View style={styles.routeBox}>
          <View style={[styles.circle, { backgroundColor: '#10B981', opacity: 0.6 }]} />
          <View style={[styles.line, { backgroundColor: skeletonBg, width: '75%' }]} />
        </View>

        <View style={styles.routeBox}>
          <View style={[styles.circle, { backgroundColor: '#EF4444', opacity: 0.6 }]} />
          <View style={[styles.line, { backgroundColor: skeletonBg, width: '65%' }]} />
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.pill, { backgroundColor: skeletonBg, width: 100, height: 24 }]} />
          <View style={[styles.button, { backgroundColor: colors.primary, opacity: 0.4 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
  },
  tabBar: {
    height: 44,
    borderRadius: 6,
    marginBottom: 14,
    borderWidth: 1,
  },
  bookingCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pill: {
    height: 16,
    borderRadius: 8,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  circle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  line: {
    height: 14,
    borderRadius: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
  },
  button: {
    width: 120,
    height: 38,
    borderRadius: 6,
  },
});
