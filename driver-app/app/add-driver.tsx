import React, { useState, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import { useConfirmBack } from '@/hooks/useConfirmBack';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image as RNImage,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { KeyboardAvoidingView } from '@/components/KeyboardSafe';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, User, Save, Upload, CheckCircle, FileText, Image as ImageIcon, Phone, Lock, MapPin, CreditCard, Eye, EyeOff, ShieldCheck, RefreshCw, X, Camera, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { addDriverDetails, DriverDetails } from '@/services/driver/driverService';
import { useCarDriver } from '@/contexts/CarDriverContext';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from '@/utils/secureStore';
import axiosInstance from '@/app/api/axiosInstance';
import axiosDriver from '@/app/api/axiosDriver';
import { getAuthHeaders } from '@/services/auth/authService';
import { getFriendlyError } from '@/utils/errorMessage';
import { appendFileToFormData } from '@/utils/formDataFile';
import { pickDocumentImage } from '@/utils/pickDocumentImage';
import DocumentCropModal from '@/components/DocumentCropModal';
import { useLanguage } from '@/contexts/LanguageContext';
// Local MIME type resolver to avoid extra dependency
const guessMimeTypeFromUri = (uri: string): string => {
  try {
    const lower = (uri || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.heic')) return 'image/heic';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
};

export default function AddDriverScreen() {
  const insets = useSafeAreaInsets();
  const [driverData, setDriverData] = useState({
    full_name: '',
    primary_number: '',
    secondary_number: '',
    password: '',
    licence_number: '',
    adress: '',
    city: '',
    pincode: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  // Driving Licence Number, entered as 3 separate parts matching the real
  // Indian DL format (State+RTO code / Year of issue / Serial number, e.g.
  // "TN24" / "2012" / "0008494") instead of one free-text field - combined
  // into driverData.licence_number ("TN24 2012 0008494") on every change.
  const [dlStateCode, setDlStateCode] = useState('');
  const [dlYear, setDlYear] = useState('');
  const [dlSerial, setDlSerial] = useState('');
  useEffect(() => {
    const combined = [dlStateCode, dlYear, dlSerial].filter(Boolean).join(' ');
    setDriverData(prev => ({ ...prev, licence_number: combined }));
    // These 3 fields bypass handleInputChange (which normally clears a
    // field's error the moment it's edited) since they don't map to a
    // single driverData key - without this, a licence_number error from an
    // earlier failed submit stayed stuck on screen even after the fields
    // were correctly filled in.
    if (combined) setErrors(prev => (prev.licence_number ? { ...prev, licence_number: '' } : prev));
  }, [dlStateCode, dlYear, dlSerial]);

  const [driverImages, setDriverImages] = useState({
    licence_front_img: '',
    licence_back_img: '',
    // Live profile photo/selfie (added 2026-09-04) - mandatory, camera
    // capture only (see pickProfilePhoto below), compared against the
    // licence photo via the zero-cost face-match check.
    profile_img: '',
    // Aadhaar front/back - collected for duty drivers only (an own-cum-driver
    // owner already gave theirs when creating the fleet account).
    aadhar_front_img: '',
    aadhar_back_img: '',
  });
  const [aadharNumber, setAadharNumber] = useState('');
  const [previewImage, setPreviewImage] = useState<{ visible: boolean; title: string; uri: string }>({
    visible: false, title: '', uri: '',
  });
  const [licenceExpiryDate, setLicenceExpiryDate] = useState('');
  const [extractingExpiry, setExtractingExpiry] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isLoading, setIsLoading] = useState(false);

  // Own-cum-driver: the fleet owner is registering themself as the driver.
  // Default 'add' preserves the existing flow exactly for everyone who doesn't switch it.
  const [driverMode, setDriverMode] = useState<'add' | 'own'>('add');
  const [ownerCityPincode, setOwnerCityPincode] = useState<{ city: string; pincode: string } | null>(null);

  const router = useRouter();
  const { user, refreshUserData } = useAuth();
  const { signinAsOwner } = useCarDriver();
  const { flow, mode } = useLocalSearchParams<{ flow?: string; mode?: string }>();
  const { colors } = useTheme();
  const { t } = useLanguage();

  // Deep-linked here from the "Duty" tab (?mode=own) when the owner hasn't
  // set themselves up as a duty driver yet - jump straight to "own" mode
  // instead of making them find the toggle themselves.
  useEffect(() => {
    if (mode === 'own') {
      handleSelectOwnAsDriver();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // handleSelectOwnAsDriver's auto-fill can run before `user` has actually
  // loaded (e.g. deep-linked straight here on mode=own, before the auth
  // context finishes its own fetch) - it then falls back to the still-empty
  // driverData defaults, silently leaving full_name/primary_number/adress
  // blank even though the UI hides those fields and tells the owner
  // they're "filled in automatically". Re-sync whenever `user` actually
  // becomes available (or changes) while still in "own" mode, so the fields
  // get populated no matter which finished loading first.
  useEffect(() => {
    if (driverMode !== 'own' || !user) return;
    setDriverData(prev => ({
      ...prev,
      full_name: user.fullName || prev.full_name,
      primary_number: user.primaryMobile || prev.primary_number,
      adress: user.address || prev.adress,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverMode, user?.fullName, user?.primaryMobile, user?.address]);

  // When switching to "Own cum Driver", auto-fill from the owner's own account
  // (name, mobile, address) and fetch city/pincode (not present on the auth user object).
  const handleSelectOwnAsDriver = async () => {
    setDriverMode('own');
    setDriverData(prev => ({
      ...prev,
      full_name: user?.fullName || prev.full_name,
      primary_number: user?.primaryMobile || prev.primary_number,
      secondary_number: '',
      adress: user?.address || prev.adress,
    }));
    if (!ownerCityPincode) {
      try {
        const res = await axiosInstance.get('/api/users/vehicle-owner/me');
        const { city, pincode } = res.data || {};
        if (city || pincode) {
          setOwnerCityPincode({ city: city || '', pincode: pincode || '' });
          setDriverData(prev => ({ ...prev, city: city || prev.city, pincode: pincode || prev.pincode }));
        }
      } catch (e) {
        console.log('Could not prefill city/pincode for own-cum-driver:', e);
      }
    }
  };

  // Prevent accidental back-button exit while adding the first driver.
  useConfirmBack(
    true,
    t('addDriver.confirmBackBody'),
    () => safeBack(router),
  );
  
  // Refresh user data on screen load to ensure fleet owner details are available
  useEffect(() => {
    const loadUserData = async () => {
      try {
        console.log('🔄 Loading user data on add-driver screen...');
        await refreshUserData();
        console.log('✅ User data loaded on add-driver screen, userId:', user?.id);
      } catch (error) {
        console.error('❌ Failed to load user data:', error);
      }
    };
    loadUserData();
  }, []);
  
  // Debug user data
  useEffect(() => {
    console.log('🔍 User data in add-driver:', {
      hasUser: !!user,
      userId: user?.id,
      userName: user?.fullName,
      userMobile: user?.primaryMobile
    });
  }, [user]);

  // Simple input handlers
  const handleInputChange = (field: string, value: string) => {
    // Clear error if exists
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    setDriverData(prev => ({ ...prev, [field]: value }));
  };

  // Simple validation - just check if fields are not empty. Returns the
  // error map itself (not just a boolean) so the caller can tell the user
  // exactly which field(s) are missing instead of a generic message.
  const validateAllFields = (): {[key: string]: string} => {
    const newErrors: {[key: string]: string} = {};

    if (!driverData.full_name.trim()) newErrors.full_name = t('addDriver.fullNameRequired');
    if (!driverData.primary_number.trim()) newErrors.primary_number = t('addDriver.primaryNumberRequired');
    // Own-cum-driver: no separate password - the owner switches into this
    // driver session via their own owner login (signin-as-owner), never a
    // direct driver-password login, so nothing to validate here.
    if (driverMode !== 'own' && !driverData.password.trim()) newErrors.password = t('addDriver.passwordRequired');
    if (!driverData.licence_number.trim()) newErrors.licence_number = t('addDriver.licenceNumberRequired');
    if (!driverData.adress.trim()) newErrors.adress = t('addDriver.addressRequired');

    setErrors(newErrors);

    return newErrors;
  };

  // Best-effort heads-up only - never blocks the upload. Catches the two
  // most common rejection reasons (a black & white Xerox instead of the
  // original color document, or a clearly expired licence) before the
  // driver submits, so they can re-pick right away instead of waiting for
  // a manual reviewer to reject it later. If the check itself fails
  // (network, backend down) the picked image is kept exactly as normal -
  // this never prevents adding a driver.
  const checkDocumentImage = async (imageKey: string, uri: string) => {
    if (imageKey !== 'licence_front_img') return; // only the document type this screen collects
    try {
      const form = new FormData();
      await appendFileToFormData(form, 'file', uri, 'licence.jpg', 'image/jpeg');
      form.append('doc_type', 'licence');
      const res = await axiosInstance.post('/api/documents/verify-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const verification = res.data?.verification;
      if ((verification?.status === 'INVALID' || verification?.status === 'NEEDS_REVIEW') && verification?.reason) {
        Alert.alert('Check this photo', verification.reason);
      }
    } catch (error) {
      // Non-fatal - see comment above.
    }
  };

  // Crop step state - photo is picked (camera OR gallery, asked every time)
  // into here, then the cropped result lands in driverImages on confirm.
  const [cropState, setCropState] = useState<{
    visible: boolean; imageKey: string; rawUri: string; imgWidth: number; imgHeight: number;
  }>({ visible: false, imageKey: '', rawUri: '', imgWidth: 1200, imgHeight: 800 });

  const pickImage = async (imageKey: string) => {
    try {
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
      Alert.alert(t('addDriver.errorTitle'), t('addDriver.pickImageFailed'));
    }
  };

  const extractExpiryForLicence = async (uri: string) => {
    setExtractingExpiry(true);
    try {
      const formData = new FormData();
      const name = uri.split('/').pop() || 'licence.jpg';
      const type = guessMimeTypeFromUri(uri) || 'image/jpeg';
      await appendFileToFormData(formData, 'file', uri, name, type);
      formData.append('doc_type', 'licence');
      const res = await axiosInstance.post('/api/users/cardetails/extract-expiry', formData);
      const expiry = res.data?.expiry_date;
      if (expiry) {
        setLicenceExpiryDate(expiry);
        setErrors(prev => (prev.licence_expiry_date ? { ...prev, licence_expiry_date: '' } : prev));
      }
    } catch (e) {
      // Best-effort OCR extraction - manual entry is always available
    } finally {
      setExtractingExpiry(false);
    }
  };

  const handleCropConfirm = (finalUri: string) => {
    const { imageKey } = cropState;
    setCropState((prev) => ({ ...prev, visible: false }));
    if (!imageKey) return;
    setDriverImages(prev => ({ ...prev, [imageKey]: finalUri }));
    checkDocumentImage(imageKey, finalUri);
    if (imageKey === 'licence_front_img') {
      extractExpiryForLicence(finalUri);
    }
  };

  // Live camera capture ONLY (no gallery) for the mandatory profile photo -
  // added 2026-09-04. Deliberately no launchImageLibraryAsync fallback: a
  // gallery pick would defeat the whole point of a "live" photo (someone
  // else's picture, an old photo, a screenshot of an ID card, etc.) - see
  // the face-match check this gets compared against.
  const pickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.6,
      });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setDriverImages(prev => ({ ...prev, profile_img: uri }));
      }
    } catch (error) {
      Alert.alert(t('addDriver.errorTitle'), t('addDriver.pickImageFailed'));
    }
  };


  // 2-column grid tile: thumbnail of the uploaded photo (tap to view full
  // size) so the driver can tell at a glance what is already uploaded, same
  // as the fleet-account signup's document cards.
  const DocTile = ({
    title,
    hint,
    imageKey,
    isRequired = true,
    cameraOnly = false,
  }: {
    title: string;
    hint: string;
    imageKey: string;
    isRequired?: boolean;
    cameraOnly?: boolean;
  }) => {
    const imageUri = driverImages[imageKey as keyof typeof driverImages];
    const isUploaded = !!imageUri;
    const doPick = () => (cameraOnly ? pickProfilePhoto() : pickImage(imageKey));

    return (
      <View style={[styles.docTile, { backgroundColor: colors.surface, borderColor: isUploaded ? '#10B981' : colors.border }, isUploaded && styles.docTileUploaded]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => (isUploaded ? setPreviewImage({ visible: true, title, uri: imageUri }) : doPick())}
          style={styles.docThumbBox}
        >
          {isUploaded ? (
            <>
              <RNImage source={{ uri: imageUri }} style={styles.docThumbImg} resizeMode="cover" />
              <View style={styles.docCheckBadge}>
                <CheckCircle color="#FFFFFF" size={14} />
              </View>
            </>
          ) : (
            <View style={styles.docThumbEmpty}>
              <ImageIcon color="#94A3B8" size={26} />
              <Text style={styles.docThumbEmptyText}>{cameraOnly ? 'Tap to take photo' : 'Tap to upload'}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={[styles.docTileTitle, { color: colors.text }]} numberOfLines={2}>
          {title} {isRequired && <Text style={styles.required}>*</Text>}
        </Text>
        <Text style={styles.docTileHint} numberOfLines={2}>{hint}</Text>
        {isUploaded ? (
          <View style={styles.docTileActions}>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => setPreviewImage({ visible: true, title, uri: imageUri })}
              activeOpacity={0.7}
            >
              <Eye color="#065F46" size={14} />
              <Text style={styles.viewBtnText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reBtn} onPress={doPick} activeOpacity={0.7}>
              <RefreshCw color="#4F46E5" size={14} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={doPick} activeOpacity={0.8}>
            <LinearGradient colors={['#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.uploadPill}>
              {cameraOnly ? <Camera color="#FFFFFF" size={13} /> : <Upload color="#FFFFFF" size={13} />}
              <Text style={styles.uploadPillText}>{cameraOnly ? 'Take Photo' : 'Upload'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const SectionHeader = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <View style={styles.sectionHeaderRow}>
      <LinearGradient colors={['#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sectionBadge}>
        {icon}
      </LinearGradient>
      <Text style={[styles.sectionHeaderText, { color: colors.text }]}>{text}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );

  const handleSave = async () => {
    // Guard against double submission (e.g. rapid taps) which could create duplicates.
    if (isLoading) return;
    // Clear previous errors
    setErrors({});

    // Simple validation - just check if fields are not empty
    const fieldErrors = validateAllFields();
    if (Object.keys(fieldErrors).length > 0) {
      Alert.alert(t('addDriver.validationErrorTitle'), Object.values(fieldErrors).join('\n'));
      return;
    }

    // licence_front_img and profile_img are both required by the backend
    // for this endpoint (profile_img added 2026-09-04, mandatory).
    if (!driverImages.licence_front_img) {
      Alert.alert(t('addDriver.errorTitle'), t('addDriver.uploadLicenceFront'));
      return;
    }
    if (!driverImages.licence_back_img) {
      Alert.alert(t('addDriver.errorTitle'), 'Please upload the Licence BACK side photo too - both sides are required.');
      return;
    }
    if (!driverImages.profile_img) {
      Alert.alert('Profile Photo Required', 'Please take a live selfie before continuing.');
      return;
    }
    if (driverMode !== 'own') {
      if (!driverImages.aadhar_front_img || !driverImages.aadhar_back_img) {
        Alert.alert(t('addDriver.errorTitle'), 'Please upload both the Aadhaar FRONT and BACK photos.');
        return;
      }
      if (aadharNumber.replace(/\D/g, '').length !== 12) {
        Alert.alert(t('addDriver.errorTitle'), 'Please enter the 12-digit Aadhaar number.');
        return;
      }
    }

    try {
      setIsLoading(true);
      console.log('👤 Starting driver registration process...');
      
      // Refresh user data to ensure fleet owner details are available
      console.log('🔄 Refreshing user data...');
      await refreshUserData();
      console.log('✅ User data refreshed, userId:', user?.id);
      
      // Verify auth before submitting (VO-protected endpoint)
      try {
        const authCheck = await axiosInstance.get('/api/users/vehicle-owner/me');
        if (!authCheck || authCheck.status !== 200) {
          Alert.alert(t('addDriver.authRequiredTitle'), t('addDriver.loginAgainToContinue'));
          return;
        }
      } catch (authErr: any) {
        console.error('🔒 Auth preflight failed:', authErr?.response?.status, authErr?.response?.data);
        Alert.alert(t('addDriver.authRequiredTitle'), t('addDriver.sessionExpiredBody'));
        return;
      }
      // Helpers
      const toTenDigit = (phone: string) => {
        const digits = (phone || '').replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        return digits.slice(-10);
      };

      // Normalize
      const primary = toTenDigit(driverData.primary_number.trim());
      const secondary = driverData.secondary_number ? toTenDigit(driverData.secondary_number.trim()) : '';

      // Validations
      if (!/^[6-9]\d{9}$/.test(primary)) {
        setErrors(prev => ({ ...prev, primary_number: t('addDriver.invalidMobileNumber') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.invalidMobileNumber'));
        return;
      }
      if (secondary && !/^[6-9]\d{9}$/.test(secondary)) {
        setErrors(prev => ({ ...prev, secondary_number: t('addDriver.invalidMobileNumber') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.secondaryNumberInvalid'));
        return;
      }
      if (driverData.adress.trim().length < 5) {
        setErrors(prev => ({ ...prev, adress: t('addDriver.addressTooShort') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.addressTooShort'));
        return;
      }
      if (!driverData.city.trim()) {
        setErrors(prev => ({ ...prev, city: t('addDriver.cityRequired') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.cityRequired'));
        return;
      }
      if (!driverData.pincode.trim() || driverData.pincode.trim().length !== 6) {
        setErrors(prev => ({ ...prev, pincode: t('addDriver.pincodeMustBe6Digits') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.pincodeMustBeExactly6Digits'));
        return;
      }
      if (driverMode !== 'own' && driverData.password.trim().length < 6) {
        setErrors(prev => ({ ...prev, password: t('addDriver.passwordTooShort') }));
        Alert.alert(t('addDriver.validationErrorTitle'), t('addDriver.passwordTooShort'));
        return;
      }
      if (driverImages.licence_front_img && !licenceExpiryDate.trim()) {
        setErrors(prev => ({ ...prev, licence_expiry_date: 'Please select the licence expiry date' }));
        Alert.alert(t('addDriver.validationErrorTitle'), 'Please select the Driving Licence expiry date.');
        return;
      }
      if (!driverImages.licence_front_img) {
        Alert.alert(t('addDriver.errorTitle'), t('addDriver.uploadLicenceFront'));
        return;
      }
      if (!driverImages.licence_back_img) {
        Alert.alert(t('addDriver.errorTitle'), 'Please upload the Licence BACK side photo too - both sides are required.');
        return;
      }
      if (!driverImages.profile_img) {
        Alert.alert('Profile Photo Required', 'Please take a live selfie before continuing.');
        return;
      }

      // Build multipart form
      const uri = driverImages.licence_front_img;
      const name = uri.split('/').pop() || 'license.jpg';
      const type = guessMimeTypeFromUri(uri) || 'image/jpeg';

      const form = new FormData();
      form.append('full_name', driverData.full_name.trim());
      form.append('primary_number', primary);
      if (secondary) form.append('secondary_number', secondary);
      // Own-cum-driver: password omitted - backend generates one server-side
      // (see /cardriver/signup) since the owner never logs in with it.
      if (driverMode !== 'own') form.append('password', driverData.password.trim());
      form.append('licence_number', driverData.licence_number.trim().toUpperCase());
      if (licenceExpiryDate.trim()) {
        form.append('licence_expiry_date', licenceExpiryDate.trim());
        form.append('expiry_date', licenceExpiryDate.trim());
      }
      form.append('address', driverData.adress.trim()); // API expects 'address', not 'adress'
      form.append('city', driverData.city.trim());
      form.append('pincode', driverData.pincode.trim());
      if (user?.id) form.append('vehicle_owner_id', user.id);
      // Uses appendFileToFormData so this actually uploads a real file on
      // web instead of the literal string "[object Object]" (see that
      // function's comment for why).
      await appendFileToFormData(form, 'licence_front_img', uri, name, type);
      form.append('is_owner_driver', driverMode === 'own' ? 'true' : 'false');
      // License back image (mandatory - checked above)
      if (driverImages.licence_back_img) {
        const backUri = driverImages.licence_back_img;
        const backName = backUri.split('/').pop() || 'license_back.jpg';
        const backType = guessMimeTypeFromUri(backUri) || 'image/jpeg';
        await appendFileToFormData(form, 'licence_back_img', backUri, backName, backType);
      }
      // Aadhaar (duty drivers only - own-cum-driver's was taken at signup)
      if (driverMode !== 'own') {
        form.append('aadhar_number', aadharNumber.replace(/\D/g, ''));
        const aFront = driverImages.aadhar_front_img;
        const aBack = driverImages.aadhar_back_img;
        await appendFileToFormData(form, 'aadhar_front_img', aFront, aFront.split('/').pop() || 'aadhar_front.jpg', guessMimeTypeFromUri(aFront));
        await appendFileToFormData(form, 'aadhar_back_img', aBack, aBack.split('/').pop() || 'aadhar_back.jpg', guessMimeTypeFromUri(aBack));
      }
      // Mandatory live profile photo (added 2026-09-04) - backend requires
      // this field, so it's always sent (validated non-empty above).
      {
        const profileUri = driverImages.profile_img;
        const profileName = profileUri.split('/').pop() || 'profile.jpg';
        const profileType = guessMimeTypeFromUri(profileUri) || 'image/jpeg';
        await appendFileToFormData(form, 'profile_img', profileUri, profileName, profileType);
      }

      // Debug form data
      console.log('🔍 Form data being sent:', {
        full_name: driverData.full_name.trim(),
        primary_number: primary,
        secondary_number: secondary,
        password: '***', // Don't log password
        licence_number: driverData.licence_number.trim().toUpperCase(),
        address: driverData.adress.trim(),
        city: driverData.city.trim(),
        pincode: driverData.pincode.trim(),
        vehicle_owner_id: user?.id,
        hasImage: !!driverImages.licence_front_img
      });

      console.log('🚀 Submitting driver signup (multipart)...');
      
      // Get authentication headers
      console.log('🔍 Getting auth headers...');
      const authHeaders = await getAuthHeaders();
      console.log('🔍 Auth headers obtained:', authHeaders);
      
      // No manual Content-Type here - axiosInstance's interceptor strips it
      // for FormData bodies so the platform can set its own boundary.
      const res = await axiosInstance.post('/api/users/cardriver/signup', form, {
        headers: {
          ...authHeaders,
        },
        timeout: 120000,
      });
      console.log('✅ Driver registration completed successfully!', res.data);

      // Heads-up only (never blocks signup, matches the licence-photo
      // check's philosophy) - the face-match result comes back on the
      // signup response itself (see /cardriver/signup's compare_faces
      // call), added 2026-09-04.
      const faceMatch = res.data?.face_match;
      if (faceMatch?.status === 'OK' && faceMatch?.is_match === false) {
        Alert.alert('Face Match Check', `Photo doesn't clearly match the licence photo (${faceMatch.match_percent}%).`);
      }

      // Refresh the cached login-response counts BEFORE navigating away -
      // otherwise index.tsx's routing check on the next app open still sees
      // the stale car_driver_count from the original login and sends the
      // owner straight back to add-driver even though it's already done.
      try {
        const statusRes = await axiosInstance.get('/api/users/vehicle-owner/status-counts');
        const prevLoginDataStr = await SecureStore.getItemAsync('loginResponse');
        const prevLoginData = prevLoginDataStr ? JSON.parse(prevLoginDataStr) : {};
        await SecureStore.setItemAsync('loginResponse', JSON.stringify({
          ...prevLoginData,
          ...statusRes.data,
        }));
        console.log('📊 Cached login counts refreshed after driver addition:', statusRes.data);
      } catch (refreshErr) {
        console.warn('⚠️ Failed to refresh cached counts after driver addition (non-fatal):', refreshErr);
      }

      // After driver is added successfully, redirect based on how this
      // screen was reached - it always redirected to /verification before
      // (the next step of the FIRST-TIME owner account signup wizard this
      // screen doubles as, "2/3" badge and all), even when reached from
      // Duty (?mode=own) for an owner whose account is already fully set
      // up - they'd land on an unrelated signup step instead of their own
      // driver session, which is what they actually came here for.
      console.log('🔄 Driver added successfully, checking signup flow redirect...');
      setIsLoading(false);

      if (mode === 'own') {
        Alert.alert(t('addDriver.successTitle'), t('addDriver.driverAddedSuccess'), [
          {
            text: t('addDriver.ok'),
            onPress: async () => {
              try {
                await signinAsOwner();
                router.replace('/car-driver/dashboard' as any);
              } catch (e: any) {
                // Just registered, so this should always succeed - fall
                // back to the tab bar rather than stranding the owner on
                // an error if it somehow doesn't.
                router.replace('/(tabs)' as any);
              }
            }
          },
        ]);
      } else {
        // Signup flow complete: redirect to Trusted Partner Registration
        Alert.alert(t('addDriver.successTitle'), t('addDriver.driverAddedSuccess'), [
          {
            text: t('addDriver.ok'),
            onPress: () => {
              console.log('✅ Signup flow complete → redirecting to Trusted Partner screen');
              router.replace('/subscription?flow=onboarding' as any);
            }
          },
        ]);
      }
    } catch (err: any) {
      console.error('❌ Error during driver registration:', err?.response?.status, err?.response?.data || err?.message);
      Alert.alert(t('addDriver.couldNotAddDriver'), getFriendlyError(err, t('addDriver.addDriverFailedGeneric')));
    } finally {
      // Always reset loading so the button re-enables (fixes the stuck-spinner /
      // "keeps trying to save after an error" behaviour on early returns).
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
          {t('addDriver.headerTitle')}
        </Text>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepText}>{t('addDriver.stepIndicator')}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t('addDriver.welcomeTitle')}</Text>
          <Text style={styles.welcomeSubtitle}>
            {t('addDriver.welcomeSubtitle', { name: user?.fullName || '' })}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionTitle}>{t('addDriver.driverDetails')}</Text>

          {/* Own cum Driver vs Add Driver choice - every fleet owner is
              assumed own-cum-driver-eligible by default, so this toggle
              only needs to appear when the answer is genuinely ambiguous
              (someone opened this screen on its own, from Fleet Management).
              Arriving here from the "Duty" tab (?mode=own) already answers
              the question, so skip straight past the choice. */}
          {mode !== 'own' && (
            <>
              <Text style={styles.inputLabel}>{t('addDriver.whoIsDriving')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    { borderColor: colors.border },
                    driverMode === 'add' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setDriverMode('add')}
                >
                  <Text style={[styles.modeButtonText, { color: driverMode === 'add' ? '#FFFFFF' : colors.text }]}>
                    {t('addDriver.addDriverOption')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    { borderColor: colors.border },
                    driverMode === 'own' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={handleSelectOwnAsDriver}
                >
                  <Text style={[styles.modeButtonText, { color: driverMode === 'own' ? '#FFFFFF' : colors.text }]}>
                    {t('addDriver.ownCumDriverOption')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {driverMode === 'own' && (
            <Text style={styles.helpText}>
              {t('addDriver.ownCumDriverHelp')}
            </Text>
          )}

          {driverMode === 'add' && (
          <>
          {/* Aadhaar first, like the fleet-account signup: photos, then the
              number right under them. */}
          <SectionHeader icon={<ShieldCheck color="#FFFFFF" size={14} />} text="Aadhaar Card" />
          <View style={styles.docGrid}>
            <DocTile title="Aadhaar Front" hint="Front side of Aadhaar" imageKey="aadhar_front_img" />
            <DocTile title="Aadhaar Back" hint="Back side of Aadhaar" imageKey="aadhar_back_img" />
          </View>
          <Text style={styles.inputLabel}>
            Aadhaar Number <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CreditCard color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={aadharNumber}
              onChangeText={(txt) => setAadharNumber(txt.replace(/\D/g, '').slice(0, 12))}
              keyboardType="numeric"
              maxLength={12}
              placeholder="12-digit Aadhaar number"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <SectionHeader icon={<User color="#FFFFFF" size={14} />} text="Driver Personal Details" />
          {/* Full Name label */}
          <Text style={styles.inputLabel}>{t('addDriver.fullNameLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <User color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.full_name && styles.inputError]}
              value={driverData.full_name}
              onChangeText={(text) => handleInputChange('full_name', text)}
            />
          </View>
          {errors.full_name && <Text style={styles.errorText}>{errors.full_name}</Text>}

          {/* Primary Mobile Number label */}
          <Text style={styles.inputLabel}>{t('addDriver.primaryMobileLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Phone color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.primary_number && styles.inputError]}
              value={driverData.primary_number}
              onChangeText={(text) => handleInputChange('primary_number', text)}
              keyboardType="phone-pad"
            />
          </View>
          {errors.primary_number && <Text style={styles.errorText}>{errors.primary_number}</Text>}
          <Text style={styles.helpText}>{t('addDriver.primaryMobileHelp')}</Text>

          {/* Secondary Mobile Number label */}
          <Text style={styles.inputLabel}>{t('addDriver.secondaryMobileLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Phone color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.secondary_number && styles.inputError]}
              value={driverData.secondary_number}
              onChangeText={(text) => handleInputChange('secondary_number', text)}
              keyboardType="phone-pad"
            />
          </View>
          </>
          )}

          {/* Password - own-cum-driver never needs one: you switch into this
              driver session from your own owner login (Duty tab), never a
              separate driver-password login. Only a real duty driver (a
              different person, logging in independently) needs one. */}
          {driverMode !== 'own' && (
            <>
              <Text style={styles.inputLabel}>{t('addDriver.passwordLabel')}</Text>
              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Lock color="#6B7280" size={20} />
                <TextInput
                  style={[styles.input, { color: colors.text }, errors.password && styles.inputError]}
                  value={driverData.password}
                  onChangeText={(text) => handleInputChange('password', text)}
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
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </>
          )}

          {/* Driving Licence Number - 3 parts matching the real Indian DL
              format printed on the licence card itself. */}
          <Text style={styles.inputLabel}>{t('addDriver.licenceNumberLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={[styles.inputGroup, { flex: 1.1, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CreditCard color="#6B7280" size={18} />
              <TextInput
                style={[styles.input, { color: colors.text }, errors.licence_number && styles.inputError]}
                value={dlStateCode}
                onChangeText={(text) => setDlStateCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                autoCapitalize="characters"
                placeholder="TN24"
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }, errors.licence_number && styles.inputError]}
                value={dlYear}
                onChangeText={(text) => setDlYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="number-pad"
                placeholder="2012"
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1.4, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }, errors.licence_number && styles.inputError]}
                value={dlSerial}
                onChangeText={(text) => setDlSerial(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                autoCapitalize="characters"
                placeholder="0008494"
                placeholderTextColor={colors.textSecondary}
                maxLength={10}
              />
            </View>
          </View>
          {errors.licence_number && <Text style={styles.errorText}>{errors.licence_number}</Text>}
          <Text style={styles.helpText}>
            {t('addDriver.licenceNumberHelp')} State+RTO code, year of issue, serial number - as printed on the licence.
          </Text>

          {/* Licence Expiry Date */}
          <Text style={styles.inputLabel}>
            {t('addDriver.licenceExpiryLabel') || 'Licence Expiry Date'}
          </Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: errors.licence_expiry_date ? '#EF4444' : colors.border }]}>
            <Calendar color="#6B7280" size={20} />
            {extractingExpiry ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Reading expiry date from licence...</Text>
              </View>
            ) : Platform.OS === 'web' ? (
              <input
                type="date"
                value={licenceExpiryDate}
                onChange={(e: any) => {
                  setLicenceExpiryDate(e.target.value);
                  if (errors.licence_expiry_date) setErrors(prev => ({ ...prev, licence_expiry_date: '' }));
                }}
                min={new Date().toISOString().split('T')[0]}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: colors.text,
                  fontSize: '14px',
                  padding: '10px 0',
                }}
              />
            ) : (
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12 }}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={{ color: licenceExpiryDate ? colors.text : colors.textSecondary, fontSize: 14 }}>
                  {licenceExpiryDate || 'Select expiry date (YYYY-MM-DD)'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {errors.licence_expiry_date && <Text style={styles.errorText}>{errors.licence_expiry_date}</Text>}
          <Text style={styles.helpText}>
            As printed on the Driving Licence (e.g. Non-Transport / Transport validity date).
          </Text>

          {Platform.OS !== 'web' && showDatePicker && (
            <DateTimePicker
              value={licenceExpiryDate ? new Date(licenceExpiryDate) : new Date()}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(_: any, date?: Date) => {
                setShowDatePicker(false);
                if (date) {
                  setLicenceExpiryDate(date.toISOString().split('T')[0]);
                  if (errors.licence_expiry_date) setErrors(prev => ({ ...prev, licence_expiry_date: '' }));
                }
              }}
            />
          )}

          {/* Address (like City/Pincode below) stays visible even in
              Own-cum-Driver mode as a safety net, in case the owner's own
              profile has no address on file to auto-fill from. */}
          <Text style={styles.inputLabel}>{t('addDriver.streetAddressLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.adress && styles.inputError]}
              value={driverData.adress}
              onChangeText={(text) => handleInputChange('adress', text)}
              multiline
              numberOfLines={3}
            />
          </View>
          {errors.adress && <Text style={styles.errorText}>{errors.adress}</Text>}
          {/* City/Pincode stay visible even in Own-cum-Driver mode as a safety net,
              in case the auto-fetch from the owner's profile doesn't return a value. */}

          {/* City label */}
          <Text style={styles.inputLabel}>{t('addDriver.cityLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.city && styles.inputError]}
              value={driverData.city}
              onChangeText={(text) => handleInputChange('city', text)}
            />
          </View>
          {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}

          {/* Pincode label */}
          <Text style={styles.inputLabel}>{t('addDriver.pincodeLabel')}</Text>
          <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MapPin color="#6B7280" size={20} />
            <TextInput
              style={[styles.input, { color: colors.text }, errors.pincode && styles.inputError]}
              value={driverData.pincode}
              onChangeText={(text) => {
                const cleanText = text.replace(/\D/g, '');
                if (cleanText.length <= 6) {
                  handleInputChange('pincode', cleanText);
                }
              }}
              keyboardType="numeric"
              maxLength={6}
            />
          </View>
          {errors.pincode && <Text style={styles.errorText}>{errors.pincode}</Text>}

          <SectionHeader icon={<FileText color="#FFFFFF" size={14} />} text={t('addDriver.requiredDocument')} />
          <Text style={styles.sectionSubtitle}>
            {t('addDriver.requiredDocumentSubtitle')}
          </Text>

          <View style={styles.docGrid}>
            <DocTile
              title={t('addDriver.licenceFrontTitle')}
              hint={t('addDriver.licenceFrontDesc')}
              imageKey="licence_front_img"
              isRequired={true}
            />
            <DocTile
              title={t('addDriver.licenceBackTitle')}
              hint={t('addDriver.licenceBackDesc')}
              imageKey="licence_back_img"
              isRequired={true}
            />
            {/* Live profile photo (added 2026-09-04) - camera capture only,
                mandatory. Compared against the licence photo via the
                zero-cost face-match check on the backend. */}
            <DocTile
              title="Profile Photo"
              hint="Live camera photo"
              imageKey="profile_img"
              isRequired={true}
              cameraOnly={true}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.saveButtonText}>{t('addDriver.savingDriver')}</Text>
              </>
            ) : (
              <>
                <Save color="#FFFFFF" size={20} />
                <Text style={styles.saveButtonText}>{t('addDriver.saveDriverButton')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={previewImage.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewImage((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.previewOverlay}>
          <View style={[styles.previewHeader, { paddingTop: Math.max(24, insets.top + 8) }]}>
            <Text style={styles.previewTitle}>{previewImage.title}</Text>
            <TouchableOpacity onPress={() => setPreviewImage((p) => ({ ...p, visible: false }))} style={styles.previewClose}>
              <X color="#FFFFFF" size={22} />
            </TouchableOpacity>
          </View>
          {previewImage.uri ? (
            <RNImage source={{ uri: previewImage.uri }} style={styles.previewImg} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      <DocumentCropModal
        visible={cropState.visible}
        rawUri={cropState.rawUri}
        label={
          cropState.imageKey === 'licence_back_img' ? 'Licence Back'
            : cropState.imageKey === 'aadhar_front_img' ? 'Aadhaar Front'
            : cropState.imageKey === 'aadhar_back_img' ? 'Aadhaar Back'
            : 'Licence Front'
        }
        imgWidth={cropState.imgWidth}
        imgHeight={cropState.imgHeight}
        onCancel={() => setCropState((prev) => ({ ...prev, visible: false }))}
        onConfirm={handleCropConfirm}
      />
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
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    flex: 1,
    flexShrink: 1,
    marginHorizontal: 8,
  },
  stepIndicator: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexShrink: 0,
  },
  stepText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
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
  },
  eyeButton: {
    padding: 4,
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
  helpText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    flexShrink: 1,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  // 2-column grid - fixed 48% tiles, nothing can overlap.
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
  docTile: {
    width: '48%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },
  docTileUploaded: {
    borderWidth: 2,
  },
  docThumbBox: {
    height: 92,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  docThumbImg: {
    width: '100%',
    height: '100%',
  },
  docThumbEmpty: {
    alignItems: 'center',
    gap: 4,
  },
  docThumbEmptyText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'Inter-Medium',
  },
  docCheckBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
    padding: 3,
  },
  docTileTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  docTileHint: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'Inter-Regular',
    marginTop: 2,
    marginBottom: 8,
    minHeight: 26,
  },
  docTileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    paddingVertical: 7,
  },
  viewBtnText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#065F46',
  },
  reBtn: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  uploadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 6,
    paddingVertical: 8,
  },
  uploadPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  previewHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 2,
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  previewClose: {
    padding: 8,
  },
  previewImg: {
    width: '100%',
    height: '80%',
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginBottom: 8,
  },
});

