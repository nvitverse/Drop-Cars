import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Smartphone,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Car,
  UserCheck,
  ShieldCheck,
  KeyRound,
  Sparkles,
  MessageCircle,
} from 'lucide-react-native';
import WelcomeScreen from '@/components/WelcomeScreen';
import { needsWelcome } from '@/services/appContent';
import axiosInstance from '@/app/api/axiosInstance';
import { extractUserIdFromJWT } from '@/utils/jwtDecoder';
import * as SecureStore from '@/utils/secureStore';
import { loginDriver } from '@/services/driver/driverService';
import {
  getSavedGuestHelpSession,
  clearGuestHelpSession,
} from '@/services/support/guestHelpService';
import GuestHelpFloatingButton from '@/components/guest/GuestHelpFloatingButton';
import GuestHelpModal from '@/components/guest/GuestHelpModal';

// Helper function to validate Indian mobile numbers
const validateIndianMobile = (phone: string): boolean => {
  const cleanPhone = phone.replace(/^\+91/, '');
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(cleanPhone);
};

// Helper function to format phone number for backend
const formatForBackend = (phone: string) => {
  const digitsOnly = (phone || '').replace(/^\+91/, '').replace(/\D/g, '');
  const ten = digitsOnly.slice(-10);
  return { ten };
};

export default function LoginScreen() {
  const { prefillNumber } = useLocalSearchParams<{ prefillNumber?: string }>();
  const [loginMode, setLoginMode] = useState<'owner' | 'driver'>(prefillNumber ? 'driver' : 'owner');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAccountVerification, setShowAccountVerification] = useState(false);
  const [accountStatus, setAccountStatus] = useState<string>('');

  // Duty Driver tab state
  const [driverPhoneNumber, setDriverPhoneNumber] = useState(prefillNumber ? String(prefillNumber) : '');
  const [driverPassword, setDriverPassword] = useState('');
  const [showDriverPassword, setShowDriverPassword] = useState(false);
  const [driverLoading, setDriverLoading] = useState(false);

  // Pre-login Guest Help Chat
  const [hasGuestSession, setHasGuestSession] = useState(false);
  const [guestHelpModalOpen, setGuestHelpModalOpen] = useState(false);

  const router = useRouter();
  const { login } = useAuth();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();

  useFocusEffect(
    useCallback(() => {
      getSavedGuestHelpSession().then((s) => setHasGuestSession(!!s?.help_token));
    }, [])
  );

  useEffect(() => {
    (async () => {
      try {
        const lastNumber = await SecureStore.getItemAsync('lastLoginNumber');
        if (lastNumber) {
          setPhoneNumber((current) => current || lastNumber);
        }
      } catch {
        // Non-critical
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!phoneNumber || !password) {
      Alert.alert('Missing Fields', 'Please enter both mobile number and password.');
      return;
    }

    if (!validateIndianMobile(phoneNumber)) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setLoading(true);

    try {
      const { ten } = formatForBackend(phoneNumber);
      const payload = {
        mobile_number: ten,
        primary_number: ten,
        password: password,
      } as any;

      const response = await axiosInstance.post('/api/users/vehicleowner/login', payload);
      const token = response.data.access_token;
      let userId = extractUserIdFromJWT(token);

      if (!userId) {
        userId = 'e5b9edb1-b4bb-48b8-a662-f7fd00abb6eb';
      }

      const userData = {
        id: userId,
        fullName: response.data.full_name || 'Account Name',
        primaryMobile: phoneNumber,
        password: password,
        address: response.data.address || '',
        aadharNumber: response.data.aadhar_number || '',
        languages: [],
        documents: {}
      };

      await SecureStore.setItemAsync('tempPassword', password);
      await SecureStore.setItemAsync('lastActiveRole', 'owner').catch(() => {});
      await SecureStore.deleteItemAsync('driverLastLogin').catch(() => {});

      await login(userData, response.data.access_token);
      await clearGuestHelpSession().catch(() => {});

      import('@/services/driver/driverService').then(({ loginDriverAsOwner }) => {
        loginDriverAsOwner().catch(() => {});
      }).catch(() => {});

      await SecureStore.setItemAsync('loginResponse', JSON.stringify(response.data)).catch(() => {});

      const accountStatus = response.data.account_status;
      const carCount = response.data.car_details_count ?? 0;
      const driverCount = response.data.car_driver_count ?? 0;

      if (carCount === 0) {
        router.replace('/add-car?flow=signup');
        return;
      }

      if (driverCount === 0) {
        router.replace('/add-driver?flow=signup');
        return;
      }

      if (accountStatus?.toLowerCase() === 'blocked') {
        setAccountStatus(accountStatus);
        setShowAccountVerification(true);
        return;
      }

      if (await needsWelcome()) {
        setShowWelcome(true);
      } else {
        router.replace('/(tabs)');
      }

    } catch (error: any) {
      if (error.response?.status === 404 && error.response?.data?.detail === 'NOT_REGISTERED') {
        const { ten } = formatForBackend(phoneNumber);
        // Check if registered as a Duty Driver
        try {
          const axiosDriver = (await import('@/app/api/axiosDriver')).default;
          await axiosDriver.post('/api/users/cardriver/signin', { primary_number: ten, password: 'check_cross_role' });
        } catch (driverErr: any) {
          if (
            driverErr.response?.status === 401 ||
            (driverErr.response?.data?.detail && driverErr.response?.data?.detail !== 'NOT_REGISTERED')
          ) {
            Alert.alert(
              'Account is Duty Driver',
              `This mobile number (+91 ${ten}) is registered as a Duty Driver account. Would you like to switch to Duty Driver login?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Switch to Duty Driver Login',
                  onPress: () => {
                    setLoginMode('driver');
                    setDriverPhoneNumber(ten);
                    if (password) setDriverPassword(password);
                  },
                },
              ]
            );
            return;
          }
        }

        Alert.alert(
          'Account Not Found',
          "This mobile number isn't registered yet as a fleet driver.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create Account', onPress: () => router.push('/signup') },
          ]
        );
        return;
      }

      let errorMessage = 'Login failed. Please try again.';
      if (error.response?.status === 401) {
        errorMessage = error.response?.data?.detail || 'Incorrect password. Please check and try again.';
      } else if (error.response?.status === 422) {
        errorMessage = 'Invalid data provided. Please check your input.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please check your internet connection.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      Alert.alert('Login Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isValidDriverPhone = (value: string) => {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length === 10 || /^\+91\d{10}$/.test(value);
  };

  const handleQuickLogin = async () => {
    if (!driverPhoneNumber || !driverPassword) {
      Alert.alert('Missing Fields', 'Please enter both mobile number and password.');
      return;
    }

    if (!isValidDriverPhone(driverPhoneNumber)) {
      Alert.alert('Invalid Mobile', 'Enter a valid 10-digit mobile number.');
      return;
    }

    if (driverPassword.length < 6) {
      Alert.alert('Short Password', 'Please enter a valid password (at least 6 characters).');
      return;
    }

    setDriverLoading(true);

    try {
      const loginResponse = await loginDriver(driverPhoneNumber, driverPassword);

      if (loginResponse.access_token) {
        const driverStatus = loginResponse.driver_status || loginResponse.status;

        if (driverStatus === 'PROCESSING') {
          await SecureStore.setItemAsync('driverTempPassword', driverPassword);
          await SecureStore.setItemAsync('driverLoginResponse', JSON.stringify(loginResponse));
          await SecureStore.setItemAsync('driverUser', JSON.stringify({
            primary_number: driverPhoneNumber,
            full_name: loginResponse.full_name,
          }));

          if (loginResponse.access_token) {
            await SecureStore.setItemAsync('driverAuthToken', loginResponse.access_token);
            await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
          }
          router.replace('/driver-verification');
          return;
        }

        const allowedStatuses = ['ONLINE', 'OFFLINE', 'DRIVING', 'online', 'offline', 'driving'];
        if (!allowedStatuses.includes(driverStatus)) {
          throw new Error(`Driver account status is ${driverStatus}. Please contact support.`);
        }

        await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
        await clearGuestHelpSession().catch(() => {});
        router.replace('/quick-dashboard');
      } else {
        throw new Error('No access token received from server');
      }
    } catch (error: any) {
      if (
        error.message === 'NOT_REGISTERED_AS_DRIVER' ||
        (error.response?.status === 404 && error.response?.data?.detail === 'NOT_REGISTERED')
      ) {
        const { ten } = formatForBackend(driverPhoneNumber);
        // Check if registered as a Fleet Owner
        try {
          await axiosInstance.post('/api/users/vehicleowner/login', {
            mobile_number: ten,
            primary_number: ten,
            password: 'check_cross_role',
          });
        } catch (ownerErr: any) {
          if (
            ownerErr.response?.status === 401 ||
            (ownerErr.response?.data?.detail && ownerErr.response?.data?.detail !== 'NOT_REGISTERED')
          ) {
            Alert.alert(
              'Account is Fleet Driver',
              `This mobile number (+91 ${ten}) is registered as a Fleet Driver account. Would you like to switch to Fleet Driver login?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Switch to Fleet Driver Login',
                  onPress: () => {
                    setLoginMode('owner');
                    setPhoneNumber(ten);
                    if (driverPassword) setPassword(driverPassword);
                  },
                },
              ]
            );
            return;
          }
        }

        Alert.alert(
          'Not Registered as a Driver',
          "This mobile number isn't registered as a duty driver yet. Ask your fleet driver to add you in their app.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create Account', onPress: () => router.push('/signup') },
          ]
        );
        return;
      }
      Alert.alert('Login Failed', error.message || 'Please check your credentials and try again.');
    } finally {
      setDriverLoading(false);
    }
  };

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
    router.replace('/(tabs)');
  };

  useEffect(() => {
    if (showAccountVerification) {
      router.replace('/verification');
    }
  }, [showAccountVerification]);

  if (showAccountVerification) {
    return null;
  }

  if (showWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  return (
    <LinearGradient
      colors={isDarkMode ? ['#0F172A', '#1E293B'] : ['#1E1B4B', '#312E81', '#4338CA']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Branding Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Car color="#6366F1" size={26} />
              </View>
              <Text style={styles.title}>Drop Cars</Text>
              <Text style={styles.subtitle}>Driver & Fleet Partner Portal</Text>

              {/* Status Pill */}
              <View style={styles.stepBadge}>
                <ShieldCheck color="#A5B4FC" size={13} />
                <Text style={styles.stepBadgeText}>
                  {loginMode === 'owner' ? 'Fleet Driver Portal' : 'Duty Driver Portal'}
                </Text>
              </View>
            </View>

            {/* Segmented Mode Switcher */}
            <View style={styles.modeSwitchContainer}>
              <TouchableOpacity
                style={[styles.modeSwitchButton, loginMode === 'owner' && styles.modeSwitchButtonActive]}
                onPress={() => {
                  setLoginMode('owner');
                  if (driverPhoneNumber && !phoneNumber) {
                    setPhoneNumber(driverPhoneNumber.replace(/^\+91/, ''));
                  }
                  if (driverPassword && !password) {
                    setPassword(driverPassword);
                  }
                }}
                activeOpacity={0.8}
              >
                <Car size={15} color={loginMode === 'owner' ? '#4F46E5' : '#E0E7FF'} />
                <Text style={[styles.modeSwitchText, loginMode === 'owner' && styles.modeSwitchTextActive]}>
                  {t('login.modeOwner')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSwitchButton, loginMode === 'driver' && styles.modeSwitchButtonActive]}
                onPress={() => {
                  setLoginMode('driver');
                  if (phoneNumber && !driverPhoneNumber) {
                    setDriverPhoneNumber(phoneNumber.replace(/^\+91/, ''));
                  }
                  if (password && !driverPassword) {
                    setDriverPassword(password);
                  }
                }}
                activeOpacity={0.8}
              >
                <UserCheck size={15} color={loginMode === 'driver' ? '#4F46E5' : '#E0E7FF'} />
                <Text style={[styles.modeSwitchText, loginMode === 'driver' && styles.modeSwitchTextActive]}>
                  {t('login.modeDriver')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Main Form Container */}
            <View style={[styles.form, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
              {loginMode === 'owner' ? (
                <>
                  {/* Fleet Driver Phone Input */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    {t('login.mobileNumber')}
                  </Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.phonePrefixBadge}>
                      <Smartphone color={colors.primary} size={18} />
                      <Text style={[styles.phonePrefixText, { color: colors.text }]}>+91</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={phoneNumber}
                      onChangeText={(text) => {
                        const cleanText = text.replace(/\D/g, '');
                        if (cleanText.length <= 10) {
                          setPhoneNumber(cleanText);
                        }
                      }}
                      keyboardType="phone-pad"
                      maxLength={10}
                      placeholder="Registered mobile number"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                  {phoneNumber.length > 0 && !validateIndianMobile(phoneNumber) && (
                    <Text style={styles.errorText}>{t('login.invalidMobile')}</Text>
                  )}

                  {/* Fleet Driver Password Input */}
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>
                    {t('login.password')}
                  </Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Lock color={colors.textSecondary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Enter password"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                      activeOpacity={0.7}
                    >
                      {showPassword ? (
                        <EyeOff color={colors.textSecondary} size={18} />
                      ) : (
                        <Eye color={colors.textSecondary} size={18} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[
                      styles.loginButton,
                      { backgroundColor: colors.primary },
                      (loading || phoneNumber.length < 10 || !password) && styles.loginButtonDisabled,
                    ]}
                    onPress={handleLogin}
                    disabled={loading || phoneNumber.length < 10 || !password}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.loginButtonText}>{t('login.signIn')}</Text>
                        <ArrowRight color="#FFFFFF" size={18} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Links Row: Forgot Password & Optional Guest Help Chat */}
                  <View style={styles.linksRow}>
                    <TouchableOpacity
                      onPress={() => router.push('/forgot-password')}
                      style={styles.forgotBtn}
                      activeOpacity={0.7}
                    >
                      <KeyRound size={13} color="#4F46E5" />
                      <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
                    </TouchableOpacity>

                    {hasGuestSession && (
                      <TouchableOpacity
                        onPress={() => setGuestHelpModalOpen(true)}
                        style={styles.guestHelpLinkBtn}
                        activeOpacity={0.7}
                      >
                        <MessageCircle size={13} color="#4F46E5" />
                        <Text style={styles.guestHelpLinkText}>{t('login.myHelpChat') || 'My help chat'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Create Fleet Account Banner */}
                  <TouchableOpacity
                    style={styles.signupCard}
                    onPress={() => router.push('/signup')}
                    activeOpacity={0.8}
                  >
                    <Sparkles size={16} color="#4F46E5" />
                    <Text style={styles.signupCardText}>
                      New Fleet? <Text style={styles.signupCardLink}>Create Account</Text>
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Duty Driver Phone Input */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    {t('login.mobileNumber')}
                  </Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.phonePrefixBadge}>
                      <Smartphone color={colors.primary} size={18} />
                      <Text style={[styles.phonePrefixText, { color: colors.text }]}>+91</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={driverPhoneNumber.replace(/^\+91/, '')}
                      onChangeText={(text) => {
                        const cleanText = text.replace(/\D/g, '');
                        if (cleanText.length <= 10) {
                          setDriverPhoneNumber(cleanText);
                        }
                      }}
                      keyboardType="phone-pad"
                      maxLength={10}
                      placeholder="Duty driver mobile number"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {/* Duty Driver Password Input */}
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>
                    {t('login.password')}
                  </Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Lock color={colors.textSecondary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={driverPassword}
                      onChangeText={setDriverPassword}
                      secureTextEntry={!showDriverPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Enter driver password"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <TouchableOpacity
                      onPress={() => setShowDriverPassword(!showDriverPassword)}
                      style={styles.eyeButton}
                      activeOpacity={0.7}
                    >
                      {showDriverPassword ? (
                        <EyeOff color={colors.textSecondary} size={18} />
                      ) : (
                        <Eye color={colors.textSecondary} size={18} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Submit Duty Driver Button */}
                  <TouchableOpacity
                    style={[
                      styles.loginButton,
                      { backgroundColor: colors.primary },
                      (driverLoading || driverPhoneNumber.length < 10 || !driverPassword) && styles.loginButtonDisabled,
                    ]}
                    onPress={handleQuickLogin}
                    disabled={driverLoading || driverPhoneNumber.length < 10 || !driverPassword}
                    activeOpacity={0.8}
                  >
                    {driverLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.loginButtonText}>{t('login.driverLoginButton')}</Text>
                        <ArrowRight color="#FFFFFF" size={18} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Duty Driver Links Row: Forgot Password & Optional Guest Help Chat */}
                  <View style={styles.linksRow}>
                    <TouchableOpacity
                      onPress={() => router.push('/forgot-password?role=driver')}
                      style={styles.forgotBtn}
                      activeOpacity={0.7}
                    >
                      <KeyRound size={13} color="#4F46E5" />
                      <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
                    </TouchableOpacity>

                    {hasGuestSession && (
                      <TouchableOpacity
                        onPress={() => setGuestHelpModalOpen(true)}
                        style={styles.guestHelpLinkBtn}
                        activeOpacity={0.7}
                      >
                        <MessageCircle size={13} color="#4F46E5" />
                        <Text style={styles.guestHelpLinkText}>{t('login.myHelpChat') || 'My help chat'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Floating Help Chat Button for Pre-Login Guests */}
      <GuestHelpFloatingButton />

      {/* Guest Help Modal (also accessible via 'My help chat' link) */}
      <GuestHelpModal
        visible={guestHelpModalOpen}
        onClose={() => setGuestHelpModalOpen(false)}
        onMessageSentOrRead={() => {
          getSavedGuestHelpSession().then((s) => setHasGuestSession(!!s?.help_token));
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
    gap: 4,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    color: '#E0E7FF',
    textAlign: 'center',
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  stepBadgeText: {
    color: '#EEF2FF',
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
  },
  modeSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modeSwitchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 6,
  },
  modeSwitchButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  modeSwitchText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#EEF2FF',
  },
  modeSwitchTextActive: {
    color: '#4F46E5',
    fontFamily: 'Inter-Bold',
  },
  form: {
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  inputLabel: {
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
    marginLeft: 2,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 6,
    borderWidth: 1.5,
  },
  phonePrefixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    marginRight: 10,
  },
  phonePrefixText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  eyeButton: {
    padding: 6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
    marginLeft: 2,
  },
  loginButton: {
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontFamily: 'Inter-Bold',
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 14,
  },
  forgotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: '#4F46E5',
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
  },
  guestHelpLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  guestHelpLinkText: {
    color: '#4F46E5',
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
  },
  signupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    borderColor: '#C7D2FE',
    borderWidth: 1,
  },
  signupCardText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  signupCardLink: {
    color: '#4F46E5',
    fontFamily: 'Inter-Bold',
  },
});