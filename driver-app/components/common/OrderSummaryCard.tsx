import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import StatusBadge from './StatusBadge';

export interface OrderSummaryCardProps {
  orderId: string | number;
  pickup: string;
  drop: string;
  fare: number | string;
  status: string;
  tripType?: string;
  carType?: string;
  distance?: string | number;
  date?: string;
  onPress?: () => void;
}

export function OrderSummaryCard({
  orderId,
  pickup,
  drop,
  fare,
  status,
  tripType,
  carType,
  distance,
  date,
  onPress,
}: OrderSummaryCardProps) {
  const { colors, radius, spacing } = useTheme();
  const formattedFare = typeof fare === 'number' ? `₹${fare.toLocaleString('en-IN')}` : fare.startsWith('₹') ? fare : `₹${fare}`;
  const metaItems = [
    carType,
    distance ? (typeof distance === 'number' ? `${distance} km` : distance) : null,
    tripType,
    date,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md || 12,
          padding: spacing.md || 12,
          marginBottom: spacing.md || 12,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.bookingId, { color: colors.text }]}>Booking #{orderId}</Text>
        <Text style={[styles.fareValue, { color: colors.primary || colors.success }]}>{formattedFare}</Text>
      </View>

      <View style={[styles.routeBox, { backgroundColor: colors.background, borderRadius: radius.md || 12 }]}>
        <View style={styles.routeRow}>
          <View style={[styles.primaryDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
            {pickup || 'Pickup Location'}
          </Text>
        </View>

        <View style={styles.dashedLineContainer}>
          <View style={[styles.dashedLine, { borderColor: colors.border }]} />
        </View>

        <View style={styles.routeRow}>
          <View style={[styles.successDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
            {drop || 'Drop Location'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
          {metaItems.length > 0 ? metaItems.join(' • ') : 'Standard Trip'}
        </Text>
        <StatusBadge status={status} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bookingId: {
    fontSize: 14,
    fontWeight: '800',
  },
  fareValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  routeBox: {
    padding: 10,
    marginVertical: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dashedLineContainer: {
    paddingLeft: 3.5,
    height: 14,
    justifyContent: 'center',
  },
  dashedLine: {
    height: '100%',
    width: 1,
    borderStyle: 'dashed',
    borderLeftWidth: 1.5,
  },
  routeText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
});

export default OrderSummaryCard;
