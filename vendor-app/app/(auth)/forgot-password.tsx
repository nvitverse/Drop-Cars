import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff, Phone, Lock, CreditCard, ArrowLeft, KeyRound } from 'lucide-react-native';
import api from '../api/api';

export default function ForgotPassword() {
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Email OTP is the ONLY reset method (owner decision: Aadhaar numbers are
  // not secret enough). No email linked -> contact admin.
  const [emailMode, setEmailMode] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpInfo, setOtpInfo] = useState('');

  const handleSendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(primaryNumber.trim())) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/users/email/request-reset-otp', {
        role: 'vendor',
        primary_number: primaryNumber.trim(),
      });
      setOtpSent(true);
      setOtpInfo(res.data?.message || 'Code sent. Check the email inbox (and spam).');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailReset = async () => {
    if (!otpCode.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all the fields');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/email/reset-password', {
        role: 'vendor',
        primary_number: primaryNumber.trim(),
        code: otpCode.trim(),
        new_password: newPassword,
      });
      Alert.alert(
        'Password Changed',
        'Your password has been changed. Please sign in with your new password.',
        [{ text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in') }]
      );
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!primaryNumber.trim() || !aadhaar.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all the fields');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(primaryNumber.trim())) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match. Please type the same password in both boxes.');
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      await api.post('/users/forgot-password', {
        role: 'vendor',
        primary_number: primaryNumber.trim(),
        proof: aadhaar.trim(),
        new_password: newPassword,
      });

      Alert.alert(
        'Password Changed',
        'Your password has been changed. Please sign in with your new password.',
        [{ text: 'Sign In', onPress: () => router.replace('/(auth)/sign-in') }]
      );
    } catch (error: any) {
      let message = 'Could not reset password. Please try again.';
      const detail = error?.response?.data?.detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (error?.code === 'ERR_NETWORK') {
        message = 'Network error. Please check your internet connection.';
      }
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color="#1F2937" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerSection}>
          <View style={styles.iconCircle}>
            <KeyRound size={32} color="#3B82F6" />
          </View>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            We&apos;ll email you a 6-digit code to set a new password.
            No email linked? Contact the admin.
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mobile Number</Text>
            <View style={styles.inputContainer}>
              <Phone size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Registered mobile number"
                value={primaryNumber}
                onChangeText={(v) => setPrimaryNumber(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {emailMode ? (
            !otpSent ? (
              <View style={styles.inputGroup}>
                <Text style={styles.helperText}>
                  We will send a 6-digit code to the email linked to this account.
                </Text>
                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#3B82F6', '#1D4ED8']}
                    style={styles.gradientButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Code to Email'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.inputGroup}>
                {!!otpInfo && <Text style={styles.helperText}>{otpInfo}</Text>}
                <Text style={styles.inputLabel}>6-digit Code</Text>
                <View style={styles.inputContainer}>
                  <CreditCard size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Code from the email"
                    value={otpCode}
                    onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={{ alignSelf: 'center', paddingVertical: 4 }}>
                  <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '600' }}>Resend code</Text>
                </TouchableOpacity>
              </View>
            )
          ) : null}

          {(!emailMode || otpSent) && (
          <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputContainer}>
              <Lock size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                {showPassword ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <View style={styles.inputContainer}>
              <Lock size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Type the same password again"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <Text style={styles.errorText}>Passwords do not match</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.buttonDisabled]}
            onPress={emailMode ? handleEmailReset : handleSubmit}
            disabled={loading}
          >
            <LinearGradient
              colors={['#3B82F6', '#1D4ED8']}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Changing Password...' : 'Change Password'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          </>
          )}
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
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginTop: 24,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  formSection: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
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
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    marginLeft: 4,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 40,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
