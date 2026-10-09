import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff, Phone, Lock, ArrowRight, Shield, Building, Car, Briefcase } from 'lucide-react-native';
import { useVendorAuth } from '../../hooks/useVendorAuth';
import { gradients } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

type AccountRoleMode = 'VENDOR' | 'B2B';

export default function SignIn() {
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountRoleMode, setAccountRoleMode] = useState<AccountRoleMode>('VENDOR');
  
  const { signIn, loading, error, clearError } = useVendorAuth();

  const handleSignIn = async () => {
    if (!primaryNumber.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      const result = await signIn(
        {
          primary_number: primaryNumber,
          password: password,
        },
        accountRoleMode
      );
      
      if (result) {
        await AsyncStorage.setItem('accountRoleMode', accountRoleMode);
        const accountStatus = result.vendor.account_status;
        console.log('Account Status:', accountStatus, 'Role:', accountRoleMode);
        if (accountStatus === 'Active') {
          router.replace('/(terms)/terms');
        } else if (accountStatus === 'Pending') {
          router.push('/(auth)/account-status?status=Pending&message=Your account is currently inactive and requires verification. It will be activated within 24 hours after verification.');
        } else if (accountStatus === 'Blocked') {
          router.push('/(auth)/account-status?status=Pending&message=Your account is currently inactive and requires verification. It will be activated within 24 hours after verification.');
        } else {
          router.push('/(auth)/account-status?status=INACTIVE&message=Your account status is BLOCKED. Please contact support for assistance.');
        }
      }
    } catch (error) {
      Alert.alert('Sign In Failed', 'Invalid credentials. Please check your phone number and password and try again.');
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'primaryNumber') {
      setPrimaryNumber(value);
    } else if (field === 'password') {
      setPassword(value);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior="padding"
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <LinearGradient
            colors={accountRoleMode === 'B2B' ? ['#4C1D95', '#7C3AED'] : gradients.primary}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeTitle}>
              {accountRoleMode === 'B2B' ? 'Welcome B2B Partner' : 'Welcome Back'}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {accountRoleMode === 'B2B'
                ? 'Sign in to book cars for guests, track commissions & corporate billing'
                : 'Sign in to your vendor account to continue'}
            </Text>

            {/* Account Role Selector Tabs */}
            <View style={styles.roleTabContainer}>
              <TouchableOpacity
                style={[styles.roleTab, accountRoleMode === 'VENDOR' && styles.roleTabActive]}
                onPress={() => setAccountRoleMode('VENDOR')}
              >
                <Car size={15} color={accountRoleMode === 'VENDOR' ? '#7C3AED' : '#FFFFFF90'} />
                <Text style={[styles.roleTabText, accountRoleMode === 'VENDOR' && styles.roleTabTextActive]}>
                  Vendor
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleTab, accountRoleMode === 'B2B' && styles.roleTabActiveB2B]}
                onPress={() => setAccountRoleMode('B2B')}
              >
                <Building size={15} color={accountRoleMode === 'B2B' ? '#4C1D95' : '#FFFFFF90'} />
                <Text style={[styles.roleTabText, accountRoleMode === 'B2B' && styles.roleTabTextActiveB2B]}>
                  B2B Partner
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mobile Number</Text>
            <View style={styles.inputContainer}>
              <Phone size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your mobile number"
                value={primaryNumber}
                onChangeText={(value) => handleInputChange('primaryNumber', value)}
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <Lock size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={(value) => handleInputChange('password', value)}
                secureTextEntry={!showPassword}
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                {showPassword ? 
                  <EyeOff size={20} color="#6B7280" /> : 
                  <Eye size={20} color="#6B7280" />
                }
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            <LinearGradient
              colors={gradients.primary}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Text>
                {!loading && <ArrowRight size={20} color="#FFFFFF" />}
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/sign-up', params: { role: accountRoleMode } })}
            >
              <Text style={styles.linkTextBold}>
                {accountRoleMode === 'B2B' ? 'Register as B2B Partner' : 'Create Account'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Section */}
        <View style={styles.footerSection}>
          <View style={styles.securityNote}>
            <Shield size={16} color="#10B981" />
            <Text style={styles.securityText}>Your data is secure and encrypted</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerGradient: {
  position: 'absolute',
  top: 0,
  left: -width * 0.25,
  width: width * 1.5,
  height: 200,
  borderBottomLeftRadius: 200,
  borderBottomRightRadius: 200,
  transform: [{ scaleX: 1.2 }],
  zIndex: -1,
},
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
headerSection: {
  // paddingTop: height * 0.02,
  paddingBottom: height * 0.04,
  alignItems: 'center',
  position: 'relative',
  overflow: 'visible',
},
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  welcomeContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  topBar: {
  height: 8,
  width: '100%',
  backgroundColor: '#3B82F6',
  borderBottomLeftRadius: 16,
  borderBottomRightRadius: 16,
  marginBottom: 16,
},
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
  roleTabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    padding: 4,
    marginTop: 16,
    width: '100%',
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
  },
  roleTabActive: {
    backgroundColor: '#FFFFFF',
  },
  roleTabActiveB2B: {
    backgroundColor: '#FFFFFF',
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  roleTabTextActive: {
    color: '#7C3AED',
    fontWeight: '800',
  },
  roleTabTextActiveB2B: {
    color: '#4C1D95',
    fontWeight: '800',
  },
  formSection: {
    flex: 1,
    paddingTop: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    height: 56,
  },
  inputIcon: {
    marginRight: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 32,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  signInButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  gradientButton: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginHorizontal: 16,
    fontWeight: '500',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  linkText: {
    fontSize: 16,
    color: '#6B7280',
  },
  link: {
    color: '#3B82F6',
  },
  linkTextBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
  },
  footerSection: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  securityText: {
    fontSize: 14,
    color: '#166534',
    marginLeft: 8,
    fontWeight: '500',
  },
});