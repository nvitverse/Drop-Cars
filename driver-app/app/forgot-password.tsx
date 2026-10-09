import React, { useState, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  Mail,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  HelpCircle,
  MessageSquare,
  X,
  Send,
  CreditCard,
} from 'lucide-react-native';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { loginDriver } from '@/services/driver/driverService';
import * as SecureStore from '@/utils/secureStore';
import {
  saveGuestHelpSession,
  getSavedGuestHelpSession,
} from '@/services/support/guestHelpService';
import GuestHelpFloatingButton from '@/components/guest/GuestHelpFloatingButton';

type ResetRole = 'vehicle_owner' | 'driver';
type FlowStep = 'MOBILE' | 'LINK_EMAIL' | 'ENTER_OTP';

interface CustomAlertBtn {
  text: string;
  onPress?: () => void;
  style?: 'cancel' | 'default' | 'primary';
}

const cleanMobile = (phone: string): string => phone.replace(/^\+91/, '').replace(/\D/g, '');

const validateIndianMobile = (phone: string): boolean => {
  return /^[6-9]\d{9}$/.test(cleanMobile(phone));
};

const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const isAccountNotFoundMsg = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  if (lower.includes('does not match') || lower.includes('mismatch')) return false;
  return (
    lower.includes('no vehicle owner account') ||
    lower.includes('no duty driver account') ||
    lower.includes('no driver account') ||
    lower.includes('no account found') ||
    (lower.includes('no ') && lower.includes('account found'))
  );
};

const SUPPORT_REASONS = [
  'Identity Verification Failed (DL / Aadhaar mismatch)',
  'No email address linked to my account',
  'Email OTP code not arriving in inbox/spam',
  'Account password locked or forgotten',
  'Need help with registered mobile number',
  'Other / Custom message',
];

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const [role] = useState<ResetRole>(params.role === 'driver' ? 'driver' : 'vehicle_owner');

  const [step, setStep] = useState<FlowStep>('MOBILE');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // --- Proof verification failure tracking ---
  const [proofFailed, setProofFailed] = useState(false);

  // --- Link Email In-Page State (For accounts with no email) ---
  const [linkProof, setLinkProof] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [linkOtpSent, setLinkOtpSent] = useState(false);
  const [linkOtpCode, setLinkOtpCode] = useState('');
  const [linkNewPassword, setLinkNewPassword] = useState('');
  const [linkConfirmPassword, setLinkConfirmPassword] = useState('');
  const [submittingLinkEmail, setSubmittingLinkEmail] = useState(false);

  // --- Custom Popup Alert Modal State (with Top-Right X Close Button) ---
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: CustomAlertBtn[];
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showAlert = (
    title: string,
    message: string,
    buttons: CustomAlertBtn[] = [{ text: 'OK' }]
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      buttons,
    });
  };

  const hideAlert = () => {
    setCustomAlert((prev) => ({ ...prev, visible: false }));
  };

  // --- Support Request Modal State ---
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState(SUPPORT_REASONS[0]);
  const [customSupportNote, setCustomSupportNote] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportSuccessMsg, setSupportSuccessMsg] = useState('');

  const isDriver = role === 'driver';
  const proofLabel = isDriver ? 'Licence Number' : 'Aadhaar Number';

  // Cooldown countdown for Resend OTP button
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  const handleChangeNumber = () => {
    setPhoneNumber('');
    setStep('MOBILE');
    setOtpSent(false);
    setOtpCode('');
    setOtpInfo('');
    setNewPassword('');
    setConfirmPassword('');
    setLoading(false);
    setResendTimer(0);
    setProofFailed(false);
    setLinkProof('');
    setLinkEmail('');
    setLinkOtpCode('');
    setLinkOtpSent(false);
    setLinkNewPassword('');
    setLinkConfirmPassword('');
  };

  // Perform automatic sign-in after successful password reset
  const performAutoLogin = async (pass: string) => {
    try {
      if (isDriver) {
        const loginResponse = await loginDriver(cleanMobile(phoneNumber), pass);
        const driverStatus = loginResponse.driver_status || loginResponse.status;
        if (driverStatus === 'PROCESSING') {
          await SecureStore.setItemAsync('driverTempPassword', pass);
          await SecureStore.setItemAsync('driverLoginResponse', JSON.stringify(loginResponse));
          await SecureStore.setItemAsync('driverUser', JSON.stringify({
            primary_number: cleanMobile(phoneNumber),
            full_name: loginResponse.full_name,
          }));
          router.replace('/driver-verification');
          return;
        }
        await SecureStore.setItemAsync('driverLastLogin', Date.now().toString());
        router.replace('/quick-dashboard');
      } else {
        router.replace('/login' as any);
      }
    } catch (err) {
      // Fallback to login screen if auto login encounters a status restriction
      router.replace((isDriver ? '/quick-login' : '/login') as any);
    }
  };

  const handleOpenSupportModal = () => {
    if (!validateIndianMobile(phoneNumber)) {
      showAlert('Mobile Number Required', 'Please enter your 10-digit registered mobile number first so we can find your account.');
      return;
    }
    setSupportSuccessMsg('');
    setCustomSupportNote('');
    setShowSupportModal(true);
  };

  const handleSendAdminSupportRequest = async () => {
    if (!validateIndianMobile(phoneNumber)) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.invalidMobile'));
      return;
    }
    setSubmittingSupport(true);
    try {
      const existingSession = await getSavedGuestHelpSession();
      const mobileClean = cleanMobile(phoneNumber);
      const res = await axiosInstance.post('/api/support/public-request-admin-help', {
        role,
        primary_number: mobileClean,
        reason: selectedReason,
        message: customSupportNote.trim() || undefined,
        help_token: existingSession?.help_token || undefined,
      });

      if (res.data?.help_token) {
        await saveGuestHelpSession({
          help_token: res.data.help_token,
          thread_key: res.data.thread_key || '',
          role,
          primary_number: mobileClean,
        });
      }

      setSupportSuccessMsg(res.data?.message || 'Support request submitted to Drop Cars Admin.');
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      showAlert(
        'Request Failed',
        typeof detail === 'string'
          ? detail
          : 'Could not send support request. Please check your mobile number and try again.'
      );
    } finally {
      setSubmittingSupport(false);
    }
  };

  // Step 1: Request OTP for account with email
  const handleSendOtp = async () => {
    if (!validateIndianMobile(phoneNumber)) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.invalidMobile'));
      return;
    }
    setLoading(true);
    try {
      const res = await axiosInstance.post('/api/users/email/request-reset-otp', {
        role,
        primary_number: cleanMobile(phoneNumber),
      });
      setOtpSent(true);
      setStep('ENTER_OTP');
      setOtpInfo(res.data?.message || t('forgotPassword.otpSentFallback'));
      setResendTimer(60); // 60s cooldown
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      const detailStr = typeof detail === 'string' ? detail : t('forgotPassword.sendCodeFailed');
      const lowerDetail = detailStr.toLowerCase();

      // If backend reports no email linked, switch seamlessly in-page to LINK_EMAIL step!
      if (lowerDetail.includes('no email is linked') || lowerDetail.includes('no email')) {
        setStep('LINK_EMAIL');
        setLinkOtpSent(false);
        setProofFailed(false);
      } else if (isAccountNotFoundMsg(detailStr)) {
        // Account does NOT exist! Do NOT suggest Admin Help. Suggest Create Account instead!
        showAlert(
          'Account Not Found',
          detailStr,
          [
            { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
            { text: 'Create Account', onPress: () => router.push('/signup' as any) },
          ]
        );
      } else {
        setProofFailed(true);
        showAlert(
          t('forgotPassword.errorTitle'),
          detailStr,
          [
            { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
            { text: 'Request Admin Help', onPress: handleOpenSupportModal },
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 1b: Validate proof + Send Code to new email (In-Page)
  const handleLinkEmailRequestOtp = async () => {
    if (!linkProof.trim()) {
      showAlert('Missing Identity Proof', `Please enter your ${proofLabel} to verify ownership of this account.`);
      return;
    }
    if (!validateEmail(linkEmail)) {
      showAlert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setSubmittingLinkEmail(true);
    try {
      const res = await axiosInstance.post('/api/users/email/link-email-and-request-otp', {
        role,
        primary_number: cleanMobile(phoneNumber),
        proof: linkProof.trim(),
        email: linkEmail.trim(),
      });
      setLinkOtpSent(true);
      setStep('ENTER_OTP');
      setResendTimer(60);
      showAlert('Code Sent!', res.data?.message || `A 6-digit code was sent to ${linkEmail}.`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      const detailStr = typeof detail === 'string' ? detail : 'Could not send verification code.';

      if (isAccountNotFoundMsg(detailStr)) {
        showAlert(
          'Account Not Found',
          detailStr,
          [
            { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
            {
              text: 'Create Account',
              onPress: () => {
                router.push('/signup' as any);
              },
            },
          ]
        );
      } else {
        setProofFailed(true);
        showAlert(
          'Verification Failed',
          detailStr,
          [
            { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
            {
              text: 'Request Admin Help',
              onPress: handleOpenSupportModal,
            },
          ]
        );
      }
    } finally {
      setSubmittingLinkEmail(false);
    }
  };

  // Step 2: Verify OTP, Link Email in DB, Reset Password & Auto Sign-In
  const handleLinkEmailVerifyAndReset = async () => {
    if (!linkOtpCode.trim() || !linkNewPassword || !linkConfirmPassword) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.fillAllFields'));
      return;
    }
    if (linkNewPassword.length < 6) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.passwordTooShort'));
      return;
    }
    if (linkNewPassword !== linkConfirmPassword) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.passwordsDontMatchFull'));
      return;
    }
    setSubmittingLinkEmail(true);
    try {
      await axiosInstance.post('/api/users/email/verify-link-and-reset', {
        role,
        primary_number: cleanMobile(phoneNumber),
        email: linkEmail.trim(),
        code: linkOtpCode.trim(),
        new_password: linkNewPassword,
      });
      showAlert(
        'Email Linked & Password Changed!',
        `Your email (${linkEmail.trim()}) has been permanently linked to account +91 ${cleanMobile(phoneNumber)} and your password is updated. Logging you in now...`,
        [{ text: 'OK', onPress: () => performAutoLogin(linkNewPassword) }]
      );
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      const detailStr = typeof detail === 'string' ? detail : 'Verification failed.';
      setProofFailed(true);
      showAlert(
        t('forgotPassword.errorTitle'),
        detailStr,
        [
          { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
          {
            text: 'Request Admin Help',
            onPress: handleOpenSupportModal,
          },
        ]
      );
    } finally {
      setSubmittingLinkEmail(false);
    }
  };

  const handleEmailReset = async () => {
    if (!otpCode.trim() || !newPassword || !confirmPassword) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.fillAllFields'));
      return;
    }
    if (newPassword.length < 6) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('forgotPassword.errorTitle'), t('forgotPassword.passwordsDontMatchFull'));
      return;
    }
    setLoading(true);
    try {
      await axiosInstance.post('/api/users/email/reset-password', {
        role,
        primary_number: cleanMobile(phoneNumber),
        code: otpCode.trim(),
        new_password: newPassword,
      });
      showAlert(
        t('forgotPassword.passwordChangedTitle'),
        'Your password has been changed successfully. Logging you in now...',
        [
          {
            text: 'OK',
            onPress: () => performAutoLogin(newPassword),
          },
        ]
      );
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      const detailStr = typeof detail === 'string' ? detail : t('forgotPassword.resetFailed');
      setProofFailed(true);
      showAlert(
        t('forgotPassword.errorTitle'),
        detailStr,
        [
          { text: 'Different Number', onPress: handleChangeNumber, style: 'cancel' },
          {
            text: 'Request Admin Help',
            onPress: handleOpenSupportModal,
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

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
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Top Navigation */}
            <TouchableOpacity
              onPress={() => {
                if (step !== 'MOBILE') {
                  setStep('MOBILE');
                } else if (router.canGoBack()) {
                  safeBack(router, '/login');
                } else {
                  router.replace((isDriver ? '/quick-login' : '/login') as any);
                }
              }}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <ArrowLeft color="#FFFFFF" size={20} />
              <Text style={styles.backText}>{t('forgotPassword.back')}</Text>
            </TouchableOpacity>

            {/* Premium Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <KeyRound color="#6366F1" size={24} />
              </View>
              <Text style={styles.title}>{t('forgotPassword.title')}</Text>
              <Text style={styles.subtitle}>
                {step === 'MOBILE'
                  ? 'Enter your registered mobile number to receive a 6-digit reset code via Email.'
                  : step === 'LINK_EMAIL'
                  ? `Verify your ${proofLabel} to add your email address.`
                  : 'Enter the 6-digit code sent to your email and set your new password.'}
              </Text>

              {/* Step Pill */}
              <View style={styles.stepBadge}>
                <ShieldCheck color="#A5B4FC" size={13} />
                <Text style={styles.stepBadgeText}>
                  {step === 'MOBILE'
                    ? 'Step 1 of 2 • Verify Account'
                    : step === 'LINK_EMAIL'
                    ? `Step 1b of 2 • Verify ${proofLabel}`
                    : 'Step 2 of 2 • Reset Password'}
                </Text>
              </View>
            </View>

            {/* Main Form Card */}
            <View style={[styles.form, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
              {/* Account Role Badge */}
              <View style={styles.roleHeaderRow}>
                <View style={[styles.accountTypeBadge, { backgroundColor: isDarkMode ? '#0F172A' : '#EEF2FF' }]}>
                  <Text style={[styles.accountTypeText, { color: colors.primary }]}>
                    {isDriver ? 'Duty Driver Account' : 'Fleet Driver Account'}
                  </Text>
                </View>

                {/* Change Number Link */}
                {phoneNumber.length > 0 && (
                  <TouchableOpacity
                    onPress={handleChangeNumber}
                    style={styles.changeNumberBtn}
                    activeOpacity={0.7}
                  >
                    <RefreshCw size={13} color="#4F46E5" />
                    <Text style={styles.changeNumberText}>Change Number</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Mobile Number Input */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {t('forgotPassword.mobileNumber')}
              </Text>
              <View
                style={[
                  styles.inputGroup,
                  {
                    backgroundColor: colors.background,
                    borderColor: step === 'ENTER_OTP' ? '#C7D2FE' : colors.border,
                  },
                ]}
              >
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
                  placeholder={t('forgotPassword.mobilePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  editable={step === 'MOBILE' && !loading}
                />
                {step === 'ENTER_OTP' && (
                  <View style={styles.verifiedIconWrap}>
                    <CheckCircle2 color="#10B981" size={20} />
                  </View>
                )}
              </View>

              {/* Action Button: Change Number & Contact Admin buttons */}
              <View style={styles.inputHelperRow}>
                {phoneNumber.length > 0 && step === 'MOBILE' && (
                  <TouchableOpacity
                    onPress={handleChangeNumber}
                    style={styles.inlineChangeNumberBtn}
                    activeOpacity={0.7}
                  >
                    <RefreshCw size={12} color="#4F46E5" />
                    <Text style={styles.inlineChangeNumberText}>Clear / Use different number</Text>
                  </TouchableOpacity>
                )}
                {phoneNumber.length === 10 && proofFailed && (
                  <TouchableOpacity
                    onPress={handleOpenSupportModal}
                    style={styles.contactAdminHeaderBtn}
                    activeOpacity={0.75}
                  >
                    <MessageSquare size={13} color="#D97706" />
                    <Text style={styles.contactAdminHeaderText}>Request Admin Help</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* STEP 1: Enter Mobile Number */}
              {step === 'MOBILE' && (
                <>
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    We will send a 6-digit verification code to the email address registered with this mobile number.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      { backgroundColor: colors.primary },
                      (loading || phoneNumber.length < 10) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSendOtp}
                    disabled={loading || phoneNumber.length < 10}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        {t('forgotPassword.sendCodeToEmail')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* STEP 1b: Verify Identity (DL / Aadhaar) & Add Email (In-Page) */}
              {step === 'LINK_EMAIL' && (
                <>
                  {/* Failure Callout Banner if Proof verification failed */}
                  {proofFailed && (
                    <View style={styles.proofFailedCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <HelpCircle color="#DC2626" size={18} />
                        <Text style={styles.proofFailedTitle}>Verification Failed</Text>
                      </View>
                      <Text style={styles.proofFailedText}>
                        Your {proofLabel} could not be verified automatically against our records.
                      </Text>
                      <TouchableOpacity
                        style={styles.modalAdminHelpBtn}
                        onPress={handleOpenSupportModal}
                        activeOpacity={0.8}
                      >
                        <MessageSquare size={14} color="#FFFFFF" />
                        <Text style={styles.modalAdminHelpBtnText}>Request Admin Help</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={[styles.helperText, { color: colors.textSecondary, marginBottom: 8 }]}>
                    Please verify your {proofLabel} to link an email address for password reset.
                  </Text>

                  {/* Proof Input */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>{proofLabel}</Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <CreditCard color={colors.textSecondary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={linkProof}
                      onChangeText={setLinkProof}
                      placeholder={isDriver ? 'Enter Driving Licence Number' : 'Enter Aadhaar Number'}
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="characters"
                    />
                  </View>

                  {/* Email Input */}
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Your Email Address</Text>
                  <View style={[styles.inputGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Mail color={colors.primary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={linkEmail}
                      onChangeText={setLinkEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="driver.name@gmail.com"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      { backgroundColor: colors.primary },
                      (submittingLinkEmail || !linkProof.trim() || !validateEmail(linkEmail)) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleLinkEmailRequestOtp}
                    disabled={submittingLinkEmail || !linkProof.trim() || !validateEmail(linkEmail)}
                    activeOpacity={0.8}
                  >
                    {submittingLinkEmail ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.submitButtonText}>Send Code to Email</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* STEP 2: Enter 6-digit Code & Set New Password */}
              {step === 'ENTER_OTP' && (
                <>
                  {/* Sent Confirmation Banner */}
                  <View style={styles.otpSentBanner}>
                    <Mail color="#4F46E5" size={20} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.otpSentBannerTitle}>Code Sent to Email</Text>
                      <Text style={styles.otpSentBannerText}>
                        {otpInfo || `Check your email inbox (${linkEmail.trim() || 'registered email'}) for the 6-digit verification code.`}
                      </Text>
                    </View>
                  </View>

                  {/* 6-Digit Code Input */}
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>
                    {t('forgotPassword.codeLabel')}
                  </Text>
                  <View
                    style={[
                      styles.inputGroup,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <KeyRound color={colors.primary} size={18} />
                    <TextInput
                      style={[styles.input, styles.codeInput, { color: colors.text }]}
                      value={linkOtpSent ? linkOtpCode : otpCode}
                      onChangeText={(v) => {
                        const val = v.replace(/\D/g, '').slice(0, 6);
                        if (linkOtpSent) setLinkOtpCode(val);
                        else setOtpCode(val);
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="000000"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {/* Resend Code Link with Timer */}
                  <View style={styles.resendRow}>
                    <TouchableOpacity
                      onPress={linkOtpSent ? handleLinkEmailRequestOtp : handleSendOtp}
                      disabled={loading || submittingLinkEmail || resendTimer > 0}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.resendText,
                          { color: resendTimer > 0 ? colors.textSecondary : colors.primary },
                        ]}
                      >
                        {resendTimer > 0
                          ? `Resend code in ${resendTimer}s`
                          : t('forgotPassword.resendCode')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* New Password */}
                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>
                    {t('forgotPassword.newPassword')}
                  </Text>
                  <View
                    style={[
                      styles.inputGroup,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Lock color={colors.textSecondary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={linkOtpSent ? linkNewPassword : newPassword}
                      onChangeText={(v) => {
                        setLinkNewPassword(v);
                        setNewPassword(v);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={t('forgotPassword.newPasswordPlaceholder')}
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

                  {/* Confirm Password */}
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    {t('forgotPassword.confirmNewPassword')}
                  </Text>
                  <View
                    style={[
                      styles.inputGroup,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Lock color={colors.textSecondary} size={18} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={linkOtpSent ? linkConfirmPassword : confirmPassword}
                      onChangeText={(v) => {
                        setLinkConfirmPassword(v);
                        setConfirmPassword(v);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {/* Submit & Auto Sign In Button */}
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      { backgroundColor: colors.primary },
                      (loading || submittingLinkEmail) && styles.submitButtonDisabled,
                    ]}
                    onPress={linkOtpSent ? handleLinkEmailVerifyAndReset : handleEmailReset}
                    disabled={loading || submittingLinkEmail}
                    activeOpacity={0.8}
                  >
                    {loading || submittingLinkEmail ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.submitButtonText}>Reset Password & Sign In</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Direct Admin Support Request Banner — ONLY shown if proof / verification failed */}
            {proofFailed && (
              <TouchableOpacity
                style={styles.adminHelpCard}
                onPress={handleOpenSupportModal}
                activeOpacity={0.8}
              >
                <View style={styles.adminHelpCardIcon}>
                  <MessageSquare color="#D97706" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminHelpCardTitle}>Identity Verification Failed?</Text>
                  <Text style={styles.adminHelpCardSubtitle}>
                    Click here to send a direct help request to Drop Cars Admin. Our team will verify your account manually.
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* --- Custom Popup Alert Modal (with Top-Right X Close Button) --- */}
      <Modal
        visible={customAlert.visible}
        transparent
        animationType="fade"
        onRequestClose={hideAlert}
      >
        <View style={styles.alertBackdrop}>
          <View style={[styles.alertContainer, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
            {/* Top-Right (X) Close Button */}
            <TouchableOpacity
              style={styles.alertCloseBtn}
              onPress={hideAlert}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X color={colors.textSecondary} size={18} />
            </TouchableOpacity>

            {/* Alert Title */}
            <Text style={[styles.alertTitle, { color: colors.text }]}>{customAlert.title}</Text>

            {/* Alert Message */}
            <Text style={[styles.alertMessage, { color: colors.textSecondary }]}>{customAlert.message}</Text>

            {/* Action Buttons */}
            <View style={styles.alertButtonRow}>
              {customAlert.buttons.map((btn, index) => {
                const isPrimary = index === customAlert.buttons.length - 1 && customAlert.buttons.length > 1;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.alertActionBtn,
                      isPrimary ? styles.alertActionBtnPrimary : styles.alertActionBtnSecondary,
                    ]}
                    onPress={() => {
                      hideAlert();
                      if (btn.onPress) btn.onPress();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.alertActionBtnText,
                        isPrimary ? styles.alertActionBtnTextPrimary : styles.alertActionBtnTextSecondary,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* --- Request Admin Support Modal --- */}
      <Modal
        visible={showSupportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <MessageSquare color="#4F46E5" size={22} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Request Admin Help</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSupportModal(false)} style={{ padding: 4 }}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            {/* Success State */}
            {supportSuccessMsg ? (
              <View style={styles.modalSuccessBody}>
                <CheckCircle2 color="#10B981" size={48} />
                <Text style={styles.modalSuccessTitle}>Request Sent to Admin!</Text>
                <Text style={styles.modalSuccessText}>{supportSuccessMsg}</Text>
                <Text style={styles.modalSuccessHint}>
                  Your message has been created as a Chat thread in Drop Cars Admin App. Our support team will review your account (+91 {phoneNumber}) and assist you.
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setShowSupportModal(false)}
                >
                  <Text style={styles.modalCloseBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Request Form */
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Select the reason for your request for account <Text style={{ fontFamily: 'Inter-Bold', color: colors.primary }}>+91 {phoneNumber}</Text>:
                </Text>

                {/* Reason Selection Chips */}
                <View style={styles.reasonsList}>
                  {SUPPORT_REASONS.map((r) => {
                    const active = selectedReason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.reasonChip,
                          active && styles.reasonChipActive,
                          { borderColor: active ? '#4F46E5' : colors.border },
                        ]}
                        onPress={() => setSelectedReason(r)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.radioCircle,
                            active && styles.radioCircleActive,
                          ]}
                        />
                        <Text style={[styles.reasonChipText, { color: active ? '#4F46E5' : colors.text }]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Optional Message Field */}
                <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>
                  Additional Details / Message (Optional):
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={customSupportNote}
                  onChangeText={setCustomSupportNote}
                  placeholder="Describe your issue or enter your correct email address..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                {/* Submit Support Button */}
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: colors.primary }]}
                  onPress={handleSendAdminSupportRequest}
                  disabled={submittingSupport}
                  activeOpacity={0.8}
                >
                  {submittingSupport ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Send color="#FFFFFF" size={16} />
                      <Text style={styles.submitButtonText}>Send Request to Admin</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Persistent Pre-Login Help Chat Floating Button */}
      <GuestHelpFloatingButton />
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
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
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    color: '#E0E7FF',
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 17,
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
  form: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  roleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  accountTypeBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  accountTypeText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
  },
  changeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  changeNumberText: {
    color: '#4F46E5',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
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
  codeInput: {
    fontSize: 18,
    letterSpacing: 4,
    fontFamily: 'Inter-Bold',
  },
  verifiedIconWrap: {
    marginLeft: 6,
  },
  inputHelperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  inlineChangeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  inlineChangeNumberText: {
    color: '#4F46E5',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  contactAdminHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  contactAdminHeaderText: {
    color: '#D97706',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  eyeButton: {
    padding: 6,
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    marginBottom: 10,
    marginLeft: 2,
    lineHeight: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    marginLeft: 2,
  },
  otpSentBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  otpSentBannerTitle: {
    color: '#312E81',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  otpSentBannerText: {
    color: '#4338CA',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
  resendRow: {
    alignItems: 'center',
    marginVertical: 6,
  },
  resendText: {
    fontSize: 12.5,
    fontFamily: 'Inter-SemiBold',
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontFamily: 'Inter-Bold',
  },
  adminHelpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
  },
  adminHelpCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminHelpCardTitle: {
    color: '#92400E',
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  adminHelpCardSubtitle: {
    color: '#B45309',
    fontSize: 11.5,
    fontFamily: 'Inter-Medium',
    lineHeight: 15,
  },

  // --- Alert Popup Custom Styles with Top-Right Close Button (X) ---
  alertBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 350,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    position: 'relative',
  },
  alertCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  alertTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  alertMessage: {
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  alertButtonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  alertActionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertActionBtnSecondary: {
    backgroundColor: '#F1F5F9',
  },
  alertActionBtnPrimary: {
    backgroundColor: '#3B82F6',
  },
  alertActionBtnText: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
  },
  alertActionBtnTextSecondary: {
    color: '#334155',
  },
  alertActionBtnTextPrimary: {
    color: '#FFFFFF',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  modalSubtitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Medium',
    marginBottom: 14,
    lineHeight: 18,
  },
  reasonsList: {
    gap: 8,
    marginBottom: 12,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1.5,
    backgroundColor: '#F8FAFC',
  },
  reasonChipActive: {
    backgroundColor: '#EEF2FF',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  radioCircleActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#4F46E5',
  },
  reasonChipText: {
    fontSize: 13.5,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
  textArea: {
    borderRadius: 6,
    padding: 12,
    borderWidth: 1.5,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    minHeight: 80,
    marginBottom: 14,
  },
  modalSuccessBody: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  modalSuccessTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#065F46',
  },
  modalSuccessText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#047857',
    textAlign: 'center',
  },
  modalSuccessHint: {
    fontSize: 12.5,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
  },
  modalCloseBtn: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 10,
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  proofFailedCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  proofFailedTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    color: '#991B1B',
  },
  proofFailedText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#B91C1C',
    lineHeight: 16,
  },
  modalAdminHelpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  modalAdminHelpBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
});
