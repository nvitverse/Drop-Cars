import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Smartphone, Lock, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { loginDriver } from '@/services/driver/driverService';
import * as SecureStore from '@/utils/secureStore';
import { useLanguage } from '@/contexts/LanguageContext';

export default function QuickLoginScreen() {
  // When opened via the owner's "Start Driving" switch, the owner's number is prefilled
  // so they only need to enter their driver password once.
  const { prefillNumber } = useLocalSearchParams<{ prefillNumber?: string }>();
  const [phoneNumber, setPhoneNumber] = useState(prefillNumber ? String(prefillNumber) : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const isNavigating = useRef(false);

  const isValidPhone = (value: string) => {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length === 10 || /^\+91\d{10}$/.test(value);
  };

  const handleQuickLogin = async () => {
    if (!phoneNumber || !password) {
      Alert.alert(t('forgotPassword.errorTitle'), t('quickLogin.fillBothFields'));
      return;
    }

    if (!isValidPhone(phoneNumber)) {
      Alert.alert(t('forgotPassword.errorTitle'), t('quickLogin.invalidPhone'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('forgotPassword.errorTitle'), t('quickLogin.shortPassword'));
      return;
    }

    setLoading(true);

    try {
      console.log('🔐 Attempting driver login...');
      
      // Call the real driver login API
      const loginResponse = await loginDriver(phoneNumber, password);
      
      if (loginResponse.access_token) {
        console.log('✅ Driver login successful, checking account status...');
        
        // Check driver status before proceeding
        const driverStatus = loginResponse.driver_status || loginResponse.status;
        console.log('🔍 Driver status:', driverStatus);
        
        // If driver status is PROCESSING, redirect to account verification
        if (driverStatus === 'PROCESSING') {
          console.log('⏳ Driver account is under verification, redirecting to verification screen');
          
          // Store driver credentials for verification page refresh
          await SecureStore.setItemAsync('driverTempPassword', password);
          await SecureStore.setItemAsync('driverLoginResponse', JSON.stringify(loginResponse));
          await SecureStore.setItemAsync('driverUser', JSON.stringify({
            primary_number: phoneNumber,
            full_name: loginResponse.full_name
          }));
          
          // Store driver auth token
          if (loginResponse.access_token) {
            await SecureStore.setItemAsync('driverAuthToken', loginResponse.access_token);
            // Store driver login timestamp
            await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
          }
          
          // Create minimal driver user object for verification screen
          const driverUser = {
            id: loginResponse.driver_id,
            fullName: loginResponse.full_name,
            primaryMobile: phoneNumber,
            secondaryMobile: undefined,
            password: password,
            address: 'Driver Address',
            aadharNumber: '',
            documents: {},
            driver_status: driverStatus,
            account_status: 'inactive' // Map PROCESSING to inactive for AccountVerificationScreen
          };
          
          // NOTE: do NOT call the shared AuthContext login() here - it writes to the
          // fleet-owner's authToken/userData/ownerLastLogin keys, which would silently
          // log the owner out of their own session if one exists. loginDriver() above
          // already persisted driverAuthToken/driverAuthInfo, which is all the driver
          // screens read from.

          // Redirect to driver verification screen instead of dashboard
          router.replace('/driver-verification');
          return;
        }
        
        // Check if driver status allows login (ONLINE, OFFLINE, DRIVING are allowed)
        const allowedStatuses = ['ONLINE', 'OFFLINE', 'DRIVING', 'online', 'offline', 'driving'];
        if (!allowedStatuses.includes(driverStatus)) {
          throw new Error(`Driver account status is ${driverStatus}. Please contact support for assistance.`);
        }
        
        // Create driver user object from login response
        const driverUser = {
          id: loginResponse.driver_id,
          fullName: loginResponse.full_name,
          primaryMobile: phoneNumber,
          secondaryMobile: undefined,
          password: password,
          address: 'Driver Address', // This could be fetched separately if needed
          aadharNumber: '', // Drivers don't have Aadhar in this context
          documents: {}, // No documents needed for quick login
          driver_status: driverStatus // Include driver status from login response
        };
        
        // NOTE: do NOT call the shared AuthContext login() here - it writes to the
        // fleet-owner's authToken/userData/ownerLastLogin keys, which would silently
        // log the owner out of their own session if one exists. loginDriver() above
        // already persisted driverAuthToken/driverAuthInfo, which is all the driver
        // screens read from.

        // Store driver login timestamp
        await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
        
        console.log('✅ Driver logged in successfully, redirecting to dashboard...');
        router.replace('/quick-dashboard');
      } else {
        throw new Error('No access token received from server');
      }
    } catch (error: any) {
      console.error('❌ Driver login failed:', error);
      Alert.alert(t('quickLogin.loginFailedTitle'), error.message || t('quickLogin.loginFailedBody'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#3B82F6', '#1E40AF']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <TouchableOpacity onPress={async () => {
            // Prevent multiple simultaneous navigations
            if (isNavigating.current) {
              return;
            }
            isNavigating.current = true;
            
            try {
              // Dismiss keyboard first and wait for it to fully close
              Keyboard.dismiss();
              
              // Wait for keyboard to fully dismiss (keyboard animation takes ~250ms)
              // This ensures smooth transition without flickering
              await new Promise(resolve => setTimeout(resolve, 300));
              
            // Clear any existing driver data before switching to owner login
              // Wait for all deletions to complete before navigating
            try {
                await Promise.all([
                  SecureStore.deleteItemAsync('driverAuthToken').catch(() => {}),
                  SecureStore.deleteItemAsync('driverAuthInfo').catch(() => {}),
                  SecureStore.deleteItemAsync('driverLastLogin').catch(() => {}),
                ]);
              console.log('✅ Cleared driver data before switching to owner login');
              } catch (error) {
                console.log('ℹ️ Error clearing driver data:', error);
              }
              
              // Small delay to ensure state is cleared before navigation
              // This prevents the index.tsx auth check from seeing stale driver data
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Use replace to avoid GO_BACK errors when there's no history
              router.replace('/login');
            } catch (error) {
              console.error('❌ Error during navigation:', error);
              isNavigating.current = false;
            }
          }} style={styles.backButton}>
            <ArrowLeft color="#FFFFFF" size={24} />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.header}>
            <Text style={styles.title}>{t('login.modeDriver')}</Text>
            <Text style={styles.subtitle}>{t('quickLogin.subtitle')}</Text>
          </View>

          <View style={styles.form}>
          <Text style={styles.inputLabel}>{t('login.mobileNumber')}</Text>
          <View style={styles.inputGroup}>
              <Smartphone color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                maxLength={13}
              />
            </View>

            <Text style={styles.inputLabel}>{t('login.password')}</Text>
            <View style={styles.inputGroup}>
              <Lock color="#6B7280" size={20} />

              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff color="#6B7280" size={20} />
                ) : (
                  <Eye color="#6B7280" size={20} />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleQuickLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? t('login.signingIn') : t('login.driverLoginButton')}
              </Text>
              <ArrowRight color="#FFFFFF" size={20} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/forgot-password?role=driver')}>
              <Text style={styles.forgotPasswordText}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Test credentials button removed - now using real driver authentication */}
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
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
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backButton: {
    padding: 8,
    marginTop: 12,
    marginLeft: 16,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputLabel: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#E5E7EB',
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
  },
  eyeButton: {
    padding: 4,
  },
  loginButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginRight: 8,
  },
  forgotPasswordText: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#3B82F6',
  },
  // Test button styles removed - no longer needed
});