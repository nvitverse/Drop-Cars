import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

interface StatusBadgeProps {
  status: string;
  // 'account' covers vendor/vehicle_owner (Active/Inactive/Pending) and
  // driver/quickdriver (ONLINE/OFFLINE/DRIVING/BLOCKED/PROCESSING) status casings.
  // 'order' covers booking/trip statuses (COMPLETED/CANCELLED/PENDING/DRIVING/IN_PROGRESS/ASSIGNED).
  type?: 'account' | 'document' | 'car' | 'driver' | 'transfer' | 'order';
}

export default function StatusBadge({ status, type = 'account' }: StatusBadgeProps) {
  const getStatusColor = (status: string, type: string) => {
    const normalizedStatus = status?.toLowerCase().replace(/\s+/g, '_');

    if (type === 'document') {
      switch (normalizedStatus) {
        case 'verified':
          return colors.success;
        case 'pending':
          return colors.warning;
        case 'invalid':
          return colors.error;
        default:
          return colors.textSecondary;
      }
    }

    if (type === 'transfer') {
      switch (normalizedStatus) {
        case 'approved':
          return colors.success;
        case 'pending':
          return colors.warning;
        case 'rejected':
          return colors.error;
        default:
          return colors.textSecondary;
      }
    }

    // Bookings can be cancelled for several distinct reasons (see
    // crud/order_details.py::_display_trip_status - CANCELLED BY VENDOR/
    // CANCELLED WHILE DRIVING/CANCELLED BY CUSTOMER/NO DRIVER ASSIGNED),
    // all still genuinely "cancelled" for coloring purposes even though
    // the exact label differs from the bare 'cancelled' case below.
    if (normalizedStatus?.startsWith('cancelled')) {
      return colors.error;
    }
    // Nobody's fault - the booking just timed out with no one having
    // looked at it. Deliberately NOT red (matches the "no money moved"
    // reality), same neutral tone as the default fallback.
    if (normalizedStatus === 'expired') {
      return colors.textSecondary;
    }

    // A driver being "Offline" is their own normal, everyday choice (off
    // duty right now), not an admin/failure state like the driver-only
    // "Inactive" (admin disabled) or "Blocked" (fraud) - color it neutral
    // instead of the same alarming red as those, for this type only.
    if (type === 'driver' && normalizedStatus === 'offline') {
      return colors.textSecondary;
    }

    switch (normalizedStatus) {
      // Active / online-ish states
      case 'active':
      case 'online':
      case 'completed':
      case 'approved':
        return colors.success;
      // Inactive / failed states
      case 'inactive':
      case 'offline':
      case 'blocked':
      case 'rejected':
        return colors.error;
      // Waiting states
      case 'pending':
      case 'processing':
      case 'unallocated':
        return colors.warning;
      // In-flight states
      case 'driving':
      case 'in_progress':
      case 'assigned':
        return colors.primary;
      default:
        return colors.textSecondary;
    }
  };

  const statusColor = getStatusColor(status, type);

  return (
    <View style={[styles.badge, { backgroundColor: `${statusColor}20` }]}>
      <View style={[styles.dot, { backgroundColor: statusColor }]} />
      <Text style={[styles.text, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});