import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Star, ShieldCheck, Crown, Tag } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface PartnerBadgeProps {
  rating?: number;
  tripCount?: number;
  tier?: 'STANDARD' | 'TRUSTED' | 'EXCLUSIVE' | 'EXECUTIVE';
  size?: 'sm' | 'md';
  short?: boolean;
  stacked?: boolean;
}

export default function PartnerBadge({
  rating,
  tripCount,
  tier = 'STANDARD',
  size = 'md',
  short = false,
  stacked = false,
}: PartnerBadgeProps) {
  const { colors, isDarkMode } = useTheme();

  const getTierConfig = () => {
    switch (tier) {
      case 'TRUSTED':
        return {
          firstWord: 'Trusted',
          secondWord: 'Partner',
          label: short ? 'Trusted' : 'Trusted Partner',
          icon: ShieldCheck,
          color: '#16A34A',
          bg: isDarkMode ? 'rgba(34, 197, 94, 0.18)' : '#DCFCE7',
          borderColor: '#22C55E',
        };
      case 'EXCLUSIVE':
      case 'EXECUTIVE':
        return {
          firstWord: 'Exclusive',
          secondWord: 'Partner',
          label: short ? 'Exclusive' : 'Exclusive Partner',
          icon: Crown,
          color: '#2563EB',
          bg: isDarkMode ? 'rgba(37, 99, 235, 0.18)' : '#DBEAFE',
          borderColor: '#3B82F6',
          isDisabled: false,
        };
      case 'STANDARD':
      default:
        return {
          firstWord: 'Standard',
          secondWord: 'Partner',
          label: short ? 'Standard' : 'Standard Partner',
          icon: Tag,
          color: '#D97706',
          bg: isDarkMode ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
          borderColor: '#F59E0B',
        };
    }
  };

  const config = getTierConfig();
  const IconComponent = config.icon;
  const isSmall = size === 'sm';

  // Only render the rating pill when real rating data was passed in - no
  // driver/owner aggregate rating is wired up yet on most screens, and this
  // used to default to a fabricated "4.9 (120)" (or a hardcoded "4.9 (124)"
  // at several call sites) shown identically for every single partner.
  const hasRealRating = typeof rating === 'number' && typeof tripCount === 'number' && tripCount > 0;

  return (
    <View style={styles.container}>
      {hasRealRating && (
        <View
          style={[
            styles.ratingPill,
            {
              backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
              borderColor: '#F59E0B',
              paddingVertical: isSmall ? 2 : 4,
              paddingHorizontal: isSmall ? 6 : 8,
            },
          ]}
        >
          <Star size={isSmall ? 11 : 13} color="#F59E0B" fill="#F59E0B" />
          <Text style={[styles.ratingText, { fontSize: isSmall ? 11 : 12 }]}>
            {rating!.toFixed(1)} <Text style={styles.countText}>({tripCount})</Text>
          </Text>
        </View>
      )}

      {/* Tier Category Badge */}
      <View
        style={[
          styles.tierBadge,
          {
            backgroundColor: config.bg,
            borderColor: config.borderColor + '60',
            paddingVertical: stacked ? 3 : (isSmall ? 2 : 4),
            paddingHorizontal: stacked ? 7 : (isSmall ? 6 : 8),
            borderRadius: stacked ? 8 : 12,
            opacity: config.isDisabled ? 0.75 : 1,
            alignItems: 'center',
          },
        ]}
      >
        <IconComponent size={stacked ? 14 : (isSmall ? 11 : 13)} color={config.color} />
        {stacked ? (
          <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
            <Text
              style={[
                styles.tierText,
                {
                  color: config.color,
                  fontSize: 10,
                  lineHeight: 12,
                  fontFamily: 'Inter-Bold',
                },
              ]}
            >
              {config.firstWord}
            </Text>
            <Text
              style={[
                styles.tierText,
                {
                  color: config.color,
                  fontSize: 9,
                  lineHeight: 11,
                  fontFamily: 'Inter-Medium',
                  opacity: 0.88,
                },
              ]}
            >
              {config.secondWord}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.tierText,
              {
                color: config.color,
                fontSize: isSmall ? 10.5 : 11.5,
                fontStyle: config.isDisabled ? 'italic' : 'normal',
              },
            ]}
          >
            {config.label}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Inter-Bold',
    color: '#D97706',
  },
  countText: {
    fontFamily: 'Inter-Medium',
    color: '#B45309',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  tierText: {
    fontFamily: 'Inter-SemiBold',
  },
});
