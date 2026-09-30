import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface StatusBadgeProps {
  status: string;
  icon?: React.ReactNode;
}

export function StatusBadge({ status, icon }: StatusBadgeProps) {
  const { colors, tints, radius } = useTheme();
  const normalized = (status || '').toUpperCase().replace(/\s+/g, '_');

  let badgeBg = tints.primaryTint || '#EEF2FF';
  let textColor = colors.primary || '#6366F1';

  if (
    normalized.includes('CANCEL') ||
    ['REJECTED', 'BLOCKED', 'INACTIVE', 'FAILED', 'EXPIRED'].includes(normalized)
  ) {
    badgeBg = tints.dangerTint || '#FEE2E2';
    textColor = colors.danger || '#EF4444';
  } else if (
    ['COMPLETED', 'VERIFIED', 'ACTIVE', 'APPROVED', 'SUCCESS'].includes(normalized)
  ) {
    badgeBg = tints.successTint || '#F0FDF4';
    textColor = colors.success || '#10B981';
  } else if (
    ['PENDING', 'UNALLOCATED', 'PROCESSING', 'WAITING'].includes(normalized)
  ) {
    badgeBg = tints.warningTint || '#FFFBEB';
    textColor = colors.warning || '#D97706';
  } else if (
    ['ACCEPTED', 'ALLOCATED', 'DRIVING', 'STARTED', 'IN_PROGRESS', 'ASSIGNED'].includes(normalized)
  ) {
    badgeBg = tints.primaryTint || '#EEF2FF';
    textColor = colors.primary || '#6366F1';
  }

  return (
    <View style={[styles.badge, { backgroundColor: badgeBg, borderRadius: radius.pill || 999 }]}>
      <View style={[styles.dot, { backgroundColor: textColor }]} />
      {icon}
      <Text style={[styles.text, { color: textColor }]}>
        {status ? status.replace(/_/g, ' ') : 'N/A'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

export default StatusBadge;
