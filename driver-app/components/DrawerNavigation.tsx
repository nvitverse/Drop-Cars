import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGE_OPTIONS } from '@/contexts/LanguageContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import LanguageToggle from '@/components/LanguageToggle';
import PartnerBadge from '@/components/PartnerBadge';
import axiosInstance from '@/app/api/axiosInstance';
import { useRouter } from 'expo-router';
import { 
  X, 
  User, 
  Car, 
  History, 
  Settings, 
  LogOut,
  ChevronRight,
  Phone,
  MapPin,
  Languages,
  Users,
  Wallet,
  Zap,
  Globe,
  Check,
  Clock,
} from 'lucide-react-native';

interface DrawerNavigationProps {
  visible: boolean;
  onClose: () => void;
}

export default function DrawerNavigation({ visible, onClose }: DrawerNavigationProps) {
  const { user, refreshUserData, logout } = useAuth();
  const { balance } = useWallet();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLanguage();
  const { dashboardData, clearAllData: clearDashboardData } = useDashboard();
  const { signinAsOwner, signout: driverSignout, clearAllData: clearCarDriverData } = useCarDriver();
  const router = useRouter();
  const [showDutyDriverModal, setShowDutyDriverModal] = React.useState(false);
  const [showLanguageModal, setShowLanguageModal] = React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
  const [myTier, setMyTier] = React.useState<'PREFERRED' | 'STANDARD'>('STANDARD');
  React.useEffect(() => {
    if (!visible) return;
    axiosInstance.get('/api/users/vehicle-owner/billing-status')
      .then(res => setMyTier(res.data?.tier === 'PREFERRED' ? 'PREFERRED' : 'STANDARD'))
      .catch(() => {});
  }, [visible]);

  // Custom slide-in-from-the-right animation. RN's <Modal animationType="slide">
  // always animates vertically (from the bottom) regardless of the panel's own
  // `right: 0` positioning, so we drive our own transform instead and keep the
  // Modal only for the backdrop/overlay behavior (animationType set to "fade" below).
  const drawerWidth = Dimensions.get('window').width * 0.85;
  const translateX = React.useRef(new Animated.Value(drawerWidth)).current;
  // Keep the Modal mounted for the duration of the closing animation, then
  // unmount it - otherwise the Modal (and its backdrop) would disappear
  // instantly on close, before the panel has slid off-screen.
  const [modalVisible, setModalVisible] = React.useState(visible);

  React.useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: drawerWidth,
        duration: 280,
        useNativeDriver: true,
      }).start(() => setModalVisible(false));
    }
  }, [visible, drawerWidth, translateX]);

  // "Start Driving" switch: only offered when this fleet owner is ALSO registered
  // as one of their own drivers (same mobile number). One-person operators.
  const ownerNumber = ((dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || '')
    .replace(/\D/g, '')
    .slice(-10);
  const [isOwnerAlsoDriver, setIsOwnerAlsoDriver] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!visible || !ownerNumber || ownerNumber.length !== 10) {
      setIsOwnerAlsoDriver(false);
      return;
    }
    (async () => {
      try {
        const { fetchAvailableDrivers } = await import('@/services/orders/assignmentService');
        const drivers = await fetchAvailableDrivers();
        const match = Array.isArray(drivers) && drivers.some(
          (d: any) => String(d?.primary_number || '').replace(/\D/g, '').slice(-10) === ownerNumber
        );
        if (!cancelled) setIsOwnerAlsoDriver(!!match);
      } catch {
        if (!cancelled) setIsOwnerAlsoDriver(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, ownerNumber]);

  // Was Alert.alert - react-native-web has no native OS dialog to render
  // it against, so its 'destructive' style (red Logout button) never
  // actually applied on web, leaving default/blue-ish text on both
  // buttons. A custom modal (same pattern as the Duty Driver dialog below)
  // renders identically - and with the real red destructive styling - on
  // every platform. Found 2026-09-23.
  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    console.log('🔄 Starting comprehensive logout process...');
    clearDashboardData();
    clearCarDriverData();
    await logout();
    onClose();
    router.replace('/login');
  };

  const handleRefreshUserData = async () => {
    try {
      await refreshUserData();
      Alert.alert('Success', 'User data refreshed successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to refresh user data');
    }
  };

  const getDriverStatusSummary = () => {
    if (!dashboardData?.drivers || dashboardData.drivers.length === 0) {
      console.log('🔍 No drivers found in dashboard data');
      return '0 drivers';
    }

    const drivers = dashboardData.drivers;
    console.log('🔍 Driver status summary - Total drivers:', drivers.length);
    console.log('🔍 Driver statuses:', drivers.map(d => ({ name: d.full_name, status: d.driver_status })));

    const statusCounts: Record<string, number> = {
      ONLINE: 0,
      OFFLINE: 0,
      DRIVING: 0,
      BLOCKED: 0,
      PROCESSING: 0,
      OTHER: 0
    };

    drivers.forEach(driver => {
      const status = (driver.driver_status || '').toUpperCase();
      console.log(`🔍 Processing driver ${driver.full_name} with status: ${status}`);
      if (status in statusCounts) {
        statusCounts[status]++;
      } else {
        statusCounts.OTHER++;
      }
    });

    console.log('🔍 Status counts:', statusCounts);

    const total = drivers.length;
    const onlineCount = statusCounts.ONLINE;
    const offlineCount = statusCounts.OFFLINE;
    const drivingCount = statusCounts.DRIVING;
    const blockedCount = statusCounts.BLOCKED;
    const processingCount = statusCounts.PROCESSING;

    // Show online and offline drivers prominently
    if (onlineCount > 0 && offlineCount > 0) {
      return `${total} drivers • ${onlineCount} online • ${offlineCount} offline`;
    } else if (onlineCount > 0) {
      return `${total} drivers • ${onlineCount} online`;
    } else if (offlineCount > 0) {
      return `${total} drivers • ${offlineCount} offline`;
    } else if (drivingCount > 0) {
      return `${total} drivers • ${drivingCount} on duty`;
    } else if (blockedCount > 0) {
      return `${total} drivers • ${blockedCount} blocked`;
    } else if (processingCount > 0) {
      return `${total} drivers • ${processingCount} verifying`;
    } else {
      return `${total} drivers`;
    }
  };

  const dynamicStyles = StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
    },
    drawer: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '85%',
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: -2, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 10,
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingTop: Platform.OS === 'ios' ? 48 : 38,
    },
    headerLeft: {
      flex: 1,
    },
    drawerTitle: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    closeButton: {
      padding: 8,
    },
    drawerContent: {
      flex: 1,
      paddingTop: 20,
    },
    profileSection: {
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    profileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    profileDetails: {
      flex: 1,
    },
    profileName: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 8,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    profileText: {
      marginLeft: 8,
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    menuSection: {
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.background,
    },
    menuLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    menuIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    dangerIcon: {
      backgroundColor: '#FEE2E2',
    },
    menuTitle: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    dangerText: {
      color: colors.error,
    },
    menuSubtitle: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginTop: 2,
    },
    logoutSection: {
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 20,
    },
  });
  const MenuItem = ({ icon, title, subtitle, onPress, danger = false, rightComponent }: {
    icon: React.ReactElement;
    title: string;
    subtitle?: string;
    onPress: () => void;
    danger?: boolean;
    rightComponent?: React.ReactElement;
  }) => (
    <TouchableOpacity style={dynamicStyles.menuItem} onPress={onPress}>
      <View style={dynamicStyles.menuLeft}>
        <View style={[dynamicStyles.menuIcon, danger && dynamicStyles.dangerIcon]}>
          {icon}
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[dynamicStyles.menuTitle, danger && dynamicStyles.dangerText]}>{title}</Text>
          {subtitle && <Text style={dynamicStyles.menuSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={modalVisible}
      onRequestClose={onClose}
    >
      <BlurView intensity={50} style={dynamicStyles.overlay}>
        <TouchableOpacity style={dynamicStyles.backdrop} onPress={onClose} />

        <Animated.View style={[dynamicStyles.drawer, { transform: [{ translateX }] }]}>
          <View style={dynamicStyles.drawerHeader}>
            <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text }}>Menu</Text>
            <TouchableOpacity onPress={onClose} style={dynamicStyles.closeButton} activeOpacity={0.7}>
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView style={dynamicStyles.drawerContent} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
            {/* Account Hero Profile Card at Top */}
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Account
              </Text>
              <View style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              }}>
                {/* Header row: Avatar + Name + Phone + View Profile button */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => {
                    onClose();
                    router.push('/(tabs)/profile');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}>
                    <Text style={{ fontSize: 22, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                      {(dashboardData?.user_info?.full_name || user?.fullName || 'P').trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: colors.text }} numberOfLines={1}>
                        {dashboardData?.user_info?.full_name || user?.fullName || 'Partner'}
                      </Text>
                      <View style={{ backgroundColor: `${colors.primary}18`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>View Profile</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 2 }}>
                      {(dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Rating & Tier Badge */}
                <View style={{ marginVertical: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <PartnerBadge tier={myTier === 'PREFERRED' ? 'TRUSTED' : 'STANDARD'} size="md" />
                </View>

                {/* 2 Stat columns: Total Cars & Total Drivers */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center' }}
                    onPress={() => { onClose(); router.push('/my-cars'); }}
                  >
                    <Car color={colors.primary} size={20} />
                    <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginVertical: 2 }}>
                      {dashboardData?.cars?.length || 0}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>
                      Total Cars
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', borderLeftWidth: 1, borderColor: colors.border }}
                    onPress={() => { onClose(); router.push('/my-drivers'); }}
                  >
                    <Users color={colors.primary} size={20} />
                    <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginVertical: 2 }}>
                      {dashboardData?.drivers?.length || 0}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>
                      Total Drivers
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Core Operations Section */}
            <View style={dynamicStyles.menuSection}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⚡ Core Operations
              </Text>

              <MenuItem
                icon={<Car color={colors.primary} size={20} />}
                title="Switch to Duty Driver Mode"
                subtitle="Go on duty & execute assigned rides"
                onPress={() => setShowDutyDriverModal(true)}
              />
            </View>

            {/* Financials & Preferences Section */}
            <View style={dynamicStyles.menuSection}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                💰 Financials & Preferences
              </Text>

              <MenuItem
                icon={<Clock color={colors.primary} size={20} />}
                title="Duty Trip History"
                subtitle="Trips you have driven and completed"
                onPress={async () => {
                  onClose();
                  try { await signinAsOwner(); } catch {}
                  router.push({ pathname: '/quick-dashboard', params: { openHistory: '1' } } as any);
                }}
              />

              <MenuItem
                icon={<User color={colors.primary} size={20} />}
                title="My Profile"
                subtitle="Personal, KYC & Account details"
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/profile');
                }}
              />

              <MenuItem
                icon={<Wallet color={colors.textSecondary} size={20} />}
                title={t('drawer.transactions')}
                subtitle={`Wallet balance: ₹${dashboardData?.user_info?.wallet_balance || 0}`}
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/wallet');
                }}
              />

              <MenuItem
                icon={<Languages color={colors.primary} size={20} />}
                title="Language / மொழி"
                subtitle="Change app language"
                onPress={() => setShowLanguageModal(true)}
                rightComponent={
                  <View style={{
                    backgroundColor: `${colors.primary}18`,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: `${colors.primary}30`,
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>
                      {(LANGUAGE_OPTIONS.find(o => o.code === language)?.label || 'English')}
                    </Text>
                  </View>
                }
              />

              <MenuItem
                icon={<Settings color={colors.textSecondary} size={20} />}
                title={t('drawer.settings')}
                subtitle="App & notification preferences"
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/settings');
                }}
              />
            </View>

            {/* Support Desk */}
            <View style={dynamicStyles.menuSection}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                📞 24/7 Helpline Desk
              </Text>

              <MenuItem
                icon={<Phone color="#10B981" size={20} />}
                title="Call Support Helpline"
                subtitle="Speak with Drop Cars Support"
                onPress={() => {
                  Linking.openURL('tel:7200217986');
                }}
              />
            </View>

            {/* Logout */}
            <View style={dynamicStyles.logoutSection}>
              <MenuItem
                icon={<LogOut color={colors.error} size={20} />}
                title={t('drawer.logout')}
                onPress={handleLogout}
                danger={true}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </BlurView>

      {/* Duty Driver Switch Dialog Modal */}
      <Modal
        visible={showDutyDriverModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDutyDriverModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 340,
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 10,
          }}>
            {/* Header Icon */}
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.primary + '18',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Car color={colors.primary} size={28} />
            </View>

            {/* Question Title */}
            <Text style={{
              fontSize: 17,
              fontFamily: 'Inter-Bold',
              color: colors.text,
              textAlign: 'center',
              marginBottom: 8,
            }}>
              Do you want to log in as a different driver?
            </Text>

            <Text style={{
              fontSize: 13,
              fontFamily: 'Inter-Regular',
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 22,
              lineHeight: 18,
            }}>
              Select whether you are driving yourself or switching to another driver account.
            </Text>

            {/* Action Buttons Row */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              {/* Left Button: Different Driver */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={async () => {
                  setShowDutyDriverModal(false);
                  onClose();
                  if (driverSignout) {
                    try { await driverSignout(); } catch (err) { console.warn('Signout warning:', err); }
                  }
                  router.push('/car-driver/signin');
                }}
              >
                <Text style={{ fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                  Different Driver
                </Text>
              </TouchableOpacity>

              {/* Right Button: I'm the Driver */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setShowDutyDriverModal(false);
                  onClose();
                  if (signinAsOwner) {
                    signinAsOwner().catch((err) => console.warn('Duty signin warning:', err));
                  }
                  router.push('/(tabs)/duty' as any);
                }}
              >
                <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                  I'm the Driver
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 340,
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 10,
          }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#FEE2E2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <LogOut color={colors.error} size={26} />
            </View>

            <Text style={{
              fontSize: 17,
              fontFamily: 'Inter-Bold',
              color: colors.text,
              textAlign: 'center',
              marginBottom: 8,
            }}>
              Logout
            </Text>

            <Text style={{
              fontSize: 13,
              fontFamily: 'Inter-Regular',
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 22,
              lineHeight: 18,
            }}>
              Are you sure you want to logout?
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  backgroundColor: colors.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={confirmLogout}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            maxHeight: '75%',
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Languages color={colors.primary} size={22} />
                <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>
                  Select Language / மொழி
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)} style={{ padding: 6 }}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            {LANGUAGE_OPTIONS.map((opt) => {
              const isSelected = language === opt.code;
              return (
                <TouchableOpacity
                  key={opt.code}
                  onPress={() => {
                    setLanguage(opt.code);
                    setShowLanguageModal(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    marginBottom: 10,
                    backgroundColor: isSelected ? `${colors.primary}15` : colors.background,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontFamily: isSelected ? 'Inter-Bold' : 'Inter-Medium',
                    color: isSelected ? colors.primary : colors.text,
                  }}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check color={colors.primary} size={20} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}