import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
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
  const formattedFare = typeof fare === 'number' ? `₹${fare.toLocaleString('en-IN')}` : fare.startsWith('₹') ? fare : `₹${fare}`;
  const metaItems = [
    carType,
    distance ? (typeof distance === 'number' ? `${distance} km` : distance) : null,
    tripType,
    date,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
    >
      <View style={styles.headerRow}>
        <Text style={styles.bookingId}>Booking #{orderId}</Text>
        <Text style={styles.fareValue}>{formattedFare}</Text>
      </View>

      <View style={styles.routeBox}>
        <View style={styles.routeRow}>
          <View style={styles.primaryDot} />
          <Text style={styles.routeText} numberOfLines={1}>
            {pickup || 'Pickup Location'}
          </Text>
        </View>

        <View style={styles.dashedLineContainer}>
          <View style={styles.dashedLine} />
        </View>

        <View style={styles.routeRow}>
          <View style={styles.successDot} />
          <Text style={styles.routeText} numberOfLines={1}>
            {drop || 'Drop Location'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText} numberOfLines={1}>
          {metaItems.length > 0 ? metaItems.join(' • ') : 'Standard Trip'}
        </Text>
        <StatusBadge status={status} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface || '#FFFFFF',
    borderRadius: radius.md || 12,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    padding: spacing.md || 12,
    marginBottom: spacing.md || 12,
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
    color: colors.textPrimary || '#1F2937',
  },
  fareValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary || '#6366F1',
  },
  routeBox: {
    backgroundColor: colors.background || '#F8FAFC',
    borderRadius: radius.md || 12,
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
    backgroundColor: colors.primary || '#6366F1',
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success || '#10B981',
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
    borderColor: colors.border || '#CBD5E1',
  },
  routeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary || '#0F172A',
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
    color: colors.textMuted || '#64748B',
    flex: 1,
  },
});

export default OrderSummaryCard;
