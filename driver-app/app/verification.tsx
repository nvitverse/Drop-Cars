import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  Image,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  Clock, 
  CheckCircle, 
  ArrowRight,
  RefreshCw,
  X,
  Copy
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import * as SecureStore from '@/utils/secureStore';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosDriver from '@/app/api/axiosDriver';
import axiosInstance from '@/app/api/axiosInstance';
import WelcomeScreen from '@/components/WelcomeScreen';
import { needsWelcome } from '@/services/appContent';
import { getAuthHeaders } from '@/services/auth/authService';
import { getRazorpayOptions } from '@/services/payment/paymentService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import GuestHelpFloatingButton from '@/components/guest/GuestHelpFloatingButton';

// Same guarded import as the wallet screen - Razorpay checkout only exists in
// native builds, not on web.
let RazorpayCheckout: any = null;
try {
  RazorpayCheckout = require('react-native-razorpay').default;
} catch {
  RazorpayCheckout = null;
}

interface VerificationPageProps {
  accountStatus?: string;
  onRefresh?: () => void;
  onLogout?: () => void;
  isLoading?: boolean;
}

export default function VerificationPage({ 
  accountStatus: propAccountStatus, 
  onRefresh: propOnRefresh,
  onLogout: propOnLogout,
  isLoading: propIsLoading = false
}: VerificationPageProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const { user } = useAuth();
  const [accountStatus, setAccountStatus] = useState(propAccountStatus || 'inactive');
  const [isLoading, setIsLoading] = useState(propIsLoading);
  const [rotateAnim] = useState(new Animated.Value(0));
  const [upiCardBlinkAnim] = useState(new Animated.Value(0));
  const [showWelcome, setShowWelcome] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [payingFee, setPayingFee] = useState(false);
  const [feePaid, setFeePaid] = useState(false);
  const [feeAmount, setFeeAmount] = useState(1000);

  // The fee amount is controlled from the admin Billing settings
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await axiosInstance.get('/api/wallet/razorpay/registration-fee', { headers });
        if (res.data?.amount_rupees > 0) setFeeAmount(res.data.amount_rupees);
      } catch {
        // Keep the default ₹1000 if the endpoint is unreachable
      }
    })();
  }, []);

  // Fetch account status if not provided as prop
  useEffect(() => {
    if (!propAccountStatus) {
      fetchAccountStatus();
    }
  }, []);

  // Register the push-notification token even BEFORE verification: owners
  // waiting for approval should still receive new-booking notifications.
  // (Previously the token was only registered on the dashboard, which
  // unverified owners never reach - so they got no notifications at all.)
  useEffect(() => {
    (async () => {
      try {
        const { updateNotificationSettings } = await import('@/services/notifications/notificationApi');
        await updateNotificationSettings({ permission1: true, permission2: true });
      } catch {
        // Never block the verification screen on notification setup
      }
    })();
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

  // Blink animation for UPI ID card (green to light green fade)
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(upiCardBlinkAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false, // backgroundColor animation requires false
        }),
        Animated.timing(upiCardBlinkAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);

  const fetchAccountStatus = async () => {
    try {
      setIsLoading(true);
      const loginDataStr = await SecureStore.getItemAsync('loginResponse');
      if (loginDataStr) {
        const loginData = JSON.parse(loginDataStr);
        const status = loginData.account_status || 'inactive';
        setAccountStatus(status);
      }
    } catch (error) {
      console.error('❌ Error fetching account status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Refreshing account status...');
      
      if (propOnRefresh) {
        propOnRefresh();
      } else {
        try {
          // Get user data and stored password to call login API
          const userDataStr = await SecureStore.getItemAsync('userData');
          const tempPassword = await SecureStore.getItemAsync('tempPassword');
          
          if (!userDataStr) {
            console.warn('⚠️ No user data found');
            await fetchAccountStatus();
            return;
          }
          
          const userData = JSON.parse(userDataStr);
          
          // Format mobile number to 10 digits only
          const formatMobileNumber = (phone: string): string => {
            if (!phone || !phone.trim()) return '';
            let cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').trim();
            if (!cleanPhone) return '';
            return cleanPhone.slice(-10);
          };
          
          const mobileNumber = formatMobileNumber(userData.primaryMobile || userData.primary_mobile || '');
          
          if (!mobileNumber || !tempPassword) {
            console.warn('⚠️ Missing mobile number or password');
            Alert.alert(t('verification.sessionExpiredTitle'), t('verification.sessionExpiredBody'));
            await fetchAccountStatus();
            return;
          }
          
          console.log('🔄 Calling login API to get fresh account status...');
          
          // Call login API to get latest status
          const response = await axiosInstance.post('/api/users/vehicleowner/login', {
            mobile_number: mobileNumber,
            password: tempPassword
          });
          
          if (response.data && response.data.account_status) {
            const newStatus = response.data.account_status;
            
            // Update stored login response with fresh data
            await SecureStore.setItemAsync('loginResponse', JSON.stringify(response.data));
            
            // Update auth token if provided
            if (response.data.access_token) {
              await SecureStore.setItemAsync('authToken', response.data.access_token);
            }
            
            console.log('✅ Account status updated:', newStatus);
            
            // Update the status but don't auto-show welcome screen
            // User will click "Continue" button to see welcome screen
            setAccountStatus(newStatus);
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
      console.error('❌ Error refreshing account status:', error);
      Alert.alert(t('verification.errorTitle'), t('verification.refreshFailedBody'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    if (propOnLogout) {
      propOnLogout();
    } else {
      router.replace('/login');
    }
  };

  const handleUPICopy = () => {
    const upiId = '7200217986-1@okbizaxis';
    try {
      Clipboard.setString(upiId);
      Alert.alert(t('verification.copiedTitle'), t('verification.copiedBody'));
    } catch (error) {
      console.error('Failed to copy:', error);
      Alert.alert(t('verification.errorTitle'), t('verification.copyFailedBody'));
    }
  };

  const handleShowQR = () => {
    setShowQRModal(true);
  };

  // Pay the yearly registration fee with Razorpay (UPI apps, cards, netbanking)
  // - same flow as the wallet recharge. The manual UPI-ID card stays as a
  // fallback for devices where Razorpay is unavailable.
  const handleRazorpayRegistrationPay = async () => {
    if (!RazorpayCheckout) {
      Alert.alert(
        t('verification.notAvailableTitle'),
        t('verification.razorpayUnavailableBody')
      );
      return;
    }
    try {
      setPayingFee(true);
      const headers = await getAuthHeaders();

      // 1. Create the fee order (backend decides the amount)
      const orderRes = await axiosInstance.post(
        '/api/wallet/razorpay/registration-order',
        {},
        { headers }
      );
      const rpOrderId = orderRes.data?.rp_order_id;
      const amountPaise = orderRes.data?.amount;
      if (!rpOrderId || !amountPaise) {
        throw new Error(t('verification.orderFailedBody'));
      }

      // 2. Open Razorpay checkout
      const userData = {
        name: user?.fullName || 'Driver',
        email: (user as any)?.email || `${user?.primaryMobile || 'user'}@dropcars.in`,
        contact: user?.primaryMobile || '9999999999',
      };
      const options = getRazorpayOptions(
        rpOrderId,
        amountPaise,
        'Drop Cars Yearly Registration Fee',
        userData
      );

      const data = await RazorpayCheckout.open(options);

      // 3. Verify on the backend (marks the fee as paid on your account)
      await axiosInstance.post(
        '/api/wallet/razorpay/registration-verify',
        {
          rp_order_id: data.razorpay_order_id,
          rp_payment_id: data.razorpay_payment_id,
          rp_signature: data.razorpay_signature,
        },
        { headers }
      );

      setFeePaid(true);
      Alert.alert(
        t('verification.paymentSuccessTitle'),
        t('verification.paymentSuccessBody')
      );
    } catch (error: any) {
      if (error?.error?.code === 'PAYMENT_CANCELLED') {
        // User closed the checkout - not an error
      } else {
        const message =
          error?.error?.description ||
          error?.response?.data?.detail ||
          error?.message ||
          t('verification.paymentFailedGeneric');
        Alert.alert(t('verification.paymentFailedTitle'), String(message));
      }
    } finally {
      setPayingFee(false);
    }
  };
  
  
  
  
  
  

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
    router.replace('/(tabs)');
  };

  const getStatusInfo = () => {
    // Check if status is PROCESSING or Inactive
    if (accountStatus?.toUpperCase() === 'PROCESSING' || accountStatus?.toLowerCase() === 'inactive') {
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

    // For any other status (including Active), show welcome screen
    return {
      icon: <CheckCircle color={colors.success} size={64} />,
      title: t('verification.verifiedTitle'),
      subtitle: t('verification.verifiedSubtitle'),
      message: t('verification.verifiedMessage'),
      buttonText: t('verification.continueButton'),
      buttonAction: async () => {
        if (await needsWelcome()) {
          setShowWelcome(true);
        } else {
          router.replace('/(tabs)');
        }
      },
      backgroundColor: isDarkMode ? '#064E3B' : '#F0FDF4',
      borderColor: colors.success,
      showRefresh: false
    };
  };

  const statusInfo = getStatusInfo();

  // Show welcome screen if account is verified
  if (showWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
      <LinearGradient
        colors={isDarkMode ? [colors.background, colors.surface] : [colors.primary, colors.primaryDark]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('verification.headerTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('verification.headerSubtitle')}</Text>
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
          {/* Paytm Payment Button - Show only when account is under verification */}
          {(accountStatus?.toUpperCase() === 'PROCESSING' || accountStatus?.toLowerCase() === 'inactive') && (
            <View style={styles.paymentSection}>
              <Text style={styles.paymentWarningText}>{t('verification.paymentWarning')}</Text>

              {/* Razorpay payment - preferred (UPI apps, cards, netbanking) */}
              <TouchableOpacity
                style={[
                  styles.razorpayButton,
                  { backgroundColor: colors.primary },
                  (payingFee || feePaid) && { opacity: 0.6 },
                ]}
                onPress={handleRazorpayRegistrationPay}
                disabled={payingFee || feePaid}
                activeOpacity={0.8}
              >
                <Text style={styles.razorpayButtonText}>
                  {feePaid
                    ? t('verification.feePaid')
                    : payingFee
                      ? t('verification.openingPayment')
                      : t('verification.payRegistrationFee', { amount: feeAmount })}
                </Text>
                {!feePaid && !payingFee && (
                  <Text style={styles.razorpayButtonSub}>{t('verification.razorpaySub')}</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.orDividerText}>{t('verification.orPayManually')}</Text>

              {/* UPI ID Display Card - Opens QR Code Modal */}
              <Animated.View
                style={[
                  styles.upiDisplayCard,
                  {
                    backgroundColor: upiCardBlinkAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['#D1FAE5', '#ECFDF5'], // Light green to very light green
                    }),
                    borderColor: upiCardBlinkAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['#10B981', '#86EFAC'], // Green to light green
                    }),
                  }
                ]}
              >
                <TouchableOpacity 
                  onPress={handleShowQR}
                  activeOpacity={0.7}
                  style={{ width: '100%' }}
                >
                  <Text style={[styles.upiDisplayLabel, { color: colors.textSecondary }]}>{t('verification.payToUpiTapToView')}</Text>
                  <View style={styles.upiIdRow}>
                    <Text style={[styles.upiDisplayId, { color: colors.primary }]}>7200217986-1@okbizaxis</Text>
                    <Copy color={colors.primary} size={18} style={{ marginLeft: 8 }} />
                  </View>
                  <Text style={[styles.upiDisplayName, { color: colors.textSecondary }]}>Drop Cars</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}

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

        {accountStatus?.toLowerCase() === 'inactive' && (
          <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>{t('verification.whatHappensNext')}</Text>
            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step1')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step2')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step3')}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.infoBullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('verification.step4')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.qrModalOverlay}>
          <View style={[styles.qrModalContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.qrModalHeader}>
              <Text style={[styles.qrModalTitle, { color: colors.text }]}>{t('verification.scanQrToPay')}</Text>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                style={styles.qrModalCloseButton}
              >
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <View style={[styles.qrImageContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image
                source={require('../assets/images/Qrcodepay.jpeg')}
                style={styles.qrImage}
                resizeMode="contain"
                onError={(error) => {
                  console.error('QR Code image load error:', error);
                }}
              />
            </View>

            <View style={styles.qrUpiInfo}>
              <Text style={[styles.qrUpiLabel, { color: colors.textSecondary }]}>{t('verification.upiIdLabel')}</Text>
              <TouchableOpacity 
                style={styles.qrUpiIdContainer}
                onPress={handleUPICopy}
                activeOpacity={0.7}
              >
                <Text style={[styles.qrUpiId, { color: colors.primary }]}>7200217986-1@okbizaxis</Text>
                <Copy color={colors.primary} size={18} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <Text style={[styles.qrUpiName, { color: colors.textSecondary }]}>Drop Cars</Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.qrCopyButton, { backgroundColor: colors.primary }]}
              onPress={handleUPICopy}
            >
              <Copy color="#FFFFFF" size={18} />
              <Text style={styles.qrCopyButtonText}>{t('verification.copyUpiId')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Persistent Pre-Login Help Chat Floating Button */}
      <GuestHelpFloatingButton />
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
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  statusSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 20,
    textAlign: 'center',
    width: '100%',
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
  paymentSection: {
    marginBottom: 16,
    width: '100%',
  },
  razorpayButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  razorpayButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  razorpayButtonSub: {
    color: '#DBEAFE',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  orDividerText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  paymentWarningText: {
    color: '#EF4444',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginBottom: 12,
  },
  upiDisplayCard: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    alignItems: 'center',
  },
  upiDisplayLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  upiDisplayId: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#3B82F6',
    textAlign: 'center',
  },
  upiDisplayName: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  paytmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  paytmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 8,
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
    backgroundColor: '#3B82F6',
    marginTop: 8,
    marginRight: 12,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    flex: 1,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalContainer: {
    borderRadius: 10,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  qrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  qrModalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  qrModalCloseButton: {
    padding: 4,
  },
  qrImageContainer: {
    width: 280,
    height: 280,
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrUpiInfo: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  qrUpiLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  qrUpiIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  qrUpiId: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#3B82F6',
    textAlign: 'center',
  },
  qrUpiName: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  qrCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
  },
  qrCopyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 8,
  },
});