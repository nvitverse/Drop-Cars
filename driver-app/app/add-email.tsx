import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';
import { getItemAsync, markEmailAddedLocally } from '@/utils/secureStore';

// Mandatory for accounts created before email became compulsory - blocks the
// dashboard until an email is added and verified. Same OTP flow as the
// Settings > "Add Email" screen, just without a way to skip or go back.
export default function AddEmailScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const checkEmailOnMount = async () => {
      try {
        const loginDataStr = await getItemAsync('loginResponse');
        if (loginDataStr) {
          const loginData = JSON.parse(loginDataStr);
          if (loginData.email_missing === false || (loginData.email && loginData.email.includes('@'))) {
            console.log('✅ Email already present in loginResponse, bypassing add-email');
            router.replace('/(tabs)');
            return;
          }
        }
        const voUserDataStr = await getItemAsync('vo_user_data');
        if (voUserDataStr) {
          const voData = JSON.parse(voUserDataStr);
          if (voData.email && voData.email.includes('@')) {
            console.log('✅ Email already present in vo_user_data, bypassing add-email');
            router.replace('/(tabs)');
            return;
          }
        }
      } catch (e) {
        console.error('Error checking existing email on mount:', e);
      }
    };
    checkEmailOnMount();
  }, [router]);

  const sendOtp = async () => {
    if (!email.includes('@')) {
      Alert.alert(t('addEmail.errorTitle'), t('addEmail.invalidEmail'));
      return;
    }
    setBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/vehicle-owner/email/request-otp', { email: email.trim() });
      setOtpSent(true);
      Alert.alert(t('addEmail.codeSentTitle'), res.data?.message || t('addEmail.codeSentFallback'));
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert(t('addEmail.errorTitle'), typeof detail === 'string' ? detail : t('addEmail.sendCodeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    if (code.trim().length !== 6) {
      Alert.alert(t('addEmail.errorTitle'), t('addEmail.enterSixDigitCode'));
      return;
    }
    setBusy(true);
    try {
      await axiosInstance.post('/api/users/vehicle-owner/email/confirm', {
        email: email.trim(),
        code: code.trim(),
      });
      await markEmailAddedLocally(email.trim());
      router.replace('/(tabs)');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert(t('addEmail.errorTitle'), typeof detail === 'string' ? detail : t('addEmail.verifyFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.container}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '22' }]}>
              <Mail color={colors.primary} size={32} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('addEmail.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('addEmail.subtitle')}
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('addEmail.emailLabel')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!otpSent}
            placeholder={t('addEmail.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { borderColor: colors.border, color: colors.text, opacity: otpSent ? 0.6 : 1 }]}
          />

          {otpSent && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>{t('addEmail.codeLabel')}</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              />
            </>
          )}

          <TouchableOpacity
            onPress={otpSent ? confirmOtp : sendOtp}
            disabled={busy}
            style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{otpSent ? t('addEmail.verifyAndContinue') : t('addEmail.sendCode')}</Text>
            )}
          </TouchableOpacity>

          {otpSent && (
            <TouchableOpacity onPress={() => { setOtpSent(false); setCode(''); }} disabled={busy} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('addEmail.changeEmail')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  label: { fontSize: 13, fontFamily: 'Inter-Medium', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  button: { borderRadius: 6, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
