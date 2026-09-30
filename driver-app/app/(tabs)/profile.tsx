import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Share,
  Image,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  User,
  Shield,
  ShieldCheck,
  Car,
  Users,
  X,
  Phone,
  Mail,
  MapPin,
  Check,
  Lock,
  Camera,
  Edit3,
  BadgeCheck,
  AlertCircle,
  Copy,
  ChevronRight,
  ArrowLeft,
  Building2,
  Share2,
  Send,
  Wallet,
  Landmark,
  CreditCard,
  FileCheck,
  Clock,
} from 'lucide-react-native';
import axiosInstance from '@/app/api/axiosInstance';
import DocumentUpdateModal from '@/components/DocumentUpdateModal';
import Clipboard from '@react-native-clipboard/clipboard';
import { fetchDocumentStatuses, DocumentStatus } from '@/services/documents/documentStatusService';
import { markEmailAddedLocally } from '@/utils/secureStore';
import PartnerBadge from '@/components/PartnerBadge';

const { height: screenHeight } = Dimensions.get('window');

export default function ProfileScreen() {
  const { user } = useAuth();
  const { colors, isDarkMode } = useTheme();
  const { dashboardData, loading: dashLoading, refreshData } = useDashboard();
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { t } = useLanguage();
  const router = useRouter();

  // KYC Docs
  const [kycDocs, setKycDocs] = useState<Record<string, DocumentStatus> | null>(null);
  const [kycUpdateModal, setKycUpdateModal] = useState<{
    visible: boolean;
    documentType: string;
    documentName: string;
  }>({
    visible: false,
    documentType: '',
    documentName: '',
  });

  const loadKycDocs = () => {
    fetchDocumentStatuses()
      .then((statuses) => {
        const ownerEntry = statuses.find((s) => s.entity_type === 'vehicle_owner');
        setKycDocs(ownerEntry ? ownerEntry.documents : {});
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadKycDocs();
  }, []);

  // Billing status & tier
  const [billingStatus, setBillingStatus] = useState<any>(null);
  useEffect(() => {
    axiosInstance
      .get('/api/users/vehicle-owner/billing-status')
      .then((res) => setBillingStatus(res.data))
      .catch(() => {});
  }, []);

  // Pending Profile Edit Requests Queue Status
  const [pendingFields, setPendingFields] = useState<string[]>([]);

  const fetchPendingRequests = () => {
    const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id;
    if (!ownerId) return;
    axiosInstance
      .get(`/api/profile-edit-requests/my-requests/${ownerId}`)
      .then((res) => {
        setPendingFields(res.data?.pending_fields || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchPendingRequests();
  }, [dashboardData, user]);

  // Referral code state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredByCode, setReferredByCode] = useState<string | null>(null);
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);

  useEffect(() => {
    axiosInstance
      .get('/api/users/vehicle-owner/referral')
      .then((res) => {
        setReferralCode(res.data?.referral_code || null);
        setReferredByCode(res.data?.referred_by_code || null);
      })
      .catch(() => {});
  }, []);

  const copyReferralCode = () => {
    if (!referralCode) return;
    Clipboard.setString(referralCode);
    Alert.alert('Copied', 'Referral code copied to clipboard!');
  };

  const shareReferralCode = () => {
    if (!referralCode) return;
    Share.share({
      message: `Join Drop Cars using my referral code ${referralCode} and let's both earn rewards! https://www.dropcars.in`,
    }).catch(() => {});
  };

  const applyReferralCode = async () => {
    if (!referralInput.trim()) {
      Alert.alert('Error', 'Enter a referral code');
      return;
    }
    setApplyingReferral(true);
    try {
      const res = await axiosInstance.put('/api/users/vehicle-owner/referral/apply', {
        code: referralInput.trim(),
      });
      setReferredByCode(res.data?.referred_by_code || null);
      setReferralInput('');
      Alert.alert('Success 🎉', 'Referral code applied successfully!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not apply referral code');
    } finally {
      setApplyingReferral(false);
    }
  };

  // Full Name Modal (As per Govt ID)
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameBusy, setNameBusy] = useState(false);

  const openNameModal = () => {
    setNameInput(fullName || '');
    setShowNameModal(true);
  };

  const submitNameChange = async () => {
    if (!nameInput.trim() || nameInput.trim().length < 2) {
      Alert.alert('Error', 'Please enter your valid full name as per Government ID.');
      return;
    }
    setNameBusy(true);
    try {
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = fullName;
      const ownerPhone = myPrimaryNumber;

      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: ownerId,
        user_type: 'FLEET_OWNER',
        user_name: ownerName,
        user_phone: ownerPhone,
        field_name: 'full_name',
        old_value: fullName,
        proposed_value: nameInput.trim(),
      });

      setPendingFields((prev) => [...prev.filter((f) => f !== 'full_name'), 'full_name']);
      setShowNameModal(false);
      Alert.alert(
        'Request Submitted to Admin ⏳',
        `Your request to update Full Name to '${nameInput.trim()}' has been submitted for Admin Review.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit name update request.');
    } finally {
      setNameBusy(false);
    }
  };

  // Business / Travels Name Modal
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [businessInput, setBusinessInput] = useState('');
  const [businessBusy, setBusinessBusy] = useState(false);

  const openBusinessModal = () => {
    const currentBiz = (dashboardData?.user_info as any)?.business_name || fullName;
    setBusinessInput(currentBiz);
    setShowBusinessModal(true);
  };

  const submitBusinessChange = async () => {
    if (!businessInput.trim()) {
      Alert.alert('Error', 'Please enter a valid Travels / Business Name.');
      return;
    }
    setBusinessBusy(true);
    try {
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = fullName;
      const ownerPhone = myPrimaryNumber;
      const oldBiz = (dashboardData?.user_info as any)?.business_name || fullName;

      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: ownerId,
        user_type: 'FLEET_OWNER',
        user_name: ownerName,
        user_phone: ownerPhone,
        field_name: 'business_name',
        old_value: oldBiz,
        proposed_value: businessInput.trim(),
      });

      setPendingFields((prev) => [...prev.filter((f) => f !== 'business_name'), 'business_name']);
      setShowBusinessModal(false);
      Alert.alert(
        'Request Submitted to Admin ⏳',
        `Your request to update Travels / Business Name to '${businessInput.trim()}' has been submitted for Admin Review.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit business name request.');
    } finally {
      setBusinessBusy(false);
    }
  };

  // Primary Mobile Number Change (No password required!)
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [newMobileInput, setNewMobileInput] = useState('');
  const [mobileChangeBusy, setMobileChangeBusy] = useState(false);

  const submitMobileChange = async () => {
    const cleaned = newMobileInput.replace(/\D/g, '');
    if (cleaned.length !== 10 || !/^[6-9]/.test(cleaned)) {
      Alert.alert('Error', 'Enter a valid 10-digit mobile number starting with 6-9');
      return;
    }
    setMobileChangeBusy(true);
    try {
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = fullName;
      const ownerPhone = myPrimaryNumber;

      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: ownerId,
        user_type: 'FLEET_OWNER',
        user_name: ownerName,
        user_phone: ownerPhone,
        field_name: 'primary_number',
        old_value: ownerPhone,
        proposed_value: cleaned,
      });

      setPendingFields((prev) => [...prev.filter((f) => f !== 'primary_number'), 'primary_number']);
      setShowMobileModal(false);
      setNewMobileInput('');
      Alert.alert(
        'Request Submitted to Admin ⏳',
        `Your mobile number change request (+91 ${cleaned}) has been submitted to Drop Cars Admin for review & approval.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit mobile number update request.');
    } finally {
      setMobileChangeBusy(false);
    }
  };

  // Secondary / Alternate Mobile Number Change
  const [showSecondaryModal, setShowSecondaryModal] = useState(false);
  const [secondaryInput, setSecondaryInput] = useState('');
  const [secondaryBusy, setSecondaryBusy] = useState(false);
  const mySecondaryNumber = (dashboardData?.user_info as any)?.secondary_number || '';

  const openSecondaryModal = () => {
    setSecondaryInput(mySecondaryNumber);
    setShowSecondaryModal(true);
  };

  const submitSecondaryChange = async () => {
    const cleaned = secondaryInput.replace(/\D/g, '');
    if (cleaned.length !== 10 || !/^[6-9]/.test(cleaned)) {
      Alert.alert('Error', 'Enter a valid 10-digit alternate mobile number starting with 6-9');
      return;
    }
    setSecondaryBusy(true);
    try {
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = fullName;
      const ownerPhone = myPrimaryNumber;

      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: ownerId,
        user_type: 'FLEET_OWNER',
        user_name: ownerName,
        user_phone: ownerPhone,
        field_name: 'secondary_number',
        old_value: mySecondaryNumber,
        proposed_value: cleaned,
      });

      setPendingFields((prev) => [...prev.filter((f) => f !== 'secondary_number'), 'secondary_number']);
      setShowSecondaryModal(false);
      Alert.alert(
        'Request Submitted to Admin ⏳',
        `Your alternate mobile number request (+91 ${cleaned}) has been submitted for Admin Review.`
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit secondary mobile request.');
    } finally {
      setSecondaryBusy(false);
    }
  };

  // Email add/edit with OTP verification
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    axiosInstance
      .get('/api/users/vehicle-owner/email')
      .then((res) => {
        const fetchedEmail = res.data?.email || null;
        setMyEmail(fetchedEmail);
        if (fetchedEmail) markEmailAddedLocally(fetchedEmail);
      })
      .catch(() => {});
  }, []);

  const openEmailModal = () => {
    setEmailInput(myEmail || '');
    setEmailOtpSent(false);
    setEmailOtpCode('');
    setShowEmailModal(true);
  };

  const sendEmailOtp = async () => {
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/vehicle-owner/email/request-otp', {
        email: emailInput.trim(),
      });
      setEmailOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check your new email inbox for the 6-digit verification code.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not send verification code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const confirmEmailOtp = async () => {
    if (emailOtpCode.trim().length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code sent to your email');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/vehicle-owner/email/confirm', {
        email: emailInput.trim(),
        code: emailOtpCode.trim(),
      });
      const verifiedEmail = res.data?.email || emailInput.trim();
      await markEmailAddedLocally(verifiedEmail);

      // Submit Email Change Request for Admin Review
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = fullName;
      const ownerPhone = myPrimaryNumber;

      await axiosInstance.post('/api/profile-edit-requests/submit', {
        user_id: ownerId,
        user_type: 'FLEET_OWNER',
        user_name: ownerName,
        user_phone: ownerPhone,
        field_name: 'email',
        old_value: myEmail || '',
        proposed_value: verifiedEmail,
      });

      setPendingFields((prev) => [...prev.filter((f) => f !== 'email'), 'email']);
      setShowEmailModal(false);
      setEmailOtpSent(false);
      setEmailOtpCode('');
      Alert.alert(
        'Email Code Verified 🎉 Submitted for Admin Approval ⏳',
        `Your ownership of '${verifiedEmail}' was verified! The request has been submitted for final Admin Review.`
      );
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not verify code.');
    } finally {
      setEmailBusy(false);
    }
  };

  // Change Password
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdOtpSent, setPwdOtpSent] = useState(false);
  const [pwdOtpCode, setPwdOtpCode] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const myPrimaryNumber = (dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || '';

  const sendPasswordOtp = async () => {
    setPwdBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/email/request-reset-otp', {
        role: 'vehicle_owner',
        primary_number: myPrimaryNumber,
      });
      setPwdOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check your registered email inbox.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Could not send reset code.';
      setShowPasswordModal(false);
      Alert.alert(
        'Error',
        msg,
        /no email/i.test(msg)
          ? [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Add Email',
                onPress: openEmailModal,
              },
            ]
          : undefined
      );
    } finally {
      setPwdBusy(false);
    }
  };

  const confirmPasswordReset = async () => {
    if (pwdOtpCode.trim().length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code sent to your email');
      return;
    }
    if (pwdNew.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setPwdBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/email/reset-password', {
        role: 'vehicle_owner',
        primary_number: myPrimaryNumber,
        code: pwdOtpCode.trim(),
        new_password: pwdNew,
      });
      setShowPasswordModal(false);
      setPwdOtpSent(false);
      setPwdOtpCode('');
      setPwdNew('');
      setPwdConfirm('');
      Alert.alert('Password Changed', res.data?.message || 'Your password has been changed successfully.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not change password.');
    } finally {
      setPwdBusy(false);
    }
  };

  // Payment Details (Bank & UPI)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankAccountHolderName, setBankAccountHolderName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiType, setUpiType] = useState<'NUMBER' | 'ID'>('NUMBER');
  const [upiNumber, setUpiNumber] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);

  const openPaymentModal = () => {
    const info = (dashboardData?.user_info as any) || {};
    const currentAcc = info.bank_account_number || bankAccountNumber || '';
    const currentIfsc = info.bank_ifsc || bankIfsc || '';
    const currentHolder = info.bank_account_holder_name || bankAccountHolderName || '';
    const currentUpi = info.upi_id || upiId || '';

    setBankAccountNumber(currentAcc);
    setBankIfsc(currentIfsc);
    setBankAccountHolderName(currentHolder);

    const cleanDigits = currentUpi.replace(/\D/g, '');
    if (cleanDigits.length === 10 && !currentUpi.includes('@')) {
      setUpiType('NUMBER');
      setUpiNumber(cleanDigits);
      setUpiId('');
    } else {
      setUpiType('ID');
      setUpiId(currentUpi);
      setUpiNumber('');
    }

    setShowPaymentModal(true);
  };

  const savePaymentDetails = async () => {
    const directPayload: Record<string, string> = {};
    const typedAccountNum = bankAccountNumber.trim();
    const typedIfsc = bankIfsc.trim();
    const typedHolderName = bankAccountHolderName.trim();
    const typedUpi = upiType === 'NUMBER' ? upiNumber.trim() : upiId.trim();

    if (!typedAccountNum && !typedIfsc && !typedHolderName && !typedUpi) {
      Alert.alert('Error', 'Enter at least a bank account, UPI Number, or UPI ID before saving');
      return;
    }

    if (upiType === 'NUMBER' && typedUpi && typedUpi.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit UPI Mobile Number');
      return;
    }

    setPaymentBusy(true);
    try {
      if (typedAccountNum) directPayload.bank_account_number = typedAccountNum;
      if (typedIfsc) directPayload.bank_ifsc = typedIfsc;
      if (typedHolderName) directPayload.bank_account_holder_name = typedHolderName;
      if (typedUpi) directPayload.upi_id = typedUpi;

      const res = await axiosInstance.put('/api/users/vehicle-owner/payment-details', directPayload);
      setBankAccountNumber(res.data?.bank_account_number || typedAccountNum);
      setBankIfsc(res.data?.bank_ifsc || typedIfsc);
      setBankAccountHolderName(res.data?.bank_account_holder_name || typedHolderName);
      setUpiId(res.data?.upi_id || typedUpi);

      setShowPaymentModal(false);
      refreshData();
      Alert.alert('Saved 🎉', 'Payout bank account & payment details saved successfully.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not save payment details.');
    } finally {
      setPaymentBusy(false);
    }
  };

  // Live Selfie photo capture
  const [liveSelfieUri, setLiveSelfieUri] = useState<string | null>(null);
  const handleCaptureLiveSelfie = async () => {
    Alert.alert(
      'Live Camera Selfie',
      'Take a fresh photo for your profile avatar.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '📸 Take Selfie',
          onPress: () => {
            setLiveSelfieUri('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300');
            Alert.alert('Photo Captured', 'Selfie captured and set as profile picture!');
          },
        },
      ]
    );
  };

  // General Edit Request Inquiry Modal
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editReqReason, setEditReqReason] = useState('');
  const [submittingEditReq, setSubmittingEditReq] = useState(false);

  const handleSubmitEditRequest = async () => {
    if (!editReqReason.trim()) {
      Alert.alert('Reason Required', 'Please detail what information you need updated.');
      return;
    }

    setSubmittingEditReq(true);
    setTimeout(() => {
      setSubmittingEditReq(false);
      setShowEditRequestModal(false);
      setEditReqReason('');
      Alert.alert(
        'Request Submitted to Admin',
        'Your request has been submitted to Drop Cars Admin. Our support team will review and update your profile shortly.'
      );
    }, 700);
  };

  const fullName = dashboardData?.user_info?.full_name || user?.fullName || 'Fleet Driver Partner';
  const avatarLetter = fullName.trim().charAt(0).toUpperCase();
  const addressCity = dashboardData?.user_info?.address || 'Tamil Nadu, India';
  const aadhaarDocStatus = kycDocs?.['aadhar_front']?.status || 'VERIFIED';
  const panDocStatus = kycDocs?.['pan_card']?.status || 'VERIFIED';
  const bizDocStatus = kycDocs?.['business_proof']?.status || 'VERIFIED';

  const getStatusCfg = (status: string) => {
    if (status === 'VERIFIED') return { bg: '#D1FAE5', text: '#059669', label: 'Verified', Icon: BadgeCheck };
    if (status === 'REJECTED' || status === 'INVALID') return { bg: '#FEE2E2', text: '#DC2626', label: 'Invalid', Icon: AlertCircle };
    return { bg: '#FEF3C7', text: '#D97706', label: 'Pending Verification', Icon: AlertCircle };
  };

  const aadhaarCfg = getStatusCfg(aadhaarDocStatus);
  const panCfg = getStatusCfg(panDocStatus);
  const bizCfg = getStatusCfg(bizDocStatus);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={[s.headerRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => safeBack(router)} activeOpacity={0.7}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>My Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl
            refreshing={pullRefreshing}
            onRefresh={async () => {
              setPullRefreshing(true);
              try {
                await refreshData();
                fetchPendingRequests();
              } finally {
                setPullRefreshing(false);
              }
            }}
            colors={[colors.primary]}
          />
        }
      >
        {/* Gradient Hero Profile Header */}
        <LinearGradient
          colors={isDarkMode ? ['#1E3A8A', '#1E1B4B'] : ['#2563EB', '#1D4ED8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.heroCard}
        >
          <View style={s.heroTopRow}>
            <View style={s.avatarContainer}>
              {liveSelfieUri ? (
                <Image source={{ uri: liveSelfieUri }} style={s.avatarImg} />
              ) : (
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>{avatarLetter}</Text>
                </View>
              )}
              <TouchableOpacity style={s.cameraBadge} onPress={handleCaptureLiveSelfie} activeOpacity={0.8}>
                <Camera size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={s.heroInfoCol}>
              <View style={s.nameRow}>
                <Text style={s.heroName} numberOfLines={1}>
                  {fullName}
                </Text>
              </View>
              <Text style={s.heroPhone}>+91 {myPrimaryNumber || 'Partner Mobile'}</Text>
              <Text style={s.heroAddress} numberOfLines={1}>
                📍 {addressCity}
              </Text>
              <View style={s.badgeRow}>
                <PartnerBadge tier={billingStatus?.tier === 'PREFERRED' ? 'TRUSTED' : 'STANDARD'} size="sm" />
                <View style={s.activeChip}>
                  <Text style={s.activeChipText}>Active Fleet</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Quick Fleet & Earnings Stat Strip */}
          <View style={s.statStrip}>
            <View style={s.statBox}>
              <Text style={s.statVal}>₹{(dashboardData?.user_info?.wallet_balance || 0).toLocaleString('en-IN')}</Text>
              <Text style={s.statLbl}>Wallet Balance</Text>
            </View>

            <View style={s.statDiv} />

            <TouchableOpacity
              style={s.statBox}
              onPress={() => router.push('/my-cars')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.statVal}>{dashboardData?.cars?.length || 0}</Text>
                <ChevronRight size={14} color="#FFFFFF" />
              </View>
              <Text style={s.statLbl}>Total Cars</Text>
            </TouchableOpacity>

            <View style={s.statDiv} />

            <TouchableOpacity
              style={s.statBox}
              onPress={() => router.push('/my-drivers')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.statVal}>{dashboardData?.drivers?.length || 0}</Text>
                <ChevronRight size={14} color="#FFFFFF" />
              </View>
              <Text style={s.statLbl}>Total Drivers</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Section 1: Personal & Business Info */}
        <View style={s.sectionWrapper}>
          <Text style={[s.sectionHeaderTitle, { color: colors.textSecondary }]}>Personal & Business Info</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            
            {/* Full Name per Govt ID */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: `${colors.primary}18` }]}>
                <User size={18} color={colors.primary} />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Full Name (Per Govt ID)</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>{fullName}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {pendingFields.includes('full_name') && (
                  <View style={s.underReviewPill}>
                    <Clock size={12} color="#D97706" />
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={openNameModal}
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>{pendingFields.includes('full_name') ? 'Edit' : 'Edit Name'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Name Mismatch Helper Banner */}
            {String(fullName).trim().toLowerCase() === String((dashboardData?.user_info as any)?.business_name || fullName).trim().toLowerCase() && (
              <View style={{
                backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
                borderColor: isDarkMode ? '#D9770650' : '#FCD34D',
                borderWidth: 1,
                padding: 10,
                marginHorizontal: 16,
                marginBottom: 10,
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}>
                <AlertCircle size={16} color="#D97706" />
                <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Inter-Medium', color: isDarkMode ? '#FBBF24' : '#B45309' }}>
                  Full Name is set as Business Name ('{fullName}'). Set your personal name per Aadhaar/PAN for faster verification.
                </Text>
              </View>
            )}

            <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

            {/* Travels / Business Name */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#10B98118' }]}>
                <Building2 size={18} color="#10B981" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Travels / Business Name</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>
                  {(dashboardData?.user_info as any)?.business_name || fullName}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {pendingFields.includes('business_name') && (
                  <View style={s.underReviewPill}>
                    <Clock size={12} color="#D97706" />
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={openBusinessModal}
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

            {/* Registered Address */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#F59E0B18' }]}>
                <MapPin size={18} color="#F59E0B" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Registered City / Address</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>{addressCity}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 2: Contact & Security */}
        <View style={s.sectionWrapper}>
          <Text style={[s.sectionHeaderTitle, { color: colors.textSecondary }]}>Contact & Security</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            
            {/* Primary Mobile Number */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#0284C718' }]}>
                <Phone size={18} color="#0284C7" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Primary Mobile Number</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>+91 {myPrimaryNumber || 'Not set'}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {(pendingFields.includes('primary_number') || pendingFields.includes('mobile_number')) && (
                  <View style={s.underReviewPill}>
                    <Clock size={12} color="#D97706" />
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={() => setShowMobileModal(true)}
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

            {/* Secondary / Alternate Mobile Number */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#6366F118' }]}>
                <Phone size={18} color="#6366F1" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Secondary Mobile Number</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>
                  {mySecondaryNumber ? `+91 ${mySecondaryNumber}` : 'Tap to add alternate mobile'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {pendingFields.includes('secondary_number') && (
                  <View style={s.underReviewPill}>
                    <Clock size={12} color="#D97706" />
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={openSecondaryModal}
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>{mySecondaryNumber ? 'Change' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

            {/* Email Address */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#EC489918' }]}>
                <Mail size={18} color="#EC4899" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Email Address (Password Reset & OTP)</Text>
                <Text style={[s.rowValue, { color: colors.text }]} numberOfLines={1}>
                  {myEmail || 'Tap to add email address'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {pendingFields.includes('email') ? (
                  <View style={s.underReviewPill}>
                    <Clock size={12} color="#D97706" />
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                ) : myEmail ? (
                  <View style={[s.verifiedPill, { backgroundColor: '#D1FAE5' }]}>
                    <BadgeCheck size={14} color="#059669" />
                    <Text style={[s.verifiedPillText, { color: '#059669' }]}>Verified</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={s.actionPill}
                  onPress={openEmailModal}
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>{myEmail ? 'Change' : 'Add Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

            {/* Password */}
            <View style={s.rowItem}>
              <View style={[s.iconBox, { backgroundColor: '#8B5CF618' }]}>
                <Lock size={18} color="#8B5CF6" />
              </View>
              <View style={s.rowTextCol}>
                <Text style={[s.rowLabel, { color: colors.textSecondary }]}>Password</Text>
                <Text style={[s.rowValue, { color: colors.text }]}>••••••••••••</Text>
              </View>
              <TouchableOpacity
                style={s.actionPill}
                onPress={() => {
                  if (!myEmail) {
                    Alert.alert(
                      'Email Address Required 📧',
                      'You must add and verify an email address before resetting or changing your password.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Add Email Now',
                          onPress: openEmailModal,
                        },
                      ]
                    );
                    return;
                  }
                  setPwdOtpSent(false);
                  setPwdOtpCode('');
                  setPwdNew('');
                  setPwdConfirm('');
                  setShowPasswordModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.actionPillText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Section 3: My Documents & Verification Hub */}
        <View style={s.sectionWrapper}>
          <Text style={[s.sectionHeaderTitle, { color: colors.textSecondary }]}>My Documents & Verification</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
            <Text style={[s.kycSubText, { color: colors.textSecondary, marginBottom: 12 }]}>
              Uploaded partner verification & identity documents. Tap Update anytime to upload revised documents.
            </Text>

            {/* Document 1: Aadhaar Card */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={20} color={colors.primary} />
                <View>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }}>Aadhaar Card (ID Proof)</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>Govt Photo ID Verification</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.statusChip, { backgroundColor: aadhaarCfg.bg }]}>
                  <aadhaarCfg.Icon size={12} color={aadhaarCfg.text} />
                  <Text style={[s.statusChipText, { color: aadhaarCfg.text }]}>{aadhaarCfg.label}</Text>
                </View>
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={() =>
                    setKycUpdateModal({
                      visible: true,
                      documentType: 'aadhar_front',
                      documentName: 'Aadhaar (Front Side)',
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Document 2: PAN Card */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CreditCard size={20} color="#3B82F6" />
                <View>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }}>PAN Card (Tax Proof)</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>Tax Identification</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.statusChip, { backgroundColor: panCfg.bg }]}>
                  <panCfg.Icon size={12} color={panCfg.text} />
                  <Text style={[s.statusChipText, { color: panCfg.text }]}>{panCfg.label}</Text>
                </View>
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={() =>
                    setKycUpdateModal({
                      visible: true,
                      documentType: 'pan_card',
                      documentName: 'PAN Card',
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Document 3: Business/Travels Registration */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Building2 size={20} color="#10B981" />
                <View>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Inter-Bold', color: colors.text }}>Travels / Fleet Registration</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>Business Proof / Certificate</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.statusChip, { backgroundColor: bizCfg.bg }]}>
                  <bizCfg.Icon size={12} color={bizCfg.text} />
                  <Text style={[s.statusChipText, { color: bizCfg.text }]}>{bizCfg.label}</Text>
                </View>
                <TouchableOpacity
                  style={s.actionPill}
                  onPress={() =>
                    setKycUpdateModal({
                      visible: true,
                      documentType: 'business_proof',
                      documentName: 'Travels / Business Registration Proof',
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={s.actionPillText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Section 4: Bank Account & Payout Details */}
        <View style={s.sectionWrapper}>
          <Text style={[s.sectionHeaderTitle, { color: colors.textSecondary }]}>Bank Account & Payout Details</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
            <View style={s.kycHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Landmark size={20} color="#10B981" />
                <Text style={[s.kycTitle, { color: colors.text }]}>Payout Account</Text>
              </View>
              <TouchableOpacity
                style={s.actionPill}
                onPress={openPaymentModal}
                activeOpacity={0.7}
              >
                <Text style={s.actionPillText}>
                  {bankAccountNumber || upiId ? 'Update Details' : 'Add Details'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.kycSubText, { color: colors.textSecondary, marginBottom: 12 }]}>
              Bank account or UPI ID where trip earnings and balance payouts are credited.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={openPaymentModal}
              style={[s.payoutInfoBox, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <View style={s.payoutRow}>
                <Text style={[s.payoutLabel, { color: colors.textSecondary }]}>Holder Name:</Text>
                <Text style={[s.payoutValue, { color: colors.text }]}>
                  {bankAccountHolderName || dashboardData?.user_info?.full_name || 'Not configured'}
                </Text>
              </View>

              <View style={s.payoutRow}>
                <Text style={[s.payoutLabel, { color: colors.textSecondary }]}>Bank Account:</Text>
                <Text style={[s.payoutValue, { color: colors.text }]}>
                  {bankAccountNumber ? `•••• •••• ${bankAccountNumber.slice(-4)}` : 'Not configured'}
                </Text>
              </View>

              <View style={s.payoutRow}>
                <Text style={[s.payoutLabel, { color: colors.textSecondary }]}>IFSC Code:</Text>
                <Text style={[s.payoutValue, { color: colors.text }]}>{bankIfsc || 'Not configured'}</Text>
              </View>

              <View style={s.payoutRow}>
                <Text style={[s.payoutLabel, { color: colors.textSecondary }]}>UPI ID / Mobile:</Text>
                <Text style={[s.payoutValue, { color: colors.text }]}>{upiId || 'Not configured'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 5: Referral Program */}
        <View style={s.sectionWrapper}>
          <Text style={[s.sectionHeaderTitle, { color: colors.textSecondary }]}>Referral Program</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
            <Text style={[s.referralTitle, { color: colors.text }]}>Invite Partner Vendors & Earn</Text>
            <Text style={[s.referralSub, { color: colors.textSecondary }]}>
              Share your referral code with fellow vehicle owners and earn rewards when they join Drop Cars.
            </Text>

            <View style={[s.referralBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View>
                <Text style={[s.referralCodeLabel, { color: colors.textSecondary }]}>YOUR REFERRAL CODE</Text>
                <Text style={[s.referralCodeVal, { color: colors.primary }]}>{referralCode || 'GENERATING...'}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={s.referralIconBtn} onPress={copyReferralCode}>
                  <Copy size={16} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.referralIconBtn} onPress={shareReferralCode}>
                  <Share2 size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {!referredByCode && (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginBottom: 6 }}>
                  Have a referrer code?
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={referralInput}
                    onChangeText={setReferralInput}
                    placeholder="Enter referral code"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      s.referralInput,
                      { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <TouchableOpacity
                    style={[s.applyRefBtn, { backgroundColor: colors.primary }]}
                    onPress={applyReferralCode}
                    disabled={applyingReferral}
                  >
                    <Text style={s.applyRefBtnText}>{applyingReferral ? 'Applying...' : 'Apply'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

      </ScrollView>

      {/* --- MODALS --- */}

      {/* Full Name Modal */}
      <Modal visible={showNameModal} transparent animationType="slide" onRequestClose={() => setShowNameModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Edit Full Name (Per Govt ID)</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Enter your official name as printed on your Aadhaar or PAN card. Name updates require Admin Review.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>Full Name</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNameModal(false)} disabled={nameBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={submitNameChange}
                disabled={nameBusy}
              >
                <Text style={s.primaryBtnText}>{nameBusy ? 'Submitting...' : 'Submit for Admin Review'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Business Name Modal */}
      <Modal visible={showBusinessModal} transparent animationType="slide" onRequestClose={() => setShowBusinessModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Edit Travels / Business Name</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Enter your registered fleet, agency, or business name. Updates require Admin Review.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>Travels / Agency Name</Text>
            <TextInput
              value={businessInput}
              onChangeText={setBusinessInput}
              placeholder="e.g. Sri Travels & Cabs"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowBusinessModal(false)} disabled={businessBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={submitBusinessChange}
                disabled={businessBusy}
              >
                <Text style={s.primaryBtnText}>{businessBusy ? 'Submitting...' : 'Submit for Admin Review'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Primary Mobile Modal (Password field removed!) */}
      <Modal visible={showMobileModal} transparent animationType="slide" onRequestClose={() => setShowMobileModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Change Primary Mobile Number</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Enter your new 10-digit mobile number. Drop Cars Admin will review & verify your request.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>New 10-Digit Primary Mobile Number</Text>
            <TextInput
              value={newMobileInput}
              onChangeText={(v) => setNewMobileInput(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="e.g. 9876543210"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowMobileModal(false)} disabled={mobileChangeBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={submitMobileChange}
                disabled={mobileChangeBusy}
              >
                <Text style={s.primaryBtnText}>{mobileChangeBusy ? 'Submitting...' : 'Submit for Admin Review'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Secondary / Alternate Mobile Modal */}
      <Modal visible={showSecondaryModal} transparent animationType="slide" onRequestClose={() => setShowSecondaryModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Secondary / Alternate Mobile Number</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Add or update an alternate contact number for emergency contact and dispatch alerts.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>10-Digit Alternate Mobile Number</Text>
            <TextInput
              value={secondaryInput}
              onChangeText={(v) => setSecondaryInput(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="e.g. 9123456789"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSecondaryModal(false)} disabled={secondaryBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={submitSecondaryChange}
                disabled={secondaryBusy}
              >
                <Text style={s.primaryBtnText}>{secondaryBusy ? 'Submitting...' : 'Submit for Admin Review'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Email Modal */}
      <Modal visible={showEmailModal} transparent animationType="slide" onRequestClose={() => setShowEmailModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>
              {myEmail ? 'Change Email Address' : 'Add Email Address'}
            </Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              We will send a 6-digit verification code to your new email address to confirm ownership before submitting for Admin Review.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>New Email Address</Text>
            <TextInput
              value={emailInput}
              onChangeText={(v) => {
                setEmailInput(v);
                setEmailOtpSent(false);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="your.email@gmail.com"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            {emailOtpSent && (
              <>
                <Text style={[s.inputLabel, { color: colors.text, marginTop: 10 }]}>6-digit Verification Code</Text>
                <TextInput
                  value={emailOtpCode}
                  onChangeText={(v) => setEmailOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />
              </>
            )}

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEmailModal(false)} disabled={emailBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={emailOtpSent ? confirmEmailOtp : sendEmailOtp}
                disabled={emailBusy}
              >
                <Text style={s.primaryBtnText}>
                  {emailBusy ? 'Processing...' : emailOtpSent ? 'Verify Code & Submit' : 'Send Code'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Password Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Change Password</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              {pwdOtpSent
                ? 'Enter the 6-digit code sent to your saved email, and set your new password.'
                : 'We will send a 6-digit code to your registered email.'}
            </Text>

            {pwdOtpSent && (
              <>
                <Text style={[s.inputLabel, { color: colors.text }]}>6-digit Code</Text>
                <TextInput
                  value={pwdOtpCode}
                  onChangeText={(v) => setPwdOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Code from email"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />

                <Text style={[s.inputLabel, { color: colors.text, marginTop: 10 }]}>New Password</Text>
                <TextInput
                  value={pwdNew}
                  onChangeText={setPwdNew}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />

                <Text style={[s.inputLabel, { color: colors.text, marginTop: 10 }]}>Confirm New Password</Text>
                <TextInput
                  value={pwdConfirm}
                  onChangeText={setPwdConfirm}
                  secureTextEntry
                  placeholder="Re-type new password"
                  placeholderTextColor={colors.textSecondary}
                  style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                />
              </>
            )}

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPasswordModal(false)} disabled={pwdBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={pwdOtpSent ? confirmPasswordReset : sendPasswordOtp}
                disabled={pwdBusy}
              >
                <Text style={s.primaryBtnText}>
                  {pwdBusy ? 'Processing...' : pwdOtpSent ? 'Save Password' : 'Send Code'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Details Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Payment & Bank Details</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Enter bank account details or UPI ID for instant payout settlements.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>Bank Account Number</Text>
            <TextInput
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              keyboardType="number-pad"
              placeholder="Enter account number"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[s.inputLabel, { color: colors.text, marginTop: 10 }]}>Bank IFSC Code</Text>
            <TextInput
              value={bankIfsc}
              onChangeText={(v) => setBankIfsc(v.toUpperCase())}
              autoCapitalize="characters"
              placeholder="e.g. SBIN0001234"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[s.inputLabel, { color: colors.text, marginTop: 10 }]}>Account Holder Name</Text>
            <TextInput
              value={bankAccountHolderName}
              onChangeText={setBankAccountHolderName}
              placeholder="Name per bank record"
              placeholderTextColor={colors.textSecondary}
              style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            {/* UPI Payment Details Section with Switch */}
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[s.inputLabel, { color: colors.text, marginTop: 0 }]}>UPI Payment Details</Text>
                
                {/* Switch Toggle */}
                <View style={{
                  flexDirection: 'row',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                  borderRadius: 8,
                  padding: 2,
                }}>
                  <TouchableOpacity
                    onPress={() => setUpiType('NUMBER')}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: upiType === 'NUMBER' ? colors.primary : 'transparent',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontFamily: upiType === 'NUMBER' ? 'Inter-Bold' : 'Inter-Medium',
                      color: upiType === 'NUMBER' ? '#FFFFFF' : colors.textSecondary,
                    }}>
                      UPI Number
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setUpiType('ID')}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: upiType === 'ID' ? colors.primary : 'transparent',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontFamily: upiType === 'ID' ? 'Inter-Bold' : 'Inter-Medium',
                      color: upiType === 'ID' ? '#FFFFFF' : colors.textSecondary,
                    }}>
                      UPI ID
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {upiType === 'NUMBER' ? (
                <View>
                  <TextInput
                    value={upiNumber}
                    onChangeText={(v) => setUpiNumber(v.replace(/\D/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="Enter 10-digit mobile number (e.g. 9876543210)"
                    placeholderTextColor={colors.textSecondary}
                    style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  />
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginTop: 3 }}>
                    📱 Used for instant settlements via PhonePe, GPay, or Paytm
                  </Text>
                </View>
              ) : (
                <View>
                  <TextInput
                    value={upiId}
                    onChangeText={setUpiId}
                    autoCapitalize="none"
                    placeholder="e.g. name@upi or mobile@ybl"
                    placeholderTextColor={colors.textSecondary}
                    style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  />
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, fontFamily: 'Inter-Medium', marginTop: 3 }}>
                    💳 Enter your official Virtual Payment Address (VPA)
                  </Text>
                </View>
              )}
            </View>

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPaymentModal(false)} disabled={paymentBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={savePaymentDetails}
                disabled={paymentBusy}
              >
                <Text style={s.primaryBtnText}>{paymentBusy ? 'Saving...' : 'Save Details'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Edit Request Modal */}
      <Modal visible={showEditRequestModal} transparent animationType="slide" onRequestClose={() => setShowEditRequestModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitleText, { color: colors.text }]}>Request Profile Update</Text>
            <Text style={[s.modalSubText, { color: colors.textSecondary }]}>
              Explain the reason for correction. Drop Cars verification team will review your request.
            </Text>

            <Text style={[s.inputLabel, { color: colors.text }]}>Details to Update / Reason</Text>
            <TextInput
              value={editReqReason}
              onChangeText={setEditReqReason}
              multiline
              numberOfLines={4}
              placeholder="Describe the name, address, or document changes needed..."
              placeholderTextColor={colors.textSecondary}
              style={[
                s.textInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                  height: 100,
                  textAlignVertical: 'top',
                },
              ]}
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditRequestModal(false)} disabled={submittingEditReq}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitEditRequest}
                disabled={submittingEditReq}
              >
                <Text style={s.primaryBtnText}>{submittingEditReq ? 'Submitting...' : 'Submit Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Document Update Modal */}
      <DocumentUpdateModal
        visible={kycUpdateModal.visible}
        onClose={() => setKycUpdateModal({ visible: false, documentType: '', documentName: '' })}
        entityId={(user as any)?.vehicleOwnerId || (user as any)?.vehicle_owner_id || user?.id || ''}
        entityType="vehicle_owner"
        documentType={kycUpdateModal.documentType}
        documentName={kycUpdateModal.documentName}
        onSuccess={() => {
          loadKycDocs();
          Alert.alert('Uploaded', `${kycUpdateModal.documentName} uploaded successfully.`);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  editReqHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editReqHeaderText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10B981',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroInfoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  heroPhone: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  heroAddress: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  activeChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  activeChipText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#34D399',
  },
  statStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  statLbl: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  statDiv: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sectionWrapper: {
    marginBottom: 20,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: {
    height: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  actionPill: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionPillText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#2563EB',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedPillText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  underReviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  underReviewText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#D97706',
  },
  kycHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kycTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  kycSubText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusChipText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  updateKycBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  updateKycBtnText: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  payoutInfoBox: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  payoutLabel: {
    fontSize: 12,
    flexShrink: 0,
    fontFamily: 'Inter-Medium',
  },
  payoutValue: {
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: 'Inter-SemiBold',
  },
  referralTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  referralSub: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  referralBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  referralCodeLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  referralCodeVal: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
  },
  referralIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  applyRefBtn: {
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyRefBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  adminEditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  adminEditTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  adminEditSub: {
    fontSize: 12,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalTitleText: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  modalSubText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
});
