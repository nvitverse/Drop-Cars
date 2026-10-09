import React, { useState } from 'react';
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
  Image,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Phone, Lock, FileText, Camera, Eye, EyeOff, ArrowRight, CircleCheck as CheckCircle, MapPin, Trash2, Mail, Building, Car } from 'lucide-react-native';
import { useVendorAuth } from '../../hooks/useVendorAuth';
import { pickImage, ImageInfo } from '../../utils/imageUtils';
import { validateFormData } from '../../utils/validation';
import { gradients } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export default function SignUp() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [currentStep, setCurrentStep] = useState(1);
  const [accountType, setAccountType] = useState<'VENDOR' | 'B2B'>(
    (role || '').toUpperCase() === 'B2B' ? 'B2B' : 'VENDOR'
  );
  const [formData, setFormData] = useState({
    full_name: '',
    company_name: '',
    primary_number: '',
    secondary_number: '',
    address: '',
    pincode: '',
    city: '',
    aadhar_number: '',
    gpay_number: '',
    password: '',
    confirmPassword: '',
  });
  const [aadharImage, setAadharImage] = useState<ImageInfo | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const { signUp, loading, error } = useVendorAuth();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImagePick = async () => {
    try {
      const image = await pickImage();
      if (image) {
        setAadharImage(image);
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? "Target" : 'Failed to pick image');
    }
  };

  const removeImage = () => {
    setAadharImage(null);
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        if (!formData.full_name.trim()) {
          Alert.alert('Error', 'Please enter your full name');
          return false;
        }
        if (!formData.primary_number.trim()) {
          Alert.alert('Error', 'Please enter your primary mobile number');
          return false;
        }
        if (!formData.address.trim()) {
          Alert.alert('Error', 'Please enter your address');
          return false;
        }
        if (!formData.pincode.trim()) {
          Alert.alert('Error', 'Please enter your pincode');
          return false;
        }
        if (!formData.city.trim()) {
          Alert.alert('Error', 'Please enter your city');
          return false;
        }
        return true;
      case 2:
        if (!formData.aadhar_number.trim()) {
          Alert.alert('Error', 'Please enter your Aadhar number');
          return false;
        }
        if (!formData.gpay_number.trim()) {
          Alert.alert('Error', 'Please enter your GPay number');
          return false;
        }
      if (!aadharImage) {
          Alert.alert('Error', 'Please upload your Aadhar image');
          return false;
        }
        return true;
      case 3:
        if (!formData.password.trim()) {
          Alert.alert('Error', 'Please enter a password');
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          Alert.alert('Error', 'Passwords do not match');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 3) {
        setCurrentStep(currentStep + 1);
      } else {
        handleSignUp();
      }
    }
  };

  const handleSignUp = async () => {
    // Validate all form data
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      Alert.alert('Validation Error', validation.errors.join('\n'));
      return;
    }

    try {
      const signUpData = {
        ...formData,
        aadhar_image: aadharImage ? aadharImage.uri : undefined,
      };

      const result = await signUp(signUpData);
      
      if (result) {
        // Redirect to success page instead of sign-in
        router.push('/(auth)/signup-success');
      }
    } catch (error) {
      // Alert.alert('Error', 'Failed to create account. Please try again.');
      console.log("Error to Signup")
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((step) => (
        <View key={step} style={styles.stepContainer}>
          <View style={[
            styles.stepCircle,
            currentStep >= step && styles.stepCircleActive,
            currentStep > step && styles.stepCircleCompleted
          ]}>
            {currentStep > step ? (
              <CheckCircle size={18} color="#FFFFFF" />
            ) : (
              <Text style={[
                styles.stepNumber,
                currentStep >= step && styles.stepNumberActive
              ]}>
                {step}
              </Text>
            )}
          </View>
          {step < 3 && (
            <View style={[
              styles.stepLine,
              currentStep > step && styles.stepLineActive
            ]} />
          )}
        </View>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>
          {accountType === 'B2B' ? 'B2B Partner Registration' : 'Vendor Registration'}
        </Text>
        <Text style={styles.stepSubtitle}>
          {accountType === 'B2B' ? 'Register your hotel or agency for guest bookings' : "Let's start with your basic details"}
        </Text>
      </View>

      {/* Account Type Selector */}
      <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4, marginBottom: 20 }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: accountType === 'VENDOR' ? '#FFFFFF' : 'transparent' }}
          onPress={() => setAccountType('VENDOR')}
        >
          <Car size={16} color={accountType === 'VENDOR' ? '#3B82F6' : '#6B7280'} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: accountType === 'VENDOR' ? '#3B82F6' : '#6B7280' }}>
            Vendor
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: accountType === 'B2B' ? '#FFFFFF' : 'transparent' }}
          onPress={() => setAccountType('B2B')}
        >
          <Building size={16} color={accountType === 'B2B' ? '#7C3AED' : '#6B7280'} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: accountType === 'B2B' ? '#7C3AED' : '#6B7280' }}>
            B2B Partner
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.inputGroup}>
        {/* Full Name */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{accountType === 'B2B' ? 'Contact Person Name' : 'Full Name'}</Text>
          <View style={styles.inputContainer}>
            <User size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={accountType === 'B2B' ? 'Contact Person Name' : 'Rajesh Kumar'}
              value={formData.full_name}
              onChangeText={(value) => handleInputChange('full_name', value)}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {accountType === 'B2B' && (
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Hotel / Agency / Company Name</Text>
            <View style={styles.inputContainer}>
              <Building size={20} color="#7C3AED" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Grand Residency Hotel / TN Travels"
                value={formData.company_name}
                onChangeText={(value) => handleInputChange('company_name', value)}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        )}

        {/* Primary Mobile Number */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Primary Mobile Number</Text>
          <View style={styles.inputContainer}>
            <Phone size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="9876543210"
              value={formData.primary_number}
              onChangeText={(value) => handleInputChange('primary_number', value)}
              keyboardType="phone-pad"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
            />
          </View>
        </View>

        {/* Secondary Mobile Number */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Secondary Mobile Number (Optional)</Text>
          <View style={styles.inputContainer}>
            <Phone size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="9876543210"
              value={formData.secondary_number}
              onChangeText={(value) => handleInputChange('secondary_number', value)}
              keyboardType="phone-pad"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
            />
          </View>
        </View>

        {/* Address */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Address</Text>
          <View style={styles.inputContainer}>
            <MapPin size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="House No. 123, Street Name, Area"
              value={formData.address}
              onChangeText={(value) => handleInputChange('address', value)}
              multiline
              numberOfLines={3}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Pincode and City in Row */}
        <View style={styles.rowContainer}>
          {/* Pincode */}
          <View style={[styles.inputWrapper, styles.halfWidth]}>
            <Text style={styles.inputLabel}>Pincode</Text>
            <View style={styles.inputContainer}>
              <MapPin size={20} color="#3B82F6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="560001"
                value={formData.pincode}
                onChangeText={(value) => handleInputChange('pincode', value)}
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
                maxLength={6}
              />
            </View>
          </View>

          {/* City */}
          <View style={[styles.inputWrapper, styles.halfWidth]}>
            <Text style={styles.inputLabel}>City</Text>
            <View style={styles.inputContainer}>
              <MapPin size={20} color="#3B82F6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Chennai"
                value={formData.city}
                onChangeText={(value) => handleInputChange('city', value)}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Identity & Payment</Text>
      </View>
      
      <View style={styles.inputGroup}>
        {/* Aadhar Number */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Aadhar Number</Text>
          <View style={styles.inputContainer}>
            <FileText size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="1234 5678 9012"
              value={formData.aadhar_number}
              onChangeText={(value) => handleInputChange('aadhar_number', value)}
              keyboardType="numeric"
              maxLength={12}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* GPay Number */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>GPay Number</Text>
          <View style={styles.inputContainer}>
            <Phone size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="9876543210"
              value={formData.gpay_number}
              onChangeText={(value) => handleInputChange('gpay_number', value)}
              keyboardType="phone-pad"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
            />
          </View>
        </View>

        {/* Aadhar Image */}
        <View style={styles.imageSection}>
          <Text style={styles.inputLabel}>Aadhar Front</Text>
          <Text style={styles.imageSubtext}>Max size: 5MB, Format: JPG/PNG</Text>
          
          {aadharImage ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: aadharImage.uri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageButton} onPress={removeImage}>
                <Trash2 size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.imagePickerButton} onPress={handleImagePick}>
              <Camera size={24} color="#3B82F6" />
              <Text style={styles.imagePickerText}>Select Image</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Secure Your Account</Text>
      </View>
      
      <View style={styles.inputGroup}>
        {/* Password */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputContainer}>
            <Lock size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={formData.password}
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

        {/* Confirm Password */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Confirm Password</Text>
          <View style={styles.inputContainer}>
            <Lock size={20} color="#3B82F6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChangeText={(value) => handleInputChange('confirmPassword', value)}
              secureTextEntry={!showConfirmPassword}
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity 
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}
            >
              {showConfirmPassword ? 
                <EyeOff size={20} color="#6B7280" /> : 
                <Eye size={20} color="#6B7280" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.passwordRequirements}>
        <Text style={styles.requirementsTitle}>Password Requirements:</Text>
        <Text style={styles.requirementItem}>• At least 6 characters long</Text>
        <Text style={styles.requirementItem}>• Include numbers and letters</Text>
        <Text style={styles.requirementItem}>• Avoid common passwords</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior="padding"
    >
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}></View>
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeTitle}>
              {accountType === 'B2B' ? 'Create B2B Account' : 'Create Account'}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {accountType === 'B2B' ? 'Join as a B2B Partner' : 'Join as a vendor partner'}
            </Text>
          </View>
          {renderStepIndicator()}
        </View>

        {/* Content Section */}
        <View style={styles.contentSection}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}

          <View style={styles.buttonContainer}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setCurrentStep(currentStep - 1)}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextButton, loading && styles.buttonDisabled]}
              onPress={handleNext}
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
                    {loading ? 'Creating Account...' : 
                     currentStep === 3 ? 'Create Account' : 'Next'}
                  </Text>
                  {currentStep < 3 && <ArrowRight size={20} color="#FFFFFF" />}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Link href="/sign-in" style={styles.link}>
              <Text style={styles.linkTextBold}>Sign In</Text>
            </Link>
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
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  headerSection: {
    paddingTop: height * 0.06,
    paddingBottom: 30,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  welcomeContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  stepCircleActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  stepCircleCompleted: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9CA3AF',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    width: 30,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: '#10B981',
  },
  contentSection: {
    flex: 1,
  },
  stepContent: {
    paddingTop: 20,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 30,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
    textAlignVertical: 'center',
    paddingVertical: 8,
  },
  textArea: {
    textAlignVertical: 'top',
    minHeight: 80,
    paddingTop: 12,
  },
  eyeIcon: {
    padding: 8,
  },
  passwordRequirements: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  requirementItem: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    gap: 16,
  },
  backButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  nextButton: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  gradientButton: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
    marginBottom: 20,
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
  imageSection: {
    marginTop: 20,
  },
  imageSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
    marginLeft: 4,
  },
  imagePreviewContainer: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 6,
    zIndex: 1,
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0E7FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  imagePickerText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
});