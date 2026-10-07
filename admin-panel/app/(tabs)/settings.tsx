import AsyncStorage from '@react-native-async-storage/async-storage';
import { playAlarmSound, stopAlarmSound } from '@/utils/alarmSound';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  User,
  Pencil,
  Wallet,
  CalendarClock,
  Clock,
  MapPin,
  Building2,
  Car,
  Lock,
  ShieldAlert,
  LogOut,
  ChevronRight,
  Users,
  Mail,
  Bell,
  Calculator,
  Receipt,
  Smartphone,
  CheckCircle2,
  FileCheck,
  ShieldCheck,
  Zap,
  History,
  Megaphone,
  AlertTriangle,
  Globe,
  Gift,
  Inbox,
  Ticket,
  ShieldBan,
  Image as ImageIcon,
  DollarSign,
  Sun,
  Moon,
  Star,
  Navigation,
  TrendingUp,
  Settings2,
  Activity,
  Shuffle,
  CreditCard,
  Database,
} from 'lucide-react-native';

import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import AlertHealthModal from '@/components/AlertHealthModal';
import { triggerTestEnquiryAlarm } from '@/components/EnquiryAlarmHost';
import OTAUpdateCard from '@/components/OTAUpdateCard';

interface AdminProfile {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: string;
}

interface SettingsItem {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onPress: () => void;
  danger?: boolean;
}

type AppContext = 'customer' | 'vendor' | 'driver' | 'duty_driver';

const APP_CONTEXTS: { label: string; value: AppContext; subtitle: string; color: string; iconName: string }[] = [
  { label: 'Customer', value: 'customer', subtitle: 'Email OTP, Google Sign-In & Booking Fares', color: '#0EA5E9', iconName: 'phone' },
  { label: 'Vendor', value: 'vendor', subtitle: 'Wallet Limits, Commissions & Subscriptions', color: '#3B82F6', iconName: 'building' },
  { label: 'Driver', value: 'driver', subtitle: 'Document checks & duty alerts', color: '#10B981', iconName: 'car' },
  { label: 'Duty Driver', value: 'duty_driver', subtitle: 'Duty Shift Limits & GPS Tracking', color: '#8B5CF6', iconName: 'user' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const { isDark, toggleTheme, themeColors } = useTheme();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppContext>('customer');
  const [showAlertHealthModal, setShowAlertHealthModal] = useState(false);

  // This screen (including the staff-permission editor further down) is
  // meant for the Owner only. The tab bar already hides the Settings tab
  // from Staff accounts (see (tabs)/_layout.tsx's canSee/isOwner check),
  // but that only hides the tab button - a Staff account deep-linking
  // straight to /(tabs)/settings still reached the full screen with no
  // guard of its own. Mirrors the forbidden-state pattern already used in
  // app/staff-daily-records.tsx for the same Owner-only situation.
  const [authChecked, setAuthChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    (async () => {
      const role = await apiService.getCachedAdminRole();
      if (role !== 'Owner') {
        setForbidden(true);
      }
      setAuthChecked(true);
    })();
  }, []);

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Owner password change - email-OTP verified, matches the pattern
  // already used for vendor/owner/driver password resets.
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdStep, setPwdStep] = useState<'request' | 'confirm'>('request');
  const [pwdRequesting, setPwdRequesting] = useState(false);
  const [pwdCode, setPwdCode] = useState('');
  const [pwdNewPassword, setPwdNewPassword] = useState('');
  const [pwdConfirmPassword, setPwdConfirmPassword] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdSentMessage, setPwdSentMessage] = useState('');

  const [allowChangeBid, setAllowChangeBid] = useState(false);
  const [loadingChangeBid, setLoadingChangeBid] = useState(false);

  // Lead Alarm Settings State (15s Alarm System)
  const [leadAlarmEnabled, setLeadAlarmEnabled] = useState(true);
  // Autopilot & Bridge Settings State
  const [leadAutoDistEnabled, setLeadAutoDistEnabled] = useState(false);
  const [leadDistMode, setLeadDistMode] = useState('single_staff');
  const [fastagProvider, setFastagProvider] = useState('MANUAL');
  const [fastagApiKey, setFastagApiKey] = useState('');
  const [fastagThreshold, setFastagThreshold] = useState('300');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [leadAlarmDuration, setLeadAlarmDuration] = useState(15);
  const [testingAlarm, setTestingAlarm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const en = await AsyncStorage.getItem('dropcars_lead_alarm_enabled');
        if (en !== null) setLeadAlarmEnabled(en === 'true');
        const dur = await AsyncStorage.getItem('dropcars_lead_alarm_duration_sec');
        if (dur !== null) setLeadAlarmDuration(parseInt(dur, 10) || 15);
      } catch {}
      try {
        const autoCfg = await apiService.getAutopilotConfig();
        if (autoCfg) {
          setLeadAutoDistEnabled(!!autoCfg.lead_auto_distribution_enabled);
          if (autoCfg.lead_distribution_mode) setLeadDistMode(autoCfg.lead_distribution_mode);
          if (autoCfg.fastag_bridge_provider) setFastagProvider(autoCfg.fastag_bridge_provider);
          if (autoCfg.fastag_low_balance_threshold) setFastagThreshold(String(autoCfg.fastag_low_balance_threshold));
        }
        const revQueue = await apiService.getCustomerReviewQueue();
        if (revQueue) setPendingReviewCount(revQueue.pending_count || 0);
      } catch {}
    })();
  }, []);

  const handleToggleLeadAlarm = async (val: boolean) => {
    setLeadAlarmEnabled(val);
    try {
      await AsyncStorage.setItem('dropcars_lead_alarm_enabled', String(val));
      showToast(val ? 'Lead alert alarm enabled (15s popup)' : 'Lead alert alarm disabled', 'success');
    } catch {}
  };

  const handleChangeLeadDuration = async (sec: number) => {
    setLeadAlarmDuration(sec);
    try {
      await AsyncStorage.setItem('dropcars_lead_alarm_duration_sec', String(sec));
      showToast(`Alarm ring duration set to ${sec} seconds`, 'success');
    } catch {}
  };

  const handleTestAlarmSound = () => {
    setTestingAlarm(true);
    playAlarmSound('enquiry');
    setTimeout(() => {
      stopAlarmSound('enquiry');
      setTestingAlarm(false);
    }, 3000);
  };

  // Business Health - wallets, ratings, billing risk, revenue trend. Was on
  // the Fleet screen, moved here at the Owner's own call (those are
  // financial/quality report figures, not fleet-operational status like
  // drivers-online/cars-verified, which stayed on Fleet). Same backend
  // endpoint either screen calls - only the fields rendered differ.
  const [businessHealth, setBusinessHealth] = useState<{
    owner_wallet_total: number;
    vendor_wallet_total: number;
    owners_wallet_at_risk: number;
    avg_driver_rating: number;
    avg_car_rating: number;
    billing_overdue_count: number;
    revenue_last_7_days: Array<{ date: string; profit: number }>;
  } | null>(null);

  const fetchBusinessHealth = () => {
    apiService.getFleetHubCounts()
      .then((data) => { if (data.reports) setBusinessHealth(data.reports); })
      .catch(() => {});
  };

  useEffect(() => {
    apiService.getDropBidSettings()
      .then(res => setAllowChangeBid(!!res?.allow_change_bid))
      .catch(() => {});
    fetchBusinessHealth();
  }, []);

  const handleToggleChangeBid = async (val: boolean) => {
    setLoadingChangeBid(true);
    try {
      await apiService.updateDropBidSettings(val);
      setAllowChangeBid(val);
      showToast(val ? 'Change Bid feature ENABLED' : 'Change Bid feature DISABLED (Default)', 'success');
    } catch {
      showToast('Failed to update Drop Bid setting', 'error');
    } finally {
      setLoadingChangeBid(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await apiService.getAdminProfile();
      setProfile(data);
    } catch {
      // Non-fatal
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
    fetchBusinessHealth();
  };

  const openEditProfile = () => {
    if (!profile) return;
    setEditUsername(profile.username || '');
    setEditEmail(profile.email || '');
    setEditPhone(profile.phone || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (editPhone && !/^[6-9]\d{9}$/.test(editPhone)) {
      Alert.alert('Error', 'Phone must be a valid 10-digit mobile number');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await apiService.updateAdminProfile({
        username: editUsername.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
      });
      setProfile(updated);
      setShowEditModal(false);
      showToast('Profile updated.', 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleForceLogout = () => {
    Alert.alert(
      'Log out everywhere?',
      'This signs this admin account out on ALL devices, including this one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out Everywhere',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.forceLogoutAllSessions();
            } catch {}
            await apiService.logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
    } finally {
      router.replace('/login');
    }
  };

  const openPasswordModal = () => {
    setPwdStep('request');
    setPwdCode('');
    setPwdNewPassword('');
    setPwdConfirmPassword('');
    setPwdSentMessage('');
    setShowPasswordModal(true);
  };

  const requestPasswordOtp = async () => {
    setPwdRequesting(true);
    try {
      const res = await apiService.requestOwnerPasswordChangeOtp();
      setPwdSentMessage(res.message);
      setPwdStep('confirm');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to send the code');
    } finally {
      setPwdRequesting(false);
    }
  };

  const submitPasswordChange = async () => {
    if (pwdCode.trim().length !== 6) {
      Alert.alert('Enter the code', 'Enter the 6-digit code sent to your email.');
      return;
    }
    if (pwdNewPassword.length < 6) {
      Alert.alert('Password too short', 'New password must be at least 6 characters.');
      return;
    }
    if (pwdNewPassword !== pwdConfirmPassword) {
      Alert.alert('Passwords do not match', 'Re-enter the new password to confirm.');
      return;
    }
    setPwdSubmitting(true);
    try {
      await apiService.changeOwnerPassword(pwdCode.trim(), pwdNewPassword);
      setShowPasswordModal(false);
      Alert.alert('Password changed', 'Your password has been updated.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to change password');
    } finally {
      setPwdSubmitting(false);
    }
  };

  // Generate app-specific settings sections based on selectedApp
  const getAppSections = (): { title: string; items: SettingsItem[] }[] => {
    if (selectedApp === 'customer') {
      return [
        {
          title: 'Customer App Pricing & Rules',
          items: [
            {
              icon: <MapPin size={20} color="#10B981" />,
              label: 'Active Cities & Pickers',
              hint: 'Pick-up / Drop-off city list & autocomplete settings',
              onPress: () => router.push('/cities' as any),
            },
            {
              icon: <MapPin size={20} color="#8B5CF6" />,
              label: 'Local Bookings Cities',
              hint: 'Toggle which cities can post/accept Local bookings',
              onPress: () => router.push('/serviceable-cities' as any),
            },
            {
              icon: <Megaphone size={20} color="#EC4899" />,
              label: 'Announcements',
              hint: 'Broadcast a message to every driver on app entry',
              onPress: () => router.push('/announcements' as any),
            },
            {
              icon: <AlertTriangle size={20} color="#F59E0B" />,
              label: 'Cash Mismatch Review',
              hint: 'Flagged trips where reported cash collected looks off',
              onPress: () => router.push('/cash-audit' as any),
            },
            {
              icon: <History size={20} color="#3B82F6" />,
              label: 'Analytics',
              hint: 'Partner tiers, commission collected, trip split',
              onPress: () => router.push('/analytics' as any),
            },
            {
              icon: <Star size={20} color="#F59E0B" />,
              label: 'Ratings & Customer Reviews',
              hint: 'Trip ratings, flagged reviews, driver deductions & 5-star incentives',
              onPress: () => router.push('/ratings-analytics' as any),
            },
            {
              icon: <Navigation size={20} color="#10B981" />,
              label: '🚕 Savaari Booking Monitor',
              hint: 'Live Savaari vendor bookings — alerts, filters & direct accept link',
              onPress: () => router.push('/savaari-bookings' as any),
            },
            {
              icon: <MapPin size={20} color="#F59E0B" />,
              label: 'Route Distance Cache',
              hint: 'Cached route distances & intercity rules',
              onPress: () => router.push('/route-distances' as any),
            },
            {
              icon: <Bell size={20} color="#EF4444" />,
              label: 'Enquiry Alarm Control (Owner)',
              hint: 'Master switch, IST weekly schedule & staff alarm overrides',
              onPress: () => router.push('/alarm-settings' as any),
            },
            {
              icon: <Activity size={20} color="#10B981" />,
              label: 'Alert Health & Diagnostics',
              hint: 'Push tokens, background alerts, polling health & 5s test alarm',
              onPress: () => setShowAlertHealthModal(true),
            },
            {
              icon: <Database size={20} color="#3B82F6" />,
              label: 'Data Archive (Owner)',
              hint: 'Export old completed/cancelled bookings to Google Sheets',
              onPress: () => router.push('/data-archive' as any),
            },
            {
              icon: <Clock size={20} color="#1D4ED8" />,
              label: 'Driver assignment rules',
              hint: 'Configurable priority cutoff, assignment timings, alarm & penalties',
              onPress: () => router.push('/assignment-priority-settings' as any),
            },
          ],
        },
        {
          title: 'Customer Authentication & Gateways',
          items: [
            {
              icon: <Mail size={20} color="#0EA5E9" />,
              label: 'Email OTP & SMTP Settings',
              hint: '6-digit email OTP verification code & SMTP configuration',
              onPress: () => router.push('/email-settings' as any),
            },
            {
              icon: <Zap size={20} color="#8B5CF6" />,
              label: 'Google Sign-In & Mobile Gateways',
              hint: 'Google OAuth Client ID & WhatsApp OTP gateway',
              onPress: () => router.push('/notification-settings' as any),
            },
          ],
        },
      ];
    } else if (selectedApp === 'vendor') {
      return [
        {
          title: 'Vendor App Wallet & Billing',
          items: [
            {
              icon: <Wallet size={20} color="#3B82F6" />,
              label: 'Vendor Wallet Management',
              hint: 'Add/deduct money, balance thresholds & top-ups',
              onPress: () => router.push('/(tabs)/wallet'),
            },
            {
              icon: <CalendarClock size={20} color="#6366F1" />,
              label: 'Billing Automation',
              hint: 'Vendor yearly fees, auto-suspend rules & invoices',
              onPress: () => router.push('/billing'),
            },
            {
              icon: <Receipt size={20} color="#0284C7" />,
              label: 'GST invoices',
              hint: 'Sequential GST invoices, 1-click PDF download & GSTR-1 export',
              onPress: () => router.push('/gst-invoices' as any),
            },
            {
              icon: <Globe size={20} color="#3B82F6" />,
              label: 'Partner websites',
              hint: 'Add/manage websites allowed to post bookings',
              onPress: () => router.push('/website-integrations'),
            },
            {
              icon: <Building2 size={20} color="#3B82F6" />,
              label: 'Vendor Accounts Directory',
              hint: 'Manage active vendor profiles & permissions',
              onPress: () => router.push('/(tabs)/vendors'),
            },
          ],
        },
      ];
    } else if (selectedApp === 'driver') {
      return [
        {
          title: 'Driver checks & alerts',
          items: [
            {
              icon: <Car size={20} color="#10B981" />,
              label: 'Car & Document Verification',
              hint: 'Mandatory RC, Insurance, Permit & License validation',
              onPress: () => router.push('/cars' as any),
            },
            {
              icon: <Car size={20} color="#6366F1" />,
              label: 'Car Models',
              hint: 'Car name list & category auto-fill for Add Car',
              onPress: () => router.push('/car-models' as any),
            },
            {
              icon: <Car size={20} color="#EA580C" />,
              label: 'New Car Year',
              hint: 'Minimum model year for the NEW SEDAN car type',
              onPress: () => router.push('/new-car-year' as any),
            },
            {
              icon: <Gift size={20} color="#EA580C" />,
              label: 'Referral Bonus',
              hint: 'Bonus amount credited on referral signups/bookings',
              onPress: () => router.push('/referral-settings' as any),
            },
            {
              icon: <Ticket size={20} color="#7C3AED" />,
              label: 'Coupons & Promotions',
              hint: 'Create, edit, and toggle discount codes',
              onPress: () => router.push('/coupons' as any),
            },
            {
              icon: <ImageIcon size={20} color="#0EA5E9" />,
              label: 'Banners',
              hint: 'Promotional banners shown on the website',
              onPress: () => router.push('/banners' as any),
            },
            {
              icon: <Gift size={20} color="#059669" />,
              label: 'Reward Claims',
              hint: 'Process customer referral-reward redeem codes',
              onPress: () => router.push('/referral-claims' as any),
            },
            {
              icon: <Bell size={20} color="#EF4444" />,
              label: 'Audio Alerts & Sound Tones',
              hint: 'Ride dispatch alert sounds & spoken notification text',
              onPress: () => router.push('/notification-settings' as any),
            },
            {
              icon: <MapPin size={20} color="#3B82F6" />,
              label: 'Waiting cities',
              hint: 'Fleets & drivers waiting for trip assignment',
              onPress: () => router.push('/(tabs)/vacant-cities'),
            },
            {
              icon: <Wallet size={20} color="#10B981" />,
              label: 'Payout Requests',
              hint: 'Fleet driver cash-out requests - mark paid or reject',
              onPress: () => router.push('/payout-requests' as any),
            },
            {
              icon: <FileCheck size={20} color="#0EA5E9" />,
              label: 'Profile changes',
              hint: 'Sensitive bank, DL, Aadhaar, PAN edit approvals',
              onPress: () => router.push('/profile-edit-queue' as any),
            },
          ],
        },
      ];
    } else {
      // Duty Driver App
      return [
        {
          title: 'Duty Driver Shift & Security Rules',
          items: [
            {
              icon: <Lock size={20} color="#F59E0B" />,
              label: 'Reset Duty Driver Passwords',
              hint: 'Set new login MPIN or password for duty drivers',
              onPress: () => router.push('/(tabs)/password'),
            },
            {
              icon: <FileCheck size={20} color="#10B981" />,
              label: 'Driver Identity Verification',
              hint: 'Driving license & identity verification documents',
              onPress: () => router.push('/account-documents' as any),
            },
          ],
        },
      ];
    }
  };

  if (!authChecked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </SafeAreaView>
    );
  }

  if (forbidden) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <Text style={[styles.title, { color: themeColors.text }]}>Settings</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <ShieldAlert size={40} color={themeColors.textMuted} />
          <Text style={{ color: themeColors.text, fontSize: 15, fontWeight: '700', marginTop: 12 }}>Not authorized</Text>
          <Text style={{ color: themeColors.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
            Only the Owner account can access Settings.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const appSections = getAppSections();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: themeColors.text }]}>Settings</Text>
          </View>
          <ThemeToggle size={20} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* My Profile - name/phone/email + Edit. This "Edit Profile" modal
            existed in code already but had no button anywhere that opened
            it, so a wrong or outdated phone number could never actually be
            fixed. Found 2026-09-22. */}
        {profile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Profile</Text>
            <View style={[styles.profileCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={[styles.profileAvatar, { backgroundColor: colors.primaryTint }]}>
                <User size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.profileName, { color: themeColors.text }]}>{profile.username || 'Admin'}</Text>
                <Text style={[styles.profileMeta, { color: themeColors.textSecondary }]}>
                  {profile.phone}{profile.email ? `  ·  ${profile.email}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={openEditProfile} style={styles.profileEditBtn} accessibilityLabel="Edit my profile">
                <Pencil size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Business Health - wallets, ratings, billing risk, revenue trend.
            Moved here from the Fleet screen (Owner's own call - these are
            financial/quality report figures, not fleet-operational status). */}
        {businessHealth && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Business Health</Text>

            <View style={healthStyles.row}>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} color="#10B981" />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>Owner Wallets</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: themeColors.text }]}>₹{businessHealth.owner_wallet_total.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} color="#3B82F6" />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>Vendor Wallets</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: themeColors.text }]}>₹{businessHealth.vendor_wallet_total.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color={businessHealth.owners_wallet_at_risk > 0 ? colors.error : themeColors.textSecondary} />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>At-Risk Wallets</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: businessHealth.owners_wallet_at_risk > 0 ? colors.error : themeColors.text }]}>{businessHealth.owners_wallet_at_risk}</Text>
              </View>
            </View>

            <View style={[healthStyles.row, { marginTop: 10 }]}>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Star size={14} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>Avg Driver Rating</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: themeColors.text }]}>{businessHealth.avg_driver_rating.toFixed(1)}★</Text>
              </View>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Star size={14} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>Avg Car Rating</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: themeColors.text }]}>{businessHealth.avg_car_rating.toFixed(1)}★</Text>
              </View>
              <View style={[healthStyles.tile, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color={businessHealth.billing_overdue_count > 0 ? colors.error : themeColors.textSecondary} />
                  <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>Billing Overdue</Text>
                </View>
                <Text style={[healthStyles.tileValue, { color: businessHealth.billing_overdue_count > 0 ? colors.error : themeColors.text }]}>{businessHealth.billing_overdue_count}</Text>
              </View>
            </View>

            <View style={[healthStyles.trendCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <TrendingUp size={14} color={isDark ? '#818CF8' : colors.primary} />
                <Text style={[healthStyles.tileLabel, { color: themeColors.textSecondary }]}>7-Day Revenue Trend</Text>
              </View>
              {businessHealth.revenue_last_7_days.every((d) => d.profit === 0) ? (
                <Text style={{ fontSize: 12, color: themeColors.textMuted, textAlign: 'center', paddingVertical: 18 }}>
                  No completed-trip profit recorded in the last 7 days.
                </Text>
              ) : (
                <View style={healthStyles.trendBars}>
                  {(() => {
                    const maxProfit = Math.max(1, ...businessHealth.revenue_last_7_days.map((d) => d.profit));
                    return businessHealth.revenue_last_7_days.map((d) => {
                      const heightPct = Math.max(4, Math.round((d.profit / maxProfit) * 100));
                      const dayLabel = new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
                      return (
                        <View key={d.date} style={healthStyles.trendBarCol}>
                          <View style={healthStyles.trendBarTrack}>
                            <View style={[healthStyles.trendBarFill, { height: `${heightPct}%`, backgroundColor: isDark ? '#818CF8' : colors.primary }]} />
                          </View>
                          <Text style={[healthStyles.trendBarLabel, { color: themeColors.textMuted }]}>{dayLabel}</Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Master Company Finance & Ledger Hub */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company money</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/(tabs)/wallet')}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Wallet size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Company money</Text>
                <Text style={styles.rowHint}>Gross revenue, profit margins, GST invoices & master payout approvals</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Appearance & Theme Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Look & feel</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.row}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                {isDark ? <Moon size={20} color="#818CF8" /> : <Sun size={20} color="#F59E0B" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>
                  {isDark ? 'Dark Theme (Active)' : 'Light Theme (Active)'}
                </Text>
                <Text style={styles.rowHint}>
                  Tap to switch to {isDark ? 'Light Theme' : 'Dark Theme'} across all pages
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
                thumbColor={isDark ? '#818CF8' : '#FFFFFF'}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Drop Bid Feature Switch Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Drop Bid Reverse-Auction Settings</Text>
          <View style={styles.sectionCard}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Zap size={20} color="#EAB308" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Allow Drivers to Change Bid</Text>
                <Text style={styles.rowHint}>
                  {allowChangeBid 
                    ? 'ENABLED: Drivers can edit bid price after submitting an offer' 
                    : 'DISABLED (Default): Drivers cannot change bid price once an offer is submitted'}
                </Text>
              </View>
              <Switch
                value={allowChangeBid}
                disabled={loadingChangeBid}
                onValueChange={handleToggleChangeBid}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                thumbColor={allowChangeBid ? '#059669' : '#FFFFFF'}
              />
            </View>
          </View>
        </View>
        {/* Lead Alerts & Alarm System Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enquiry & Booking Alerts</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/alarm-settings' as any)}>
              <View style={styles.rowIcon}>
                <Bell size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Enquiry Alarm Control (Owner Master)</Text>
                <Text style={styles.rowHint}>Weekly IST schedule, master toggle & per-staff distribution</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/data-archive' as any)}>
              <View style={styles.rowIcon}>
                <Database size={20} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Data Archive (Owner)</Text>
                <Text style={styles.rowHint}>Export old completed/cancelled bookings to Google Sheets</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={() => setShowAlertHealthModal(true)}>
              <View style={styles.rowIcon}>
                <Activity size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Alert Health & 5s Test Alarm</Text>
                <Text style={styles.rowHint}>Push registration, background channels & instant test verification</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Selector 4-Equal Segment Tab Bar (No Scrolling) */}
        <View style={styles.appSelectorBox}>
          <Text style={styles.selectorLabel}>CONFIGURABLE MODULES</Text>
          <View style={styles.fourTabContainer}>
            {APP_CONTEXTS.map((ctx) => {
              const isSelected = selectedApp === ctx.value;
              return (
                <TouchableOpacity
                  key={ctx.value}
                  style={[
                    styles.appTabEqual,
                    isSelected && { backgroundColor: ctx.color, borderColor: ctx.color },
                  ]}
                  onPress={() => setSelectedApp(ctx.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.appTabEqualText, isSelected && { color: '#FFFFFF' }]} numberOfLines={1}>
                    {ctx.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Dynamic App Settings Sections (Renders Selected Module Settings First) */}
        {appSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.row, idx < section.items.length - 1 && styles.rowBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIcon}>{item.icon}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, item.danger && { color: '#EF4444' }]}>
                      {item.label}
                    </Text>
                    <Text style={styles.rowHint}>{item.hint}</Text>
                  </View>
                  <ChevronRight size={18} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Platform-Wide Settings - Shown as bottom section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform-Wide Settings</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/system-config' as any)}>
              <View style={styles.rowIcon}><Settings2 size={20} color="#6366F1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>App setup</Text>
                <Text style={styles.rowHint}>Fees, commission %, GPS spoof threshold, OTP rate-limits — no hardcoding</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/app-content' as any)}>
              <View style={styles.rowIcon}><Megaphone size={20} color="#6366F1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>App Content & AI</Text>
                <Text style={styles.rowHint}>Driver first-login cards, Terms, Help Bot knowledge, AI switches - no app release needed</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/system-health' as any)}>
              <View style={styles.rowIcon}><Activity size={20} color="#059669" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>System Health</Text>
                <Text style={styles.rowHint}>Database speed, errors, auto-checks, alert limits and quick actions</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/tariffs' as any)}>
              <View style={styles.rowIcon}><DollarSign size={20} color="#059669" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Tariffs</Text>
                <Text style={styles.rowHint}>Per-vehicle-type rate per KM, driver bata, passengers & luggage</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/fare-rules' as any)}>
              <View style={styles.rowIcon}><Calculator size={20} color="#0EA5E9" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Minimum Billable KM</Text>
                <Text style={styles.rowHint}>Minimum KM floor per trip type (One-Way, Round Trip, Multi-City)</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={() => router.push('/maps-api-keys' as any)}>
              <View style={styles.rowIcon}><Zap size={20} color="#10B981" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Zero-Cost Location API & Key Pool</Text>
                <Text style={styles.rowHint}>Google Maps key rotation pool, Nominatim free proxy & monthly limit auto-resets</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Global Admin Security Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security & logs</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/(tabs)/logs')}>
              <View style={styles.rowIcon}><History size={20} color="#6366F1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Activity Logs</Text>
                <Text style={styles.rowHint}>Full wallet & ledger activity history</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/enquiries' as any)}>
              <View style={styles.rowIcon}><Inbox size={20} color="#0EA5E9" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Website Enquiries</Text>
                <Text style={styles.rowHint}>View, confirm, or reject leads from the website</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/blocked-ips' as any)}>
              <View style={styles.rowIcon}><ShieldBan size={20} color="#EF4444" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Blocked IPs</Text>
                <Text style={styles.rowHint}>Spam/fake IPs silently ignored on public forms</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/website-settings' as any)}>
              <View style={styles.rowIcon}><Globe size={20} color="#3B82F6" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: themeColors.text }]}>Website Settings</Text>
                <Text style={[styles.rowHint, { color: themeColors.textSecondary, lineHeight: 16 }]}>Advance payment %, minimum, UPI, surcharges & pricing rules</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/tax-reports' as any)}>
              <View style={styles.rowIcon}><Receipt size={20} color="#059669" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: themeColors.text }]}>Accounts & GST Reports</Text>
                <Text style={[styles.rowHint, { color: themeColors.textSecondary, lineHeight: 16 }]}>GSTR-1, GSTR-3B, Sec 9(5), tax invoices & driver settlements</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/driver-tours' as any)}>
              <View style={styles.rowIcon}><Navigation size={20} color="#8B5CF6" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: themeColors.text }]}>Tours & Operations Hub</Text>
                <Text style={[styles.rowHint, { color: themeColors.textSecondary, lineHeight: 16 }]}>Active running tours, ledger, own-fleet return matches & autopilot</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/workers-payroll' as any)}>
              <View style={styles.rowIcon}><Users size={20} color="#F59E0B" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: themeColors.text }]}>Workers & Payroll</Text>
                <Text style={[styles.rowHint, { color: themeColors.textSecondary, lineHeight: 16 }]}>1-tap daily attendance, advances, petty cashbook & monthly salary</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            {/* Screens that were built but had no menu entry (found by the 2026-10-07 reachability audit) */}
            {([
              { to: '/sos-alerts', label: 'SOS Emergency Hub', hint: 'Live SOS alerts from drivers and customers', color: '#EF4444', Icon: AlertTriangle },
              { to: '/refund-requests', label: 'Refund Claims', hint: 'Customer refund requests from the website', color: '#F59E0B', Icon: Wallet },
              { to: '/review-tasks', label: 'Mandatory Review Tasks', hint: 'Items that need a staff review before they can move on', color: '#6366F1', Icon: FileCheck },
              { to: '/our-fleet-requests', label: 'Our Fleet Route Reservations', hint: 'Own-fleet vehicles reserved for return routes', color: '#10B981', Icon: Car },
              { to: '/customer-insights', label: 'Customer Behaviour Insights', hint: 'Who books, how often, and who is drifting away', color: '#0EA5E9', Icon: Users },
              { to: '/ai-automation-logs', label: 'AI & Automation Logs', hint: 'What the bot and automations did and why', color: '#8B5CF6', Icon: Globe },
              { to: '/face-audit', label: 'Duty Face Checks', hint: 'Audit the face verifications drivers did on duty', color: '#14B8A6', Icon: ShieldCheck },
              { to: '/staff-roles', label: 'Named Staff Roles', hint: 'Role templates (Dispatcher, Finance, Support) and their permissions', color: '#8B5CF6', Icon: Users },
              { to: '/team-hub', label: 'Team & Operations Hub', hint: 'Team workload, tasks and operations in one place', color: '#3B82F6', Icon: Users },
            ] as const).map(({ to, label, hint, color, Icon }) => (
              <TouchableOpacity key={to} style={[styles.row, styles.rowBorder]} onPress={() => router.push(to as any)}>
                <View style={styles.rowIcon}><Icon size={20} color={color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: themeColors.text }]}>{label}</Text>
                  <Text style={[styles.rowHint, { color: themeColors.textSecondary, lineHeight: 16 }]}>{hint}</Text>
                </View>
                <ChevronRight size={18} color="#D1D5DB" />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/staff-management' as any)}>
              <View style={styles.rowIcon}><Users size={20} color="#8B5CF6" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Staff & Roles</Text>
                <Text style={styles.rowHint}>Add staff accounts and control what each one can access</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/staff-activity' as any)}>
              <View style={styles.rowIcon}><Globe size={20} color="#10B981" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Staff Activity & Google Sheet Backup</Text>
                <Text style={styles.rowHint}>View audit logs & auto-backup to Google Sheets on clear</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={openPasswordModal}>
              <View style={styles.rowIcon}><Lock size={20} color="#059669" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Change Password</Text>
                <Text style={styles.rowHint}>Verify with a code sent to your email</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={handleForceLogout}>
              <View style={styles.rowIcon}><ShieldAlert size={20} color="#EF4444" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: '#EF4444' }]}>Log Out Everywhere</Text>
                <Text style={styles.rowHint}>Sign out this admin account on all devices</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={handleLogout}>
              <View style={styles.rowIcon}><LogOut size={20} color="#EF4444" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: '#EF4444' }]}>Log Out</Text>
                <Text style={styles.rowHint}>Sign out on this device only</Text>
              </View>
              <ChevronRight size={18} color="#D1D5DB" />
            </TouchableOpacity>

            {Platform.OS === 'web' && typeof window !== 'undefined' && (
              <TouchableOpacity
                style={[styles.row, { borderTopWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F0F9FF' }]}
                onPress={() => {
                  try {
                    window.parent.postMessage({ type: 'NVOS_CLOSE_APP', appId: 'taxi' }, '*');
                  } catch (e) {
                    console.log('Exit to NV OS failed', e);
                  }
                }}
              >
                <View style={styles.rowIcon}><Text style={{ fontSize: 18 }}>🖥️</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: '#0284C7', fontWeight: '800' }]}>Exit to NV OS Desktop</Text>
                  <Text style={styles.rowHint}>Minimize and return to NV OS window workspace</Text>
                </View>
                <ChevronRight size={18} color="#0284C7" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Live Over-The-Air (OTA) Updates Card */}
        <View style={{ marginTop: 20 }}>
          <OTAUpdateCard />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Edit Admin Profile</Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Username</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              value={editUsername}
              onChangeText={setEditUsername}
              autoCapitalize="none"
              placeholder="Username"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              value={editEmail}
              onChangeText={setEditEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Phone</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="10-digit mobile"
              placeholderTextColor={themeColors.textMuted}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? (
                <LoadingSpinner size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Change Password Modal - email-OTP verified */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Change Password</Text>
            <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {pwdStep === 'request' ? (
              <>
                <Text style={[styles.pwdIntroText, { color: themeColors.textSecondary }]}>
                  We'll send a 6-digit code to your registered email ({profile?.email || 'no email on file'}) to confirm this change.
                </Text>
                <TouchableOpacity
                  style={[styles.saveButton, (pwdRequesting || !profile?.email) && { opacity: 0.6 }]}
                  onPress={requestPasswordOtp}
                  disabled={pwdRequesting || !profile?.email}
                >
                  {pwdRequesting ? (
                    <LoadingSpinner size="small" color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Send Code</Text>
                  )}
                </TouchableOpacity>
                {!profile?.email && (
                  <Text style={styles.pwdWarningText}>Add an email to your profile first (Edit Profile above).</Text>
                )}
              </>
            ) : (
              <>
                {!!pwdSentMessage && <Text style={[styles.pwdIntroText, { color: themeColors.textSecondary }]}>{pwdSentMessage}</Text>}
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>6-Digit Code</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                  value={pwdCode}
                  onChangeText={setPwdCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={themeColors.textMuted}
                />
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>New Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                  value={pwdNewPassword}
                  onChangeText={setPwdNewPassword}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={themeColors.textMuted}
                />
                <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Confirm New Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                  value={pwdConfirmPassword}
                  onChangeText={setPwdConfirmPassword}
                  secureTextEntry
                  placeholder="Re-enter new password"
                  placeholderTextColor={themeColors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.saveButton, pwdSubmitting && { opacity: 0.6 }]}
                  onPress={submitPasswordChange}
                  disabled={pwdSubmitting}
                >
                  {pwdSubmitting ? (
                    <LoadingSpinner size="small" color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Change Password</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={requestPasswordOtp} disabled={pwdRequesting} style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={styles.pwdResendText}>{pwdRequesting ? 'Sending...' : 'Resend code'}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AlertHealthModal visible={showAlertHealthModal} onClose={() => setShowAlertHealthModal(false)} />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 2 },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  appSelectorBox: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  selectorLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0EA5E9',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  fourTabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    padding: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appTabEqual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  appTabEqualText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 14.5, fontWeight: '700' },
  profileMeta: { fontSize: 12.5, marginTop: 2 },
  profileEditBtn: { padding: 8 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  rowHint: { fontSize: 12, color: colors.textSecondary },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
  closeButton: { paddingHorizontal: 16, paddingVertical: 8 },
  closeButtonText: { fontSize: 15, fontWeight: '700', color: '#3B82F6' },
  modalContent: { flex: 1, padding: 20 },
  modalLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 24,
  },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  pwdIntroText: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginTop: 8, marginBottom: 16 },
  pwdWarningText: { fontSize: 12, color: '#B45309', marginTop: 10, textAlign: 'center' },
  pwdResendText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
  },
  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminName: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  profileDetail: { fontSize: 13, color: '#6B7280' },
  emptyText: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 40 },
});

const healthStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tileLabel: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  tileValue: {
    fontSize: 18,
    fontFamily: 'Inter-ExtraBold',
    marginTop: 6,
  },
  trendCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 80,
  },
  trendBarCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  trendBarTrack: {
    width: 18,
    height: 60,
    justifyContent: 'flex-end',
  },
  trendBarFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 3,
  },
  trendBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
});
