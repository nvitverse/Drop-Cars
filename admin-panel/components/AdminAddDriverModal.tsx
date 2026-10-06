import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
  Platform,
} from 'react-native';
import {
  X,
  User,
  CheckCircle2,
  UploadCloud,
  FileCheck,
  Camera,
  Trash2,
  Eye,
  ShieldCheck,
  FileText,
  AlertCircle,
  IdCard,
  RotateCw,
  Crop as CropIcon,
  Sparkles,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import DocumentCropModal from '@/components/DocumentCropModal';
import PhotoPickerModal from '@/components/PhotoPickerModal';

interface AdminAddDriverModalProps {
  visible: boolean;
  vehicleOwnerId: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerCity?: string;
  ownerAddress?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface DocState {
  url: string | null;
  name: string | null;
  loading: boolean;
}

export default function AdminAddDriverModal({
  visible,
  vehicleOwnerId,
  ownerName,
  ownerPhone,
  ownerCity,
  ownerAddress,
  onClose,
  onSuccess,
}: AdminAddDriverModalProps) {
  const { themeColors, isDark } = useTheme();

  // 1. Is Owner Cum Driver Toggle (Top Level)
  const [isOwnerDriver, setIsOwnerDriver] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [primaryNumber, setPrimaryNumber] = useState('');
  const [secondaryNumber, setSecondaryNumber] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [password, setPassword] = useState('');

  // Document Upload States
  const [dlFront, setDlFront] = useState<DocState>({ url: null, name: null, loading: false });
  const [dlBack, setDlBack] = useState<DocState>({ url: null, name: null, loading: false });
  const [profileImg, setProfileImg] = useState<DocState>({ url: null, name: null, loading: false });
  const [aadharDoc, setAadharDoc] = useState<DocState>({ url: null, name: null, loading: false });

  const [loading, setLoading] = useState(false);

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

  // Auto-fill or clear when "Is Owner Cum Driver" is toggled
  const handleToggleOwnerDriver = (val: boolean) => {
    setIsOwnerDriver(val);
    if (val) {
      if (ownerName) setFullName(ownerName);
      if (ownerPhone) setPrimaryNumber(ownerPhone.replace(/\D/g, '').slice(-10));
      if (ownerCity) setCity(ownerCity);
      if (ownerAddress) setAddress(ownerAddress);
    } else {
      setFullName('');
      setPrimaryNumber('');
      setCity('');
      setAddress('');
    }
  };

  const resetForm = () => {
    setIsOwnerDriver(false);
    setFullName('');
    setPrimaryNumber('');
    setSecondaryNumber('');
    setLicenceNumber('');
    setCity('');
    setAddress('');
    setPincode('');
    setPassword('');
    setDlFront({ url: null, name: null, loading: false });
    setDlBack({ url: null, name: null, loading: false });
    setProfileImg({ url: null, name: null, loading: false });
    setAadharDoc({ url: null, name: null, loading: false });
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
    const cleanPhone = primaryNumber.replace(/\D/g, '');
    if (!fullName.trim()) {
      Alert.alert('Missing Name', 'Please enter driver full name.');
      return;
    }
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit primary mobile number.');
      return;
    }
    if (!licenceNumber.trim()) {
      Alert.alert('Missing Driving Licence', 'Driving Licence Number is mandatory (even for Owner-cum-Driver).');
      return;
    }

    setLoading(true);
    try {
      await apiService.addDriverToFleet(vehicleOwnerId, {
        full_name: fullName.trim(),
        primary_number: cleanPhone,
        secondary_number: secondaryNumber.trim() || undefined,
        licence_number: licenceNumber.trim().toUpperCase(),
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        pincode: pincode.trim() || undefined,
        password: password.trim() || undefined,
        licence_front_img: dlFront.url || undefined,
        licence_back_img: dlBack.url || undefined,
        profile_img: profileImg.url || undefined,
        aadhar_img: aadharDoc.url || undefined,
        is_owner_driver: isOwnerDriver,
      });

      Alert.alert('Driver Added Successfully! 🎉', `${fullName} is now registered under this fleet.`);
      resetForm();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Failed to Add Driver', err.message || 'Could not add driver to fleet.');
    } finally {
      setLoading(false);
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
                  <UploadCloud color="#6366F1" size={18} />
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <Sparkles color="#6366F1" size={13} />
                <Text style={styles.badgeText}>FLEET DRIVER ENROLLMENT</Text>
              </View>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>Add Driver to Fleet</Text>
              {ownerName ? <Text style={styles.headerSubtitle}>Fleet Owner: {ownerName}</Text> : null}
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X color="#94A3B8" size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* 1. Owner-Cum-Driver Toggle Banner */}
            <View style={styles.ownerDriverBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerDriverTitle}>Is Owner-cum-Driver?</Text>
                <Text style={styles.ownerDriverSub}>Auto-fills details from owner profile (DL still required)</Text>
              </View>
              <Switch
                value={isOwnerDriver}
                onValueChange={handleToggleOwnerDriver}
                trackColor={{ false: '#334155', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Profile Inputs */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>
                Full Name <Text style={styles.req}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Driver full name"
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
                  placeholder="Emergency contact"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={secondaryNumber}
                  onChangeText={setSecondaryNumber}
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
                value={licenceNumber}
                onChangeText={(v) => setLicenceNumber(v.toUpperCase())}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>City</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="Operational city"
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
              <Text style={[styles.label, { color: themeColors.text }]}>Permanent Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Driver residence address"
                placeholderTextColor="#64748B"
                value={address}
                onChangeText={setAddress}
              />
            </View>

            {/* Document Uploads with Scanner & Crop */}
            <Text style={styles.subSectionTitle}>Mandatory Driver Documents</Text>
            {renderDocUploadCard('Driving Licence Front Side', 'dl_front', dlFront, setDlFront, 'Original DL front side with photo & chip')}
            {renderDocUploadCard('Driving Licence Back Side', 'dl_back', dlBack, setDlBack, 'Original DL back side with valid vehicle categories')}
            {renderDocUploadCard('Driver Profile Photo / Selfie', 'driver_photo', profileImg, setProfileImg, 'Clear square selfie or passport photo')}
            {renderDocUploadCard('Aadhaar Document (Optional)', 'aadhar_card', aadharDoc, setAadharDoc, 'Driver Aadhaar card')}

            {/* Password */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Login Password (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="Leave empty for auto-generated password"
                placeholderTextColor="#64748B"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 color="#FFFFFF" size={16} />
                    <Text style={styles.submitBtnText}>Add Driver to Fleet</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  ownerDriverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
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
  formGroup: {
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  req: {
    color: '#EF4444',
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#818CF8',
    marginTop: 6,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  docCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 4,
  },
  docCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  docCardTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  docCardSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  docUploadedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  thumbnailWrap: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 6,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  docFileSize: {
    fontSize: 10,
    color: '#10B981',
    marginTop: 1,
  },
  reCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  reCropBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#818CF8',
  },
  deleteDocBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  uploadDropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#4F46E560',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#0F172A50',
  },
  uploadPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPlaceholderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  uploadPlaceholderSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
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
    gap: 6,
    paddingVertical: 4,
  },
  uploadLoadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  submitBtn: {
    flex: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  submitBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
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
