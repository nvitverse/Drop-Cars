import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { X, Camera, Upload, CheckCircle2, RefreshCw, Calendar, User, CreditCard } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';
import { appendFileToFormData } from '@/utils/formDataFile';
import { useLanguage } from '@/contexts/LanguageContext';
import DocumentCropModal from '@/components/DocumentCropModal';

export interface DocumentUpdateModalProps {
  visible: boolean;
  onClose: () => void;
  entityId: string;
  entityType: 'vehicle_owner' | 'car' | 'driver';
  documentType: string;
  documentName: string;
  targetSide?: 'front' | 'back';
  initialDocumentNumber?: string;
  initialDriverName?: string;
  onSuccess: () => void;
  /** Why the current upload is INVALID / waiting (from the server), shown at the top so the owner knows what to fix */
  currentReason?: string | null;
  currentStatus?: string | null;
}

export default function DocumentUpdateModal({
  visible,
  onClose,
  entityId,
  entityType,
  documentType,
  documentName,
  targetSide,
  initialDocumentNumber = '',
  initialDriverName = '',
  onSuccess,
  currentReason,
  currentStatus,
}: DocumentUpdateModalProps) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useLanguage();
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [registrationDate, setRegistrationDate] = useState<string>('');
  const [showRegPicker, setShowRegPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aadharNumber, setAadharNumber] = useState('');
  // Crop step: picked photo lands here first, cropped result goes to front/back.
  const [cropState, setCropState] = useState<{
    visible: boolean; side: 'front' | 'back'; rawUri: string; w: number; h: number;
  }>({ visible: false, side: 'front', rawUri: '', w: 1200, h: 800 });

  // Driver details editable fields
  const isDriverDoc = entityType === 'driver';
  const isAadhaarDoc =
    isDriverDoc && ((documentType || '').toLowerCase().startsWith('aadhar') || (documentName || '').toLowerCase().includes('aadhaar'));
  const [driverName, setDriverName] = useState('');
  const [dlStateCode, setDlStateCode] = useState('');
  const [dlYear, setDlYear] = useState('');
  const [dlSerial, setDlSerial] = useState('');

  // Parse initial values whenever modal opens or props change
  useEffect(() => {
    if (visible) {
      setFrontImage(null);
      setBackImage(null);
      setExpiryDate('');
      setAadharNumber((isAadhaarDoc ? (initialDocumentNumber || '') : '').replace(/\D/g, '').slice(0, 12));
      setDriverName(initialDriverName || '');

      // Parse document number into 3 parts
      const rawDoc = (initialDocumentNumber || '').trim();
      if (rawDoc) {
        if (rawDoc.includes(' ')) {
          const parts = rawDoc.split(/\s+/);
          setDlStateCode(parts[0] || '');
          setDlYear(parts[1] || '');
          setDlSerial(parts.slice(2).join('') || '');
        } else {
          const clean = rawDoc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (clean.length >= 8) {
            setDlStateCode(clean.slice(0, 4));
            setDlYear(clean.slice(4, 8));
            setDlSerial(clean.slice(8));
          } else {
            setDlStateCode(clean);
            setDlYear('');
            setDlSerial('');
          }
        }
      } else {
        setDlStateCode('');
        setDlYear('');
        setDlSerial('');
      }
    }
  }, [visible, initialDocumentNumber, initialDriverName]);

  const docLower = (documentType || '').toLowerCase();

  // Documents that require expiry date: vehicle docs (Insurance, Permit, FC, Pollution) + Driver Licence
  const isLicenceDoc =
    isDriverDoc && (docLower.includes('licence') || docLower.includes('license') || docLower.includes('dl') || (documentName || '').toLowerCase().includes('licence') || (documentName || '').toLowerCase().includes('license'));
  const requiresExpiryDate =
    isLicenceDoc ||
    (!isDriverDoc && ['insurance', 'permit', 'fitness', 'fc', 'pollution', 'puc'].some((d) => docLower.includes(d)));

  // An RC has no expiry date - only a registration date (asked on the front side)
  const isRcFront = !isDriverDoc && entityType === 'car' && docLower === 'rc_front';

  // Determine which side(s) to show based on targetSide
  const showFront = targetSide ? targetSide === 'front' : true;
  const showBack = targetSide
    ? targetSide === 'back'
    : isAadhaarDoc || ['rc', 'licence', 'dl', 'aadhaar', 'permit'].some((d) => docLower.includes(d));

  const extractExpiryOCR = async (uri: string, dType: string) => {
    try {
      const formData = new FormData();
      const name = uri.split('/').pop() || 'doc.jpg';
      const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      await appendFileToFormData(formData, 'file', uri, name, type);
      const cleanDocType = dType.includes('licen') || dType.includes('dl') ? 'licence' : dType;
      formData.append('doc_type', cleanDocType);
      const res = await axiosInstance.post('/api/users/cardetails/extract-expiry', formData);
      const expiry = res.data?.expiry_date;
      if (expiry) {
        setExpiryDate(expiry);
      }
    } catch {
      // Non-fatal
    }
  };

  const capturePhoto = async (side: 'front' | 'back', source: 'camera' | 'gallery') => {
    try {
      let asset: ImagePicker.ImagePickerAsset | undefined;
      if (source === 'camera') {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(t('documentUpdateModal.permissionRequiredTitle'), t('documentUpdateModal.cameraPermissionBody'));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (!result.canceled) asset = result.assets[0];
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (!result.canceled) asset = result.assets[0];
      }
      if (asset) {
        setCropState({ visible: true, side, rawUri: asset.uri, w: asset.width || 1200, h: asset.height || 800 });
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      Alert.alert(t('documentUpdateModal.errorTitle'), 'Failed to select image photo.');
    }
  };

  const handleCropConfirm = (finalUri: string) => {
    const { side } = cropState;
    setCropState((prev) => ({ ...prev, visible: false }));
    if (side === 'front') {
      setFrontImage(finalUri);
      if (requiresExpiryDate) {
        extractExpiryOCR(finalUri, docLower);
      }
    } else {
      setBackImage(finalUri);
    }
  };

  const chooseSource = (side: 'front' | 'back') => {
    Alert.alert(side === 'front' ? 'Front Side Photo' : 'Back Side Photo', 'How do you want to add this photo?', [
      { text: 'Take Photo', onPress: () => capturePhoto(side, 'camera') },
      { text: 'Choose from Gallery', onPress: () => capturePhoto(side, 'gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadDocument = async () => {
    // Validate required photos
    if (showFront && !frontImage) {
      Alert.alert(t('documentUpdateModal.noImageTitle'), 'Please capture the front photo of the document.');
      return;
    }

    if (showBack && !backImage) {
      Alert.alert(t('documentUpdateModal.noImageTitle'), 'Please capture the back photo of the document.');
      return;
    }

    if (requiresExpiryDate && !expiryDate) {
      Alert.alert('Expiry Date Required', 'Please select the expiry date printed on this document.');
      return;
    }
    if (isRcFront && !registrationDate) {
      Alert.alert('Registration Date Required', 'Please select the registration date printed on the RC.');
      return;
    }

    if (isAadhaarDoc && aadharNumber.replace(/\D/g, '').length !== 12) {
      Alert.alert('Aadhaar Number Required', 'Please enter the 12-digit Aadhaar number.');
      return;
    }
    if (isDriverDoc && !isAadhaarDoc && (!dlStateCode.trim() || !dlYear.trim() || !dlSerial.trim())) {
      Alert.alert('Licence Number Required', 'Please complete the driving licence number (State+RTO, Year, Serial).');
      return;
    }

    try {
      setUploading(true);
      let outcome: any = null;
      const formData = new FormData();

      if (entityType === 'vehicle_owner') {
        formData.append('document_type', documentType);
        if (expiryDate) formData.append('expiry_date', expiryDate);
        if (frontImage) {
          const isPng = frontImage.toLowerCase().endsWith('.png');
          const file = {
            uri: frontImage,
            type: isPng ? 'image/png' : 'image/jpeg',
            name: `document_front_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
          } as any;
          await appendFileToFormData(formData, 'file', file.uri, file.name, file.type);
        }
        await axiosInstance.post('/api/users/vehicle-owner/update-document', formData);
      } else if (isAadhaarDoc) {
        formData.append('document_type', 'aadhar');
        formData.append('aadhar_number', aadharNumber.replace(/\D/g, ''));
        if (frontImage) {
          await appendFileToFormData(formData, 'aadhar_image', frontImage, `aadhar_front_${Date.now()}.jpg`, 'image/jpeg');
        }
        if (backImage) {
          await appendFileToFormData(formData, 'aadhar_back_image', backImage, `aadhar_back_${Date.now()}.jpg`, 'image/jpeg');
        }
        outcome = (await axiosInstance.post(`/api/users/cardriver/${entityId}/update-document`, formData))?.data;
      } else if (entityType === 'driver') {
        formData.append('document_type', 'licence');
        if (targetSide) {
          formData.append('side', targetSide);
        }
        if (driverName.trim()) {
          formData.append('driver_name', driverName.trim());
        }
        const fullLicenceNumber = [dlStateCode.trim(), dlYear.trim(), dlSerial.trim()].filter(Boolean).join(' ');
        if (fullLicenceNumber) {
          formData.append('document_number', fullLicenceNumber);
        }
        if (expiryDate) {
          formData.append('expiry_date', expiryDate);
        }

        if (frontImage) {
          const isPng = frontImage.toLowerCase().endsWith('.png');
          const file = {
            uri: frontImage,
            type: isPng ? 'image/png' : 'image/jpeg',
            name: `document_front_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
          } as any;
          await appendFileToFormData(formData, 'licence_image', file.uri, file.name, file.type);
        }

        if (backImage) {
          const isPng = backImage.toLowerCase().endsWith('.png');
          const backFile = {
            uri: backImage,
            type: isPng ? 'image/png' : 'image/jpeg',
            name: `document_back_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
          } as any;
          await appendFileToFormData(formData, 'licence_back_image', backFile.uri, backFile.name, backFile.type);
        }

        outcome = (await axiosInstance.post(`/api/users/cardriver/${entityId}/update-document`, formData))?.data;
      } else {
        const rawKey = String(documentType || '').toLowerCase().trim();
        const normalizedDocKey = rawKey === 'car_img' ? 'car' : rawKey;
        formData.append('document_type', normalizedDocKey);
        if (expiryDate) formData.append('expiry_date', expiryDate);
        if (isRcFront && registrationDate) formData.append('registration_date', registrationDate);
        if (frontImage) {
          const isPng = frontImage.toLowerCase().endsWith('.png');
          const file = {
            uri: frontImage,
            type: isPng ? 'image/png' : 'image/jpeg',
            name: `document_${Date.now()}.${isPng ? 'png' : 'jpg'}`,
          } as any;
          await appendFileToFormData(formData, 'image', file.uri, file.name, file.type);
        }
        const resp = await axiosInstance.post(`/api/users/cardetails/${entityId}/update-document`, formData);
        outcome = resp?.data;
      }

      onSuccess();
      handleClose();
      // Tell the owner straight away if the new upload was rejected, and exactly what to do - no phone call needed
      if (outcome?.reason && /invalid|needs/i.test(String(outcome.new_status || ''))) {
        const invalid = /invalid/i.test(String(outcome.new_status));
        Alert.alert(invalid ? 'Document not accepted' : 'Document received', outcome.reason);
      } else {
        Alert.alert(t('documentUpdateModal.successTitle'), t('documentUpdateModal.documentUpdatedSuccess'));
      }
    } catch (error: any) {
      console.error('Error uploading document:', error);
      const msg = error?.response?.data?.detail || t('documentUpdateModal.updateFailedGeneric');
      Alert.alert(t('documentUpdateModal.errorTitle'), typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFrontImage(null);
    setBackImage(null);
    setExpiryDate('');
    setRegistrationDate('');
    setShowDatePicker(false);
    setShowRegPicker(false);
    onClose();
  };

  // Determine modal title
  let modalTitle = `Upload ${documentName}`;
  if (targetSide === 'front') modalTitle = `Upload ${documentName} (Front)`;
  else if (targetSide === 'back') modalTitle = `Upload ${documentName} (Back)`;

  // Check if form is ready to submit
  const isSubmitDisabled =
    uploading ||
    (showFront && !frontImage) ||
    (showBack && !backImage) ||
    (requiresExpiryDate && !expiryDate) ||
    (isRcFront && !registrationDate) ||
    (isAadhaarDoc && aadharNumber.replace(/\D/g, '').length !== 12) ||
    (isDriverDoc && !isAadhaarDoc && (!dlStateCode.trim() || !dlYear.trim() || !dlSerial.trim()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{modalTitle}</Text>
              <Text style={styles.subtitle}>Auto-verification checks document photo, number & name</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: Math.max(380, Math.round(windowHeight * 0.62)) }} showsVerticalScrollIndicator={false}>
            {/* Why the last upload was not accepted, and what to do */}
            {!!currentReason && /invalid|needs/i.test(String(currentStatus || 'invalid')) && (
              <View style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 6, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#B91C1C', fontFamily: 'Inter-Bold', fontSize: 12.5, marginBottom: 2 }}>
                  {/invalid/i.test(String(currentStatus || 'invalid')) ? 'Last upload was not accepted' : 'Last upload is waiting for a check'}
                </Text>
                <Text style={{ color: '#7F1D1D', fontSize: 12.5, lineHeight: 18 }}>{currentReason}</Text>
              </View>
            )}
            {(requiresExpiryDate || isRcFront) && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                Upload the photo of the original, then pick the {isRcFront ? 'registration date' : 'expiry date'} printed on it (date field is below the photo).
              </Text>
            )}
            {/* Driver Editable Details (Name & Document Number) */}
            {isAadhaarDoc && (
              <View style={styles.driverMetaSection}>
                <Text style={styles.fieldLabel}>
                  AADHAAR NUMBER <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View style={styles.inputContainer}>
                  <CreditCard size={18} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    value={aadharNumber}
                    onChangeText={(v) => setAadharNumber(v.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12-digit Aadhaar number"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={12}
                  />
                </View>
              </View>
            )}
            {isDriverDoc && !isAadhaarDoc && (
              <View style={styles.driverMetaSection}>
                {/* Driver Name with edit capability */}
                <Text style={styles.fieldLabel}>
                  DRIVER FULL NAME <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View style={styles.inputContainer}>
                  <User size={18} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.textInput}
                    value={driverName}
                    onChangeText={setDriverName}
                    placeholder="Enter full name as on licence"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                  />
                </View>
                <Text style={styles.metaHint}>Auto-verified against name on document photo.</Text>

                {/* 3-Part Licence Number Input */}
                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  LICENCE NUMBER <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View style={styles.dlRow}>
                  <View style={[styles.dlPartBox, { flex: 1.1 }]}>
                    <CreditCard size={16} color="#64748B" style={{ marginRight: 4 }} />
                    <TextInput
                      style={styles.dlInput}
                      value={dlStateCode}
                      onChangeText={(t) => setDlStateCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                      placeholder="TN25"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      maxLength={4}
                    />
                  </View>
                  <View style={[styles.dlPartBox, { flex: 1 }]}>
                    <TextInput
                      style={styles.dlInput}
                      value={dlYear}
                      onChangeText={(t) => setDlYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                      placeholder="2018"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  <View style={[styles.dlPartBox, { flex: 1.5 }]}>
                    <TextInput
                      style={styles.dlInput}
                      value={dlSerial}
                      onChangeText={(t) => setDlSerial(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                      placeholder="0004862"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      maxLength={10}
                    />
                  </View>
                </View>
                <Text style={styles.metaHint}>State+RTO (TN25), Year (2018), Serial (0004862)</Text>
              </View>
            )}

            {/* Front Photo Card (Only shown if showFront is true) */}
            {showFront && (
              <View style={{ marginTop: isDriverDoc ? 16 : 4 }}>
                <Text style={styles.sideLabel}>
                  {showBack ? '1. FRONT SIDE PHOTO' : 'FRONT SIDE PHOTO'} <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                {frontImage ? (
                  <View style={styles.previewBox}>
                    <Image source={{ uri: frontImage }} style={styles.previewImg} />
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => chooseSource('front')}>
                      <RefreshCw size={14} color="#FFFFFF" />
                      <Text style={styles.retakeText}>Retake Front</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadRow}>
                    <TouchableOpacity
                      style={styles.captureCard}
                      onPress={() => capturePhoto('front', 'camera')}
                      activeOpacity={0.8}
                    >
                      <Camera size={22} color="#3B82F6" />
                      <Text style={styles.captureText}>Take Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.captureCard, styles.galleryCard]}
                      onPress={() => capturePhoto('front', 'gallery')}
                      activeOpacity={0.8}
                    >
                      <Upload size={22} color="#64748B" />
                      <Text style={[styles.captureText, { color: '#334155' }]}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Back Photo Card (Only shown if showBack is true) */}
            {showBack && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sideLabel}>
                  {showFront ? '2. BACK SIDE PHOTO' : 'BACK SIDE PHOTO'} <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                {backImage ? (
                  <View style={styles.previewBox}>
                    <Image source={{ uri: backImage }} style={styles.previewImg} />
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => chooseSource('back')}>
                      <RefreshCw size={14} color="#FFFFFF" />
                      <Text style={styles.retakeText}>Retake Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadRow}>
                    <TouchableOpacity
                      style={styles.captureCard}
                      onPress={() => capturePhoto('back', 'camera')}
                      activeOpacity={0.8}
                    >
                      <Camera size={22} color="#3B82F6" />
                      <Text style={styles.captureText}>Take Back Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.captureCard, styles.galleryCard]}
                      onPress={() => capturePhoto('back', 'gallery')}
                      activeOpacity={0.8}
                    >
                      <Upload size={22} color="#64748B" />
                      <Text style={[styles.captureText, { color: '#334155' }]}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Registration date - the RC has no expiry date */}
            {isRcFront && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.fieldLabel}>
                  RC REGISTRATION DATE <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
                  <Calendar size={18} color={colors.primary} style={{ marginRight: 8 }} />
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={registrationDate}
                      onChange={(e) => setRegistrationDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text, fontSize: '13px', fontFamily: 'Inter-Medium', cursor: 'pointer' }}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setShowRegPicker(true)} style={{ flex: 1 }}>
                      <Text style={{ color: registrationDate ? colors.text : colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' }}>
                        {registrationDate || 'Select Registration Date'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {Platform.OS !== 'web' && showRegPicker && (
                  <DateTimePicker
                    value={registrationDate ? new Date(registrationDate) : new Date()}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={(_: any, date?: Date) => {
                      setShowRegPicker(false);
                      if (date) setRegistrationDate(date.toISOString().split('T')[0]);
                    }}
                  />
                )}
              </View>
            )}

            {/* Expiry Date Section - Only for vehicle documents that actually expire (Insurance/Permit/FC) */}
            {requiresExpiryDate && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.fieldLabel}>
                  DOCUMENT EXPIRY DATE <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 12,
                  }}
                >
                  <Calendar size={18} color={colors.primary} style={{ marginRight: 8 }} />
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        backgroundColor: 'transparent',
                        color: colors.text,
                        fontSize: '13px',
                        fontFamily: 'Inter-Medium',
                        cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: expiryDate ? colors.text : colors.textSecondary,
                          fontSize: 13,
                          fontFamily: 'Inter-Medium',
                        }}
                      >
                        {expiryDate || 'Select Expiry Date'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {Platform.OS !== 'web' && showDatePicker && (
                  <DateTimePicker
                    value={expiryDate ? new Date(expiryDate) : new Date()}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_: any, date?: Date) => {
                      setShowDatePicker(false);
                      if (date) {
                        setExpiryDate(date.toISOString().split('T')[0]);
                      }
                    }}
                  />
                )}
              </View>
            )}
          </ScrollView>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitDisabled && styles.submitBtnDisabled]}
            onPress={uploadDocument}
            disabled={isSubmitDisabled}
            activeOpacity={0.85}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <CheckCircle2 size={18} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>SUBMIT DOCUMENT FOR APPROVAL</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <DocumentCropModal
        visible={cropState.visible}
        rawUri={cropState.rawUri}
        label={cropState.side === 'front' ? 'Front Side' : 'Back Side'}
        imgWidth={cropState.w}
        imgHeight={cropState.h}
        onCancel={() => setCropState((prev) => ({ ...prev, visible: false }))}
        onConfirm={handleCropConfirm}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginLeft: 8,
  },
  driverMetaSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  metaHint: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 4,
  },
  dlRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dlPartBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dlInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
    textAlign: 'center',
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  captureCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 8,
    paddingVertical: 18,
  },
  galleryCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  captureText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  previewBox: {
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  retakeBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  retakeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
