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
import { ArrowLeft, Car, Save, Upload, CheckCircle, FileText, Image, ChevronDown } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { addCarDetails } from '@/services/auth/signupService';
import CarNumberInput from '@/components/CarNumberInput';
import CarModelPicker from '@/components/CarModelPicker';
import YearPicker from '@/components/YearPicker';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AddCarMenuScreen() {
  const { t } = useLanguage();
  const [carData, setCarData] = useState({
    name: '',
    type: '',
    registration: '',
    model: '',
    year: '',
    color: '',
  });
  
  const [carImages, setCarImages] = useState({
    rcFront: '',
    rcBack: '',
    insurance: '',
    fc: '',
    permit: '',
    carImage: '',
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1 Vehicle Details, 2 Documents, 3 Review
  const [uploadPercent, setUploadPercent] = useState(0);

  const STEP_LABELS = [t('addCar.stepVehicleDetails'), t('addCar.stepDocuments'), t('addCar.stepReview')];
  const IMAGE_FIELDS: { key: keyof typeof carImages; title: string }[] = [
    { key: 'rcFront', title: t('addCar.imgRcFront') },
    { key: 'rcBack', title: t('addCar.imgRcBack') },
    { key: 'insurance', title: t('addCar.imgInsurance') },
    { key: 'fc', title: t('addCar.imgFc') },
    { key: 'permit', title: t('addCar.imgPermit') },
    { key: 'carImage', title: t('addCar.imgCarImage') },
  ];

  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { refreshData } = useDashboard();

  const carTypes = [
    'HATCHBACK',
    'SEDAN_4_PLUS_1',
    'NEW_SEDAN_2022_MODEL',
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
    if (carType.toUpperCase() === 'NEW_SEDAN_2022_MODEL') return 'Prime Sedan';

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

  // Function to redirect after successful car addition (MENU FLOW ONLY)
  const redirectAfterCarAddition = async () => {
    try {
      console.log('🚗 Car added successfully via menu, going back to My Cars...');
      
      // Refresh dashboard data to show the new car
      await refreshData();
      
      // Always go back to My Cars page for menu flow
      safeBack(router);
      
    } catch (error) {
      console.error('❌ Error during redirect:', error);
      // Fallback: go back anyway
      safeBack(router);
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

  const pickImage = async (imageKey: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // freeform crop before upload - no fixed aspect ratio
        quality: 0.5, // compress - full-size photos made uploads painfully slow
      });
      if (!result.canceled) {
        setCarImages(prev => ({ ...prev, [imageKey]: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert(t('addCar.errorTitle'), t('addCar.pickImageFailed'));
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
    const imageUri = carImages[imageKey as keyof typeof carImages];
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
    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validateStep1()) { setCurrentStep(1); return; }
    if (!validateStep2()) { setCurrentStep(2); return; }

    try {
      setIsLoading(true);
      setUploadPercent(0);
      console.log('🚗 Starting car registration process via menu...');
      const payload = {
        car_name: carData.name.trim(),
        car_type: carData.type,
        car_number: carData.registration.trim().toUpperCase(), // Convert to uppercase
        vehicle_owner_id: user?.id ,
        rc_front_img: carImages.rcFront,
        rc_back_img: carImages.rcBack,
        insurance_img: carImages.insurance,
        fc_img: carImages.fc,
      permit_img: carImages.permit,
        car_img: carImages.carImage,
        model: carData.model || carData.name, // Add model field
        year_of_the_car: carData.year, // Convert to number - backend expects this field name
  
      };
  
      console.log('Sending payload:', JSON.stringify(payload, null, 2));

      // Ensure vehicle_owner_id is always a string to satisfy CarDetailsData type
      await addCarDetails({
        ...payload,
        vehicle_owner_id: payload.vehicle_owner_id ?? ''
      }, setUploadPercent);

      console.log('✅ Car registration completed successfully via menu!');
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

      Alert.alert(t('addCar.errorTitle'), error.message || t('addCarMenu.addCarFailedGeneric'));
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('addCarMenu.headerTitle')}</Text>
        <View style={styles.placeholder} />
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentStep === 1 && (
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t('addCarMenu.welcomeTitle')}</Text>
          <Text style={styles.welcomeSubtitle}>
            {t('addCarMenu.welcomeSubtitle')}
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
          <Text style={styles.inputLabel}>{t('addCar.carTypeLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }] }>
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
            <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }] }>
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
            </View>
          )}
          {errors.type && <Text style={styles.errorText}>{errors.type}</Text>}

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

          <ImageUploadField
            title={t('addCar.imgRcFront')}
            description={t('addCar.rcFrontDesc')}
            imageKey="rcFront"
            isRequired={true}
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
          />

          <ImageUploadField
            title={t('addCar.imgFc')}
            description={t('addCar.fcDesc')}
            imageKey="fc"
            isRequired={true}
          />

        <ImageUploadField
          title={t('addCar.imgPermit')}
          description={t('addCar.permitDesc')}
          imageKey="permit"
          isRequired={true}
        />

          <ImageUploadField
            title={t('addCar.imgCarImage')}
            description={t('addCar.carImageDesc')}
            imageKey="carImage"
            isRequired={true}
          />
          </>
          )}

          {currentStep === 3 && (
          <>
          <Text style={styles.sectionTitle}>{t('addCar.reviewTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('addCar.reviewSubtitle')}</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 6, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
            {[
              [t('addCar.reviewCarName'), carData.name],
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
            <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <CheckCircle color={carImages[f.key] ? '#10B981' : '#D1D5DB'} size={18} />
              <Text style={{ flexShrink: 1, color: colors.text, fontSize: 13 }}>{f.title}</Text>
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
                    <Text style={styles.saveButtonText}>{t('addCarMenu.saveCarButton')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
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
  },
  backButtonDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  placeholder: {
    width: 40, // Same width as back button for centering
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
    color: '#6B7280',
    marginBottom: 8,
  },
});
