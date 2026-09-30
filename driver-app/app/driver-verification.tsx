import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  Clock, 
  CheckCircle, 
  ArrowRight,
  RefreshCw
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from '@/utils/secureStore';
import axiosDriver from '@/app/api/axiosDriver';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

interface DriverVerificationPageProps {
  accountStatus?: string;
  onRefresh?: () => void;
  onLogout?: () => void;
  isLoading?: boolean;
}

export default function DriverVerificationPage({ 
  accountStatus: propAccountStatus, 
  onRefresh: propOnRefresh,
  onLogout: propOnLogout,
  isLoading: propIsLoading = false
}: DriverVerificationPageProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const [accountStatus, setAccountStatus] = useState(propAccountStatus || 'PROCESSING');
  const [isLoading, setIsLoading] = useState(propIsLoading);
  const [rotateAnim] = useState(new Animated.Value(0));

  // Fetch account status if not provided as prop
  useEffect(() => {
    if (!propAccountStatus) {
      fetchAccountStatus();
    }
  }, []);

  // Spin animation for loading state
  useEffect(() => {
    if (isLoading) {
      const spin = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    }
  }, [isLoading]);

  const fetchAccountStatus = async () => {
    try {
      setIsLoading(true);
      const driverLoginStr = await SecureStore.getItemAsync('driverLoginResponse');
      if (driverLoginStr) {
        const driverLogin = JSON.parse(driverLoginStr);
        const status = driverLogin.driver_status || 'PROCESSING';
        setAccountStatus(status);
      }
    } catch (error) {
      console.error('❌ Error fetching driver account status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Refreshing driver account status...');
      
      if (propOnRefresh) {
        propOnRefresh();
      } else {
        try {
          // Get driver user data and stored password to call signin API
          const driverUserStr = await SecureStore.getItemAsync('driverUser');
          const tempPassword = await SecureStore.getItemAsync('driverTempPassword');
          
          if (!driverUserStr) {
            console.warn('⚠️ No driver user data found');
            await fetchAccountStatus();
            return;
          }
          
          const driverUser = JSON.parse(driverUserStr);
          
          // Format mobile number to 10 digits only
          const formatMobileNumber = (phone: string): string => {
            if (!phone || !phone.trim()) return '';
            let cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
            if (!cleanPhone) return '';
            return cleanPhone.slice(-10);
          };
          
          const mobileNumber = formatMobileNumber(driverUser.primary_number || '');

          if (!mobileNumber) {
            console.warn('⚠️ Missing mobile number');
            Alert.alert(t('verification.sessionExpiredTitle'), t('verification.sessionExpiredBody'));
            await fetchAccountStatus();
            return;
          }

          if (!tempPassword) {
            // No password on file - this driver signed in via Firebase
            // Phone OTP (forgot-password.tsx), which never stores one.
            // That's expected, not a session error: just re-check the
            // locally-stored status instead of retrying a password signin.
            console.log('ℹ️ No stored password (Firebase-authenticated driver) - re-checking local status only');
            await fetchAccountStatus();
            return;
          }
          
          console.log('🔄 Calling driver signin API to get fresh account status...');
          
          // Call driver signin API to get latest status
          // Use axiosInstance for unauthenticated signin requests
          // NOTE: Driver API uses 'primary_number' not 'mobile_number'
          const response = await axiosInstance.post('/api/users/cardriver/signin', {
            primary_number: mobileNumber,
            password: tempPassword
          });
          
          if (response.data && response.data.driver_status) {
            const newStatus = response.data.driver_status;
            setAccountStatus(newStatus);
            
            // Update stored driver login response with fresh data
            await SecureStore.setItemAsync('driverLoginResponse', JSON.stringify(response.data));
            
            // Update driver auth token if provided
            if (response.data.access_token) {
              await SecureStore.setItemAsync('driverAuthToken', response.data.access_token);
            }
            
            console.log('✅ Driver account status updated:', newStatus);
            
            // If status is now ONLINE, redirect to dashboard
            if (newStatus === 'ONLINE') {
              setTimeout(() => {
                router.replace('/quick-dashboard');
              }, 2000);
            }
          }
        } catch (apiError: any) {
          console.warn('⚠️ Could not refresh from API:', apiError);
          console.error('API error details:', {
            message: apiError.message,
            status: apiError.response?.status,
            data: apiError.response?.data
          });
          Alert.alert(t('verification.refreshFailedTitle'), t('verification.refreshFailedBody'));
          // Fallback to local data
          await fetchAccountStatus();
        }
      }
    } catch (error) {
      console.error('❌ Error refreshing driver account status:', error);
      Alert.alert(t('verification.errorTitle'), t('verification.refreshFailedBody'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    if (propOnLogout) {
      propOnLogout();
    } else {
      router.replace('/quick-login');
    }
  };

  const getStatusInfo = () => {
    // Check if status is PROCESSING
    if (accountStatus?.toUpperCase() === 'PROCESSING') {
      return {
        icon: <Clock color={colors.warning} size={64} />,
        title: t('verification.processingTitle'),
        subtitle: t('verification.processingSubtitle'),
        message: t('verification.processingMessage'),
        buttonText: t('verification.refreshStatus'),
        buttonAction: handleRefresh,
        backgroundColor: isDarkMode ? '#451A03' : '#FFFBEB',
        borderColor: colors.warning,
        showRefresh: true
      };
    }

    // For any other status (including ONLINE), redirect to dashboard
    return {
      icon: <CheckCircle color={colors.success} size={64} />,
      title: t('verification.verifiedTitle'),
      subtitle: t('driverVerification.verifiedSubtitle'),
      message: t('driverVerification.verifiedMessage'),
      buttonText: t('driverVerification.goToDashboard'),
      buttonAction: () => router.replace('/quick-dashboard'),
      backgroundColor: isDarkMode ? '#064E3B' : '#F0FDF4',
      borderColor: colors.success,
      showRefresh: false
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
      <LinearGradient
        colors={isDarkMode ? [colors.background, colors.surface] : [colors.success, colors.primaryDark]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('verification.headerTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('driverVerification.headerSubtitle')}</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusCard, { backgroundColor: statusInfo.backgroundColor, borderColor: statusInfo.borderColor }]}>
          <View style={styles.iconContainer}>
            {statusInfo.icon}
          </View>

          <Text style={[styles.statusTitle, { color: colors.text }]}>{statusInfo.title}</Text>
          <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>{statusInfo.subtitle}</Text>

          <View style={styles.messageContainer}>
            <Text style={[styles.messageText, { color: colors.text }]}>{statusInfo.message}</Text>
          </View>

          {statusInfo.showRefresh && (
            <View style={[styles.refreshInfo, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)', borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.2)' }]}>
              <RefreshCw color={colors.warning} size={16} />
              <Text style={[styles.refreshText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>
                {t('verification.refreshHint')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={[styles.primaryButton, { backgroundColor: statusInfo.borderColor }]}
            onPress={statusInfo.buttonAction}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Animated.View style={{
                  transform: [{
                    rotate: rotateAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }],
                  marginRight: 8,
                }}>
                  <RefreshCw color="#FFFFFF" size={20} />
                </Animated.View>
                <Text style={styles.primaryButtonText}>{t('verification.checkingStatus')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.primaryButtonText}>{statusInfo.buttonText}</Text>
                <ArrowRight color="#FFFFFF" size={20} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handleLogout}
            disabled={isLoading}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>{t('verification.logout')}</Text>
          </TouchableOpacity>
        </View>

        {accountStatus?.toUpperCase() === 'PROCESSING' && (
          <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>{t('verification.whatHappensNext')}</Text>
            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.success }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step1')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.success }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step2')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.success }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step3')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.success }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('driverVerification.step4')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 24,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#E5E7EB',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  statusCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  iconContainer: {
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 20,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 20,
  },
  messageText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    textAlign: 'center',
  },
  refreshInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  refreshText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginLeft: 8,
    flex: 1,
  },
  actionContainer: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginRight: 8,
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  infoCard: {
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
    textAlign: 'center',
  },
  infoList: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    marginRight: 12,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    flex: 1,
  },
});

