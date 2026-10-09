import React, { useState } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { CarDriverSignupRequest } from '@/services/driver/carDriverService';
import { ArrowLeft, User, Phone, MapPin, CreditCard, Car, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CarDriverSignupScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { signup, isLoading, error, clearError } = useCarDriver();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState<CarDriverSignupRequest>({
    full_name: '',
    primary_number: '',
    secondary_number: '',
    address: '',
    aadhar_number: '',
    organization_id: '',
    password: '',
    email: '',
    license_number: '',
    experience_years: 0,
    vehicle_preferences: []
  });

  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (field: keyof CarDriverSignupRequest, value: string | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.full_name.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterFullName'));
      return false;
    }

    if (!formData.primary_number.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterPrimaryNumber'));
      return false;
    }

    if (formData.primary_number.length !== 10) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterValidMobileNumber'));
      return false;
    }

    if (!formData.address.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterAddress'));
      return false;
    }

    if (!formData.aadhar_number.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterAadhar'));
      return false;
    }

    if (formData.aadhar_number.length !== 12) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterValidAadhar'));
      return false;
    }

    if (!formData.organization_id.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterOrgId'));
      return false;
    }

    if (!formData.password.trim()) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.enterPassword'));
      return false;
    }

    if (formData.password.length < 6) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.passwordTooShort'));
      return false;
    }

    if (formData.password !== confirmPassword) {
      Alert.alert(t('carDriverSignup.errorTitle'), t('carDriverSignup.passwordsDontMatch'));
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    try {
      clearError();
      await signup(formData);
      
      Alert.alert(
        t('carDriverSignup.successTitle'),
        t('carDriverSignup.accountCreatedBody'),
        [
          {
            text: t('carDriverSignup.ok'),
            onPress: () => router.push('/car-driver/signin')
          }
        ]
      );
    } catch (error: any) {
      Alert.alert(t('carDriverSignup.signupFailedTitle'), error.message || t('carDriverSignup.signupFailedGeneric'));
    }
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    title: {
      fontSize: 28,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginBottom: 32,
    },
    formSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      marginBottom: 16,
    },
    inputContainer: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.text,
      marginBottom: 8,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputIcon: {
      marginRight: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'Inter-Regular',
      color: colors.text,
    },
    passwordToggle: {
      padding: 4,
    },
    signupButton: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 16,
    },
    signupButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
    },
    loadingButton: {
      opacity: 0.7,
    },
    signinLink: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
    },
    signinText: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
    },
    signinButton: {
      marginLeft: 4,
    },
    signinButtonText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.primary,
    },
    errorText: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.error,
      textAlign: 'center',
      marginTop: 16,
    },
    keyboardView: {
      flex: 1,
    },
  });

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              safeBack(router, '/login');
            } else {
              router.replace('/(tabs)' as any);
            }
          }} 
          style={dynamicStyles.backButton}
        >
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>{t('carDriverSignup.headerTitle')}</Text>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={dynamicStyles.keyboardView}
      >
      <ScrollView
        style={dynamicStyles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={dynamicStyles.title}>{t('carDriverSignup.title')}</Text>
        <Text style={dynamicStyles.subtitle}>
          {t('carDriverSignup.subtitle')}
        </Text>

        {/* Personal Information */}
        <View style={dynamicStyles.formSection}>
          <Text style={dynamicStyles.sectionTitle}>{t('carDriverSignup.personalInformation')}</Text>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.fullNameLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <User color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.fullNamePlaceholder')}
                value={formData.full_name}
                onChangeText={(value) => handleInputChange('full_name', value)}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.primaryMobileLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Phone color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.primaryMobilePlaceholder')}
                value={formData.primary_number}
                onChangeText={(value) => handleInputChange('primary_number', value)}
                keyboardType="phone-pad"
                maxLength={10}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.secondaryMobileLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Phone color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.secondaryMobilePlaceholder')}
                value={formData.secondary_number}
                onChangeText={(value) => handleInputChange('secondary_number', value)}
                keyboardType="phone-pad"
                maxLength={10}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.emailLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Mail color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.emailPlaceholder')}
                value={formData.email}
                onChangeText={(value) => handleInputChange('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.addressLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <MapPin color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.addressPlaceholder')}
                value={formData.address}
                onChangeText={(value) => handleInputChange('address', value)}
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Identity Information */}
        <View style={dynamicStyles.formSection}>
          <Text style={dynamicStyles.sectionTitle}>{t('carDriverSignup.identityInformation')}</Text>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.aadharLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <CreditCard color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.aadharPlaceholder')}
                value={formData.aadhar_number}
                onChangeText={(value) => handleInputChange('aadhar_number', value)}
                keyboardType="numeric"
                maxLength={12}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.licenseLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Car color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.licensePlaceholder')}
                value={formData.license_number}
                onChangeText={(value) => handleInputChange('license_number', value)}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.experienceLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Car color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.experiencePlaceholder')}
                value={formData.experience_years?.toString() || ''}
                onChangeText={(value) => handleInputChange('experience_years', parseInt(value) || 0)}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Account Information */}
        <View style={dynamicStyles.formSection}>
          <Text style={dynamicStyles.sectionTitle}>{t('carDriverSignup.accountInformation')}</Text>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.orgIdLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <User color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.orgIdPlaceholder')}
                value={formData.organization_id}
                onChangeText={(value) => handleInputChange('organization_id', value)}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.passwordLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Lock color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.passwordPlaceholder')}
                value={formData.password}
                onChangeText={(value) => handleInputChange('password', value)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={dynamicStyles.passwordToggle}
              >
                {showPassword ? (
                  <EyeOff color={colors.textSecondary} size={20} />
                ) : (
                  <Eye color={colors.textSecondary} size={20} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={dynamicStyles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>{t('carDriverSignup.confirmPasswordLabel')}</Text>
            <View style={dynamicStyles.inputWrapper}>
              <Lock color={colors.textSecondary} size={20} style={dynamicStyles.inputIcon} />
              <TextInput
                style={dynamicStyles.input}
                placeholder={t('carDriverSignup.confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={dynamicStyles.passwordToggle}
              >
                {showConfirmPassword ? (
                  <EyeOff color={colors.textSecondary} size={20} />
                ) : (
                  <Eye color={colors.textSecondary} size={20} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {error && <Text style={dynamicStyles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[
            dynamicStyles.signupButton,
            isLoading && dynamicStyles.loadingButton
          ]}
          onPress={handleSignup}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={dynamicStyles.signupButtonText}>{t('carDriverSignup.createAccount')}</Text>
          )}
        </TouchableOpacity>

        <View style={dynamicStyles.signinLink}>
          <Text style={dynamicStyles.signinText}>{t('carDriverSignup.alreadyHaveAccount')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/car-driver/signin')}
            style={dynamicStyles.signinButton}
          >
            <Text style={dynamicStyles.signinButtonText}>{t('carDriverSignup.signIn')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
