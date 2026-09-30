import React, { useState } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, Save, Upload, CheckCircle, Image, Phone, Lock, MapPin, CreditCard, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import axiosInstance from '@/app/api/axiosInstance';
import { getAuthHeaders } from '@/services/auth/authService';
import { appendFileToFormData } from '@/utils/formDataFile';
import { useLanguage } from '@/contexts/LanguageContext';
// Local MIME type resolver to avoid extra dependency
const guessMimeTypeFromUri = (uri: string): string => {
  try {
    const lower = (uri || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.heic')) return 'image/heic';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
};

export default function AddDriverScreen() {
  const [driverData, setDriverData] = useState({
    full_name: '',
    primary_number: '',
    secondary_number: '',
    password: '',
    licence_number: '',
    adress: '',
    city: '',
    pincode: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const [driverImages, setDriverImages] = useState({
    licence_front_img: '',
    licence_back_img: '',
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();

  // Simple input handlers
  const handleInputChange = (field: string, value: string) => {
    // Clear error if exists
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    setDriverData(prev => ({ ...prev, [field]: value }));
  };

  // Simple validation - just check if fields are not empty
  const validateAllFields = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!driverData.full_name.trim()) newErrors.full_name = t('addDriver.fullNameRequired');
    if (!driverData.primary_number.trim()) newErrors.primary_number = t('addDriver.primaryNumberRequired');
    if (!driverData.password.trim()) newErrors.password = t('addDriver.passwordRequired');
    if (!driverData.licence_number.trim()) newErrors.licence_number = t('addDriver.licenceNumberRequired');
    if (!driverData.adress.trim()) newErrors.adress = t('addDriver.addressRequired');
    
    setErrors(newErrors);
    
    return Object.keys(newErrors).length === 0;
  };

  const pickImage = async (imageKey: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // freeform crop before upload - no fixed aspect ratio
        quality: 0.5, // compress - full-size photos made uploads painfully slow
      });
      if (!result.canceled) {
        setDriverImages(prev => ({ ...prev, [imageKey]: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert(t('addDriver.errorTitle'), t('addDriver.pickImageFailed'));
    }
  };


  const ImageUploadField = ({ 
    title, 
    description, 
    imageKey, 
    isRequired = true 
  }: { 
    title: string; 
    description: string; 
    imageKey: string; 
    isRequired?: boolean;
  }) => {
    const imageUri = driverImages[imageKey as keyof typeof driverImages];
    const isUploaded = !!imageUri;
    
    return (
      <TouchableOpacity
        style={[styles.imageUploadField, isUploaded && styles.uploadedField]}
        onPress={() => pickImage(imageKey)}
      >
        <View style={styles.imageUploadLeft}>
          <View style={[styles.imageUploadIcon, isUploaded && styles.uploadedIcon]}>
            {isUploaded ? (
              <CheckCircle color="#FFFFFF" size={20} />
            ) : (
              <Image color="#6B7280" size={20} />
            )}
          </View>
          <View style={styles.imageUploadText}>
            <Text style={styles.imageUploadTitle}>
              {title} {isRequired && <Text style={styles.required}>*</Text>}
            </Text>
            <Text style={styles.imageUploadDescription}>{description}</Text>
          </View>
        </View>
        <Upload color={isUploaded ? "#10B981" : "#6B7280"} size={20} />
      </TouchableOpacity>
    );
  };

  const handleSave = async () => {
    // Clear previous errors
    setErrors({});

    // Simple validation - just check if fields are not empty
    if (!validateAllFields()) {
      Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.fillAllRequiredFields'));
      return;
    }

    // Only licence_front_img is required by backend for this endpoint
    if (!driverImages.licence_front_img) {
      Alert.alert(t('addDriver.errorTitle'), t('addDriver.uploadLicenceFront'));
      return;
    }
    if (!driverImages.licence_back_img) {
      Alert.alert(t('addDriver.errorTitle'), 'Please upload the Licence BACK side photo too - both sides are required.');
      return;
    }

    try {
      setIsLoading(true);
      console.log('👤 Starting driver registration process (menu flow)...');
      // Helpers
      const toTenDigit = (phone: string) => {
        const digits = (phone || '').replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        return digits.slice(-10);
      };

      // Normalize
      const primary = toTenDigit(driverData.primary_number.trim());
      const secondary = driverData.secondary_number ? toTenDigit(driverData.secondary_number.trim()) : '';

      // Validations
      if (!/^[6-9]\d{9}$/.test(primary)) {
        setErrors(prev => ({ ...prev, primary_number: t('addDriver.invalidMobileNumber') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.invalidMobileNumber'));
        return;
      }
      if (secondary && !/^[6-9]\d{9}$/.test(secondary)) {
        setErrors(prev => ({ ...prev, secondary_number: t('addDriver.invalidMobileNumber') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.secondaryNumberInvalid'));
        return;
      }
      if (driverData.adress.trim().length < 5) {
        setErrors(prev => ({ ...prev, adress: t('addDriver.addressTooShort') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.addressTooShort'));
        return;
      }
      if (!driverData.city.trim()) {
        setErrors(prev => ({ ...prev, city: t('addDriver.cityRequired') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.cityRequired'));
        return;
      }
      if (!driverData.pincode.trim() || driverData.pincode.trim().length !== 6) {
        setErrors(prev => ({ ...prev, pincode: t('addDriver.pincodeMustBe6Digits') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.pincodeMustBeExactly6Digits'));
        return;
      }
      if (driverData.password.trim().length < 6) {
        setErrors(prev => ({ ...prev, password: t('addDriver.passwordTooShort') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.passwordTooShort'));
        return;
      }
      if (!driverImages.licence_front_img) {
        Alert.alert(t('addDriver.errorTitle'), t('addDriver.uploadLicenceFront'));
        return;
      }
      if (!driverImages.licence_back_img) {
        Alert.alert(t('addDriver.errorTitle'), 'Please upload the Licence BACK side photo too - both sides are required.');
        return;
      }

      // Build multipart form
      const uri = driverImages.licence_front_img;
      const name = uri.split('/').pop() || 'license.jpg';
      const type = guessMimeTypeFromUri(uri) || 'image/jpeg';

      const form = new FormData();
      form.append('full_name', driverData.full_name.trim());
      form.append('primary_number', primary);
      if (secondary) form.append('secondary_number', secondary);
      form.append('password', driverData.password.trim());
      form.append('licence_number', driverData.licence_number.trim().toUpperCase());
      form.append('address', driverData.adress.trim()); // API expects 'address', not 'adress'
      form.append('city', driverData.city.trim());
      form.append('pincode', driverData.pincode.trim());
      if (user?.id) form.append('vehicle_owner_id', user.id);
      // Uses appendFileToFormData so this actually uploads a real file on
      // web instead of the literal string "[object Object]" (see that
      // function's comment for why).
      await appendFileToFormData(form, 'licence_front_img', uri, name, type);
      if (driverImages.licence_back_img) {
        const backUri = driverImages.licence_back_img;
        const backName = backUri.split('/').pop() || 'license_back.jpg';
        const backType = guessMimeTypeFromUri(backUri) || 'image/jpeg';
        await appendFileToFormData(form, 'licence_back_img', backUri, backName, backType);
      }

      // Debug form data
      console.log('🔍 Form data being sent:', {
        full_name: driverData.full_name.trim(),
        primary_number: primary,
        secondary_number: secondary,
        password: '***', // Don't log password
        licence_number: driverData.licence_number.trim().toUpperCase(),
        address: driverData.adress.trim(),
        city: driverData.city.trim(),
        pincode: driverData.pincode.trim(),
        vehicle_owner_id: user?.id,
        hasImage: !!driverImages.licence_front_img
      });

      console.log('🚀 Submitting driver signup (multipart)...');
      
      // Get authentication headers
      console.log('🔍 Getting auth headers...');
      const authHeaders = await getAuthHeaders();
      console.log('🔍 Auth headers obtained:', authHeaders);
      
      // No manual Content-Type here - axiosInstance's interceptor strips it
      // for FormData bodies so the platform can set its own boundary.
      const res = await axiosInstance.post('/api/users/cardriver/signup', form, {
        headers: {
          ...authHeaders,
        },
        timeout: 120000,
      });
      console.log('✅ Driver registration completed successfully!', res.data);

      // After driver is added successfully, go back (MENU FLOW ONLY)
      console.log('🔄 Driver added successfully via menu → going back');
      setIsLoading(false);
      
      Alert.alert(t('addDriver.successTitle'), t('addDriver.driverAddedSuccess'), [
        {
          text: t('addDriver.ok'),
          onPress: () => {
            console.log('✅ Menu flow: Driver added → going back');
            safeBack(router);
          }
        },
      ]);
    } catch (err: any) {
      console.error('❌ Error during driver registration:', err);
      setIsLoading(false);
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        console.error('🔍 Backend validation error:', JSON.stringify(detail));
        Alert.alert(t('addDriverMenu.validationFailedTitle'), detail.map((d: any) => d?.msg || JSON.stringify(d)).join('\n'));
      } else {
        console.error('❌ API Error:', JSON.stringify({
          status: err?.response?.status,
          data: err?.response?.data || err?.message,
        }));
        Alert.alert(t('addDriver.errorTitle'), err?.response?.data?.detail || t('addDriverMenu.addDriverFailedGeneric'));
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => safeBack(router)} 
          style={[styles.backButton, isLoading && styles.backButtonDisabled]}
          disabled={isLoading}
        >
          <ArrowLeft color="#FFFFFF" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('addDriverMenu.headerTitle')}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t('addDriver.welcomeTitle')}</Text>
          <Text style={styles.welcomeSubtitle}>
            {t('addDriverMenu.welcomeSubtitle', { name: user?.fullName || '' })}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionTitle}>{t('addDriver.driverDetails')}</Text>
          {/* Full Name label */}
          <Text style={styles.inputLabel}>{t('addDriver.fullNameLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <User color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.full_name && styles.inputError]}
              value={driverData.full_name}
              onChangeText={(text) => handleInputChange('full_name', text)}
            />
          </View>
          {errors.full_name && <Text style={styles.errorText}>{errors.full_name}</Text>}

          {/* Primary Mobile label */}
          <Text style={styles.inputLabel}>{t('addDriver.primaryMobileLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <Phone color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.primary_number && styles.inputError]}
              value={driverData.primary_number}
              onChangeText={(text) => handleInputChange('primary_number', text)}
              keyboardType="phone-pad"
            />
          </View>
          {errors.primary_number && <Text style={styles.errorText}>{errors.primary_number}</Text>}
          <Text style={styles.helpText}>{t('addDriver.primaryMobileHelp')}</Text>

          {/* Secondary Mobile label */}
          <Text style={styles.inputLabel}>{t('addDriver.secondaryMobileLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <Phone color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.secondary_number && styles.inputError]}
              value={driverData.secondary_number}
              onChangeText={(text) => handleInputChange('secondary_number', text)}
              keyboardType="phone-pad"
            />
          </View>

          {/* Password label */}
          <Text style={styles.inputLabel}>{t('addDriver.passwordLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <Lock color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.password && styles.inputError]}
              value={driverData.password}
              onChangeText={(text) => handleInputChange('password', text)}
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
          {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

          {/* Licence Number label */}
          <Text style={styles.inputLabel}>{t('addDriver.licenceNumberLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <CreditCard color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.licence_number && styles.inputError]}
              value={driverData.licence_number}
              onChangeText={(text) => handleInputChange('licence_number', text)}
              autoCapitalize="characters"
            />
          </View>
          {errors.licence_number && <Text style={styles.errorText}>{errors.licence_number}</Text>}
          <Text style={styles.helpText}>
            {t('addDriver.licenceNumberHelp')}
          </Text>

          {/* Address label */}
          <Text style={styles.inputLabel}>{t('addDriver.streetAddressLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.adress && styles.inputError]}
              value={driverData.adress}
              onChangeText={(text) => handleInputChange('adress', text)}
              multiline
              numberOfLines={3}
            />
          </View>
          {errors.adress && <Text style={styles.errorText}>{errors.adress}</Text>}

          {/* City label */}
          <Text style={styles.inputLabel}>{t('addDriver.cityLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.city && styles.inputError]}
              value={driverData.city}
              onChangeText={(text) => handleInputChange('city', text)}
            />
          </View>
          {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}

          {/* Pincode label */}
          <Text style={styles.inputLabel}>{t('addDriver.pincodeLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.pincode && styles.inputError]}
              value={driverData.pincode}
              onChangeText={(text) => {
                const cleanText = text.replace(/\D/g, '');
                if (cleanText.length <= 6) {
                  handleInputChange('pincode', cleanText);
                }
              }}
              keyboardType="numeric"
              maxLength={6}
            />
          </View>
          {errors.pincode && <Text style={styles.errorText}>{errors.pincode}</Text>}

          <Text style={styles.sectionTitle}>{t('addDriver.requiredDocument')}</Text>
          <Text style={styles.sectionSubtitle}>
            {t('addDriver.requiredDocumentSubtitle')}
          </Text>

          <ImageUploadField
            title={t('addDriver.licenceFrontTitle')}
            description={t('addDriver.licenceFrontDesc')}
            imageKey="licence_front_img"
            isRequired={true}
          />

          <ImageUploadField
            title={t('addDriver.licenceBackTitle')}
            description={t('addDriver.licenceBackDesc')}
            imageKey="licence_back_img"
            isRequired={false}
          />

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.saveButtonText}>{t('addDriver.savingDriver')}</Text>
              </>
            ) : (
              <>
                <Save color="#FFFFFF" size={20} />
                <Text style={styles.saveButtonText}>{t('addDriver.saveDriverButton')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    position: 'relative',
    paddingTop:30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#3B82F6',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    padding: 8,
  },
  backButtonDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    flexShrink: 1,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  stepIndicator: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stepText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  welcomeSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  welcomeTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 20,
  },
  form: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 20,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 16,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  helpText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  imageUploadField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadedField: {
    borderColor: '#10B981',
    borderWidth: 2,
  },
  imageUploadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageUploadIcon: {
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    padding: 8,
  },
  uploadedIcon: {
    backgroundColor: '#10B981',
  },
  imageUploadText: {
    marginLeft: 12,
  },
  imageUploadTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
  },
  required: {
    color: '#EF4444',
  },
  imageUploadDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
    marginBottom: 8,
  },
});

