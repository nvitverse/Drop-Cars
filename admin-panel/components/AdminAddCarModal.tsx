import React, { useState } from 'react';
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
  Image,
  Platform,
} from 'react-native';
import {
  X,
  CarFront,
  CheckCircle2,
  UploadCloud,
  FileCheck,
  Trash2,
  Car,
  FileText,
  ShieldCheck,
  Calendar,
  RotateCw,
  Crop as CropIcon,
  Sparkles,
  Eye,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import DocumentCropModal from '@/components/DocumentCropModal';
import PhotoPickerModal from '@/components/PhotoPickerModal';

interface AdminAddCarModalProps {
  visible: boolean;
  vehicleOwnerId: string;
  ownerName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

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

export default function AdminAddCarModal({
  visible,
  vehicleOwnerId,
  ownerName,
  onClose,
  onSuccess,
}: AdminAddCarModalProps) {
  const { themeColors, isDark } = useTheme();

  // Basic Details
  const [carName, setCarName] = useState('');
  const [carType, setCarType] = useState('SEDAN_4_PLUS_1');
  const [carNumber, setCarNumber] = useState('');
  const [carYear, setCarYear] = useState('');
  const [registrationDate, setRegistrationDate] = useState(''); // RC has no expiry date, only a registration date
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [fcExpiry, setFcExpiry] = useState('');

  // Document Upload States
  const [rcFront, setRcFront] = useState<DocState>({ url: null, name: null, loading: false });
  const [rcBack, setRcBack] = useState<DocState>({ url: null, name: null, loading: false });
  const [insuranceDoc, setInsuranceDoc] = useState<DocState>({ url: null, name: null, loading: false });
  const [fcDoc, setFcDoc] = useState<DocState>({ url: null, name: null, loading: false });
  // A new vehicle (registered under 2 years ago) has no FC. Registration date decides; the make year is the fallback.
  const fcApplies = (() => {
    const reg = registrationDate.trim() ? new Date(registrationDate.trim()) : null;
    if (reg && !isNaN(reg.getTime())) {
      const freeUntil = new Date(reg); freeUntil.setFullYear(freeUntil.getFullYear() + 2);
      return new Date() >= freeUntil;
    }
    const y = parseInt(carYear);
    return !isNaN(y) && new Date().getFullYear() - y >= 2;
  })();
  const [carPhoto, setCarPhoto] = useState<DocState>({ url: null, name: null, loading: false });
  const [permitDoc, setPermitDoc] = useState<DocState>({ url: null, name: null, loading: false });

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

  const resetForm = () => {
    setCarName('');
    setCarType('SEDAN_4_PLUS_1');
    setCarNumber('');
    setCarYear('');
    setRegistrationDate('');
    setInsuranceExpiry('');
    setFcExpiry('');
    setRcFront({ url: null, name: null, loading: false });
    setRcBack({ url: null, name: null, loading: false });
    setInsuranceDoc({ url: null, name: null, loading: false });
    setFcDoc({ url: null, name: null, loading: false });
    setCarPhoto({ url: null, name: null, loading: false });
    setPermitDoc({ url: null, name: null, loading: false });
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
    if (!carNumber.trim()) {
      Alert.alert('Missing Number', 'Please enter vehicle registration number.');
      return;
    }
    if (!carName.trim()) {
      Alert.alert('Missing Model', 'Please enter car model name (e.g. Swift Dzire).');
      return;
    }

    setLoading(true);
    try {
      await apiService.addCarToFleet(vehicleOwnerId, {
        car_name: carName.trim(),
        car_number: carNumber.trim().toUpperCase().replace(/\s/g, ''),
        car_type: carType,
        year_of_the_car: carYear.trim() || undefined,
        registration_date: registrationDate.trim() || undefined,
        insurance_expiry_date: insuranceExpiry.trim() || undefined,
        fc_expiry_date: fcApplies ? (fcExpiry.trim() || undefined) : undefined,
        rc_front_img_url: rcFront.url || undefined,
        rc_back_img_url: rcBack.url || undefined,
        insurance_img_url: insuranceDoc.url || undefined,
        fc_img_url: fcApplies ? (fcDoc.url || undefined) : undefined,
        car_img_url: carPhoto.url || undefined,
        permit_img_url: permitDoc.url || undefined,
      });

      Alert.alert('Car Added Successfully! 🚗', `${carNumber.toUpperCase()} is now attached to this fleet.`);
      resetForm();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Failed to Add Vehicle', err.message || 'Could not attach car to fleet.');
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
                <Text style={styles.badgeText}>FLEET VEHICLE ATTACHMENT</Text>
              </View>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>Add Car to Fleet</Text>
              {ownerName ? <Text style={styles.headerSubtitle}>Fleet Owner: {ownerName}</Text> : null}
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X color="#94A3B8" size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1.2 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Number Plate <Text style={styles.req}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="e.g. TN01AB1234"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  value={carNumber}
                  onChangeText={(v) => setCarNumber(v.toUpperCase())}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1.2 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>
                  Model Name <Text style={styles.req}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="e.g. Swift Dzire"
                  placeholderTextColor="#64748B"
                  value={carName}
                  onChangeText={setCarName}
                />
              </View>
            </View>

            {/* Category Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Vehicle Category</Text>
              <View style={styles.typeGrid}>
                {CAR_TYPES.map((ct) => (
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
                      {ct.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>Manufacturing Year</Text>
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

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.text }]}>Insurance Expiry</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                  value={insuranceExpiry}
                  onChangeText={setInsuranceExpiry}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>RC Registration Date</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                placeholder="YYYY-MM-DD (as printed on the RC)"
                placeholderTextColor="#64748B"
                value={registrationDate}
                onChangeText={setRegistrationDate}
              />
            </View>

            {fcApplies && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>FC Expiry</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                  value={fcExpiry}
                  onChangeText={setFcExpiry}
                />
              </View>
            )}

            {/* Document Scans */}
            <Text style={styles.subSectionTitle}>Mandatory Vehicle Document Scans</Text>
            {renderDocUploadCard('RC Book (Front Side)', 'rc_front', rcFront, setRcFront, 'Registration Certificate Front with Owner & Engine No')}
            {renderDocUploadCard('RC Book (Back Side)', 'rc_back', rcBack, setRcBack, 'Registration Certificate Back with Tax & Hypothecation')}
            {renderDocUploadCard('Insurance Certificate', 'insurance', insuranceDoc, setInsuranceDoc, 'Valid Commercial / Comprehensive Insurance')}
            {fcApplies && renderDocUploadCard('Fitness Certificate (FC)', 'fc_doc', fcDoc, setFcDoc, 'Commercial Transport Fitness Certificate')}
            {!fcApplies && (
              <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 8 }}>
                FC not needed - a new vehicle has no Fitness Certificate for its first 2 years after the registration date.
              </Text>
            )}
            {renderDocUploadCard('Car Exterior Photo', 'car_photo', carPhoto, setCarPhoto, 'Clear front 45° angle photo of vehicle with plate')}
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
                colors={['#4F46E5', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 color="#FFFFFF" size={16} />
                    <Text style={styles.submitBtnText}>Attach Car to Fleet</Text>
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
