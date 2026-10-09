import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  Image,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Building2,
  User,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Wallet,
  Phone,
  MapPin,
  FileCheck,
  Building,
  Eye,
  Camera,
  RotateCw,
  Crop as CropIcon,
  Sparkles,
  ArrowRight,
  Copy,
  Plus,
  CreditCard,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import DocumentCropModal from '@/components/DocumentCropModal';
import PhotoPickerModal from '@/components/PhotoPickerModal';

interface DocState {
  url: string | null;
  name: string | null;
  loading: boolean;
}

export default function CreateVendorScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Agency & Contact Fields
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [secondaryNumber, setSecondaryNumber] = useState('');
  const [gpayNumber, setGpayNumber] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [password, setPassword] = useState('');

  // Documents
  const [tradeDoc, setTradeDoc] = useState<DocState>({ url: null, name: null, loading: false });
  const [aadharDoc, setAadharDoc] = useState<DocState>({ url: null, name: null, loading: false });
  const [panDoc, setPanDoc] = useState<DocState>({ url: null, name: null, loading: false });

  const [loading, setLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState<any | null>(null);

  // Crop & Photo Picker State
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    docType: string;
    label: string;
    setter: React.Dispatch<React.SetStateAction<DocState>>;
  }>({
    visible: false,
    docType: '',
    label: '',
    setter: () => {},
  });

  const [cropModal, setCropModal] = useState<{
    visible: boolean;
    rawUri: string;
    label: string;
    docType: string;
    setter: React.Dispatch<React.SetStateAction<DocState>>;
  }>({
    visible: false,
    rawUri: '',
    label: '',
    docType: '',
    setter: () => {},
  });

  const [previewModal, setPreviewModal] = useState<{ visible: boolean; title: string; url: string }>({
    visible: false,
    title: '',
    url: '',
  });

  const triggerUploadFlow = (
    docType: string,
    label: string,
    setter: React.Dispatch<React.SetStateAction<DocState>>
  ) => {
    setPickerModal({
      visible: true,
      docType,
      label,
      setter,
    });
  };

  const handleLaunchCamera = () => {
    const { docType, label, setter } = pickerModal;
    setPickerModal((p) => ({ ...p, visible: false }));

    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re: any) => {
          setCropModal({
            visible: true,
            rawUri: re.target.result,
            label,
            docType,
            setter,
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      pickNativeFile(docType, label, setter);
    }
  };

  const handleLaunchGallery = () => {
    const { docType, label, setter } = pickerModal;
    setPickerModal((p) => ({ ...p, visible: false }));

    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type === 'application/pdf') {
          uploadDirectFile(file, docType, setter, file.name);
          return;
        }
        const reader = new FileReader();
        reader.onload = (re: any) => {
          setCropModal({
            visible: true,
            rawUri: re.target.result,
            label,
            docType,
            setter,
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      pickNativeFile(docType, label, setter);
    }
  };

  const pickNativeFile = async (
    docType: string,
    label: string,
    setter: React.Dispatch<React.SetStateAction<DocState>>
  ) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];

      if (asset.mimeType?.startsWith('image/')) {
        setCropModal({
          visible: true,
          rawUri: asset.uri,
          label,
          docType,
          setter,
        });
      } else {
        uploadDirectFile(
          { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/pdf' },
          docType,
          setter,
          asset.name
        );
      }
    } catch (err: any) {
      Alert.alert('Selection Failed', err?.message || 'Could not choose document.');
    }
  };

  const uploadDirectFile = async (
    fileOrPayload: any,
    docType: string,
    setter: React.Dispatch<React.SetStateAction<DocState>>,
    fileName?: string
  ) => {
    setter((prev) => ({ ...prev, loading: true }));
    try {
      const res = await apiService.uploadAdminDocument(fileOrPayload, docType);
      setter({ url: res.url, name: fileName || `${docType}.jpg`, loading: false });
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message || 'Could not upload file.');
      setter((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConfirmCrop = async (croppedResult: string | File | Blob) => {
    const { docType, setter } = cropModal;
    setCropModal((c) => ({ ...c, visible: false }));
    setter((prev) => ({ ...prev, loading: true }));

    try {
      const res = await apiService.uploadAdminDocument(croppedResult, docType);
      setter({ url: res.url, name: `${docType}_cropped.jpg`, loading: false });
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message || 'Could not save cropped image.');
      setter((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing Contact', 'Please enter primary contact person name.');
      setActiveStep(1);
      return;
    }
    const cleanPhone = primaryNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit primary mobile number.');
      setActiveStep(1);
      return;
    }
    if (!city.trim()) {
      Alert.alert('Missing City', 'Please enter agency operating city.');
      setActiveStep(1);
      return;
    }

    setLoading(true);
    try {
      const res = await apiService.createVendor({
        full_name: fullName.trim(),
        business_name: businessName.trim() || undefined,
        primary_number: cleanPhone,
        secondary_number: secondaryNumber.trim() || undefined,
        gpay_number: gpayNumber.trim() || undefined,
        city: city.trim(),
        address: address.trim() || undefined,
        pincode: pincode.trim() || undefined,
        aadhar_number: aadharNumber.trim() || undefined,
        password: password.trim() || undefined,
        account_status: 'ACTIVE',
      });
      setCreatedResult(res);
    } catch (e: any) {
      Alert.alert('Failed to Onboard Vendor', e.message || 'Could not register vendor.');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = (txt: string) => {
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(txt);
      Alert.alert('Copied!', 'Credentials copied to clipboard.');
    } else {
      Alert.alert('Credentials', txt);
    }
  };

  const renderDocUploadCard = (
    label: string,
    docType: string,
    docState: DocState,
    setter: React.Dispatch<React.SetStateAction<DocState>>,
    subtitle?: string
  ) => {
    return (
      <View style={styles.docCard}>
        <View style={styles.docCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docCardTitle, { color: themeColors.text }]}>{label}</Text>
            {subtitle ? <Text style={styles.docCardSub}>{subtitle}</Text> : null}
          </View>
          {docState.url ? (
            <View style={styles.verifiedBadge}>
              <CheckCircle2 color="#10B981" size={14} />
              <Text style={styles.verifiedBadgeText}>Attached</Text>
            </View>
          ) : null}
        </View>

        {docState.url ? (
          <View style={styles.docUploadedPreviewRow}>
            <TouchableOpacity
              style={styles.thumbnailWrap}
              onPress={() => setPreviewModal({ visible: true, title: label, url: docState.url! })}
              activeOpacity={0.8}
            >
              <Image source={{ uri: docState.url }} style={styles.docThumbnail} />
              <View style={styles.thumbnailZoomIcon}>
                <Eye color="#FFFFFF" size={12} />
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.docFileName} numberOfLines={1}>
                {docState.name || `${docType}.jpg`}
              </Text>
              <Text style={styles.docFileSize}>Ready for verification</Text>
            </View>

            <TouchableOpacity
              style={styles.reCropBtn}
              onPress={() => triggerUploadFlow(docType, label, setter)}
              activeOpacity={0.7}
            >
              <RotateCw color="#6366F1" size={14} />
              <Text style={styles.reCropBtnText}>Change</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteDocBtn}
              onPress={() => setter({ url: null, name: null, loading: false })}
              activeOpacity={0.7}
            >
              <Trash2 color="#EF4444" size={15} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.uploadDropzone}
            onPress={() => triggerUploadFlow(docType, label, setter)}
            disabled={docState.loading}
            activeOpacity={0.8}
          >
            {docState.loading ? (
              <View style={styles.uploadLoadingRow}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.uploadLoadingText}>Uploading & Processing...</Text>
              </View>
            ) : (
              <View style={styles.uploadPlaceholderRow}>
                <View style={styles.uploadIconBox}>
                  <UploadCloud color="#6366F1" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadPlaceholderTitle}>Scan or Upload Document</Text>
                  <Text style={styles.uploadPlaceholderSub}>Supports camera crop, jpg, png, pdf</Text>
                </View>
                <View style={styles.scanBadge}>
                  <CropIcon color="#818CF8" size={12} />
                  <Text style={styles.scanBadgeText}>Crop</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ----------------------------------------------------
  // Success / Completion Screen
  // ----------------------------------------------------
  if (createdResult) {
    const credText = `Drop Cars Vendor Account:\nMobile: ${createdResult?.vendor?.primary_number || primaryNumber}\nPassword: ${createdResult?.plain_password || password || 'Set via SMS/OTP'}\nVendor ID: ${createdResult?.vendor?.id || createdResult?.vendor_id}`;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successWrapper}>
            <View style={styles.successIconBox}>
              <CheckCircle2 size={54} color="#10B981" />
            </View>
            <Text style={[styles.successTitle, { color: themeColors.text }]}>
              Travel Agency / Vendor Account Created! 🎉
            </Text>
            <Text style={[styles.successSub, { color: themeColors.textSecondary }]}>
              The agency partner account has been activated and is ready to post bookings & take drop car trips.
            </Text>

            {/* Credentials Card */}
            <View style={styles.credCard}>
              <View style={styles.credHeader}>
                <ShieldCheck color="#10B981" size={18} />
                <Text style={styles.credHeaderTitle}>VENDOR AUTHENTICATION</Text>
              </View>

              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Vendor ID:</Text>
                <Text style={styles.credValHighlight}>
                  {createdResult?.vendor?.id || createdResult?.vendor_id || 'DC-VND-OK'}
                </Text>
              </View>
              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Business Name:</Text>
                <Text style={styles.credVal}>{businessName || 'Self / Proprietor'}</Text>
              </View>
              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Contact Person:</Text>
                <Text style={styles.credVal}>{fullName}</Text>
              </View>
              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Login Mobile:</Text>
                <Text style={styles.credVal}>{primaryNumber}</Text>
              </View>
              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Initial Password:</Text>
                <Text style={styles.credValHighlight}>
                  {createdResult?.plain_password || password || 'Generated & Sent via SMS'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.copyCredBtn}
                onPress={() => copyCredentials(credText)}
                activeOpacity={0.8}
              >
                <Copy size={15} color="#FFFFFF" />
                <Text style={styles.copyCredBtnText}>Copy Credentials to Clipboard</Text>
              </TouchableOpacity>
            </View>

            {/* Actions */}
            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.primaryFinishBtn}
                onPress={() => router.replace('/(tabs)/fleet-hub')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#4F46E5', '#6366F1']}
                  style={styles.primaryFinishBtnGradient}
                >
                  <Text style={styles.primaryFinishBtnText}>Go to Vendor Management</Text>
                  <ArrowRight color="#FFFFFF" size={18} />
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryFinishBtn}
                onPress={() => {
                  setCreatedResult(null);
                  setActiveStep(1);
                  setFullName('');
                  setBusinessName('');
                  setPrimaryNumber('');
                  setGpayNumber('');
                }}
                activeOpacity={0.8}
              >
                <Plus color="#94A3B8" size={16} />
                <Text style={styles.secondaryFinishBtnText}>Register Another Vendor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------
  // Main Onboarding Wizard Flow
  // ----------------------------------------------------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.headerTagRow}>
            <Sparkles size={13} color="#6366F1" />
            <Text style={styles.headerTag}>VENDOR APP REPLICA ONBOARDING</Text>
          </View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>New Travel Agency Registration</Text>
        </View>
      </View>

      {/* Step Indicators */}
      <View style={styles.stepIndicatorRow}>
        {[
          { step: 1, label: 'Agency Profile' },
          { step: 2, label: 'KYC & Trade Docs' },
          { step: 3, label: 'Settlement & Access' },
        ].map((item) => {
          const isActive = activeStep === item.step;
          const isDone = activeStep > item.step;
          return (
            <TouchableOpacity
              key={item.step}
              style={[
                styles.stepTab,
                isActive && styles.stepTabActive,
                isDone && styles.stepTabDone,
              ]}
              onPress={() => setActiveStep(item.step as any)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.stepTabText,
                  isActive && styles.stepTabTextActive,
                  isDone && styles.stepTabTextDone,
                ]}
              >
                {item.step}. {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* STEP 1: Agency Profile */}
        {activeStep === 1 && (
          <View style={styles.stepSection}>
            <View style={styles.sectionHeadingBox}>
              <Building2 color="#6366F1" size={20} />
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Agency & Contact Information</Text>
                <Text style={styles.sectionSubtitle}>Enter business details and designated authorized person</Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Travel Agency / Business Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="e.g. Sri Travels / Balaji Cabs"
                placeholderTextColor="#64748B"
                value={businessName}
                onChangeText={setBusinessName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>
                Primary Contact Person <Text style={styles.req}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Full Name of Proprietor / Manager"
                placeholderTextColor="#64748B"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Primary Mobile <Text style={styles.req}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="10-digit mobile"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={primaryNumber}
                  onChangeText={setPrimaryNumber}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>Secondary Phone</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="Optional landline / alt"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={secondaryNumber}
                  onChangeText={setSecondaryNumber}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Operating City <Text style={styles.req}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="e.g. Madurai / Salem"
                  placeholderTextColor="#64748B"
                  value={city}
                  onChangeText={setCity}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>Pincode</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="6-digit pincode"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={pincode}
                  onChangeText={setPincode}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Office / Shop Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Office Address, Landmark"
                placeholderTextColor="#64748B"
                value={address}
                onChangeText={setAddress}
              />
            </View>

            <View style={styles.stepButtonRow}>
              <TouchableOpacity
                style={styles.stepNextBtn}
                onPress={() => setActiveStep(2)}
                activeOpacity={0.85}
              >
                <Text style={styles.stepNextBtnText}>Proceed to KYC Documents</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 2: KYC & Identification Documents */}
        {activeStep === 2 && (
          <View style={styles.stepSection}>
            <View style={styles.sectionHeadingBox}>
              <FileCheck color="#6366F1" size={20} />
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Agency KYC & Trade Verification</Text>
                <Text style={styles.sectionSubtitle}>Upload proprietor Aadhaar & shop / trade certificate</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>Aadhaar Card Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="12-digit Aadhaar"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  maxLength={12}
                  value={aadharNumber}
                  onChangeText={setAadharNumber}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>PAN Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="10-digit PAN"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  maxLength={10}
                  value={panNumber}
                  onChangeText={(v) => setPanNumber(v.toUpperCase())}
                />
              </View>
            </View>

            {renderDocUploadCard('Proprietor Aadhaar Card', 'aadhar_card', aadharDoc, setAadharDoc, 'Clear photo of Aadhaar front/back')}
            {renderDocUploadCard('Trade License / Shop Visiting Card', 'trade_license', tradeDoc, setTradeDoc, 'Visiting card, GST certificate, or board photo')}
            {renderDocUploadCard('PAN Card Document', 'pan_card', panDoc, setPanDoc, 'Company or individual PAN card')}

            <View style={styles.stepButtonRow}>
              <TouchableOpacity
                style={styles.stepBackBtn}
                onPress={() => setActiveStep(1)}
                activeOpacity={0.8}
              >
                <Text style={styles.stepBackBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.stepNextBtn}
                onPress={() => setActiveStep(3)}
                activeOpacity={0.85}
              >
                <Text style={styles.stepNextBtnText}>Proceed to Settlement</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: Settlement & Access */}
        {activeStep === 3 && (
          <View style={styles.stepSection}>
            <View style={styles.sectionHeadingBox}>
              <CreditCard color="#6366F1" size={20} />
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Settlement & Access Credentials</Text>
                <Text style={styles.sectionSubtitle}>GPay number for fast instant trip commission payouts</Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>GPay / UPI Mobile Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="10-digit GPay number"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
                maxLength={10}
                value={gpayNumber}
                onChangeText={setGpayNumber}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Password (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Leave blank for automatic secure password"
                placeholderTextColor="#64748B"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <View style={styles.stepButtonRow}>
              <TouchableOpacity
                style={styles.stepBackBtn}
                onPress={() => setActiveStep(2)}
                activeOpacity={0.8}
              >
                <Text style={styles.stepBackBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitFinalBtn, loading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitFinalBtnGradient}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CheckCircle2 color="#FFFFFF" size={18} />
                      <Text style={styles.submitFinalBtnText}>Complete & Onboard Vendor</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Photo Picker Modal */}
      <PhotoPickerModal
        visible={pickerModal.visible}
        title={`Upload ${pickerModal.label}`}
        onSelectCamera={handleLaunchCamera}
        onSelectGallery={handleLaunchGallery}
        onClose={() => setPickerModal((p) => ({ ...p, visible: false }))}
      />

      {/* Document Cropping Modal */}
      <DocumentCropModal
        visible={cropModal.visible}
        rawUri={cropModal.rawUri}
        label={cropModal.label}
        onCancel={() => setCropModal((c) => ({ ...c, visible: false }))}
        onConfirm={handleConfirmCrop}
      />

      {/* Full Preview Popup Modal */}
      <Modal
        visible={previewModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalCard}>
            <View style={styles.previewModalHeader}>
              <Text style={styles.previewModalTitle}>{previewModal.title}</Text>
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setPreviewModal((p) => ({ ...p, visible: false }))}
              >
                <CheckCircle2 color="#FFFFFF" size={20} />
              </TouchableOpacity>
            </View>
            <Image source={{ uri: previewModal.url }} style={styles.previewModalImage} resizeMode="contain" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  stepTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  stepTabActive: {
    borderBottomColor: '#6366F1',
  },
  stepTabDone: {
    borderBottomColor: '#10B981',
  },
  stepTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stepTabTextActive: {
    color: '#818CF8',
  },
  stepTabTextDone: {
    color: '#10B981',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  stepSection: {
    gap: 14,
  },
  sectionHeadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  formGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  req: {
    color: '#EF4444',
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  docCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  docCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  docCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  docCardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
  },
  docUploadedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  thumbnailWrap: {
    position: 'relative',
    width: 46,
    height: 46,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  docThumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailZoomIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  docFileName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  docFileSize: {
    fontSize: 10,
    color: '#10B981',
    marginTop: 2,
  },
  reCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  reCropBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
  },
  deleteDocBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  uploadDropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#4F46E560',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#0F172A50',
  },
  uploadPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPlaceholderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  uploadPlaceholderSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  scanBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
  },
  uploadLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  uploadLoadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
  },
  stepButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  stepBackBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  stepNextBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
  },
  stepNextBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  submitFinalBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitFinalBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  submitFinalBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successScroll: {
    padding: 20,
    alignItems: 'center',
  },
  successWrapper: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  successIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSub: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  credCard: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    marginBottom: 20,
  },
  credHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  credHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  credItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  credLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  credVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  credValHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  copyCredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  copyCredBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successActions: {
    width: '100%',
    gap: 10,
  },
  primaryFinishBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryFinishBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  primaryFinishBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryFinishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryFinishBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  previewModalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  previewCloseBtn: {
    padding: 4,
  },
  previewModalImage: {
    width: '100%',
    height: 380,
    backgroundColor: '#000000',
  },
});
