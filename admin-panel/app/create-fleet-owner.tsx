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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Car,
  User,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Wallet,
  Phone,
  MapPin,
  IdCard,
  FileCheck,
  Lock,
  Copy,
  Plus,
  Building,
  Eye,
  Camera,
  RotateCw,
  Crop as CropIcon,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import { Card, Btn } from '@/components/ui';
import DocumentCropModal from '@/components/DocumentCropModal';
import PhotoPickerModal from '@/components/PhotoPickerModal';

interface DocState {
  url: string | null;
  name: string | null;
  loading: boolean;
}

const CAR_TYPES = [
  { label: 'Sedan (Dzire, Etios)', value: 'SEDAN_4_PLUS_1' },
  { label: 'New Sedan (2022+ Dzire/Aura)', value: 'NEW_SEDAN_2022_MODEL' },
  { label: 'SUV (Ertiga, Triber)', value: 'SUV_6_PLUS_1' },
  { label: 'Innova / Marazzo', value: 'INNOVA_7_PLUS_1' },
  { label: 'Innova Crysta', value: 'INNOVA_CRYSTA_7_PLUS_1' },
  { label: 'Tempo Traveller', value: 'TEMPO_TRAVELLER_12_PLUS_1' },
];

export default function CreateFleetOwnerScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();

  // Active Wizard Tab
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Owner Info
  const [fullName, setFullName] = useState('');
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [secondaryNumber, setSecondaryNumber] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [walletBalance, setWalletBalance] = useState('0');
  const [isPreferred, setIsPreferred] = useState(false);
  const [password, setPassword] = useState('');

  // Step 2: Owner Documents
  const [aadharFront, setAadharFront] = useState<DocState>({ url: null, name: null, loading: false });
  const [aadharBack, setAadharBack] = useState<DocState>({ url: null, name: null, loading: false });
  const [panDoc, setPanDoc] = useState<DocState>({ url: null, name: null, loading: false });

  // Step 3: Attach First Car
  const [includeCar, setIncludeCar] = useState(true);
  const [carName, setCarName] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [carType, setCarType] = useState('SEDAN_4_PLUS_1');
  const [carYear, setCarYear] = useState('');
  const [rcFront, setRcFront] = useState<DocState>({ url: null, name: null, loading: false });
  const [rcBack, setRcBack] = useState<DocState>({ url: null, name: null, loading: false });
  const [insuranceDoc, setInsuranceDoc] = useState<DocState>({ url: null, name: null, loading: false });
  const [fcDoc, setFcDoc] = useState<DocState>({ url: null, name: null, loading: false });

  // Step 4: Attach First Driver
  const [includeDriver, setIncludeDriver] = useState(true);
  const [isOwnerDriver, setIsOwnerDriver] = useState(true);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverLicence, setDriverLicence] = useState('');
  const [dlFront, setDlFront] = useState<DocState>({ url: null, name: null, loading: false });
  const [dlBack, setDlBack] = useState<DocState>({ url: null, name: null, loading: false });
  const [driverPhoto, setDriverPhoto] = useState<DocState>({ url: null, name: null, loading: false });

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

  // Image Preview Popup
  const [previewModal, setPreviewModal] = useState<{ visible: boolean; title: string; url: string }>({
    visible: false,
    title: '',
    url: '',
  });

  // Auto-fill driver details if owner is driver
  const handleOwnerDriverToggle = (val: boolean) => {
    setIsOwnerDriver(val);
    if (val) {
      if (fullName) setDriverName(fullName);
      if (primaryNumber) setDriverPhone(primaryNumber);
    } else {
      setDriverName('');
      setDriverPhone('');
    }
  };

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
          // Direct upload for PDF
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
      Alert.alert('Missing Name', 'Please enter fleet owner full name.');
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
      Alert.alert('Missing City', 'Please enter base operational city.');
      setActiveStep(1);
      return;
    }

    if (includeCar) {
      if (!carNumber.trim() || !carName.trim()) {
        Alert.alert('Missing Car Info', 'Please enter vehicle registration number and car model.');
        setActiveStep(3);
        return;
      }
    }

    if (includeDriver) {
      const finalDriverName = isOwnerDriver ? (driverName || fullName) : driverName;
      const finalDriverPhone = isOwnerDriver ? (driverPhone || cleanPhone) : driverPhone;
      if (!finalDriverName.trim() || !finalDriverPhone.trim()) {
        Alert.alert('Missing Driver Info', 'Please enter driver name and primary mobile number.');
        setActiveStep(4);
        return;
      }
      if (!driverLicence.trim()) {
        Alert.alert('Missing Driving Licence', 'Driving Licence Number is mandatory for drivers (including Owner-Driver).');
        setActiveStep(4);
        return;
      }
    }

    setLoading(true);
    try {
      const payload: any = {
        full_name: fullName.trim(),
        primary_number: cleanPhone,
        secondary_number: secondaryNumber.trim() || undefined,
        city: city.trim(),
        address: address.trim() || undefined,
        pincode: pincode.trim() || undefined,
        aadhar_number: aadharNumber.trim() || undefined,
        pan_number: panNumber.trim() || undefined,
        initial_wallet_balance: parseFloat(walletBalance) || 0,
        tier: isPreferred ? 'PREFERRED' : 'STANDARD',
        password: password.trim() || undefined,
        account_status: 'ACTIVE',
      };

      if (includeCar && carNumber.trim() && carName.trim()) {
        payload.car_name = carName.trim();
        payload.car_number = carNumber.trim().toUpperCase().replace(/\s/g, '');
        payload.car_type = carType;
        payload.year_of_the_car = carYear.trim() || undefined;
      }

      if (includeDriver) {
        payload.driver_name = isOwnerDriver ? (driverName.trim() || fullName.trim()) : driverName.trim();
        payload.driver_primary_number = isOwnerDriver ? (driverPhone.trim() || cleanPhone) : driverPhone.trim();
        payload.driver_licence_number = driverLicence.trim().toUpperCase();
        payload.is_owner_driver = isOwnerDriver;
      }

      const res = await apiService.createFleetOwner(payload);
      setCreatedResult(res);
    } catch (e: any) {
      Alert.alert('Failed to Create Fleet Account', e.message || 'Could not onboard fleet owner.');
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
    const credText = `Drop Cars Fleet Login:\nMobile: ${createdResult?.fleet_owner?.primary_number || primaryNumber}\nPassword: ${createdResult?.plain_password || password || 'Set via SMS/OTP'}\nFleet ID: ${createdResult?.fleet_owner?.id || createdResult?.fleet_owner_id}`;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successWrapper}>
            <View style={styles.successIconBox}>
              <CheckCircle2 size={54} color="#10B981" />
            </View>
            <Text style={[styles.successTitle, { color: themeColors.text }]}>
              Fleet Account Created Successfully! 🎉
            </Text>
            <Text style={[styles.successSub, { color: themeColors.textSecondary }]}>
              The fleet owner account has been activated and verified on the Drop Cars Driver & Fleet Network.
            </Text>

            {/* Credentials Card */}
            <View style={styles.credCard}>
              <View style={styles.credHeader}>
                <ShieldCheck color="#10B981" size={18} />
                <Text style={styles.credHeaderTitle}>AUTHENTICATION CREDENTIALS</Text>
              </View>

              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Fleet Owner ID:</Text>
                <Text style={styles.credValHighlight}>
                  {createdResult?.fleet_owner?.id || createdResult?.fleet_owner_id || 'DC-FLEET-OK'}
                </Text>
              </View>
              <View style={styles.credItemRow}>
                <Text style={styles.credLabel}>Registered Name:</Text>
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
                <Text style={styles.copyCredBtnText}>Copy Full Credentials to Clipboard</Text>
              </TouchableOpacity>
            </View>

            {/* Attached Assets Summary */}
            <View style={styles.summaryStatsGrid}>
              <View style={styles.summaryStatBox}>
                <Car color="#6366F1" size={24} />
                <Text style={styles.summaryStatVal}>{includeCar ? '1 Vehicle' : '0 Vehicles'}</Text>
                <Text style={styles.summaryStatLabel}>{includeCar ? carNumber : 'None Attached'}</Text>
              </View>
              <View style={styles.summaryStatBox}>
                <User color="#10B981" size={24} />
                <Text style={styles.summaryStatVal}>{includeDriver ? '1 Driver' : '0 Drivers'}</Text>
                <Text style={styles.summaryStatLabel}>{includeDriver ? (isOwnerDriver ? 'Owner-Driver' : driverName) : 'None Attached'}</Text>
              </View>
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
                  <Text style={styles.primaryFinishBtnText}>View in Fleet Hub</Text>
                  <ArrowRight color="#FFFFFF" size={18} />
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryFinishBtn}
                onPress={() => {
                  setCreatedResult(null);
                  setActiveStep(1);
                  setFullName('');
                  setPrimaryNumber('');
                  setCarNumber('');
                  setCarName('');
                }}
                activeOpacity={0.8}
              >
                <Plus color="#94A3B8" size={16} />
                <Text style={styles.secondaryFinishBtnText}>Register Another Fleet Owner</Text>
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
            <Text style={styles.headerTag}>DRIVER APP REPLICA ONBOARDING</Text>
          </View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>New Fleet Owner Registration</Text>
        </View>
      </View>

      {/* Step Indicators */}
      <View style={styles.stepIndicatorRow}>
        {[
          { step: 1, label: 'Owner Profile' },
          { step: 2, label: 'KYC & Docs' },
          { step: 3, label: 'Attach Car' },
          { step: 4, label: 'Attach Driver' },
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
        {/* STEP 1: Owner Profile & Contact */}
        {activeStep === 1 && (
          <View style={styles.stepSection}>
            <View style={styles.sectionHeadingBox}>
              <User color="#6366F1" size={20} />
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Owner Personal Information</Text>
                <Text style={styles.sectionSubtitle}>Enter basic identification and primary contact details</Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>
                Full Name <Text style={styles.req}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#64748B"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Primary Mobile Number <Text style={styles.req}>*</Text>
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
                  placeholder="Optional backup"
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
                  placeholder="e.g. Chennai / Coimbatore"
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
              <Text style={[styles.label, { color: themeColors.text }]}>Residential / Office Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Door No, Street Name, Landmark"
                placeholderTextColor="#64748B"
                value={address}
                onChangeText={setAddress}
              />
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
                <Text style={[styles.label, { color: themeColors.text }]}>PAN Card Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="10-digit PAN (e.g. ABCDE1234F)"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  maxLength={10}
                  value={panNumber}
                  onChangeText={(v) => setPanNumber(v.toUpperCase())}
                />
              </View>
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
              <IdCard color="#6366F1" size={20} />
              <View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Owner KYC & Document Scan</Text>
                <Text style={styles.sectionSubtitle}>Attach cropped front/back identification cards</Text>
              </View>
            </View>

            {renderDocUploadCard('Aadhaar Card (Front Side)', 'aadhar_front', aadharFront, setAadharFront, 'Clear photo showing name and photo')}
            {renderDocUploadCard('Aadhaar Card (Back Side)', 'aadhar_back', aadharBack, setAadharBack, 'Clear photo showing address and QR code')}
            {renderDocUploadCard('PAN Card Document', 'pan_card', panDoc, setPanDoc, 'Original PAN card copy')}

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
                <Text style={styles.stepNextBtnText}>Proceed to Attach Car</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: Vehicle Attachment */}
        {activeStep === 3 && (
          <View style={styles.stepSection}>
            <View style={styles.toggleAttachHeader}>
              <View style={styles.sectionHeadingBox}>
                <Car color="#6366F1" size={20} />
                <View>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Attach First Vehicle</Text>
                  <Text style={styles.sectionSubtitle}>Optionally register their primary car immediately</Text>
                </View>
              </View>
              <Switch
                value={includeCar}
                onValueChange={setIncludeCar}
                trackColor={{ false: '#334155', true: '#4F46E5' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {includeCar ? (
              <View style={styles.attachedSubForm}>
                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1.2 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>
                      Vehicle Number Plate <Text style={styles.req}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                      placeholder="e.g. TN 01 AB 1234"
                      placeholderTextColor="#64748B"
                      autoCapitalize="characters"
                      value={carNumber}
                      onChangeText={(v) => setCarNumber(v.toUpperCase())}
                    />
                  </View>

                  <View style={[styles.formGroup, { flex: 1.2 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>
                      Car Model Name <Text style={styles.req}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                      placeholder="e.g. Swift Dzire ZXi"
                      placeholderTextColor="#64748B"
                      value={carName}
                      onChangeText={setCarName}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1.2 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>Vehicle Category</Text>
                    <View style={styles.typeSelectorRow}>
                      {CAR_TYPES.slice(0, 3).map((ct) => (
                        <TouchableOpacity
                          key={ct.value}
                          style={[
                            styles.typeChip,
                            carType === ct.value && styles.typeChipActive,
                          ]}
                          onPress={() => setCarType(ct.value)}
                        >
                          <Text
                            style={[
                              styles.typeChipText,
                              carType === ct.value && styles.typeChipTextActive,
                            ]}
                          >
                            {ct.label.split(' ')[0]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>Year of Make</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                      placeholder="e.g. 2023"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={carYear}
                      onChangeText={setCarYear}
                    />
                  </View>
                </View>

                {/* RC & Insurance Documents */}
                <Text style={styles.subSectionTitle}>Vehicle Documents (RC & Insurance)</Text>
                {renderDocUploadCard('RC Book Front Side', 'rc_front', rcFront, setRcFront, 'Registration Certificate Front')}
                {renderDocUploadCard('RC Book Back Side', 'rc_back', rcBack, setRcBack, 'Registration Certificate Back')}
                {renderDocUploadCard('Insurance Certificate', 'insurance', insuranceDoc, setInsuranceDoc, 'Valid comprehensive / 3rd party insurance')}
              </View>
            ) : (
              <View style={styles.skipBanner}>
                <Text style={styles.skipBannerText}>Car attachment skipped. Owner can add cars later from their app or admin hub.</Text>
              </View>
            )}

            <View style={styles.stepButtonRow}>
              <TouchableOpacity
                style={styles.stepBackBtn}
                onPress={() => setActiveStep(2)}
                activeOpacity={0.8}
              >
                <Text style={styles.stepBackBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.stepNextBtn}
                onPress={() => setActiveStep(4)}
                activeOpacity={0.85}
              >
                <Text style={styles.stepNextBtnText}>Proceed to Attach Driver</Text>
                <ArrowRight color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 4: Driver Attachment */}
        {activeStep === 4 && (
          <View style={styles.stepSection}>
            <View style={styles.toggleAttachHeader}>
              <View style={styles.sectionHeadingBox}>
                <User color="#6366F1" size={20} />
                <View>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Attach First Driver</Text>
                  <Text style={styles.sectionSubtitle}>Owner can drive their car or assign a designated driver</Text>
                </View>
              </View>
              <Switch
                value={includeDriver}
                onValueChange={setIncludeDriver}
                trackColor={{ false: '#334155', true: '#4F46E5' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {includeDriver ? (
              <View style={styles.attachedSubForm}>
                {/* Owner-Driver Toggle */}
                <View style={styles.ownerDriverBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ownerDriverTitle}>Is Owner-cum-Driver?</Text>
                    <Text style={styles.ownerDriverSub}>Auto-fills owner details for driver account</Text>
                  </View>
                  <Switch
                    value={isOwnerDriver}
                    onValueChange={handleOwnerDriverToggle}
                    trackColor={{ false: '#334155', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1.2 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>
                      Driver Name <Text style={styles.req}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                      placeholder="Driver full name"
                      placeholderTextColor="#64748B"
                      value={isOwnerDriver ? (driverName || fullName) : driverName}
                      onChangeText={setDriverName}
                    />
                  </View>

                  <View style={[styles.formGroup, { flex: 1.2 }]}>
                    <Text style={[styles.label, { color: themeColors.text }]}>
                      Driver Mobile <Text style={styles.req}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                      placeholder="10-digit mobile"
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                      maxLength={10}
                      value={isOwnerDriver ? (driverPhone || primaryNumber) : driverPhone}
                      onChangeText={setDriverPhone}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: themeColors.text }]}>
                    Driving Licence (DL) Number <Text style={styles.req}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                    placeholder="e.g. TN0120200012345"
                    placeholderTextColor="#64748B"
                    autoCapitalize="characters"
                    value={driverLicence}
                    onChangeText={(v) => setDriverLicence(v.toUpperCase())}
                  />
                </View>

                {/* Driver Documents */}
                <Text style={styles.subSectionTitle}>Driver Licence & Photo Scan</Text>
                {renderDocUploadCard('Driving Licence Front Side', 'dl_front', dlFront, setDlFront, 'Original DL front copy with chip/barcode')}
                {renderDocUploadCard('Driving Licence Back Side', 'dl_back', dlBack, setDlBack, 'DL back copy with badge details')}
                {renderDocUploadCard('Driver Passport Photo', 'driver_photo', driverPhoto, setDriverPhoto, 'Clear square selfie or passport photo')}
              </View>
            ) : (
              <View style={styles.skipBanner}>
                <Text style={styles.skipBannerText}>Driver attachment skipped. Fleet owner can assign drivers later.</Text>
              </View>
            )}

            {/* Security & Final Submit */}
            <View style={styles.securityBox}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Custom Password (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="Leave empty for auto-generated password"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
            </View>

            <View style={styles.stepButtonRow}>
              <TouchableOpacity
                style={styles.stepBackBtn}
                onPress={() => setActiveStep(3)}
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
                      <Text style={styles.submitFinalBtnText}>Complete & Create Account</Text>
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
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#818CF8',
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#818CF8',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  toggleAttachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B40',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  attachedSubForm: {
    gap: 12,
    marginTop: 6,
  },
  ownerDriverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    padding: 12,
  },
  ownerDriverTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  ownerDriverSub: {
    fontSize: 11,
    color: '#6EE7B7',
    marginTop: 1,
  },
  skipBanner: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B50',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  skipBannerText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  securityBox: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  // Doc Cards
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
  // Step Navigation Buttons
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
  // Success Screen
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
    marginBottom: 16,
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
  summaryStatsGrid: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 20,
  },
  summaryStatBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 6,
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
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
  // Preview Modal
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
