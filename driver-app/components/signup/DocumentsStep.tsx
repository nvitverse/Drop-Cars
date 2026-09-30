import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Upload, CheckCircle, FileText } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { signupAccount, signupAndLogin, SignupSucceededLoginFailedError } from '@/services/auth/signupService';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';

interface DocumentsStepProps {
  data: any;
  onUpdate: (data: any) => void;
  onBack: () => void;
  formData: any;
  onSignupSuccess: (response: any) => void;
}

const normalizeLocalUri = (uri: string) => (uri ? uri.replace('/useer/', '/user/') : uri);

export default function DocumentsStep({ data, onUpdate, onBack, formData, onSignupSuccess }: DocumentsStepProps) {
  const [documents, setDocuments] = useState(data);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const documentTypes = [
    { key: 'aadharFront', label: t('documentsStep.aadharFrontLabel'), required: true },
  ];

  const pickDocument = async (documentKey: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // freeform crop before upload - no fixed aspect ratio
        quality: 0.5, // compress - full-size photos made uploads painfully slow
      });
      if (!result.canceled) {
        const rawUri = result.assets[0].uri;
        const fixedUri = normalizeLocalUri(rawUri);
        const updatedDocuments = { ...documents, [documentKey]: fixedUri };
        setDocuments(updatedDocuments);
        onUpdate(updatedDocuments);
      }
    } catch (error) {
      Alert.alert(t('documentsStep.errorTitle'), t('documentsStep.pickImageFailed'));
    }
  };

  const handleSubmit = async () => {
    const requiredDocs = documentTypes.filter(doc => doc.required);
    const missingDocs = requiredDocs.filter(doc => !documents[doc.key]);

    if (missingDocs.length > 0) {
      Alert.alert(t('documentsStep.errorTitle'), t('documentsStep.uploadAadharFront'));
      return;
    }

    // Additional validation for image
    if (!documents.aadharFront) {
      Alert.alert(t('documentsStep.errorTitle'), t('documentsStep.selectAadharFront'));
      return;
    }

    // Validate image URI format
    if (!documents.aadharFront.startsWith('file://')) {
      Alert.alert(t('documentsStep.errorTitle'), t('documentsStep.invalidImageFormat'));
      return;
    }

    setLoading(true);

    try {
      console.log('📤 Starting signup process...');
      
      // Ensure URI normalization just before submit
      const normalizedDocs = {
        ...documents,
        aadharFront: normalizeLocalUri(documents.aadharFront)
      };
      console.log('🧭 Normalized docs for submit:', normalizedDocs);
      
      // Validate data structure before signup
      console.log('Validating signup data structure...');
      
      // Signup then login to obtain JWT token per API docs
      const { signup, login: loginResp } = await signupAndLogin(formData.personalDetails, normalizedDocs);

      if (signup.status === 'success') {
        // Create user object for local auth
        const userData = {
          id: signup.user_id,
          fullName: formData.personalDetails.fullName,
          primaryMobile: formData.personalDetails.primaryMobile,
          secondaryMobile: formData.personalDetails.secondaryMobile,
          password: formData.personalDetails.password,
          address: formData.personalDetails.address,
          aadharNumber: formData.personalDetails.aadharNumber,
          organizationId: formData.personalDetails.organizationId,
          languages: formData.personalDetails.languages || [],
          documents: normalizedDocs,
        };

        // Save user and real token
        await login(userData, loginResp.access_token);

        // Call the success callback with the response data
        onSignupSuccess({
          signup,
          login: loginResp,
          userData
        });
      }
    } catch (error: any) {
      console.error('❌ Signup failed:', error);

      // Account was actually created - only the immediate auto-login didn't
      // come back in time. Route to Login instead of "Signup Failed", since
      // retrying signup here would just fail on a duplicate phone number.
      if (error instanceof SignupSucceededLoginFailedError) {
        Alert.alert(t('documentsStep.accountCreatedTitle'), error.message, [
          { text: t('documentsStep.goToLogin'), onPress: () => router.replace('/login') },
        ]);
        return;
      }

      let errorMessage = t('documentsStep.signupFailedGeneric');

      if (error.code === 'ECONNABORTED') {
        errorMessage = t('documentsStep.requestTimeout');
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = t('documentsStep.networkError');
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = t('documentsStep.serverNotFound');
      } else if (error.response?.status === 500) {
        errorMessage = t('documentsStep.serverError');
      } else if (error.message && typeof error.message === 'string' && !error.message.startsWith('Signup failed:')) {
        errorMessage = error.message;
      } else if (error.response?.status === 400) {
        const data = error.response?.data;
        const detail = data?.detail ?? data?.message;
        errorMessage = typeof detail === 'string' ? detail : (detail ? String(detail) : errorMessage);
      } else if (error.response?.data?.detail) {
        errorMessage = typeof error.response.data.detail === 'string' ? error.response.data.detail : String(error.response.data.detail);
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      Alert.alert(t('documentsStep.signupFailedTitle'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const DocumentUpload = ({ docType }: { docType: { key: string; label: string; required: boolean } }) => {
    const isUploaded = documents[docType.key];
    
    return (
      <TouchableOpacity
        style={[styles.documentCard, isUploaded && styles.uploadedCard]}
        onPress={() => pickDocument(docType.key)}
      >
        <View style={styles.documentLeft}>
          <View style={[styles.documentIcon, isUploaded && styles.uploadedIcon]}>
            {isUploaded ? (
              <CheckCircle color="#FFFFFF" size={20} />
            ) : (
              <FileText color="#6B7280" size={20} />
            )}
          </View>
          <View>
            <Text style={styles.documentTitle}>{docType.label}</Text>
            <Text style={styles.documentStatus}>
              {isUploaded ? t('documentsStep.uploaded') : t('documentsStep.required')}
            </Text>
          </View>
        </View>
        <Upload color={isUploaded ? "#10B981" : "#6B7280"} size={20} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('documentsStep.title')}</Text>
      <Text style={styles.subtitle}>{t('documentsStep.subtitle')}</Text>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {documentTypes.map((docType) => (
          <DocumentUpload key={docType.key} docType={docType} />
        ))}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ArrowLeft color="#6B7280" size={20} />
          <Text style={styles.backButtonText}>{t('documentsStep.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? t('documentsStep.creatingAccount') : t('documentsStep.createAccount')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  documentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadedCard: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  documentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  uploadedIcon: {
    backgroundColor: '#10B981',
  },
  documentTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  documentStatus: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});