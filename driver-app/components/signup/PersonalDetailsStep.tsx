import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { User, Phone, MapPin, ArrowRight, Lock, Hash, Eye, EyeOff } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

interface PersonalDetailsStepProps {
  data: any;
  onUpdate: (data: any) => void;
  onNext: () => void;
}



// Helper function to validate Indian mobile numbers
const validateIndianMobile = (phone: string): boolean => {
  // Remove +91 prefix if present
  const cleanPhone = phone.replace(/^\+91/, '');
  
  // Check if it's exactly 10 digits and starts with 6, 7, 8, or 9
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(cleanPhone);
};

// Helper function to format phone number for display
const formatPhoneNumber = (phone: string): string => {
  // Remove any non-digit characters and +91 prefix
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
  
  // Return only 10 digits (no +91 prefix)
  if (cleanPhone.length === 10) {
    return cleanPhone;
  }
  
  // If it's more than 10 digits, return the last 10
  if (cleanPhone.length > 10) {
    return cleanPhone.slice(-10);
  }
  
  // Otherwise return the cleaned number
  return cleanPhone;
};

export default function PersonalDetailsStep({ data, onUpdate, onNext }: PersonalDetailsStepProps) {
  const [fullName, setFullName] = useState(data.fullName || '');
  const [primaryMobile, setPrimaryMobile] = useState(data.primaryMobile || '');
  const [secondaryMobile, setSecondaryMobile] = useState(data.secondaryMobile || '');
  const [password, setPassword] = useState(data.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [address, setAddress] = useState(data.address || '');
  const [city, setCity] = useState(data.city || '');
  const [pincode, setPincode] = useState(data.pincode || '');
  const [aadharNumber, setAadharNumber] = useState(data.aadharNumber || '');
  const { t } = useLanguage();




  const handleNext = () => {
    // Remove blocking client-side validations to allow signup without constraints
    const personalData = {
      fullName,
      primaryMobile,
      secondaryMobile,
      password,
      address,
      city,
      pincode,
      aadharNumber,
    };

    onUpdate(personalData);
    onNext();
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{t('personalDetailsStep.title')}</Text>
      <Text style={styles.subtitle}>{t('personalDetailsStep.subtitle')}</Text>

      <View style={styles.form}>
        {/* Full Name */}
        <Text style={styles.label}>{t('addDriver.fullNameLabel')}</Text>
        <View style={styles.inputGroup}>
          <User color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Primary Mobile */}
        <Text style={styles.label}>{t('addDriver.primaryMobileLabel')}</Text>
        <View style={styles.inputGroup}>
          <Phone color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={primaryMobile}
            onChangeText={(text) => {
              const cleanText = text.replace(/\D/g, '');
              if (cleanText.length <= 10) {
                setPrimaryMobile(cleanText);
              }
            }}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>
        {/* Helper/error hints removed to avoid blocking UX */}

        {/* Secondary Mobile */}
        <Text style={styles.label}>{t('addDriver.secondaryMobileLabel')}</Text>
        <View style={styles.inputGroup}>
          <Phone color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={secondaryMobile}
            onChangeText={(text) => {
              const cleanText = text.replace(/\D/g, '');
              if (cleanText.length <= 10) {
                setSecondaryMobile(cleanText);
              }
            }}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>

        {/* Password */}
        <Text style={styles.label}>{t('addDriver.passwordLabel')}</Text>
        <View style={styles.inputGroup}>
          <Lock color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
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

        {/* Address */}
        <Text style={styles.label}>{t('addDriver.streetAddressLabel')}</Text>
        <View style={styles.inputGroup}>
          <MapPin color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* City */}
        <Text style={styles.label}>{t('addDriver.cityLabel')}</Text>
        <View style={styles.inputGroup}>
          <MapPin color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
          />
        </View>

        {/* Pincode */}
        <Text style={styles.label}>{t('addDriver.pincodeLabel')}</Text>
        <View style={styles.inputGroup}>
          <MapPin color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={pincode}
            onChangeText={(text) => {
              const cleanText = text.replace(/\D/g, '');
              if (cleanText.length <= 6) {
                setPincode(cleanText);
              }
            }}
            keyboardType="numeric"
            maxLength={6}
          />
        </View>

        {/* Aadhar Number */}
        <Text style={styles.label}>{t('personalDetailsStep.aadharNumberLabel')}</Text>
        <View style={styles.inputGroup}>
          <Hash color="#6B7280" size={20} />
          <TextInput
            style={styles.input}
            value={aadharNumber}
            onChangeText={setAadharNumber}
            keyboardType="numeric"
            maxLength={12}
          />
        </View>




        {/* Next Button */}
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>{t('personalDetailsStep.next')}</Text>
          <ArrowRight color="#FFFFFF" size={20} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    paddingBottom: 20,
  },
  title: { 
    fontSize: 24, 
    fontFamily: 'Inter-Bold', 
    color: '#1F2937', 
    marginBottom: 8 
  },
  subtitle: { 
    fontSize: 14, 
    fontFamily: 'Inter-Regular', 
    color: '#6B7280', 
    marginBottom: 32 
  },
  form: { 
    flex: 1 
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
  eyeButton: {
    padding: 4,
  },
  label: { 
    fontSize: 16, 
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 10,
    marginTop: 8,
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  paymentOption: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  selectedPayment: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  paymentOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  selectedPaymentText: {
    color: '#FFFFFF',
  },

  nextButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  nextButtonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontFamily: 'Inter-SemiBold', 
    marginRight: 8 
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    marginLeft: 44
  },
  helperText: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    marginLeft: 44,
    marginBottom: 8
  },
});
