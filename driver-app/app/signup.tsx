import React, { useState } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import SignupSinglePage from '@/components/signup/SignupSinglePage';
import SuccessScreen from '@/components/SuccessScreen';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react-native';
import { loginVehicleOwner } from '@/services/auth/authService';
import { useConfirmBack } from '@/hooks/useConfirmBack';
import * as SecureStore from '@/utils/secureStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { clearGuestHelpSession } from '@/services/support/guestHelpService';
import GuestHelpFloatingButton from '@/components/guest/GuestHelpFloatingButton';

export default function SignupScreen() {
  const { t } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<{
    personalDetails: {
      fullName?: string;
      primaryMobile?: string;
      secondaryMobile?: string;
      password?: string;
      address?: string;
      city?: string;
      pincode?: string;
      aadharNumber?: string;
      languages?: string[];
    };
    documents: any;
  }>({
    personalDetails: {},
    documents: {},
  });
  const [signupResponse, setSignupResponse] = useState<any>(null);
  const router = useRouter();

  // Guard against accidental back-button exit while on step 1 (before the account exists).
  useConfirmBack(
    currentStep < 2,
    t('signup.confirmBackBody'),
    async () => {
      await SecureStore.deleteItemAsync('dropcars_signup_draft_v1');
      safeBack(router, '/login');
    },
  );

  const handleSignupSuccess = (response: any) => {
    clearGuestHelpSession().catch(() => {});
    setSignupResponse(response);
    if (response?.userData) {
      setFormData(prev => ({
        ...prev,
        personalDetails: {
          fullName: response.userData.fullName,
          primaryMobile: response.userData.primaryMobile,
          secondaryMobile: response.userData.secondaryMobile,
          password: response.userData.password,
          address: response.userData.address,
          city: response.userData.city,
          pincode: response.userData.pincode,
          aadharNumber: response.userData.aadharNumber,
        },
      }));
    }
    setCurrentStep(2);
  };

  const handleContinue = async () => {
    await clearGuestHelpSession().catch(() => {});
    await SecureStore.setItemAsync('tempPassword', formData.personalDetails.password || '');
    const cleanMobile = String(formData.personalDetails.primaryMobile || '').replace(/^\+91/, '');

    const maxRetries = 2;
    let loginResponse: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        loginResponse = await loginVehicleOwner(cleanMobile, formData.personalDetails.password || '');
        break;
      } catch (error) {
        console.warn(`⚠️ Post-signup count-check login failed (attempt ${attempt}/${maxRetries}):`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    if (!loginResponse) {
      router.replace('/add-car?flow=signup');
      return;
    }

    const carCount = loginResponse.car_details_count ?? 0;
    const driverCount = loginResponse.car_driver_count ?? 0;

    if (carCount === 0) {
      router.replace('/add-car?flow=signup');
    } else if (driverCount === 0) {
      router.replace('/add-driver?flow=signup');
    } else {
      router.replace('/subscription?flow=onboarding' as any);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <SignupSinglePage onSignupSuccess={handleSignupSuccess} />;
      case 2:
        return (
          <SuccessScreen
            message={t('signup.successMessage')}
            onContinue={handleContinue}
          />
        );
      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={isDarkMode ? ['#0F172A', '#1E293B'] : ['#1E1B4B', '#312E81', '#4338CA']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header navigation bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router, '/login')} style={styles.backButton} activeOpacity={0.7}>
            <ArrowLeft color="#FFFFFF" size={20} />
            <Text style={styles.backText}>{t('forgotPassword.back')}</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {currentStep < 2 && (
              <View style={styles.stepBadge}>
                <Sparkles color="#A5B4FC" size={13} />
                <Text style={styles.stepBadgeText}>Step {currentStep} of 2</Text>
              </View>
            )}
          </View>
        </View>

        {currentStep < 2 && (
          <View style={styles.progressBarBg}>
            <View style={[styles.progressFill, { width: `${(currentStep / 2) * 100}%` }]} />
          </View>
        )}

        <KeyboardAvoidingView
          behavior="padding"
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  stepBadgeText: {
    color: '#EEF2FF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 2,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});