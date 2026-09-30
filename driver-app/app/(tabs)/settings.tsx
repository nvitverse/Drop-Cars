import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Dimensions,
  Linking,
  TextInput,
  ActivityIndicator,
  Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications, MUTE_DURATIONS } from '@/contexts/NotificationContext';
import { useBubble } from '@/contexts/BubbleContext';
import { useDashboard } from '@/contexts/DashboardContext';
import { useLanguage, LANGUAGE_OPTIONS, LanguageCode } from '@/contexts/LanguageContext';
import { Moon, Sun, LogOut, ChevronRight, User, Shield, ShieldCheck, Car, Users, X, Phone, Mail, Globe, MapPin, CalendarClock, ArrowLeftRight, Bell, BellRing, Gift, Copy, MessageCircle, Languages, Check, Landmark, Wallet, Lock, Camera, Edit3, CheckCircle, Upload, Volume2, Crown } from 'lucide-react-native';
import axiosInstance from '@/app/api/axiosInstance';
import VacantCityPicker from '@/components/VacantCityPicker';
import LocalCityPicker from '@/components/LocalCityPicker';
import DocumentUpdateModal from '@/components/DocumentUpdateModal';
import Clipboard from '@react-native-clipboard/clipboard';
import { fetchDocumentStatuses, DocumentStatus } from '@/services/documents/documentStatusService';
import { markEmailAddedLocally } from '@/utils/secureStore';
import TermsModal from '@/components/TermsModal';
import { useAppContent, TermsContent } from '@/services/appContent';
import PartnerBadge from '@/components/PartnerBadge';

const { height: screenHeight } = Dimensions.get('window');

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme, colors } = useTheme();
  const { notificationsEnabled, mutedUntil, muteFor, unmute } = useNotifications();
  const { bubbleEnabled, overlayPermissionGranted, setBubbleEnabled, requestOverlayPermission } = useBubble();
  const { dashboardData, loading, refreshData } = useDashboard();
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const feeInfo = useAppContent<TermsContent>('driver_fee_info', language);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showBubblePermissionModal, setShowBubblePermissionModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [selectedSoundTone, setSelectedSoundTone] = useState<string>('Loud Taxi Horn');
  const [showSoundPickerModal, setShowSoundPickerModal] = useState<boolean>(false);

  const [kycUpdateModal, setKycUpdateModal] = useState<{
    visible: boolean;
    documentType: string;
    documentName: string;
  }>({
    visible: false,
    documentType: '',
    documentName: '',
  });

  // Owner KYC status - same three documents the backend's accept-booking
  // gate checks (crud/verification.py).
  const [kycDocs, setKycDocs] = useState<Record<string, DocumentStatus> | null>(null);
  
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

  // Notifications are always-on (registered automatically on first login,
  // no manual toggle) - the only user control is a temporary mute.
  const isMuted = !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
  const muteLabel = isMuted
    ? `Muted until ${new Date(mutedUntil as string).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
    : 'Mute for a while if you need quiet';

  // Same "explain before asking" pattern as notifications above, but for the
  // "Display over other apps" overlay permission the floating bubble needs.
  // Turning off never needs the explainer or touches the OS permission.
  const handleToggleBubble = (value: boolean) => {
    if (value) {
      setShowBubblePermissionModal(true);
    } else {
      setBubbleEnabled(false);
    }
  };

  const confirmEnableBubble = async () => {
    setShowBubblePermissionModal(false);
    await setBubbleEnabled(true);
    if (!overlayPermissionGranted) {
      await requestOverlayPermission();
    }
  };

  // Yearly-fee countdown (each account has its own anniversary-based due date)
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [updatingAutoRenew, setUpdatingAutoRenew] = useState(false);
  useEffect(() => {
    axiosInstance.get('/api/users/vehicle-owner/billing-status')
      .then(res => setBillingStatus(res.data))
      .catch(() => {});
  }, []);

  const toggleAutoRenew = async (value: boolean) => {
    setUpdatingAutoRenew(true);
    try {
      const res = await axiosInstance.put('/api/users/vehicle-owner/auto-renew', { enabled: value });
      setBillingStatus(res.data);
    } catch {
      Alert.alert('Error', 'Could not update auto-renew. Please try again.');
    } finally {
      setUpdatingAutoRenew(false);
    }
  };

  const [showLocalCityModal, setShowLocalCityModal] = useState(false);

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredByCode, setReferredByCode] = useState<string | null>(null);
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);

  useEffect(() => {
    axiosInstance.get('/api/users/vehicle-owner/referral')
      .then(res => {
        setReferralCode(res.data?.referral_code || null);
        setReferredByCode(res.data?.referred_by_code || null);
      })
      .catch(() => {});
  }, []);

  const copyReferralCode = () => {
    if (!referralCode) return;
    Clipboard.setString(referralCode);
    Alert.alert('Copied', 'Referral code copied to clipboard');
  };

  const shareReferralCode = () => {
    if (!referralCode) return;
    Share.share({
      message: `Join Drop Cars using my referral code ${referralCode} and let's both benefit!`,
    }).catch(() => {});
  };

  const applyReferralCode = async () => {
    if (!referralInput.trim()) {
      Alert.alert('Error', 'Enter a referral code');
      return;
    }
    setApplyingReferral(true);
    try {
      const res = await axiosInstance.put('/api/users/vehicle-owner/referral/apply', { code: referralInput.trim() });
      setReferredByCode(res.data?.referred_by_code || null);
      setReferralInput('');
      Alert.alert('Applied', 'Referral code applied successfully');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not apply referral code');
    } finally {
      setApplyingReferral(false);
    }
  };

  const [subscribingMonthly, setSubscribingMonthly] = useState(false);
  const [upgradingYearly, setUpgradingYearly] = useState(false);

  const confirmStartMonthly = () => {
    Alert.alert(
      'Subscribe - ₹199/month',
      `₹199 will be charged now from your wallet, and again every month automatically. This CANNOT be cancelled - the only way off it is upgrading to the Yearly plan. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', style: 'destructive', onPress: startMonthly },
      ]
    );
  };

  const startMonthly = async () => {
    setSubscribingMonthly(true);
    try {
      const res = await axiosInstance.put('/api/users/vehicle-owner/subscription/start-monthly');
      setBillingStatus(res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not start the Monthly plan. Please try again.');
    } finally {
      setSubscribingMonthly(false);
    }
  };

  const confirmUpgradeYearly = () => {
    Alert.alert(
      'Upgrade to Yearly',
      'The full yearly fee will be charged now from your wallet, and your plan switches to Yearly. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: upgradeYearly },
      ]
    );
  };

  const upgradeYearly = async () => {
    setUpgradingYearly(true);
    try {
      const res = await axiosInstance.put('/api/users/vehicle-owner/subscription/upgrade-yearly');
      setBillingStatus(res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not upgrade to Yearly. Please try again.');
    } finally {
      setUpgradingYearly(false);
    }
  };

  // Email add/change (verified by a code sent to the NEW email)
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    axiosInstance.get('/api/users/vehicle-owner/email')
      .then(res => {
        const fetchedEmail = res.data?.email || null;
        setMyEmail(fetchedEmail);
        if (fetchedEmail) {
          markEmailAddedLocally(fetchedEmail);
        }
      })
      .catch(() => {});
  }, []);

  // Change Mobile Number - authorized by re-entering the current password
  // (no SMS OTP gateway exists in this codebase to verify the new number).
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [newMobileInput, setNewMobileInput] = useState('');
  const [mobilePasswordInput, setMobilePasswordInput] = useState('');
  const [mobileChangeBusy, setMobileChangeBusy] = useState(false);

  const submitMobileChange = async () => {
    const cleaned = newMobileInput.replace(/\D/g, '');
    if (cleaned.length !== 10 || !/^[6-9]/.test(cleaned)) {
      Alert.alert('Error', 'Enter a valid 10-digit mobile number starting with 6-9');
      return;
    }
    if (!mobilePasswordInput) {
      Alert.alert('Error', 'Enter your current password to confirm');
      return;
    }
    setMobileChangeBusy(true);
    try {
      await axiosInstance.put('/api/users/vehicle-owner/mobile-number', {
        new_mobile_number: cleaned,
        current_password: mobilePasswordInput,
      });
      Alert.alert('Success', 'Mobile number updated. Use the new number next time you log in.');
      setShowMobileModal(false);
      setNewMobileInput('');
      setMobilePasswordInput('');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not update mobile number');
    } finally {
      setMobileChangeBusy(false);
    }
  };

  const sendEmailOtp = async () => {
    if (!emailInput.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/vehicle-owner/email/request-otp', { email: emailInput.trim() });
      setEmailOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check the email inbox (and spam folder).');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not send the code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const confirmEmailOtp = async () => {
    if (emailOtpCode.trim().length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code from the email');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/vehicle-owner/email/confirm', {
        email: emailInput.trim(),
        code: emailOtpCode.trim(),
      });
      const savedEmail = res.data?.email || emailInput.trim();
      await markEmailAddedLocally(savedEmail);
      setMyEmail(savedEmail);
      setShowEmailModal(false);
      setEmailOtpSent(false);
      setEmailOtpCode('');
      Alert.alert('Saved', 'Your email is verified and saved. You can now reset your password with it.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not verify the code.');
    } finally {
      setEmailBusy(false);
    }
  };

  // Change Password (while logged in) - same email-OTP flow as Forgot
  // Password, but primary_number is pulled from the logged-in session
  // instead of being typed in.
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdOtpSent, setPwdOtpSent] = useState(false);
  const [pwdOtpCode, setPwdOtpCode] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const openPasswordModal = () => {
    setPwdOtpSent(false);
    setPwdOtpCode('');
    setPwdNew('');
    setPwdConfirm('');
    setShowPasswordModal(true);
  };

  const myPrimaryNumber = (dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || '';

  const sendPasswordOtp = async () => {
    setPwdBusy(true);
    try {
      const res = await axiosInstance.post('/api/users/email/request-reset-otp', {
        role: 'vehicle_owner',
        primary_number: myPrimaryNumber,
      });
      setPwdOtpSent(true);
      Alert.alert('Code Sent', res.data?.message || 'Check the email inbox (and spam folder).');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Could not send the code. Please try again.';
      setShowPasswordModal(false);
      Alert.alert(
        'Error',
        msg,
        /no email/i.test(msg)
          ? [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Add Email', onPress: () => { setEmailInput(''); setEmailOtpSent(false); setEmailOtpCode(''); setShowEmailModal(true); } },
            ]
          : undefined
      );
    } finally {
      setPwdBusy(false);
    }
  };

  const confirmPasswordReset = async () => {
    if (pwdOtpCode.trim().length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code from the email');
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
      Alert.alert('Password Changed', res.data?.message || 'Your password has been changed.');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not change password. Please try again.');
    } finally {
      setPwdBusy(false);
    }
  };

  // Vacant City: up to 5 cities where the owner/driver is waiting for a
  // trip. Fetch/toggle/save logic now lives in the shared <VacantCityPicker />
  // (also used by the Dashboard screen); this screen just tracks visibility.
  const [showVacantCityModal, setShowVacantCityModal] = useState(false);

  // Payment Details (bank account + UPI) - no GET endpoint returns these
  // fields today, so the form always starts blank and PUT is save-only.
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankAccountHolderName, setBankAccountHolderName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);

  const savePaymentDetails = async () => {
    const directPayload: Record<string, string> = {};
    const typedAccountNum = bankAccountNumber.trim();
    const typedIfsc = bankIfsc.trim();
    const typedHolderName = bankAccountHolderName.trim();
    const typedUpi = upiId.trim();

    if (!typedAccountNum && !typedIfsc && !typedHolderName && !typedUpi) {
      Alert.alert('Error', 'Enter at least a bank account or UPI ID before saving');
      return;
    }

    setPaymentBusy(true);
    let submittedReviewCount = 0;

    try {
      const ownerId = (dashboardData?.user_info as any)?.vehicle_owner_id || user?.id || 'VO_OWNER';
      const ownerName = (dashboardData?.user_info as any)?.full_name || user?.fullName || 'Vehicle Owner';
      const ownerPhone = myPrimaryNumber;
      const currentDetails = (dashboardData?.user_info as any) || {};

      // Gate sensitive field 1: bank_account_number -> Admin Review Queue
      if (typedAccountNum) {
        await axiosInstance.post('/api/profile-edit-requests/submit', {
          user_id: ownerId,
          user_type: 'FLEET_OWNER',
          user_name: ownerName,
          user_phone: ownerPhone,
          field_name: 'bank_account_number',
          old_value: currentDetails.bank_account_number || '',
          proposed_value: typedAccountNum,
        });
        submittedReviewCount++;
      }

      // Gate sensitive field 2: bank_ifsc -> Admin Review Queue
      if (typedIfsc) {
        await axiosInstance.post('/api/profile-edit-requests/submit', {
          user_id: ownerId,
          user_type: 'FLEET_OWNER',
          user_name: ownerName,
          user_phone: ownerPhone,
          field_name: 'bank_ifsc',
          old_value: currentDetails.bank_ifsc || '',
          proposed_value: typedIfsc,
        });
        submittedReviewCount++;
      }

      // Non-sensitive fields (holder name, upi_id) update directly
      if (typedHolderName) directPayload.bank_account_holder_name = typedHolderName;
      if (typedUpi) directPayload.upi_id = typedUpi;

      if (Object.keys(directPayload).length > 0) {
        const res = await axiosInstance.put('/api/users/vehicle-owner/payment-details', directPayload);
        setBankAccountHolderName(res.data?.bank_account_holder_name || typedHolderName);
        setUpiId(res.data?.upi_id || typedUpi);
      }

      setShowPaymentModal(false);
      if (submittedReviewCount > 0) {
        Alert.alert(
          'Request Submitted for Admin Review ⏳',
          'Your bank account / IFSC change request has been submitted to the Admin Review Queue and is pending approval.'
        );
      } else {
        Alert.alert('Saved', 'Your payment details have been saved.');
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not submit payment detail update. Please try again.');
    } finally {
      setPaymentBusy(false);
    }
  };

  // Support contact functions
  const handleCallSupport = () => {
    const phoneNumber = '+917200217986';
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleEmailSupport = () => {
    const email = 'dropcars.in@gmail.com';
    const subject = 'Support Request - Drop Cars Driver App';
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}`);
  };

  const handleOpenWebsite = () => {
    const website = 'https://www.dropcars.in';
    Linking.openURL(website);
  };

  const remoteTerms = useAppContent<TermsContent>('driver_terms', language);
  const termsAndConditions = remoteTerms?.body || t('terms.body');
  const currentLanguageLabel = LANGUAGE_OPTIONS.find((opt) => opt.code === language)?.label || 'English';

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editReqName, setEditReqName] = useState('');
  const [editReqMobile, setEditReqMobile] = useState('');
  const [editReqReason, setEditReqReason] = useState('');
  const [submittingEditReq, setSubmittingEditReq] = useState(false);
  const handleSubmitEditRequest = async () => {
    if (!editReqReason.trim()) {
      Alert.alert('Reason Required', 'Please explain the reason for requesting profile updates.');
      return;
    }

    setSubmittingEditReq(true);
    setTimeout(() => {
      setSubmittingEditReq(false);
      setShowEditRequestModal(false);
      setEditReqReason('');
      Alert.alert(
        'Request Submitted to Admin',
        'Your profile update request has been submitted to Drop Cars Admin. Our verification team will review and update your profile shortly.'
      );
    }, 800);
  };

  // Was Alert.alert - react-native-web has no native OS dialog to render
  // it against, so the 'destructive' style (red Logout button) never
  // applied on web, leaving default/blue-ish text on both buttons instead.
  // A themed modal renders the real red destructive styling on every
  // platform. Found 2026-09-23 (same fix as DrawerNavigation.tsx).
  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    router.replace('/login');
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    section: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
      marginBottom: 12,
      marginLeft: 4,
    },
    settingItem: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    settingIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    settingTitle: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
    },
    settingSubtitle: {
      fontSize: 12,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginTop: 2,
    },
    logoutButton: {
      backgroundColor: colors.surface,
      borderRadius: 6,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.error + '33',
    },
    logoutButtonText: {
      color: colors.error,
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      marginLeft: 8,
    },
    profileCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    profileAvatar: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    profileAvatarText: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      marginBottom: 4,
    },
    profileSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
    },
    profileStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontFamily: 'Inter-Bold',
      marginTop: 8,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      height: screenHeight * 0.8,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
    },
    closeButton: {
      padding: 8,
    },
    modalContent: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    termsText: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      lineHeight: 22,
    },
    supportCard: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    supportItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    supportIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    supportContent: {
      flex: 1,
    },
    supportTitle: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      marginBottom: 2,
    },
    supportValue: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
    },
    appInfoCard: {
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    appName: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      marginBottom: 4,
    },
    appVersion: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
    },
  });

  type SettingItemProps = {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
  };

  const SettingItem: React.FC<SettingItemProps> = ({ icon, title, subtitle, onPress, rightComponent }) => (
    <TouchableOpacity style={dynamicStyles.settingItem} onPress={onPress}>
      <View style={dynamicStyles.settingLeft}>
        <View style={dynamicStyles.settingIcon}>{icon}</View>
        <View style={{ flexShrink: 1 }}>
          <Text style={dynamicStyles.settingTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
          {subtitle && (
            <Text style={dynamicStyles.settingSubtitle} numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>Settings</Text>
        <Text style={dynamicStyles.headerSubtitle}>
          Welcome back, {(dashboardData?.user_info?.full_name || user?.fullName || 'Account Name')}!
        </Text>
      </View>

      <ScrollView
        style={dynamicStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl
            refreshing={pullRefreshing}
            onRefresh={async () => { setPullRefreshing(true); try { await refreshData(); } finally { setPullRefreshing(false); } }}
            colors={[colors.primary]}
          />
        }
      >
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Account</Text>

          {/* High-End Partner Account Summary Card */}
          <View style={[dynamicStyles.profileCard, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <TouchableOpacity
              style={dynamicStyles.profileHeader}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
            >
              <View style={[dynamicStyles.profileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={dynamicStyles.profileAvatarText}>
                  {(dashboardData?.user_info?.full_name || user?.fullName || 'V').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={dynamicStyles.profileInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[dynamicStyles.profileName, { color: colors.text }]} numberOfLines={1}>
                    {dashboardData?.user_info?.full_name || user?.fullName || 'Fleet Driver'}
                  </Text>
                  <View style={{ backgroundColor: `${colors.primary}18`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: colors.primary }}>Manage Profile ➔</Text>
                  </View>
                </View>
                <Text style={[dynamicStyles.profileSubtitle, { color: colors.textSecondary }]}>
                  {(dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || 'Verified Partner'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Partner Tier Badge */}
            <View style={{ marginVertical: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <PartnerBadge tier={billingStatus?.tier === 'PREFERRED' ? 'TRUSTED' : 'STANDARD'} size="md" />
            </View>

            {/* Quick Fleet Metrics Navigation */}
            <View style={dynamicStyles.profileStats}>
              <TouchableOpacity
                style={dynamicStyles.statItem}
                onPress={() => router.push('/my-cars')}
              >
                <Car color={colors.primary} size={20} />
                <Text style={[dynamicStyles.statValue, { color: colors.text }]}>
                  {dashboardData?.cars?.length || 0}
                </Text>
                <Text style={[dynamicStyles.statLabel, { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
                  Total Cars
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={dynamicStyles.statItem}
                onPress={() => router.push('/my-drivers')}
              >
                <Users color={colors.primary} size={20} />
                <Text style={[dynamicStyles.statValue, { color: colors.text }]}>
                  {dashboardData?.drivers?.length || 0}
                </Text>
                <Text style={[dynamicStyles.statLabel, { color: colors.primary, fontFamily: 'Inter-Bold' }]}>
                  Total Drivers
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* <SettingItem
            icon={<User color={colors.textSecondary} size={20} />}
            title="Edit Profile"
            subtitle="Update your personal information"
            onPress={() => Alert.alert('Edit Profile', 'Profile editing coming soon')}
          /> */}

          <SettingItem
            icon={<Gift color="#F59E0B" size={20} />}
            title="Driver PRO Subscription"
            subtitle="Priority trip dispatch & subscriber analytics"
            onPress={() => router.push('/subscription')}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />

          <SettingItem
            icon={<Shield color={colors.textSecondary} size={20} />}
            title="Privacy & Security"
            subtitle="View Terms and Conditions"
            onPress={() => setShowTermsModal(true)}
          />

          <SettingItem
            icon={<Wallet color={colors.textSecondary} size={20} />}
            title="Fees & Commission"
            subtitle="How commission, fees and your wallet work"
            onPress={() => setShowFeeModal(true)}
          />

          <SettingItem
            icon={<Landmark color={colors.textSecondary} size={20} />}
            title="Payment Details"
            subtitle={
              bankAccountNumber || upiId
                ? 'Bank account / UPI saved - tap to update'
                : 'Add your bank account or UPI ID to receive payouts'
            }
            onPress={() => setShowPaymentModal(true)}
          />
        </View>

        {/* Support & Helpline Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Support & Assistance</Text>

          <SettingItem
            icon={<Phone color="#10B981" size={20} />}
            title="24/7 Phone Support Helpline"
            subtitle="Tap to call Drop Cars support (7200217986)"
            onPress={() => Linking.openURL('tel:7200217986')}
          />

          <SettingItem
            icon={<MessageCircle color="#25D366" size={20} />}
            title="WhatsApp Fleet Help Desk"
            subtitle="Chat directly with fleet support team"
            onPress={() => Linking.openURL('https://wa.me/917200217986')}
          />
        </View>

        {/* Vacant City moved to the Dashboard (top of Available Bookings) */}

        <View style={dynamicStyles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={dynamicStyles.sectionTitle}>Membership</Text>
            {!!billingStatus?.tier && (
              <View style={{
                paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
                backgroundColor: billingStatus.tier === 'PREFERRED' ? colors.primary + '22' : colors.border,
              }}>
                <Text style={{
                  fontSize: 12, fontFamily: 'Inter-SemiBold',
                  color: billingStatus.tier === 'PREFERRED' ? colors.primary : colors.textSecondary,
                }}>
                  {billingStatus.tier === 'PREFERRED'
                    ? (billingStatus.days_remaining != null && billingStatus.days_remaining >= 0
                        ? `Trusted Partner · ${billingStatus.days_remaining} days left`
                        : 'Trusted Partner')
                    : 'Standard Partner'}
                </Text>
              </View>
            )}
          </View>

          {billingStatus?.subscription_type === 'MONTHLY' ? (
            <>
              <SettingItem
                icon={<CalendarClock color={colors.primary} size={20} />}
                title="Monthly Plan - active"
                subtitle={
                  `₹${billingStatus.monthly_fee}/month, auto-debited from your wallet every month` +
                  (billingStatus.billing_next_date ? ` • Next charge: ${billingStatus.billing_next_date}` : '') +
                  ' • Cannot be cancelled'
                }
              />
              <SettingItem
                icon={<ArrowLeftRight color={colors.textSecondary} size={20} />}
                title="Upgrade to Yearly"
                subtitle="Pay the full yearly fee once and stop the monthly auto-debit"
                onPress={upgradingYearly ? undefined : confirmUpgradeYearly}
                rightComponent={
                  upgradingYearly ? <ActivityIndicator size="small" color={colors.primary} /> : <ChevronRight color={colors.textSecondary} size={20} />
                }
              />
            </>
          ) : (
            <>
              {billingStatus?.billing_active && billingStatus?.days_remaining != null && (
                <SettingItem
                  icon={<CalendarClock color={billingStatus.days_remaining <= 30 ? colors.error : colors.textSecondary} size={20} />}
                  title={
                    billingStatus.days_remaining >= 0
                      ? `Membership: ${billingStatus.days_remaining} days left`
                      : `Membership expired ${Math.abs(billingStatus.days_remaining)} days ago`
                  }
                  subtitle={
                    `Valid until ${billingStatus.billing_next_date}` +
                    (billingStatus.yearly_fee > 0 ? ` • Renews automatically from your wallet (₹${billingStatus.yearly_fee})` : '') +
                    ' • Keep enough wallet balance • Tap to top up'
                  }
                  onPress={() => router.push('/(tabs)/wallet')}
                  rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
                />
              )}

              {billingStatus?.tier === 'STANDARD' && (
                <SettingItem
                  icon={<Crown color={colors.primary} size={20} />}
                  title="Become a Trusted Partner"
                  subtitle="Get first chance at bookings. Plans from ₹199/month."
                  onPress={() => router.push('/subscription')}
                  rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
                />
              )}
            </>
          )}

          <SettingItem
            icon={<MapPin color={colors.primary} size={20} />}
            title="Fleet Vacant Cities"
            subtitle="Manage waiting cities for all your vehicles & drivers"
            onPress={() => router.push('/vacants' as any)}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />

          <SettingItem
            icon={<MapPin color={colors.textSecondary} size={20} />}
            title="Local Bookings Cities"
            subtitle={
              billingStatus?.local_cities?.[0] === 'ALL'
                ? 'All Cities'
                : (billingStatus?.local_cities?.length
                    ? billingStatus.local_cities.join(', ')
                    : billingStatus?.local_city || 'Not set - tap to choose')
            }
            onPress={() => setShowLocalCityModal(true)}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />

          <SettingItem
            icon={<ArrowLeftRight color={colors.textSecondary} size={20} />}
            title="Switch to Duty Driver"
            subtitle="Go to the duty-driver side of the app"
            onPress={() => router.push('/quick-login')}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />
        </View>

        {/* Contact - everything used to prove/regain access to this account,
            grouped together instead of scattered across other sections. */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Contact</Text>

          <SettingItem
            icon={<Phone color={colors.textSecondary} size={20} />}
            title="Change Mobile Number"
            subtitle={user?.primaryMobile ? `+91 ${user.primaryMobile}` : 'Tap to change your mobile number'}
            onPress={() => { setNewMobileInput(''); setMobilePasswordInput(''); setShowMobileModal(true); }}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />

          <SettingItem
            icon={<Mail color={colors.textSecondary} size={20} />}
            title={myEmail ? 'Change Email' : 'Add Email'}
            subtitle={myEmail ? myEmail : 'For password reset - verified with a code'}
            onPress={() => { setEmailInput(myEmail || ''); setEmailOtpSent(false); setEmailOtpCode(''); setShowEmailModal(true); }}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />

          <SettingItem
            icon={<Lock color={colors.textSecondary} size={20} />}
            title="Change Password"
            subtitle="Send a code to your saved email to set a new password"
            onPress={openPasswordModal}
            rightComponent={<ChevronRight color={colors.textSecondary} size={20} />}
          />
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Preferences</Text>

          <SettingItem
            icon={isDarkMode ? <Moon color={colors.textSecondary} size={20} /> : <Sun color={colors.textSecondary} size={20} />}
            title="Dark Mode"
            subtitle="Switch between light and dark themes"
            rightComponent={
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={isDarkMode ? '#FFFFFF' : '#F3F4F6'}
              />
            }
          />

          <SettingItem
            icon={<Languages color={colors.textSecondary} size={20} />}
            title={t('settings.languageTitle')}
            subtitle={t('settings.languageSubtitle')}
            onPress={() => setShowLanguageModal(true)}
            rightComponent={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 14 }}>
                  {currentLanguageLabel}
                </Text>
                <ChevronRight color={colors.textSecondary} size={20} />
              </View>
            }
          />

          <SettingItem
            icon={isMuted ? <Bell color={colors.textSecondary} size={20} /> : <BellRing color={colors.textSecondary} size={20} />}
            title="Notifications"
            subtitle={muteLabel}
            onPress={() => setShowMuteModal(true)}
          />

          <SettingItem
            icon={<Bell color={colors.textSecondary} size={20} />}
            title="Notification Inbox"
            subtitle="See everything sent to you, even if you missed the push"
            onPress={() => router.push('/notifications' as any)}
          />

          <SettingItem
            icon={<Volume2 color={colors.primary} size={20} />}
            title="Booking Alert Sound Tone"
            subtitle="Custom notification horn sound for high priority bookings"
            onPress={() => setShowSoundPickerModal(true)}
            rightComponent={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 13 }}>
                  {selectedSoundTone}
                </Text>
                <ChevronRight color={colors.textSecondary} size={18} />
              </View>
            }
          />

          <SettingItem
            icon={<MessageCircle color={colors.textSecondary} size={20} />}
            title="New Booking Bubble"
            subtitle={
              bubbleEnabled
                ? (overlayPermissionGranted
                    ? 'On - a floating bubble shows new bookings even outside the app'
                    : 'On - but "Display over other apps" permission is not granted yet')
                : 'See new bookings instantly, even with the app closed, without missing them'
            }
            rightComponent={
              <Switch
                value={bubbleEnabled}
                onValueChange={handleToggleBubble}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={bubbleEnabled ? '#FFFFFF' : '#F3F4F6'}
              />
            }
          />
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Refer & Earn</Text>

          {!!referralCode && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 14, marginBottom: 8,
            }}>
              <Gift color={colors.primary} size={20} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Your referral code</Text>
                <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, letterSpacing: 1 }}>
                  {referralCode}
                </Text>
              </View>
              <TouchableOpacity onPress={copyReferralCode} style={{ padding: 8 }}>
                <Copy color={colors.textSecondary} size={18} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={shareReferralCode}
                style={{ backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 4 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter-SemiBold' }}>Share</Text>
              </TouchableOpacity>
            </View>
          )}

          {referredByCode ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, paddingHorizontal: 4 }}>
              Referred by code: {referredByCode}
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={referralInput}
                onChangeText={(t) => setReferralInput(t.toUpperCase())}
                placeholder="Have a referral code? Enter it here"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                style={{
                  flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                  paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14,
                }}
              />
              <TouchableOpacity
                onPress={applyingReferral ? undefined : applyReferralCode}
                disabled={applyingReferral}
                style={{ backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 16, justifyContent: 'center', opacity: applyingReferral ? 0.6 : 1 }}
              >
                {applyingReferral ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Support & Help Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Support & Help</Text>
          
          <View style={[dynamicStyles.supportCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={dynamicStyles.supportItem} onPress={handleCallSupport}>
              <View style={[dynamicStyles.supportIcon, { backgroundColor: colors.primary }]}>
                <Phone color="#FFFFFF" size={20} />
              </View>
              <View style={dynamicStyles.supportContent}>
                <Text style={[dynamicStyles.supportTitle, { color: colors.text }]}>Call Support</Text>
                <Text style={[dynamicStyles.supportValue, { color: colors.text }]}>+91 7200217986</Text>
              </View>
              <ChevronRight color={colors.textSecondary} size={20} />
            </TouchableOpacity>

            <TouchableOpacity style={dynamicStyles.supportItem} onPress={handleEmailSupport}>
              <View style={[dynamicStyles.supportIcon, { backgroundColor: colors.primary }]}>
                <Mail color="#FFFFFF" size={20} />
              </View>
              <View style={dynamicStyles.supportContent}>
                <Text style={[dynamicStyles.supportTitle, { color: colors.text }]}>Email Support</Text>
                <Text style={[dynamicStyles.supportValue, { color: colors.text }]}>dropcars.in@gmail.com</Text>
              </View>
              <ChevronRight color={colors.textSecondary} size={20} />
            </TouchableOpacity>

            <TouchableOpacity style={[dynamicStyles.supportItem, { borderBottomWidth: 0 }]} onPress={handleOpenWebsite}>
              <View style={[dynamicStyles.supportIcon, { backgroundColor: colors.primary }]}>
                <Globe color="#FFFFFF" size={20} />
              </View>
              <View style={dynamicStyles.supportContent}>
                <Text style={[dynamicStyles.supportTitle, { color: colors.text }]}>Website</Text>
                <Text style={[dynamicStyles.supportValue, { color: colors.text }]}>www.dropcars.in</Text>
              </View>
              <ChevronRight color={colors.textSecondary} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Information Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>App Information</Text>
          
          <View style={[dynamicStyles.appInfoCard, { backgroundColor: colors.surface }]}>
            <Text style={[dynamicStyles.appName, { color: colors.text }]}>Drop Cars Driver App</Text>
            <Text style={[dynamicStyles.appVersion, { color: colors.textSecondary }]}>Version 0.1</Text>
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <TouchableOpacity style={dynamicStyles.logoutButton} onPress={handleLogout}>
            <LogOut color={colors.error} size={20} />
            <Text style={dynamicStyles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 10, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <LogOut color={colors.error} size={26} />
            </View>
            <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text, textAlign: 'center', marginBottom: 8 }}>
              Logout
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter-Regular', color: colors.textSecondary, textAlign: 'center', marginBottom: 22, lineHeight: 18 }}>
              Are you sure you want to logout?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 6, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}
                onPress={confirmLogout}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Mobile Number modal - authorized by current password since
          there's no SMS OTP gateway to verify the new number. */}
      <Modal
        visible={showMobileModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMobileModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 4 }}>
              Change Mobile Number
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              Enter your new number and current password to confirm.
            </Text>

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>New Mobile Number</Text>
            <TextInput
              value={newMobileInput}
              onChangeText={(v) => setNewMobileInput(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Current Password</Text>
            <TextInput
              value={mobilePasswordInput}
              onChangeText={setMobilePasswordInput}
              secureTextEntry
              placeholder="Your current password"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowMobileModal(false)}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitMobileChange} disabled={mobileChangeBusy}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                  {mobileChangeBusy ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Email add/change modal (code sent to the NEW email proves ownership) */}
      <Modal
        visible={showEmailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmailModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 4 }}>
              {myEmail ? 'Change Email' : 'Add Email'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              We will send a 6-digit code to this email to confirm it is yours.
            </Text>

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Email</Text>
            <TextInput
              value={emailInput}
              onChangeText={(v) => { setEmailInput(v); setEmailOtpSent(false); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="your.email@gmail.com"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            {emailOtpSent && (
              <>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>6-digit Code</Text>
                <TextInput
                  value={emailOtpCode}
                  onChangeText={(v) => setEmailOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Code from the email"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                    color: colors.text, backgroundColor: colors.background, marginBottom: 12,
                  }}
                />
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowEmailModal(false)}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              {emailOtpSent ? (
                <>
                  <TouchableOpacity onPress={sendEmailOtp} disabled={emailBusy}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Resend</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmEmailOtp} disabled={emailBusy}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                      {emailBusy ? 'Verifying...' : 'Verify & Save'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={sendEmailOtp} disabled={emailBusy}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                    {emailBusy ? 'Sending...' : 'Send Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password modal (same email-OTP flow as Forgot Password, but
          primary_number comes from the logged-in session, not a text field) */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 4 }}>
              Change Password
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              {pwdOtpSent
                ? 'Enter the 6-digit code sent to your saved email, and your new password.'
                : 'We will send a 6-digit code to the email saved on your account.'}
            </Text>

            {pwdOtpSent && (
              <>
                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>6-digit Code</Text>
                <TextInput
                  value={pwdOtpCode}
                  onChangeText={(v) => setPwdOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Code from the email"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                    color: colors.text, backgroundColor: colors.background, marginBottom: 12,
                  }}
                />

                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>New Password</Text>
                <TextInput
                  value={pwdNew}
                  onChangeText={setPwdNew}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                    color: colors.text, backgroundColor: colors.background, marginBottom: 12,
                  }}
                />

                <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Confirm New Password</Text>
                <TextInput
                  value={pwdConfirm}
                  onChangeText={setPwdConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Type the same password again"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                    color: colors.text, backgroundColor: colors.background, marginBottom: 4,
                  }}
                />
                {pwdConfirm.length > 0 && pwdNew !== pwdConfirm && (
                  <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8 }}>Passwords do not match</Text>
                )}
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} disabled={pwdBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              {pwdOtpSent ? (
                <>
                  <TouchableOpacity onPress={sendPasswordOtp} disabled={pwdBusy}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Resend</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmPasswordReset} disabled={pwdBusy}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                      {pwdBusy ? 'Saving...' : 'Change Password'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={sendPasswordOtp} disabled={pwdBusy}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                    {pwdBusy ? 'Sending...' : 'Send Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Details modal (bank account + UPI) */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 4 }}>
              Payment Details
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              Add your bank account or UPI ID so payouts can be sent to you. Either one is enough.
            </Text>

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Bank Account Number</Text>
            <TextInput
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              placeholder="Enter bank account number"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Bank IFSC</Text>
            <TextInput
              value={bankIfsc}
              onChangeText={(v) => setBankIfsc(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. SBIN0001234"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Bank Account Holder Name</Text>
            <TextInput
              value={bankAccountHolderName}
              onChangeText={setBankAccountHolderName}
              autoCorrect={false}
              placeholder="Name as per bank records"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>UPI ID</Text>
            <TextInput
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="yourname@upi"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
                color: colors.text, backgroundColor: colors.background, marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)} disabled={paymentBusy}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePaymentDetails} disabled={paymentBusy}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                  {paymentBusy ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mute-for-duration picker - notifications are always-on by default,
          this is the only user control (server-side, holds even if the app
          is fully closed). */}
      <Modal
        visible={showMuteModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowMuteModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContainer, { backgroundColor: colors.surface, maxHeight: undefined }]}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.primary + '22', marginBottom: 14,
              }}>
                <Bell color={colors.primary} size={28} />
              </View>
              <Text style={[dynamicStyles.modalTitle, { color: colors.text, textAlign: 'center' }]}>
                Mute Notifications
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 8 }}>
                {isMuted ? muteLabel : 'Notifications stay on by default so you never miss a booking. Pick a duration to go quiet for a while.'}
              </Text>
            </View>
            {MUTE_DURATIONS.map((d) => (
              <TouchableOpacity
                key={d.minutes}
                onPress={async () => { await muteFor(d.minutes); setShowMuteModal(false); }}
                style={{
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.background,
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: 'Inter-Medium', color: colors.text, textAlign: 'center' }}>{d.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {isMuted && (
                <TouchableOpacity
                  onPress={async () => { await unmute(); setShowMuteModal(false); }}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.primary }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Unmute Now</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowMuteModal(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.border }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pre-permission explainer - shown before the native "Display over
          other apps" Settings screen opens */}
      <Modal
        visible={showBubblePermissionModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowBubblePermissionModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContainer, { backgroundColor: colors.surface, maxHeight: undefined }]}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.primary + '22', marginBottom: 14,
              }}>
                <MessageCircle color={colors.primary} size={28} />
              </View>
              <Text style={[dynamicStyles.modalTitle, { color: colors.text, textAlign: 'center' }]}>
                Never miss a booking again
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 8 }}>
                See new bookings instantly, even with the app closed, without missing them - a small floating bubble shows the trip type and fare the moment one arrives. Your phone will ask you to allow "Display over other apps" next - please allow it so the bubble can appear.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowBubblePermissionModal(false)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.border }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmEnableBubble}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.primary }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Enable</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fees & Commission explanation (admin-editable: Admin App > App Content) */}
      <TermsModal
        visible={showFeeModal}
        onClose={() => setShowFeeModal(false)}
        title={feeInfo?.title || 'Fees & Commission'}
        subtitle="How money works on a booking"
        body={feeInfo?.body || ''}
        agreeButtonText="Close"
      />

      {/* Terms and Conditions Modal */}
      <TermsModal
        visible={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title={remoteTerms?.title || "Terms & Policies"}
        body={termsAndConditions}
        summary={remoteTerms?.summary}
        fullUrl={remoteTerms?.full_url}
        agreeButtonText="Close"
      />

      {/* Language picker - updates the persisted language via LanguageContext;
          already-mounted screens re-render automatically since they read
          `t()`/`translations` from context, not a stale static import. */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>{t('settings.languageTitle')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)} style={{ padding: 4 }}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>
            {LANGUAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.code}
                onPress={() => {
                  setLanguage(opt.code as LanguageCode);
                  setShowLanguageModal(false);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingVertical: 16,
                  borderBottomWidth: 1, borderBottomColor: colors.background,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontFamily: language === opt.code ? 'Inter-Bold' : 'Inter-Medium',
                  color: language === opt.code ? colors.primary : colors.text,
                }}>
                  {opt.label}
                </Text>
                {language === opt.code && <Check color={colors.primary} size={20} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Vacant City Modal - up to 5 cities where the owner/driver is waiting
          for a trip. Shared component also used by the Dashboard screen
          (see components/VacantCityPicker.tsx). */}
      <VacantCityPicker
        visible={showVacantCityModal}
        onClose={() => setShowVacantCityModal(false)}
        variant="full"
      />

      <LocalCityPicker
        visible={showLocalCityModal}
        onClose={() => setShowLocalCityModal(false)}
        currentCities={billingStatus?.local_cities || (billingStatus?.local_city ? [billingStatus.local_city] : null)}
        onSaved={(cities) => setBillingStatus((prev: any) => prev ? { ...prev, local_cities: cities, local_city: cities?.[0] === 'ALL' ? null : (cities?.[0] || null) } : prev)}
      />

      {/* KYC Document Update Modal */}
      <DocumentUpdateModal
        visible={kycUpdateModal.visible}
        onClose={() => setKycUpdateModal({ visible: false, documentType: '', documentName: '' })}
        entityId={(user as any)?.vehicleOwnerId || (user as any)?.vehicle_owner_id || user?.id || ''}
        entityType="vehicle_owner"
        documentType={kycUpdateModal.documentType}
        documentName={kycUpdateModal.documentName}
        onSuccess={() => {
          loadKycDocs();
          Alert.alert('KYC Updated', `${kycUpdateModal.documentName} uploaded successfully.`);
        }}
      />
      {/* Rich Profile Overview Modal */}
      <Modal
        visible={showProfileModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContainer, { backgroundColor: colors.surface, height: screenHeight * 0.85 }]}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={[dynamicStyles.modalTitle, { color: colors.text }]}>Profile & Account Details</Text>
              <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
              {/* Avatar & Live Photo trigger */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ position: 'relative' }}>
                  <View style={[dynamicStyles.profileAvatar, { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.primary }]}>
                    <Text style={{ fontSize: 36, fontFamily: 'Inter-Bold', color: '#FFFFFF' }}>
                      {(dashboardData?.user_info?.full_name || user?.fullName || 'V').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: colors.text, marginTop: 10 }}>
                  {dashboardData?.user_info?.full_name || user?.fullName || 'Fleet Driver'}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {(dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || ''}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <PartnerBadge tier={billingStatus?.tier === 'PREFERRED' ? 'TRUSTED' : 'STANDARD'} size="sm" />
                </View>
              </View>

              {/* Personal Info Grid */}
              <View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase' }}>
                  Personal Information
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Full Name</Text>
                  <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>{dashboardData?.user_info?.full_name || user?.fullName || 'N/A'}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Primary Mobile</Text>
                  <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>{(dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || 'N/A'}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Registered City</Text>
                  <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>{dashboardData?.user_info?.address || 'N/A'}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Fleet Status</Text>
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: '#10B981' }}>🛡️ Verified Owner</Text>
                  </View>
                </View>
              </View>

              {/* Action: Request Edit to Admin */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                  paddingVertical: 14,
                  borderRadius: 6,
                  gap: 8,
                  marginBottom: 24,
                }}
                onPress={() => {
                  setEditReqName(dashboardData?.user_info?.full_name || user?.fullName || '');
                  setEditReqMobile((dashboardData?.user_info as any)?.primary_number || user?.primaryMobile || '');
                  setShowProfileModal(false);
                  setShowEditRequestModal(true);
                }}
              >
                <Edit3 color="#FFFFFF" size={18} />
                <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>
                  Request Profile Edit to Admin
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Request Modal */}
      <Modal
        visible={showEditRequestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditRequestModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContainer, { backgroundColor: colors.surface, height: screenHeight * 0.7 }]}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={[dynamicStyles.modalTitle, { color: colors.text }]}>Request Profile Edit</Text>
              <TouchableOpacity onPress={() => setShowEditRequestModal(false)}>
                <X color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 }}>
                Submitted profile changes will be sent to Drop Cars Admin verification desk for security approval.
              </Text>

              <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Full Name:</Text>
              <TextInput
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 14 }}
                value={editReqName}
                onChangeText={setEditReqName}
                placeholder="Enter full name"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Mobile Number:</Text>
              <TextInput
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, marginBottom: 14 }}
                value={editReqMobile}
                onChangeText={setEditReqMobile}
                keyboardType="phone-pad"
                placeholder="Enter mobile number"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text, marginBottom: 6 }}>Reason for Change:</Text>
              <TextInput
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, color: colors.text, height: 80, textAlignVertical: 'top', marginBottom: 20 }}
                value={editReqReason}
                onChangeText={setEditReqReason}
                multiline
                placeholder="Explain why you are requesting this change (e.g. business name update, new mobile number)"
                placeholderTextColor={colors.textSecondary}
              />

              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 6, alignItems: 'center' }}
                onPress={handleSubmitEditRequest}
                disabled={submittingEditReq}
              >
                {submittingEditReq ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 15 }}>Submit Edit Request</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Booking Alert Sound Tone Modal */}
      <Modal
        visible={showSoundPickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSoundPickerModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={[dynamicStyles.modalContainer, { backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 18 }]}>
            <View style={dynamicStyles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Volume2 color={colors.primary} size={22} />
                <Text style={[dynamicStyles.modalTitle, { color: colors.text }]}>Booking Alert Sound Tone</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSoundPickerModal(false)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
              Choose a custom alert tone for high priority booking notifications:
            </Text>

            {[
              { id: 'Loud Taxi Horn', label: '🎺 Loud Taxi Horn (Default)', desc: 'High volume double horn alert' },
              { id: 'Urgency Siren', label: '🚨 Urgency Siren Alert', desc: 'Continuous alert tone for instant bookings' },
              { id: 'Pleasant Chime', label: '🔔 Pleasant Chime Ring', desc: 'Soft chime notification tone' },
              { id: 'Digital Beep', label: '⚡ Digital Beep Pattern', desc: 'Modern rapid beep sequence' },
            ].map((tone) => {
              const isSelected = selectedSoundTone === tone.id;
              return (
                <TouchableOpacity
                  key={tone.id}
                  onPress={() => {
                    setSelectedSoundTone(tone.id);
                    setShowSoundPickerModal(false);
                    Alert.alert('Sound Tone Set', `Booking alert sound tone set to "${tone.id}".`);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 14,
                    borderRadius: 6,
                    marginBottom: 10,
                    backgroundColor: isSelected ? colors.primary + '15' : colors.background,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: isSelected ? colors.primary : colors.text }}>
                      {tone.label}
                    </Text>
                    <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: colors.textSecondary, marginTop: 2 }}>
                      {tone.desc}
                    </Text>
                  </View>
                  {isSelected && <CheckCircle color={colors.primary} size={20} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}