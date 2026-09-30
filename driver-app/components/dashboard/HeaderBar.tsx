import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { User, Bell, Menu, ShieldCheck } from 'lucide-react-native';
import AppText from '@/components/AppText';
import PartnerBadge from '@/components/PartnerBadge';
import LanguageToggle from '@/components/LanguageToggle';
import { colors as themeColors } from '@/theme/tokens';

export interface HeaderBarProps {
  userName?: string;
  myTier?: 'PREFERRED' | 'STANDARD';
  isDarkMode?: boolean;
  unreadCount?: number;
  onOpenDrawer: () => void;
  onPressNotifications: () => void;
  onPressProfile: () => void;
  onPressKyc?: () => void;
  verificationSummary?: {
    ownerVerified: boolean;
  } | null;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  userName = 'Partner',
  myTier = 'STANDARD',
  isDarkMode = false,
  unreadCount = 0,
  onOpenDrawer,
  onPressNotifications,
  onPressProfile,
  onPressKyc,
  verificationSummary,
}) => {
  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      {/* Left Action Group */}
      <View style={styles.leftGroup}>
        <TouchableOpacity
          onPress={onOpenDrawer}
          style={[styles.iconButton, isDarkMode && styles.iconButtonDark]}
          accessibilityLabel="Open Navigation Menu"
        >
          <Menu color={isDarkMode ? '#F8FAFC' : '#0F172A'} size={22} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onPressProfile} style={styles.userSection}>
          <View style={styles.avatar}>
            <User color="#FFFFFF" size={18} />
          </View>
          <View style={styles.userInfo}>
            <AppText variant="label" weight="bold" numberOfLines={1}>
              {userName}
            </AppText>
            <PartnerBadge tier={myTier === 'PREFERRED' ? 'TRUSTED' : myTier} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Right Action Group */}
      <View style={styles.rightGroup}>
        {verificationSummary && !verificationSummary.ownerVerified && (
          <TouchableOpacity
            onPress={onPressKyc}
            style={styles.kycBadge}
            accessibilityLabel="KYC Verification Alert"
          >
            <ShieldCheck size={16} color="#D97706" />
          </TouchableOpacity>
        )}

        <LanguageToggle />

        <TouchableOpacity
          onPress={onPressNotifications}
          style={[styles.iconButton, isDarkMode && styles.iconButtonDark]}
          accessibilityLabel="View Notifications"
        >
          <Bell color={isDarkMode ? '#F8FAFC' : '#0F172A'} size={20} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <AppText style={styles.badgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </AppText>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  containerDark: {
    backgroundColor: '#0F172A',
    borderBottomColor: '#1E293B',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: themeColors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    justifyContent: 'center',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconButtonDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  kycBadge: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: themeColors.error.main,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default HeaderBar;
