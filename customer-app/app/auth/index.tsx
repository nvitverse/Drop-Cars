import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Car, Mail, Phone, Lock, User, ShieldCheck, KeyRound, Sparkles, ArrowRight, CheckCircle2, MessageSquare } from 'lucide-react-native';
import { SafeArea } from '@/components/SafeArea';
import * as Haptics from 'expo-haptics';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/utils/firebaseClient';
import { isPhoneAuthAvailable, sendPhoneOtp, confirmPhoneOtp } from '@/utils/phoneAuth';

const RECAPTCHA_CONTAINER_ID = 'drop-cars-recaptcha-container';

type AuthMode = 'email' | 'mobile' | 'google';

export default function AuthScreen() {
  // Mobile OTP is the only auth path that actually works in production -
  // Email/Google handlers all return success:false (see the __DEV__-only
  // tabs below). Was defaulting to 'email', so every real user landed on
  // the broken tab first.
  const [authMode, setAuthMode] = useState<AuthMode>('mobile');
  const [isEmailLoginMode, setIsEmailLoginMode] = useState(true);
  
  // Registration / OTP Step state (1: enter email, 2: verify OTP code, 3: set password & profile)
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobilePassword, setMobilePassword] = useState('');
  const [isMobileLoginMode, setIsMobileLoginMode] = useState(true);

  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // --- Phone OTP (Firebase) state - a toggle alongside the existing real
  // Mobile+Password login, not a replacement for it ---
  const [useOtpForMobile, setUseOtpForMobile] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [firebasePhoneOtp, setFirebasePhoneOtp] = useState('');

  const {
    loginWithEmail,
    sendEmailOtp,
    verifyEmailOtp,
    registerWithEmail,
    loginWithFirebaseToken,
    loginWithMobile,
    signupWithMobile
  } = useAuth();
  const router = useRouter();

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // --- Google Sign-In (real, via Firebase) - expo-auth-session gets the
  // Google id_token, then Firebase exchanges it for a Firebase ID token,
  // which is what the backend actually verifies. Needs
  // EXPO_PUBLIC_GOOGLE_*_CLIENT_ID env vars set (see .env.example).
  //
  // useAuthRequest THROWS synchronously (crashing this whole screen, not
  // just disabling the button) if the platform's required client ID is
  // missing - confirmed live: "Client Id property `webClientId` must be
  // defined". Rules of Hooks means this call can't be skipped, so a
  // syntactically-valid placeholder is passed when unset - the hook then
  // builds successfully but is never actually used, because
  // handleGoogleSignIn checks isGoogleSignInConfigured() BEFORE calling
  // promptAsync and shows a clean "not configured" message instead.
  const isGoogleSignInConfigured = () =>
    !!(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const PLACEHOLDER_CLIENT_ID = 'not-configured.apps.googleusercontent.com';
  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || PLACEHOLDER_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = (googleResponse.params as any)?.id_token;
    if (!idToken) return;

    (async () => {
      setLoading(true);
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(getFirebaseAuth(), credential);
        const firebaseIdToken = await result.user.getIdToken();
        const res = await loginWithFirebaseToken(firebaseIdToken);
        if (res.success) {
          router.replace('/(customer)');
        } else {
          showAlert('Google Sign-In Failed', res.message);
        }
      } catch (e: any) {
        showAlert('Google Sign-In Failed', e?.message || 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    })();
  }, [googleResponse]);

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured() || !isGoogleSignInConfigured()) {
      showAlert('Not Set Up Yet', 'Google Sign-In needs a Firebase project + OAuth Client ID to be configured first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // promptAsync() itself can throw (e.g. the browser blocked the
      // popup) separately from the googleResponse useEffect above, which
      // only handles a resolved response, not a rejected promise here.
      await promptGoogleSignIn();
    } catch (e: any) {
      showAlert('Google Sign-In Failed', e?.message || 'Could not open the Google sign-in window. Please try again.');
    }
  };

  // --- Phone OTP (Firebase Phone Auth) ---
  const handleSendFirebasePhoneOtp = async () => {
    if (!phone || phone.length !== 10) {
      showAlert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (!isPhoneAuthAvailable()) {
      showAlert('Not Available Here', 'Phone OTP sign-in isn’t available on this build yet. Please use Mobile Number + Password.');
      return;
    }
    setLoading(true);
    setStatusMessage('');
    try {
      await sendPhoneOtp(phone, RECAPTCHA_CONTAINER_ID);
      setOtpRequested(true);
      setStatusMessage(`A 6-digit code was sent to ${phone}.`);
    } catch (e: any) {
      showAlert('Could Not Send Code', e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFirebasePhoneOtp = async () => {
    if (!firebasePhoneOtp || firebasePhoneOtp.trim().length !== 6) {
      showAlert('Error', 'Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const idToken = await confirmPhoneOtp(firebasePhoneOtp.trim());
      const res = await loginWithFirebaseToken(idToken);
      if (res.success) {
        router.replace('/(customer)');
      } else {
        showAlert('Sign-In Failed', res.message);
      }
    } catch (e: any) {
      showAlert('Incorrect Code', e?.message || 'Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Email Login Flow ---
  const handleEmailLogin = async () => {
    if (!email || !password) {
      showAlert('Error', 'Please enter your email address and password');
      return;
    }
    setLoading(true);
    setStatusMessage('');
    const res = await loginWithEmail(email, password);
    setLoading(false);
    if (res.success) {
      router.replace('/(customer)');
    } else {
      showAlert('Login Failed', res.message);
    }
  };

  // --- Step 1: Send Verification Code to Email ---
  const handleSendEmailOtp = async () => {
    if (!email || !email.includes('@')) {
      showAlert('Error', 'Please enter a valid email address');
      return;
    }
    setLoading(true);
    setStatusMessage('');
    const res = await sendEmailOtp(email, fullName);
    setLoading(false);
    if (res.success) {
      setRegStep(2);
      setStatusMessage(res.message);
    } else {
      showAlert('Error', res.message);
    }
  };

  // --- Step 2: Verify 6-Digit Email OTP ---
  const handleVerifyEmailOtp = async () => {
    if (!otpCode || otpCode.trim().length !== 6) {
      showAlert('Error', 'Please enter the 6-digit code sent to your email');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setStatusMessage('');
    const res = await verifyEmailOtp(otpCode.trim());
    setLoading(false);
    if (res.success) {
      setRegStep(3);
      setStatusMessage('Email verified successfully! Now set your password & name.');
    } else {
      showAlert('Verification Failed', res.message);
    }
  };

  // --- Step 3: Set Password & Create Account ---
  const handleCompleteEmailRegister = async () => {
    if (!password || password.length < 6) {
      showAlert('Error', 'Password must be at least 6 characters long');
      return;
    }
    if (!fullName) {
      showAlert('Error', 'Please enter your full name');
      return;
    }
    setLoading(true);
    setStatusMessage('');
    const res = await registerWithEmail(password, fullName, phone || '9876543210');
    setLoading(false);
    if (res.success) {
      router.replace('/(customer)');
    } else {
      showAlert('Registration Failed', res.message);
    }
  };

  // --- Mobile Number + Password Login ---
  const handleMobileLogin = async () => {
    if (!phone || phone.length !== 10) {
      showAlert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (!mobilePassword) {
      showAlert('Error', 'Please enter your password');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setStatusMessage('');
    const res = await loginWithMobile(phone, mobilePassword);
    setLoading(false);
    if (res.success) {
      router.replace('/(customer)');
    } else {
      showAlert('Login Failed', res.message);
    }
  };

  // --- Mobile Number + Password Signup ---
  const handleMobileSignup = async () => {
    if (!phone || phone.length !== 10) {
      showAlert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (!fullName || fullName.trim().length < 3) {
      showAlert('Error', 'Please enter your full name (at least 3 characters)');
      return;
    }
    if (!mobilePassword || mobilePassword.length < 6) {
      showAlert('Error', 'Password must be at least 6 characters long');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setStatusMessage('');
    const res = await signupWithMobile(phone, fullName.trim(), mobilePassword);
    setLoading(false);
    if (res.success) {
      router.replace('/(customer)');
    } else {
      showAlert('Registration Failed', res.message);
    }
  };

  return (
    <SafeArea style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.gradient}>
        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior="padding"
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* App Brand Header */}
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <Car color="#0EA5E9" size={38} strokeWidth={2.5} />
              </View>
              <Text style={styles.title}>Drop Cars</Text>
              <Text style={styles.subtitle}>Premium One-Way Drop & Outstation Rides</Text>
            </View>

            {/* Auth Mode Tabs - Email/Google are dev-only (see the handlers
                below, both always return success:false against the real
                backend); a real user only ever sees Mobile OTP. */}
            <View style={styles.modeTabs}>
              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.modeTab, authMode === 'email' && styles.activeModeTab]}
                  onPress={() => { setAuthMode('email'); setStatusMessage(''); }}
                >
                  <Mail color={authMode === 'email' ? '#0EA5E9' : '#94A3B8'} size={18} />
                  <Text style={[styles.modeTabText, authMode === 'email' && styles.activeModeTabText]}>Email</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.modeTab, authMode === 'mobile' && styles.activeModeTab]}
                onPress={() => { setAuthMode('mobile'); setStatusMessage(''); }}
              >
                <Phone color={authMode === 'mobile' ? '#0EA5E9' : '#94A3B8'} size={18} />
                <Text style={[styles.modeTabText, authMode === 'mobile' && styles.activeModeTabText]}>Mobile OTP</Text>
              </TouchableOpacity>

              {__DEV__ && (
                <TouchableOpacity
                  style={[styles.modeTab, authMode === 'google' && styles.activeModeTab]}
                  onPress={() => { setAuthMode('google'); setStatusMessage(''); }}
                >
                  <Sparkles color={authMode === 'google' ? '#0EA5E9' : '#94A3B8'} size={18} />
                  <Text style={[styles.modeTabText, authMode === 'google' && styles.activeModeTabText]}>Google</Text>
                </TouchableOpacity>
              )}
            </View>

            {statusMessage ? (
              <View style={styles.statusBox}>
                <CheckCircle2 color="#10B981" size={18} />
                <Text style={styles.statusBoxText}>{statusMessage}</Text>
              </View>
            ) : null}

            {/* --- TAB 1: EMAIL AUTH --- */}
            {authMode === 'email' && (
              <View style={styles.card}>
                {/* Sub-toggle: Existing User Login vs New User Registration */}
                <View style={styles.subToggleContainer}>
                  <TouchableOpacity
                    style={[styles.subToggleBtn, isEmailLoginMode && styles.activeSubToggle]}
                    onPress={() => { setIsEmailLoginMode(true); setStatusMessage(''); }}
                  >
                    <Text style={[styles.subToggleText, isEmailLoginMode && styles.activeSubToggleText]}>
                      Login with Password
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subToggleBtn, !isEmailLoginMode && styles.activeSubToggle]}
                    onPress={() => { setIsEmailLoginMode(false); setRegStep(1); setStatusMessage(''); }}
                  >
                    <Text style={[styles.subToggleText, !isEmailLoginMode && styles.activeSubToggleText]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* MODE A: LOGIN WITH EMAIL + PASSWORD */}
                {isEmailLoginMode ? (
                  <View style={styles.formGap}>
                    <Text style={styles.formTitle}>Customer Login</Text>

                    <View style={styles.inputContainer}>
                      <Mail color="#64748B" size={20} />
                      <TextInput
                        style={styles.input}
                        placeholder="Email Address"
                        placeholderTextColor="#64748B"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={styles.inputContainer}>
                      <Lock color="#64748B" size={20} />
                      <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#64748B"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                      />
                    </View>

                    <TouchableOpacity style={styles.submitBtn} onPress={handleEmailLogin} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitBtnText}>Sign In to Account</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* MODE B: EMAIL REGISTRATION WITH OTP VERIFICATION & PASSWORD SETUP */
                  <View style={styles.formGap}>
                    {/* STEP INDICATOR BAR */}
                    <View style={styles.stepBar}>
                      <View style={[styles.stepItem, regStep >= 1 && styles.activeStepItem]}>
                        <Text style={styles.stepNum}>1</Text>
                        <Text style={styles.stepLbl}>Email</Text>
                      </View>
                      <View style={styles.stepLine} />
                      <View style={[styles.stepItem, regStep >= 2 && styles.activeStepItem]}>
                        <Text style={styles.stepNum}>2</Text>
                        <Text style={styles.stepLbl}>OTP Code</Text>
                      </View>
                      <View style={styles.stepLine} />
                      <View style={[styles.stepItem, regStep >= 3 && styles.activeStepItem]}>
                        <Text style={styles.stepNum}>3</Text>
                        <Text style={styles.stepLbl}>Password</Text>
                      </View>
                    </View>

                    {/* STEP 1: ENTER EMAIL */}
                    {regStep === 1 && (
                      <>
                        <Text style={styles.formTitle}>Enter your Email to Get Verification Code</Text>
                        <View style={styles.inputContainer}>
                          <Mail color="#64748B" size={20} />
                          <TextInput
                            style={styles.input}
                            placeholder="Your Email Address"
                            placeholderTextColor="#64748B"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                          />
                        </View>
                        <TouchableOpacity style={styles.submitBtn} onPress={handleSendEmailOtp} disabled={loading}>
                          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Send Verification Code</Text>}
                        </TouchableOpacity>
                      </>
                    )}

                    {/* STEP 2: VERIFY 6-DIGIT EMAIL CODE */}
                    {regStep === 2 && (
                      <>
                        <Text style={styles.formTitle}>Enter 6-Digit Code Sent to Email</Text>
                        <Text style={styles.formSub}>Code sent to: {email}</Text>
                        <View style={styles.inputContainer}>
                          <KeyRound color="#64748B" size={20} />
                          <TextInput
                            style={styles.input}
                            placeholder="Enter 6-digit OTP (e.g. 123456)"
                            placeholderTextColor="#64748B"
                            value={otpCode}
                            onChangeText={setOtpCode}
                            keyboardType="number-pad"
                            maxLength={6}
                          />
                        </View>
                        <TouchableOpacity style={styles.submitBtn} onPress={handleVerifyEmailOtp} disabled={loading}>
                          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Verify OTP Code</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setRegStep(1)} style={styles.linkBtn}>
                          <Text style={styles.linkText}>Change Email</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* STEP 3: CREATE PASSWORD & PROFILE */}
                    {regStep === 3 && (
                      <>
                        <Text style={styles.formTitle}>Create Account Password</Text>
                        <View style={styles.inputContainer}>
                          <User color="#64748B" size={20} />
                          <TextInput
                            style={styles.input}
                            placeholder="Full Name"
                            placeholderTextColor="#64748B"
                            value={fullName}
                            onChangeText={setFullName}
                          />
                        </View>

                        <View style={styles.inputContainer}>
                          <Phone color="#64748B" size={20} />
                          <TextInput
                            style={styles.input}
                            placeholder="Mobile Number"
                            placeholderTextColor="#64748B"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                          />
                        </View>

                        <View style={styles.inputContainer}>
                          <Lock color="#64748B" size={20} />
                          <TextInput
                            style={styles.input}
                            placeholder="Create Password (min 6 chars)"
                            placeholderTextColor="#64748B"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                          />
                        </View>

                        <TouchableOpacity style={styles.submitBtn} onPress={handleCompleteEmailRegister} disabled={loading}>
                          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Complete Registration</Text>}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* --- TAB 2: MOBILE NUMBER + PASSWORD AUTH --- */}
            {authMode === 'mobile' && (
              <View style={styles.card}>
                <View style={styles.subToggleContainer}>
                  <TouchableOpacity
                    style={[styles.subToggleBtn, isMobileLoginMode && styles.activeSubToggle]}
                    onPress={() => { setIsMobileLoginMode(true); setStatusMessage(''); }}
                  >
                    <Text style={[styles.subToggleText, isMobileLoginMode && styles.activeSubToggleText]}>
                      Login with Password
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subToggleBtn, !isMobileLoginMode && styles.activeSubToggle]}
                    onPress={() => { setIsMobileLoginMode(false); setStatusMessage(''); }}
                  >
                    <Text style={[styles.subToggleText, !isMobileLoginMode && styles.activeSubToggleText]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.formTitle}>{isMobileLoginMode ? 'Customer Login' : 'Create Your Account'}</Text>

                <View style={styles.inputContainer}>
                  <Phone color="#64748B" size={20} />
                  <TextInput
                    style={styles.input}
                    placeholder="10-Digit Mobile Number"
                    placeholderTextColor="#64748B"
                    value={phone}
                    onChangeText={(v) => { setPhone(v); setOtpRequested(false); }}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>

                {!isMobileLoginMode && (
                  <View style={styles.inputContainer}>
                    <User color="#64748B" size={20} />
                    <TextInput
                      style={styles.input}
                      placeholder="Full Name"
                      placeholderTextColor="#64748B"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                )}

                {/* Password vs OTP - a toggle on the existing real login,
                    not a replacement (Create Account keeps password-only,
                    matching what the real signup endpoint requires). */}
                {isMobileLoginMode && (
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => { setUseOtpForMobile(!useOtpForMobile); setOtpRequested(false); setStatusMessage(''); }}
                  >
                    <Text style={styles.linkText}>
                      {useOtpForMobile ? 'Use password instead' : 'Use OTP instead'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isMobileLoginMode && useOtpForMobile ? (
                  <>
                    {otpRequested && (
                      <View style={styles.inputContainer}>
                        <KeyRound color="#64748B" size={20} />
                        <TextInput
                          style={styles.input}
                          placeholder="Enter 6-digit code"
                          placeholderTextColor="#64748B"
                          value={firebasePhoneOtp}
                          onChangeText={setFirebasePhoneOtp}
                          keyboardType="number-pad"
                          maxLength={6}
                        />
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.submitBtn}
                      onPress={otpRequested ? handleConfirmFirebasePhoneOtp : handleSendFirebasePhoneOtp}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitBtnText}>{otpRequested ? 'Verify & Sign In' : 'Send OTP'}</Text>
                      )}
                    </TouchableOpacity>
                    {!isPhoneAuthAvailable() && (
                      <Text style={styles.formSub}>Phone OTP works on web right now - native app support is next.</Text>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.inputContainer}>
                      <Lock color="#64748B" size={20} />
                      <TextInput
                        style={styles.input}
                        placeholder={isMobileLoginMode ? 'Password' : 'Create Password (min 6 chars)'}
                        placeholderTextColor="#64748B"
                        value={mobilePassword}
                        onChangeText={setMobilePassword}
                        secureTextEntry
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.submitBtn}
                      onPress={isMobileLoginMode ? handleMobileLogin : handleMobileSignup}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitBtnText}>
                          {isMobileLoginMode ? 'Sign In to Account' : 'Create Account'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {/* Invisible reCAPTCHA host for Firebase Phone Auth (web
                    only - see utils/phoneAuth.ts). Renders nothing visible. */}
                {Platform.OS === 'web' && <View nativeID={RECAPTCHA_CONTAINER_ID} />}
              </View>
            )}

            {/* --- TAB 3: GOOGLE SIGN-IN --- */}
            {authMode === 'google' && (
              <View style={styles.card}>
                <Text style={styles.formTitle}>Instant Google Login</Text>
                <Text style={styles.formSub}>Sign in securely using your verified Google account</Text>

                <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn} disabled={loading || !googleRequest}>
                  {loading ? (
                    <ActivityIndicator color="#0F172A" />
                  ) : (
                    <View style={styles.googleBtnContent}>
                      <Sparkles color="#4285F4" size={22} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Dev-only hint - never shown in production builds */}
            {__DEV__ && (
              <View style={styles.testBox}>
                <ShieldCheck color="#10B981" size={16} />
                <Text style={styles.testBoxText}>
                  <Text style={styles.boldText}>Mobile Number</Text>, <Text style={styles.boldText}>Phone OTP</Text> and <Text style={styles.boldText}>Google</Text> are connected to the real backend - Google/OTP need Firebase project keys set in .env to actually work. Email is not available yet.
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  flexOne: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingVertical: 24, gap: 16 },
  header: { alignItems: 'center', marginBottom: 12 },
  logoBadge: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    marginBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 5,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  activeModeTab: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#0EA5E9' },
  modeTabText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
  activeModeTabText: { color: '#0EA5E9' },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    padding: 12,
  },
  statusBoxText: { color: '#10B981', fontSize: 13, fontWeight: '600', flex: 1 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  subToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 4,
  },
  subToggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeSubToggle: { backgroundColor: '#0EA5E9' },
  subToggleText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  activeSubToggleText: { color: '#FFFFFF' },
  formGap: { gap: 14 },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  formSub: { fontSize: 12, color: '#94A3B8', marginTop: -6 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  input: { flex: 1, fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  googleBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  googleBtnText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.5 },
  activeStepItem: { opacity: 1 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0EA5E9',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
  stepLbl: { fontSize: 12, fontWeight: '700', color: '#F8FAFC' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#334155', marginHorizontal: 8 },
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  linkText: { color: '#0EA5E9', fontSize: 13, fontWeight: '600' },
  testBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  testBoxText: { color: '#94A3B8', fontSize: 12 },
  boldText: { color: '#0EA5E9', fontWeight: '800' },
});