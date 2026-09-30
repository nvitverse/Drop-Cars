import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MapPin, Wallet, Plus } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { colors } from '@/theme/tokens';

export interface QuickMetricsProps {
  vacantCitiesCount?: number;
  walletBalance: number;
  isDarkMode?: boolean;
  onPressVacant?: () => void;
  onPressRequest?: () => void;
  onPressWallet: () => void;
  tVacantLabel?: string;
  isTrustedPartner?: boolean;
  hasActiveRouteRequest?: boolean;
}

export const QuickMetrics: React.FC<QuickMetricsProps> = ({
  walletBalance = 0,
  isDarkMode = false,
  onPressRequest,
  onPressWallet,
  hasActiveRouteRequest = false,
}) => {
  return (
    <View style={styles.container}>
      {/* 1. Request Button (Exclusive for Trusted Partners / Route Requests) */}
      <TouchableOpacity
        onPress={onPressRequest}
        style={[
          styles.card,
          isDarkMode ? styles.cardDark : styles.cardLightRequest,
          hasActiveRouteRequest && styles.cardActiveRequest,
        ]}
        activeOpacity={0.8}
        accessibilityLabel="Route Request for Trusted Partners"
      >
        <MapPin size={16} color={hasActiveRouteRequest ? '#10B981' : '#6366F1'} />
        <AppText
          variant="label"
          weight="bold"
          color={hasActiveRouteRequest ? '#10B981' : (isDarkMode ? '#A5B4FC' : '#4F46E5')}
          numberOfLines={1}
        >
          {hasActiveRouteRequest ? 'Request Active' : 'Request'}
        </AppText>
        {hasActiveRouteRequest && (
          <View style={styles.activeDot} />
        )}
      </TouchableOpacity>

      {/* 2. Wallet Balance Card */}
      <TouchableOpacity
        onPress={onPressWallet}
        style={[
          styles.card,
          styles.walletCard,
          isDarkMode ? styles.cardDark : styles.cardLightWallet,
        ]}
        activeOpacity={0.8}
        accessibilityLabel="View Wallet Balance and Add Money"
      >
        <Wallet size={16} color={colors.primary.main} />
        <AppText
          variant="label"
          weight="bold"
          color={colors.primary.main}
          numberOfLines={1}
        >
          ₹{Math.round(walletBalance)}
        </AppText>
        <View style={styles.plusBadge}>
          <Plus size={10} color="#FFFFFF" />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 3,
    marginBottom: 3,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardLightVacant: {
    backgroundColor: colors.primary.subtle,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  cardLightRequest: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  cardActiveRequest: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  walletCard: {
    flex: 1.2,
  },
  cardLightWallet: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.surface.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardDark: {
    backgroundColor: colors.surface.darkBorder,
    borderColor: colors.surface.darkBorder,
  },
  plusBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success.main,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});

export default QuickMetrics;
