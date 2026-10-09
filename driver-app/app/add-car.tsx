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
  Image as RNImage,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useConfirmBack } from '@/hooks/useConfirmBack';
import { ArrowLeft, Car, Save, Upload, CheckCircle, FileText, Image, ChevronDown, RotateCw, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { addCarDetails } from '@/services/auth/signupService';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from '@/utils/secureStore';
import axiosInstance from '@/app/api/axiosInstance';
import { getFriendlyError } from '@/utils/errorMessage';
import { appendFileToFormData } from '@/utils/formDataFile';
import CarNumberInput from '@/components/CarNumberInput';
import CarModelPicker from '@/components/CarModelPicker';
import YearPicker from '@/components/YearPicker';
import DocumentCropModal from '@/components/DocumentCropModal';
import { pickDocumentImage } from '@/utils/pickDocumentImage';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AddCarScreen() {
  const { t } = useLanguage();
  const [carData, setCarData] = useState({
    name: '',
    type: '',
    registration: '',
    model: '',
    year: '',
  });
  
  const [carImages, setCarImages] = useState({
    rcFront: '',
    rcBack: '',
    insurance: '',
    fc: '',
    permit: '',
    pollution: '',
    carImage: '',
  });

  // Expiry dates for the documents that have one - RC/Insurance/FC/Permit/
  // Pollution. Auto-filled from OCR right after crop (see
  // extractExpiryForField), but always stay editable - OCR is best-effort.
  const [carExpiry, setCarExpiry] = useState({
    registration: '', // RC: registration date (an RC card has NO expiry date)
    insurance: '',
    fc: '',
    permit: '',
    pollution: '',
  });
  const [extractingExpiry, setExtractingExpiry] = useState<string | null>(null);
  const [datePickerField, setDatePickerField] = useState<keyof typeof carExpiry | null>(null);

  // Crop modal state - a photo is picked into here first, then the cropped
  // result lands in carImages once the user confirms.
  const [cropState, setCropState] = useState<{
    visible: boolean;
    imageKey: keyof typeof carImages | null;
    rawUri: string;
    imgWidth: number;
    imgHeight: number;
  }>({ visible: false, imageKey: null, rawUri: '', imgWidth: 1200, imgHeight: 800 });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1 Vehicle Details, 2 Documents, 3 Review
  const [uploadPercent, setUploadPercent] = useState(0);

  const STEP_LABELS = [t('addCar.stepVehicleDetails'), t('addCar.stepDocuments'), t('addCar.stepReview')];
  // RC front/back never ask for an "expiry date" at registration - an RC
  // doesn't meaningfully expire the way Insurance/FC/Permit/PUC do, and the
  // real thing that matters for matching a car to a booking is its
  // Manufacturing Year (carData.year, asked for separately above, right
  // before this Documents step - see the "Car Make Year" field). Admin can
  // still record an RC expiry later for its own reminder purposes via
  // Document management if ever needed - that's a separate, later flow,
  // not part of creating the car. (Owner explicitly asked for this
  // 2026-09-29 - the old rcFront expiryKey was confusing.)
  //
  // A NEW vehicle has no Fitness Certificate for its first two years (no RTO issues one), so FC is neither asked nor required until
  // two years after the registration date printed on the RC. Before the registration date is entered, the make year decides.
  const fcApplies = (() => {
    const reg = carExpiry.registration ? new Date(carExpiry.registration) : null;
    if (reg && !isNaN(reg.getTime())) {
      const freeUntil = new Date(reg); freeUntil.setFullYear(freeUntil.getFullYear() + 2);
      return new Date() >= freeUntil;
    }
    const y = parseInt(carData.year);
    return !isNaN(y) && new Date().getFullYear() - y >= 2;
  })();
  const IMAGE_FIELDS: { key: keyof typeof carImages; title: string; docType?: string; expiryKey?: keyof typeof carExpiry }[] = [
    { key: 'rcFront', title: t('addCar.imgRcFront') },
    { key: 'rcBack', title: t('addCar.imgRcBack') },
    { key: 'insurance', title: t('addCar.imgInsurance'), docType: 'insurance', expiryKey: 'insurance' },
    ...(fcApplies ? [{ key: 'fc' as const, title: t('addCar.imgFc'), docType: 'fc', expiryKey: 'fc' as const }] : []),
    { key: 'permit', title: t('addCar.imgPermit'), docType: 'permit', expiryKey: 'permit' },
    { key: 'pollution', title: 'Pollution Certificate (PUC)', docType: 'pollution', expiryKey: 'pollution' },
    { key: 'carImage', title: 'Car Front Photo' },
  ];

  const validateStep1 = (): boolean => {
    const stepErrors: {[key: string]: string} = {};
    if (!carData.name) stepErrors.name = t('addCar.nameRequired');
    if (!carData.type) stepErrors.type = t('addCar.typeRequired');
    if (!carData.registration) stepErrors.registration = t('addCar.registrationRequired');
    const year = parseInt(carData.year);
    const currentYear = new Date().getFullYear();
    if (!carData.year) {
      stepErrors.year = t('addCar.yearRequired');
    } else if (isNaN(year) || year < 1900 || year > currentYear + 1) {
      stepErrors.year = t('addCar.yearInvalid', { maxYear: currentYear + 1 });
    }
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const missing = IMAGE_FIELDS.filter((f) => !carImages[f.key]).map((f) => f.title);
    if (missing.length > 0) {
      setErrors({ documents: t('addCar.docsNeedUpload', { fields: missing.join(', '), verb: missing.length > 1 ? t('addCar.verbNeed') : t('addCar.verbNeeds') }) });
      return false;
    }
    if (!carExpiry.registration) {
      setErrors({ documents: 'Please select the registration date shown on the RC' });
      return false;
    }
    // Expiry date is what verification actually checks - required for every
    // document that has one (RC, Insurance, FC, Permit, Pollution).
    const noExpiry = IMAGE_FIELDS.filter((f) => f.expiryKey && !carExpiry[f.expiryKey]).map((f) => f.title);
    if (noExpiry.length > 0) {
      setErrors({ documents: 'Please select the expiry date for: ' + noExpiry.join(', ') });
      return false;
    }
    setErrors({});
    return true;
  };

  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { dashboardData } = useDashboard();

  // Prevent accidental back-button exit while adding the first car.
  useConfirmBack(
    true,
    'Are you sure you want to go back? The car details you entered may be lost.',
    () => safeBack(router),
  );
  const { flow } = useLocalSearchParams<{ flow?: string }>();

  const carTypes = [
    'HATCHBACK',
    'SEDAN_4_PLUS_1',
    'ETIOS_4_PLUS_1',
    'SUV',
    'SUV_6_PLUS_1',
    'SUV_7_PLUS_1',
    'INNOVA',
    'INNOVA_6_PLUS_1',
    'INNOVA_7_PLUS_1',
    'INNOVA_CRYSTA',
    'INNOVA_CRYSTA_6_PLUS_1',
    'INNOVA_CRYSTA_7_PLUS_1',
    'TEMPO_TRAVELLER_12',
    'TEMPO_TRAVELLER_14',
    'TEMPO_TRAVELLER_18',
    'URBANIA_12',
    'URBANIA_14',
    'URBANIA_16'
  ];

  // Format car type for display (e.g., "SEDAN_4_PLUS_1" -> "Sedan (4+1)")
  const formatCarTypeDisplay = (carType: string): string => {
    if (!carType) return '';
    
    // Replace underscores with spaces and convert to title case
    let formatted = carType
      .toLowerCase()
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => {
        // Keep acronyms uppercase (SUV, NEW, etc.)
        if (word === 'suv' || word === 'new') return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
    
    // Replace "Plus" patterns with (+)
    // Pattern: "4 Plus 1" -> "(4+1)"
    formatted = formatted.replace(/\s+(\d+)\s+Plus\s+(\d+)/gi, ' ($1+$2)');
    
    return formatted;
  };
  const redirectAfterCarAddition = async () => {
    try {
      console.log('🚗 Car added successfully, determining next step...');
      
      // Re-fetch login data to get updated car/driver counts
      const loginDataStr = await SecureStore.getItemAsync('loginResponse');
      if (loginDataStr) {
        // Re-login to get fresh counts
        const userData = await SecureStore.getItemAsync('userData');
        if (userData) {
          const user = JSON.parse(userData);
          const authToken = await SecureStore.getItemAsync('authToken');
          
          // Fetch updated login response by calling the API.
          // NOTE: /vehicle-owner/me does NOT return counts/status at all
          // (VehicleOwnerDetailsResponse has no such fields) - it always
          // silently fell through to the defaults below regardless of the
          // real driver count. /vehicle-owner/status-counts is the actual
          // lightweight counts refresh (JWT-authenticated, no password
          // re-entry) - see backend/app/api/routes/vehicle_owner.py.
          try {
            const response = await axiosInstance.get('/api/users/vehicle-owner/status-counts', {
              headers: { 'Authorization': `Bearer ${authToken}` }
            });

            // Get counts from API response (fresh data)
            const carCount = Number(response.data?.car_details_count || 1); // At least 1 since we just added
            const driverCount = Number(response.data?.car_driver_count || 0);
            const accountStatus = response.data?.account_status || 'INACTIVE';
            
            console.log('📊 Updated counts after car addition:', {
              carCount,
              driverCount,
              accountStatus
            });
            
            // Update the stored login response with new counts
            const loginData = JSON.parse(loginDataStr);
            loginData.car_details_count = carCount;
            loginData.car_driver_count = driverCount;
            loginData.account_status = accountStatus;
            await SecureStore.setItemAsync('loginResponse', JSON.stringify(loginData));
            
            // Signup flow: sequential progression only
            if (driverCount === 0) {
              console.log('👤 Signup flow: No drivers yet → go to Add Driver');
              router.replace('/add-driver?flow=signup');
            } else if (accountStatus === 'Inactive' || accountStatus?.toLowerCase() !== 'active') {
              console.log('⏳ Signup flow: Account not active → go to Verification');
              router.replace('/verification');
            } else {
              console.log('✅ Signup flow: All good → go to Trusted Partner screen');
              router.replace('/subscription?flow=onboarding' as any);
            }
          } catch (error) {
            console.error('❌ Error fetching updated data:', error);
            // Fallback: assume we just added a car, so car count is at least 1
            // Check if we have any drivers from dashboard data
            const driverCount = Number(dashboardData?.drivers?.length || 0);
            if (driverCount === 0) {
              console.log('👤 Signup flow fallback: No drivers yet → go to Add Driver');
              router.replace('/add-driver?flow=signup');
            } else {
              console.log('✅ Signup flow fallback: Drivers present → go to Trusted Partner screen');
              router.replace('/subscription?flow=onboarding' as any);
            }
          }
        }
      } else {
        // No login data, fallback to dashboard data (signup flow only)
        const driverCount = Number(dashboardData?.drivers?.length || 0);
        if (driverCount === 0) {
          console.log('👤 Signup flow (no login data): No drivers yet → go to Add Driver');
          router.replace('/add-driver?flow=signup');
        } else {
          console.log('✅ Signup flow (no login data): Drivers already present → go to Trusted Partner screen');
          router.replace('/subscription?flow=onboarding' as any);
        }
      }
    } catch (error) {
      console.error('❌ Error during redirect:', error);
      router.replace('/subscription?flow=onboarding' as any);
    }
  };

  // Simple input handlers
  const handleInputChange = (field: string, value: string) => {
    // Clear error if exists
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    setCarData(prev => ({ ...prev, [field]: value }));
  };

  const pickImage = async (imageKey: keyof typeof carImages) => {
    try {
      // Asks Camera vs Gallery every time. No OS crop (allowsEditing): it
      // draws under the status/nav bars and DocumentCropModal is the crop step.
      const asset = await pickDocumentImage();
      if (!asset) return;
      setCropState({
        visible: true,
        imageKey,
        rawUri: asset.uri,
        imgWidth: asset.width || 1200,
        imgHeight: asset.height || 800,
      });
    } catch (error) {
      Alert.alert(t('addCar.errorTitle'), t('addCar.pickImageFailed'));
    }
  };

  // Best-effort OCR read of the printed expiry date, right after a crop is
  // confirmed - the field is pre-filled but always stays editable, and a
  // failure here is silent (the driver just types the date manually).
  const extractExpiryForField = async (field: (typeof IMAGE_FIELDS)[number], uri: string) => {
    if (!field.docType || !field.expiryKey) return;
    setExtractingExpiry(field.key);
    try {
      const formData = new FormData();
      const name = uri.split('/').pop() || `${field.key}.jpg`;
      const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      await appendFileToFormData(formData, 'file', uri, name, type);
      formData.append('doc_type', field.docType);
      const res = await axiosInstance.post('/api/users/cardetails/extract-expiry', formData);
      const expiry = res.data?.expiry_date;
      if (expiry) {
        setCarExpiry((prev) => ({ ...prev, [field.expiryKey as string]: expiry }));
      }
    } catch (e) {
      // Silent - manual date entry is always available below.
    } finally {
      setExtractingExpiry(null);
    }
  };

  const handleCropConfirm = async (finalUri: string) => {
    const { imageKey } = cropState;
    setCropState((prev) => ({ ...prev, visible: false }));
    if (!imageKey) return;
    setCarImages((prev) => ({ ...prev, [imageKey]: finalUri }));
    const field = IMAGE_FIELDS.find((f) => f.key === imageKey);
    if (field) {
      extractExpiryForField(field, finalUri);
    }
  };

  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);

  const ImageUploadField = ({
    title,
    description,
    imageKey,
    isRequired = true,
    expiryKey,
  }: {
    title: string;
    description: string;
    imageKey: keyof typeof carImages;
    isRequired?: boolean;
    expiryKey?: keyof typeof carExpiry;
  }) => {
    const imageUri = carImages[imageKey];
    const isUploaded = !!imageUri;
    const isExtracting = extractingExpiry === imageKey;
    const expiryValue = expiryKey ? carExpiry[expiryKey] : '';

    return (
      <View style={styles.gridCard}>
        {isUploaded ? (
          <View style={styles.gridUploadedContainer}>
            <RNImage source={{ uri: imageUri }} style={styles.gridThumbnail} resizeMode="cover" />
            <View style={styles.gridUploadedHeader}>
              <CheckCircle color="#10B981" size={16} />
              <Text style={[styles.gridCardTitle, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.reuploadButton}
              onPress={() => pickImage(imageKey)}
              activeOpacity={0.8}
            >
              <RotateCw color="#0EA5E9" size={13} />
              <Text style={styles.reuploadButtonText}>Re-upload</Text>
            </TouchableOpacity>

          </View>
        ) : (
          <TouchableOpacity
            style={[styles.gridEmptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => pickImage(imageKey)}
            activeOpacity={0.8}
          >
            <View style={styles.gridEmptyIconWrap}>
              <Upload color="#6B7280" size={22} />
            </View>
            <Text style={[styles.gridCardTitle, { color: colors.text }]} numberOfLines={1}>
              {title} {isRequired && <Text style={styles.required}>*</Text>}
            </Text>
            <Text style={styles.gridEmptySubtitle} numberOfLines={2}>{description}</Text>
            <Text style={styles.gridSelectText}>Upload Photo</Text>
          </TouchableOpacity>
        )}

        {/* Expiry date: always visible for RC / Insurance / FC / Permit /
            Pollution (auto-filled from the photo when readable, but the
            owner can always set or fix it by hand). */}
        {expiryKey && (
          <View style={styles.expiryRow}>
            <Calendar color="#6B7280" size={13} />
            {isExtracting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity
                style={styles.expiryDateBtn}
                onPress={() => {
                  setDatePickerField(expiryKey);
                  setShowNativeDatePicker(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.expiryDateText, !expiryValue && styles.expiryDatePlaceholder]} numberOfLines={1}>
                  {expiryValue || (expiryKey === 'registration' ? 'Select registration date' : 'Select expiry date')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const handleSave = async () => {
    // Guard against double submission (rapid taps) creating duplicate cars.
    if (isLoading) return;
    // Both steps were already validated to get here, but re-check as a
    // safety net in case state changed after Review was reached.
    if (!validateStep1()) { setCurrentStep(1); return; }
    if (!validateStep2()) { setCurrentStep(2); return; }

    try {
      setIsLoading(true);
      setUploadPercent(0);
      console.log('🚗 Starting car registration process...');
      const payload = {
        car_name: carData.name.trim(),
        car_type: carData.type,
        car_number: carData.registration.trim().toUpperCase(), // Convert to uppercase
        vehicle_owner_id: user?.id || 'e5b9edb1-b4bb-48b8-a662-f7fd00abb6eb',
        rc_front_img: carImages.rcFront,
        rc_back_img: carImages.rcBack,
        insurance_img: carImages.insurance,
        fc_img: fcApplies ? carImages.fc : undefined,
      permit_img: carImages.permit,
        car_img: carImages.carImage,
        pollution_img: carImages.pollution,
        model: carData.model || carData.name, // Add model field
        year_of_the_car: carData.year, // Convert to number - backend expects this field name
        registration_date: carExpiry.registration || undefined,
        insurance_expiry_date: carExpiry.insurance || undefined,
        fc_expiry_date: fcApplies ? (carExpiry.fc || undefined) : undefined,
        permit_expiry_date: carExpiry.permit || undefined,
        pollution_expiry_date: carExpiry.pollution || undefined,
      };
  
      console.log('Sending payload:', JSON.stringify(payload, null, 2));
  
      await addCarDetails(payload, setUploadPercent);
  
      console.log('✅ Car registration completed successfully!');
      Alert.alert(
        t('addCar.successTitle'),
        t('addCar.carAddedSuccess'),
        [
          {
            text: t('addCar.ok'),
            onPress: () => {
              setIsLoading(false);
              redirectAfterCarAddition();
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('❌ Error adding car:', error);
      setIsLoading(false);
      
      // Improved error handling
      if (error.response) {
        // The request was made and the server responded with a status code
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        
        if (error.response.status === 422) {
          // Handle validation errors
          const validationErrors = error.response.data;
          if (typeof validationErrors === 'object') {
            // Convert backend validation errors to frontend error messages
            const fieldErrors: {[key: string]: string} = {};
            
            Object.keys(validationErrors).forEach(key => {
              if (Array.isArray(validationErrors[key])) {
                fieldErrors[key] = validationErrors[key].join(', ');
              } else {
                fieldErrors[key] = validationErrors[key];
              }
            });
            
            // Set errors for specific fields
            if (fieldErrors.car_number) {
              setErrors(prev => ({...prev, registration: fieldErrors.car_number}));
            }
            if (fieldErrors.car_type) {
              setErrors(prev => ({...prev, type: fieldErrors.car_type}));
            }
            if (fieldErrors.car_name) {
              setErrors(prev => ({...prev, name: fieldErrors.car_name}));
            }
            
            Alert.alert(t('addCar.validationErrorTitle'), t('addCar.validationErrorBody'));
            return;
          }
        }
      }

      Alert.alert(t('addCar.couldNotAddCar'), getFriendlyError(error, t('addCar.addCarFailedGeneric')));
    } finally {
      // Always reset loading so the button re-enables and the user can retry.
      setIsLoading(false);
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
          <ArrowLeft color={isLoading ? colors.textSecondary : colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('addCar.headerTitle')}
        </Text>
      </View>

      {/* Step progress - numbered circles, filled for done steps */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
        {STEP_LABELS.map((label, idx) => {
          const stepNum = idx + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <React.Fragment key={label}>
              <View style={{ alignItems: 'center', width: 74 }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDone ? '#0EA5E9' : isCurrent ? colors.primary : colors.border,
                }}>
                  <Text style={{ color: isDone || isCurrent ? '#FFFFFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                    {isDone ? '✓' : stepNum}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, marginTop: 4, textAlign: 'center', color: isCurrent ? colors.text : colors.textSecondary }}>
                  {label}
                </Text>
              </View>
              {idx < STEP_LABELS.length - 1 && (
                <View style={{ flex: 1, height: 2, backgroundColor: isDone ? '#0EA5E9' : colors.border, marginBottom: 14 }} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {currentStep === 1 && (
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t('addCar.welcomeTitle')}</Text>
          <Text style={styles.welcomeSubtitle}>
            {t('addCar.welcomeSubtitle', { name: user?.fullName || '' })}
          </Text>
        </View>
        )}

        <View style={styles.form}>
          {currentStep === 1 && Object.keys(errors).length > 0 && (
            <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>{t('addCar.checkVehicleDetails')}</Text>
              {Object.values(errors).map((msg, i) => (
                <Text key={i} style={{ color: '#B91C1C', fontSize: 12.5 }}>• {msg}</Text>
              ))}
            </View>
          )}
          {currentStep === 1 && (
          <>
          <Text style={styles.sectionTitle}>{t('addCar.carDetails')}</Text>
          {/* Car Name label */}
          <Text style={styles.inputLabel}>{t('addCar.carNameLabel')}</Text>
          <CarModelPicker
            value={carData.name}
            onChangeText={(text) => handleInputChange('name', text)}
            onCategorySelect={(type) => setCarData((prev) => ({ ...prev, type }))}
            hasError={!!errors.name}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

          {/* Car Type label */}
          <View style={{ zIndex: showTypeDropdown ? 99999 : 1, elevation: showTypeDropdown ? 10 : 0, position: 'relative' }}>
            <Text style={styles.inputLabel}>{t('addCar.carTypeLabel')}</Text>
            <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Car color="#6B7280" size={20} />
              <TouchableOpacity
                style={[styles.dropdownButton, errors.type && styles.inputError]}
                onPress={() => setShowTypeDropdown(!showTypeDropdown)}
              >
                <Text style={[styles.dropdownText, { color: colors.text }, !carData.type && styles.placeholderText]}>
                  {carData.type ? formatCarTypeDisplay(carData.type) : t('addCar.selectCarType')}
                </Text>
                <ChevronDown color="#6B7280" size={20} />
              </TouchableOpacity>
            </View>
            {showTypeDropdown && (
              <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border, position: 'absolute', top: 76, left: 0, right: 0, zIndex: 99999, elevation: 10, maxHeight: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }] }>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {carTypes.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setCarData(prev => ({ ...prev, type }));
                        setShowTypeDropdown(false);
                        if (errors.type) setErrors(prev => ({ ...prev, type: '' }));
                      }}
                    >
                      <Text style={[styles.dropdownItemText, { color: colors.text }]}>{formatCarTypeDisplay(type)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {errors.type && <Text style={styles.errorText}>{errors.type}</Text>}
          </View>

          {/* Registration Number label */}
          <Text style={styles.inputLabel}>{t('addCar.registrationNumberLabel')}</Text>
          <CarNumberInput
            value={carData.registration}
            onChangeText={(text) => handleInputChange('registration', text)}
          />
          {errors.registration && <Text style={styles.errorText}>{errors.registration}</Text>}
          <Text style={styles.helpText}>{t('addCar.registrationHelp')}</Text>

          {/* Car Make Year label */}
          <Text style={styles.inputLabel}>{t('addCar.carMakeYearLabel')}</Text>
          <YearPicker
            value={carData.year}
            onSelect={(year) => handleInputChange('year', year)}
            hasError={!!errors.year}
          />
          {errors.year && <Text style={styles.errorText}>{errors.year}</Text>}

          </>
          )}

          {currentStep === 2 && (
          <>
          <Text style={styles.sectionTitle}>{t('addCar.requiredDocsTitle')}</Text>
          <Text style={styles.sectionSubtitle}>
            {t('addCar.requiredDocsSubtitle')}
          </Text>

          {!!errors.documents && (
            <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>{t('addCar.completeVehicleDocs')}</Text>
              <Text style={{ color: '#B91C1C', fontSize: 12.5 }}>{errors.documents}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <ImageUploadField
              title={t('addCar.imgRcFront')}
              description={t('addCar.rcFrontDesc')}
              imageKey="rcFront"
              isRequired={true}
              expiryKey="registration"
            />

            <ImageUploadField
              title={t('addCar.imgRcBack')}
              description={t('addCar.rcBackDesc')}
              imageKey="rcBack"
              isRequired={true}
            />

            <ImageUploadField
              title={t('addCar.imgInsurance')}
              description={t('addCar.insuranceDesc')}
              imageKey="insurance"
              isRequired={true}
              expiryKey="insurance"
            />

            {fcApplies ? (
              <ImageUploadField
                title={t('addCar.imgFc')}
                description={t('addCar.fcDesc')}
                imageKey="fc"
                isRequired={true}
                expiryKey="fc"
              />
            ) : (
              <View style={[styles.gridCard, { justifyContent: 'center' }]}>
                <Text style={[styles.gridCardTitle, { color: colors.text }]}>{t('addCar.imgFc')}</Text>
                <Text style={styles.gridEmptySubtitle}>
                  Not needed - a new vehicle has no FC for its first 2 years{carExpiry.registration ? ' (after the registration date)' : ''}.
                </Text>
              </View>
            )}

            <ImageUploadField
              title={t('addCar.imgPermit')}
              description={t('addCar.permitDesc')}
              imageKey="permit"
              isRequired={true}
              expiryKey="permit"
            />

            <ImageUploadField
              title="Pollution Certificate (PUC)"
              description="Valid Pollution Under Control certificate"
              imageKey="pollution"
              isRequired={true}
              expiryKey="pollution"
            />

            <ImageUploadField
              title="Car Front Photo"
              description={t('addCar.carImageDesc')}
              imageKey="carImage"
              isRequired={true}
            />
          </View>
          </>
          )}

          {currentStep === 3 && (
          <>
          <Text style={styles.sectionTitle}>{t('addCar.reviewTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('addCar.reviewSubtitle')}</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 6, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
            {[
              [t('addCar.reviewCarName'), carData.name],
              [t('addCar.reviewCarType'), formatCarTypeDisplay(carData.type)],
              [t('addCar.reviewRegistrationNumber'), carData.registration],
              [t('addCar.reviewCarMakeYear'), carData.year],
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 1 }}>{label}</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value || '—'}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { fontSize: 15, marginBottom: 8 }]}>{t('addCar.documentsTitle')}</Text>
          {IMAGE_FIELDS.map((f) => (
            <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle color={carImages[f.key] ? '#10B981' : '#D1D5DB'} size={18} />
                <Text style={{ flexShrink: 1, color: colors.text, fontSize: 13 }}>{f.title}</Text>
              </View>
              {(f.expiryKey || f.key === 'rcFront') && (
                <Text style={{ flexShrink: 1, textAlign: 'right', color: colors.textSecondary, fontSize: 12 }}>
                  {f.key === 'rcFront'
                    ? (carExpiry.registration ? `Registered ${carExpiry.registration}` : 'No registration date')
                    : (f.expiryKey && carExpiry[f.expiryKey] ? `Expires ${carExpiry[f.expiryKey]}` : 'No expiry set')}
                </Text>
              )}
            </View>
          ))}

          {isLoading && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>{t('addCar.uploading', { percent: uploadPercent })}</Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: 6, width: `${uploadPercent}%`, backgroundColor: colors.primary }} />
              </View>
            </View>
          )}
          </>
          )}

          {/* Step navigation */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={[styles.saveButton, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setCurrentStep((s) => s - 1)}
                disabled={isLoading}
              >
                <Text style={[styles.saveButtonText, { color: colors.text }]}>{t('addCar.back')}</Text>
              </TouchableOpacity>
            )}
            {currentStep < 3 ? (
              <TouchableOpacity
                style={[styles.saveButton, { flex: 1 }]}
                onPress={() => {
                  if (currentStep === 1 && !validateStep1()) return;
                  if (currentStep === 2 && !validateStep2()) return;
                  setCurrentStep((s) => s + 1);
                }}
              >
                <Text style={styles.saveButtonText}>{t('addCar.continueButton')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.saveButton, { flex: 1 }, isLoading && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.saveButtonText}>{t('addCar.savingCar')}</Text>
                  </>
                ) : (
                  <>
                    <Save color="#FFFFFF" size={20} />
                    <Text style={styles.saveButtonText}>{t('addCar.saveCarButton')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <DocumentCropModal
        visible={cropState.visible}
        rawUri={cropState.rawUri}
        label={IMAGE_FIELDS.find((f) => f.key === cropState.imageKey)?.title || 'Document'}
        imgWidth={cropState.imgWidth}
        imgHeight={cropState.imgHeight}
        onCancel={() => setCropState((prev) => ({ ...prev, visible: false }))}
        onConfirm={handleCropConfirm}
      />

      {datePickerField && Platform.OS === 'web' && (
        <View style={styles.webDateOverlay}>
          <View style={[styles.webDateCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.webDateTitle, { color: colors.text }]}>{datePickerField === 'registration' ? 'Set Registration Date' : 'Set Expiry Date'}</Text>
            <input
              type="date"
              value={carExpiry[datePickerField] || ''}
              onChange={(e: any) => setCarExpiry((prev) => ({ ...prev, [datePickerField]: e.target.value }))}
              {...(datePickerField === 'registration'
                ? { max: new Date().toISOString().split('T')[0] }
                : { min: new Date().toISOString().split('T')[0] })}
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: 6,
                padding: 10,
                fontSize: 14,
                color: colors.text,
                backgroundColor: 'transparent',
                width: '100%',
              }}
            />
            <TouchableOpacity
              style={[styles.webDateDoneBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setDatePickerField(null); setShowNativeDatePicker(false); }}
            >
              <Text style={styles.webDateDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {datePickerField && Platform.OS !== 'web' && showNativeDatePicker && (
        <DateTimePicker
          value={carExpiry[datePickerField] ? new Date(carExpiry[datePickerField]) : new Date()}
          mode="date"
          display="default"
          {...(datePickerField === 'registration' ? { maximumDate: new Date() } : { minimumDate: new Date() })}
          onChange={(_: any, date?: Date) => {
            setShowNativeDatePicker(false);
            if (date) {
              const field = datePickerField;
              setCarExpiry((prev) => ({ ...prev, [field]: date.toISOString().split('T')[0] }));
            }
            setDatePickerField(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    flexShrink: 0,
  },
  backButtonDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    flex: 1,
    flexShrink: 1,
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 16,
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
    textAlign: 'left'
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
  dropdownButton: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  dropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
  },
  helpText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 16,
    fontStyle: 'italic',
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
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  imageUploadIcon: {
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    padding: 8,
    flexShrink: 0,
  },
  uploadedIcon: {
    backgroundColor: '#10B981',
  },
  imageUploadText: {
    marginLeft: 12,
    flex: 1,
    flexShrink: 1,
  },
  imageUploadTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
    flexShrink: 1,
  },
  required: {
    color: '#EF4444',
  },
  imageUploadDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 4,
    flexShrink: 1,
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
    color: '#6B7280',
    marginBottom: 8,
  },
  gridCard: {
    width: '48%',
    marginBottom: 14,
  },
  gridUploadedContainer: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 10,
    alignItems: 'center',
  },
  gridThumbnail: {
    width: '100%',
    height: 90,
    borderRadius: 6,
    marginBottom: 8,
  },
  gridUploadedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  gridCardTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
  },
  reuploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    width: '100%',
  },
  reuploadButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#0EA5E9',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    width: '100%',
  },
  expiryDateBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  expiryDateText: {
    fontSize: 11.5,
    fontFamily: 'Inter-SemiBold',
    color: '#334155',
  },
  expiryDatePlaceholder: {
    color: '#94A3B8',
    fontFamily: 'Inter-Medium',
  },
  webDateOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  webDateCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 8,
    padding: 20,
    gap: 14,
  },
  webDateTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  webDateDoneBtn: {
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  webDateDoneBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
  gridEmptyContainer: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  gridEmptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridEmptySubtitle: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  gridSelectText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#0EA5E9',
  },
});


