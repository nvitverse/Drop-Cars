import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Car, UserCheck, ChevronRight } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { colors } from '@/theme/tokens';

export interface DutyStatusCardProps {
  isOnDuty?: boolean;
  driverName?: string;
  vehicleNumber?: string;
  isDarkMode?: boolean;
  onPressToggleDuty: () => void;
}

export const DutyStatusCard: React.FC<DutyStatusCardProps> = ({
  isOnDuty = true,
  driverName = 'Driver On Duty',
  vehicleNumber = 'TN-01-AB-1234',
  isDarkMode = false,
  onPressToggleDuty,
}) => {
  return (
    <View style={[styles.card, isDarkMode && styles.cardDark]}>
      <View style={styles.leftSection}>
        <View style={[styles.statusDot, isOnDuty ? styles.dotOnline : styles.dotOffline]} />
        <View style={styles.infoGroup}>
          <View style={styles.badgeRow}>
            <AppText
              variant="caption"
              weight="bold"
              color={isOnDuty ? colors.success.main : colors.warning.main}
            >
              {isOnDuty ? 'ONLINE & READY FOR DISPATCH' : 'OFF DUTY'}
            </AppText>
          </View>
          <View style={styles.detailsRow}>
            <Car size={13} color={colors.text.secondary} />
            <AppText variant="caption" weight="medium" color={colors.text.secondary}>
              {vehicleNumber}
            </AppText>
            <AppText variant="caption" color={colors.text.muted}>
              •
            </AppText>
            <UserCheck size={13} color={colors.text.secondary} />
            <AppText variant="caption" weight="medium" color={colors.text.secondary}>
              {driverName}
            </AppText>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={onPressToggleDuty}
        style={styles.toggleButton}
        activeOpacity={0.7}
      >
        <AppText variant="caption" weight="semibold" color={colors.primary.main}>
          Change
        </AppText>
        <ChevronRight size={14} color={colors.primary.main} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surface.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardDark: {
    backgroundColor: colors.surface.darkCard,
    borderColor: colors.surface.darkBorder,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: colors.success.main,
  },
  dotOffline: {
    backgroundColor: colors.warning.main,
  },
  infoGroup: {
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.primary.subtle,
    borderRadius: 6,
  },
});

export default DutyStatusCard;
