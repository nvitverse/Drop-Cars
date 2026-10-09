import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  Switch,
  Linking,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Phone,
  MapPin,
  Wallet,
  Car,
  UserCircle,
  Lock,
  FileCheck,
  Plus,
  Minus,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  CalendarClock,
  AlertTriangle,
  History,
  Star,
  Settings,
  MessageSquare,
  PhoneCall,
  Eye,
  EyeOff,
  ArrowLeftRight,
  KeyRound,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react-native';
import { apiService, resetUserPassword } from '@/services/api';
import StatusBadge from '@/components/StatusBadge';
import ErrorMessage from '@/components/ErrorMessage';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, Btn } from '@/components/ui';
import AdminAddCarModal from '@/components/AdminAddCarModal';
import AdminAddDriverModal from '@/components/AdminAddDriverModal';

interface OwnerProfile {
  id: string;
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string | null;
  wallet_balance: number;
  aadhar_number: string;
  aadhar_status?: string | null;
  address: string;
  city: string;
  pincode: string;
  account_status: string;
  billing_next_date?: string | null;
  billing_last_charged_at?: string | null;
  billing_suspended?: boolean;
  yearly_fee?: number | null;
  tier?: 'PREFERRED' | 'STANDARD' | null;
  subscription_type?: 'MONTHLY' | 'YEARLY' | null;
  admin_trusted_override?: boolean;
  trusted_override_by?: string | null;
  trusted_override_reason?: string | null;
  trusted_override_at?: string | null;
}

interface CarItem {
  id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  car_status: string;
  rating_avg?: number | null;
  rating_count?: number | null;
}

interface DriverItem {
  id: string;
  full_name: string;
  primary_number: string;
  licence_number: string;
  driver_status: string;
  rating_avg?: number | null;
  rating_count?: number | null;
}

function RatingBadge({ ratingAvg, ratingCount }: { ratingAvg?: number | null; ratingCount?: number | null }) {
  if (!ratingCount) return null;
  return (
    <View style={styles.ratingBadge}>
      <Star size={12} color="#F59E0B" fill="#F59E0B" />
      <Text style={styles.ratingBadgeText}>{(ratingAvg || 0).toFixed(1)} ({ratingCount})</Text>
    </View>
  );
}

interface LedgerEntry {
  id: string;
  order_id?: number | null;
  entry_type: 'CREDIT' | 'DEBIT';
  amount: number;
  balance_before: number;
  balance_after: number;
  notes?: string | null;
  reference_type?: string | null;
  created_at: string;
}

const formatCurrency = (amount: number) => `₹${(amount || 0).toLocaleString('en-IN')}`;

type DetailTab = 'overview' | 'wallet' | 'fleet' | 'settings';
const DETAIL_TABS: { key: DetailTab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: UserCircle },
  { key: 'wallet', label: 'Wallet', icon: Wallet },
  { key: 'fleet', label: 'Fleet', icon: Car },
  { key: 'settings', label: 'Settings', icon: Settings },
];
const LEDGER_PAGE_SIZE = 25;

export default function FleetOwnerDetailScreen() {
  const { ownerId, tab } = useLocalSearchParams<{ ownerId: string; tab?: string }>();
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [cars, setCars] = useState<CarItem[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>((tab as DetailTab) || 'overview');

  // Wallet adjust form
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingWallet, setSubmittingWallet] = useState(false);

  // Password reset form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Editable Profile Settings State
  const [editFullName, setEditFullName] = useState('');
  const [editPrimaryNumber, setEditPrimaryNumber] = useState('');
  const [editSecondaryNumber, setEditSecondaryNumber] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editAadhar, setEditAadhar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Partner Tier Override State
  const [tierModalVisible, setTierModalVisible] = useState(false);
  const [selectedTierTarget, setSelectedTierTarget] = useState<'PREFERRED' | 'STANDARD'>('PREFERRED');
  const [tierOverrideReason, setTierOverrideReason] = useState('');
  const [submittingTier, setSubmittingTier] = useState(false);

  // Add Car / Add Driver Modals State
  const [addCarModalVisible, setAddCarModalVisible] = useState(false);
  const [addDriverModalVisible, setAddDriverModalVisible] = useState(false);

  const handleSaveTierOverride = async () => {
    if (!owner) return;
    if (!tierOverrideReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for updating the partner tier.');
      return;
    }
    setSubmittingTier(true);
    try {
      const isTrusted = selectedTierTarget === 'PREFERRED';
      const res = await apiService.setTrustedPartnerOverride(owner.vehicle_owner_id, isTrusted, tierOverrideReason.trim());
      setOwner(prev => prev ? {
        ...prev,
        tier: res.tier as any,
        admin_trusted_override: res.admin_trusted_override,
        trusted_override_by: res.trusted_override_by,
        trusted_override_reason: res.trusted_override_reason,
        trusted_override_at: res.trusted_override_at,
      } : null);
      setTierModalVisible(false);
      setTierOverrideReason('');
      showToast(`Partner tier updated to ${isTrusted ? 'Trusted' : 'Standard'} successfully!`, 'success');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update partner tier.');
    } finally {
      setSubmittingTier(false);
    }
  };

  // Fleet Swap State (T5 / T6)
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapType, setSwapType] = useState<'DRIVER' | 'CAR'>('DRIVER');
  const [swapTargetInput, setSwapTargetInput] = useState('');
  const [activeSwapUuid, setActiveSwapUuid] = useState<string | null>(null);
  const [swapStep, setSwapStep] = useState<'REQUEST' | 'VERIFY' | 'OVERRIDE'>('REQUEST');
  const [swapOtp, setSwapOtp] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapInfo, setSwapInfo] = useState<string | null>(null);

  const handleOpenSwapModal = (type: 'DRIVER' | 'CAR') => {
    setSwapType(type);
    setSwapTargetInput('');
    setActiveSwapUuid(null);
    setSwapStep('REQUEST');
    setSwapOtp('');
    setOverrideReason('');
    setSwapInfo(null);
    setSwapModalVisible(true);
  };

  const handleInitiateSwap = async () => {
    if (!owner) return;
    if (!swapTargetInput.trim()) {
      Alert.alert('Required', swapType === 'DRIVER' ? 'Please enter Driver UUID / Mobile' : 'Please enter Car Number');
      return;
    }
    setSwapSubmitting(true);
    try {
      if (swapType === 'DRIVER') {
        const res = await apiService.requestDriverSwap(swapTargetInput.trim(), owner.vehicle_owner_id);
        setActiveSwapUuid(res.swap_id);
        setSwapInfo(res.message || 'OTP sent to driver.');
        setSwapStep('VERIFY');
        showToast('Swap request created. OTP sent to driver.', 'info');
      } else {
        const res = await apiService.requestCarSwap(swapTargetInput.trim(), owner.vehicle_owner_id);
        setActiveSwapUuid(res.swap_id);
        setSwapInfo(res.message || 'OTP sent to current car owner.');
        setSwapStep('VERIFY');
        showToast('Swap request created. OTP sent to current car owner.', 'info');
      }
    } catch (err: any) {
      Alert.alert('Swap Blocked', err?.message || 'Failed to initiate swap.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleVerifySwap = async () => {
    if (!activeSwapUuid) return;
    if (!swapOtp.trim() || swapOtp.trim().length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter a 6-digit OTP.');
      return;
    }
    setSwapSubmitting(true);
    try {
      if (swapType === 'DRIVER') {
        await apiService.verifyDriverSwap(activeSwapUuid, swapOtp.trim());
      } else {
        await apiService.verifyCarSwap(activeSwapUuid, swapOtp.trim());
      }
      showToast('Fleet swap completed successfully!', 'success');
      setSwapModalVisible(false);
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'Invalid or expired OTP.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleAdminOverride = async () => {
    if (!activeSwapUuid) return;
    if (!overrideReason.trim() || overrideReason.trim().length < 10) {
      Alert.alert('Reason Required', 'Please provide a detailed reason (at least 10 characters) for admin override.');
      return;
    }
    setSwapSubmitting(true);
    try {
      await apiService.adminOverrideSwap(activeSwapUuid, overrideReason.trim());
      showToast('Admin override swap completed successfully!', 'success');
      setSwapModalVisible(false);
      fetchDetails();
    } catch (err: any) {
      Alert.alert('Override Failed', err?.message || 'Admin override failed.');
    } finally {
      setSwapSubmitting(false);
    }
  };

  useEffect(() => {
    if (owner) {
      setEditFullName(owner.full_name || '');
      setEditPrimaryNumber(owner.primary_number || '');
      setEditSecondaryNumber(owner.secondary_number || '');
      setEditEmail((owner as any).email || '');
      setEditCity(owner.city || '');
      setEditAddress(owner.address || '');
      setEditAadhar(owner.aadhar_number || '');
    }
  }, [owner]);

  const handleSaveProfile = async () => {
    if (!ownerId) return;
    if (!editFullName.trim()) {
      Alert.alert('Missing Name', 'Please enter a valid full name.');
      return;
    }
    if (!editPrimaryNumber.trim()) {
      Alert.alert('Missing Phone', 'Please enter a valid primary phone number.');
      return;
    }
    setSavingProfile(true);
    try {
      await apiService.updateVehicleOwnerProfile(ownerId, {
        full_name: editFullName.trim(),
        primary_number: editPrimaryNumber.trim(),
        secondary_number: editSecondaryNumber.trim(),
        email: editEmail.trim(),
        city: editCity.trim(),
        address: editAddress.trim(),
        aadhar_number: editAadhar.trim(),
      });
      setOwner(prev => prev ? {
        ...prev,
        full_name: editFullName.trim(),
        primary_number: editPrimaryNumber.trim(),
        secondary_number: editSecondaryNumber.trim(),
        city: editCity.trim(),
        address: editAddress.trim(),
        aadhar_number: editAadhar.trim(),
        email: editEmail.trim(),
      } as any : null);
      showToast('Profile updated successfully!', 'success');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile settings.');
    } finally {
      setSavingProfile(false);
    }
  };

  const fetchDetails = useCallback(async () => {
    if (!ownerId) return;
    setError(null);
    try {
      const data = await apiService.getVehicleOwnerDetails(ownerId);
      setOwner(data.vehicle_owner);
      setCars(data.cars || []);
      setDrivers(data.drivers || []);
      apiService.getVehicleOwnerLedger(ownerId, 0, LEDGER_PAGE_SIZE)
        .then((res) => {
          setLedger(res.entries || []);
          setLedgerTotalCount(res.total_count || 0);
        })
        .catch(() => setLedger([]));
    } catch (err: any) {
      setError(err?.message || 'Failed to load fleet details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDetails();
  };

  const loadMoreLedger = async () => {
    if (!ownerId || ledgerLoadingMore || ledger.length >= ledgerTotalCount) return;
    setLedgerLoadingMore(true);
    try {
      const res = await apiService.getVehicleOwnerLedger(ownerId, ledger.length, LEDGER_PAGE_SIZE);
      setLedger((prev) => [...prev, ...(res.entries || [])]);
      setLedgerTotalCount(res.total_count || 0);
    } catch {
      // silent
    } finally {
      setLedgerLoadingMore(false);
    }
  };

  const handleToggleStatus = async (value: boolean) => {
    if (!owner) return;
    const newStatus = value ? 'Active' : 'Inactive';
    setUpdatingStatus(true);
    try {
      await apiService.updateVehicleOwnerAccountStatus(owner.vehicle_owner_id, newStatus);
      setOwner({ ...owner, account_status: newStatus });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update account status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleWalletSubmit = async () => {
    if (!owner) return;
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Enter a valid positive whole-rupee amount');
      return;
    }
    setSubmittingWallet(true);
    try {
      const result = await apiService.adjustWallet({
        role: 'vehicle_owner',
        target_id: owner.vehicle_owner_id,
        direction,
        amount: numAmount,
        notes: notes.trim() || undefined,
      });
      setOwner({ ...owner, wallet_balance: result.new_wallet_balance });
      setAmount('');
      setNotes('');
      showToast(`${direction === 'credit' ? 'Added' : 'Deducted'} ${formatCurrency(numAmount)}. New balance: ${formatCurrency(result.new_wallet_balance)}`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to adjust wallet');
    } finally {
      setSubmittingWallet(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!owner) return;
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setResettingPassword(true);
    try {
      await resetUserPassword('Driver', owner.vehicle_owner_id, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast(`Password reset for ${owner.full_name}.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const isAccountBlocked = (owner?.account_status || '').toUpperCase() === 'BLOCKED';

  const handleToggleBlockAccount = () => {
    if (!owner) return;
    const nextStatus = isAccountBlocked ? 'Active' : 'Blocked';
    Alert.alert(
      isAccountBlocked ? 'Unblock Fleet Account' : 'Block Fleet Account',
      isAccountBlocked
        ? `Are you sure you want to unblock ${owner.full_name}'s fleet account? They will regain access to their portal and vehicles.`
        : `Are you sure you want to block ${owner.full_name}'s fleet account? They will be locked out from logging in and accepting bookings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isAccountBlocked ? 'Unblock Account' : 'Block Account',
          style: isAccountBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              await apiService.updateVehicleOwnerAccountStatus(owner.vehicle_owner_id, nextStatus);
              setOwner(prev => prev ? { ...prev, account_status: nextStatus } : null);
              showToast(`Fleet account ${isAccountBlocked ? 'unblocked' : 'blocked'} successfully!`, 'success');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to update account status.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const handlePermanentDeleteAccount = () => {
    if (!owner) return;
    Alert.alert(
      'Permanently Delete Fleet Account',
      `Are you sure you want to permanently delete ${owner.full_name}'s fleet account?\n\nThis action cannot be undone and will completely remove this fleet owner from the system.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await apiService.deleteAccount(owner.vehicle_owner_id, 'vehicle_owner');
              showToast('Fleet account permanently deleted.', 'success');
              setTimeout(() => {
                router.replace('/(tabs)/fleet-hub');
              }, 600);
            } catch (err: any) {
              Alert.alert('Cannot Delete Account', err?.message || 'Failed to permanently delete fleet account.');
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const handleShareWhatsAppSummary = () => {
    if (!owner) return;
    const activeCars = cars.filter(c => (c.car_status || '').toUpperCase() === 'ONLINE' || (c.car_status || '').toUpperCase() === 'ACTIVE').length;
    const activeDrivers = drivers.filter(d => (d.driver_status || '').toUpperCase() === 'ONLINE' || (d.driver_status || '').toUpperCase() === 'ACTIVE').length;
    const carList = cars.slice(0, 5).map(c => `• ${c.car_number} (${c.car_name || c.car_type})`).join('\n');
    
    const message = `*DROP CARS - Fleet Partner Statement*\n\n` +
      `👤 *Partner:* ${owner.full_name}\n` +
      `📞 *Mobile:* ${owner.primary_number}\n` +
      `💰 *Wallet Balance:* ₹${Number(owner.wallet_balance || 0).toLocaleString('en-IN')}\n` +
      `⭐ *Tier:* ${owner.tier === 'PREFERRED' ? 'Trusted Partner' : 'Standard Partner'}\n` +
      `🚗 *Cars:* ${activeCars} Active (${cars.length} Total)\n` +
      `👨‍✈️ *Drivers:* ${activeDrivers} Active (${drivers.length} Total)\n` +
      (carList ? `\n*Vehicles:*\n${carList}\n` : '') +
      `\n_Generated on ${new Date().toLocaleDateString('en-IN')}_ - Drop Cars Head Office`;

    const phone = owner.primary_number.replace(/\D/g, '').slice(-10);
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`);
  };

  const openDocuments = () => {
    if (!owner) return;
    router.push({
      pathname: '/account-documents',
      params: { accountId: owner.vehicle_owner_id, accountType: 'vehicle_owner', accountName: owner.full_name },
    });
  };

  const openCarDocuments = (car: CarItem) => {
    if (!owner) return;
    router.push({
      pathname: '/car-documents',
      params: { carId: car.id, vehicleOwnerId: owner.vehicle_owner_id, carName: car.car_name },
    });
  };

  const openDriverDocuments = (driver: DriverItem) => {
    if (!owner) return;
    router.push({
      pathname: '/account-documents',
      params: { accountId: driver.id, accountType: 'driver', accountName: driver.full_name },
    });
  };

  const handleToggleCarStatus = async (carId: string, currentStatus: string) => {
    const newStatus = (currentStatus || '').toUpperCase() === 'ONLINE' ? 'BLOCKED' : 'ONLINE';
    setCars(prev => prev.map(c => c.id === carId ? { ...c, car_status: newStatus } : c));
    try {
      await apiService.updateCarAccountStatus(carId, newStatus);
      showToast(`Car status updated to ${newStatus}`, 'success');
    } catch (e) {
      fetchDetails();
    }
  };

  const handleToggleDriverStatus = async (driverId: string, currentStatus: string) => {
    const newStatus = (currentStatus || '').toUpperCase() === 'ONLINE' ? 'BLOCKED' : 'ONLINE';
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, driver_status: newStatus } : d));
    try {
      await apiService.updateDriverAccountStatus(driverId, newStatus);
      showToast(`Driver status updated to ${newStatus}`, 'success');
    } catch (e) {
      fetchDetails();
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ErrorMessage message={error} onRetry={fetchDetails} />
      </View>
    );
  }

  if (!owner) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.textSecondary }}>Fleet not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={[styles.backButton, { backgroundColor: themeColors.background }]} hitSlop={10}>
            <ChevronLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>{owner.full_name}</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Fleet Account</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ThemeToggle size={20} />
            <StatusBadge status={owner.account_status} />
          </View>
        </View>
      </View>

      <View style={[styles.tabsRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {DETAIL_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, isActive && { backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Icon size={15} color={isActive ? themeColors.primary : themeColors.textSecondary} />
              <Text style={[styles.tabButtonText, { color: isActive ? themeColors.primary : themeColors.textSecondary, fontWeight: isActive ? '800' : '600' }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
      >
        {activeTab === 'overview' && (
        <>
        {/* 1. Profile */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <UserCircle size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Profile</Text>
            </View>
            <View style={styles.activeToggleRow}>
              <Text style={[styles.activeToggleLabel, { color: themeColors.textSecondary }]}>Active</Text>
              {updatingStatus ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Switch
                  value={owner.account_status?.toLowerCase() === 'active'}
                  onValueChange={handleToggleStatus}
                  trackColor={{ false: themeColors.border, true: themeColors.success }}
                />
              )}
            </View>
          </View>

          <View style={styles.detailRow}>
            <Phone size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>{owner.primary_number}</Text>
          </View>
          <View style={styles.detailRow}>
            <MapPin size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>{owner.address}, {owner.city} - {owner.pincode}</Text>
          </View>
          <View style={styles.detailRow}>
            <ShieldCheck size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>Aadhar: {owner.aadhar_number}</Text>
            {!!owner.aadhar_status && <StatusBadge status={owner.aadhar_status} type="document" />}
          </View>

          {/* Quick Contact Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: isDark ? themeColors.surfaceAlt : '#10B98115', borderColor: themeColors.success, borderWidth: 1, paddingVertical: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onPress={() => {
                if (owner.primary_number) Linking.openURL(`tel:${owner.primary_number}`);
              }}
            >
              <PhoneCall size={14} color={themeColors.success} />
              <Text style={{ color: themeColors.success, fontWeight: '800', fontSize: 13 }}>Call Owner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: isDark ? themeColors.surfaceAlt : '#25D36615', borderColor: '#25D366', borderWidth: 1, paddingVertical: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onPress={() => {
                if (owner.primary_number) {
                  const cleanPhone = owner.primary_number.replace(/[^\d]/g, '');
                  const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                  Linking.openURL(`https://wa.me/${fullPhone}`);
                }
              }}
            >
              <MessageSquare size={14} color="#25D366" />
              <Text style={{ color: '#25D366', fontWeight: '800', fontSize: 13 }}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: isDark ? themeColors.surfaceAlt : '#10B98115', borderColor: '#10B981', borderWidth: 1, marginBottom: 8 }]}
            onPress={handleShareWhatsAppSummary}
          >
            <MessageSquare size={16} color="#10B981" />
            <Text style={[styles.secondaryButtonText, { color: '#10B981' }]}>Send Fleet Statement on WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint }]} onPress={openDocuments}>
            <FileCheck size={16} color={themeColors.primary} />
            <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>View & Verify Documents</Text>
          </TouchableOpacity>
        </Card>

        {/* 2. Partner Tier & Subscription Status Card */}
        <Card style={[styles.card, { marginTop: 12 }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <ShieldCheck size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Partner Tier & Subscription</Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: themeColors.primary,
              }}
              onPress={() => {
                setSelectedTierTarget(owner.tier === 'PREFERRED' ? 'STANDARD' : 'PREFERRED');
                setTierOverrideReason(owner.trusted_override_reason || '');
                setTierModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: themeColors.primary, fontSize: 12, fontWeight: '700' }}>Change Tier</Text>
            </TouchableOpacity>
          </View>

          {/* Current Tier Pill & Source */}
          <View style={{
            backgroundColor: owner.tier === 'PREFERRED' ? (isDark ? '#064E3B33' : '#ECFDF5') : (isDark ? '#37415133' : '#F3F4F6'),
            padding: 12,
            borderRadius: 8,
            marginTop: 6,
            borderWidth: 1,
            borderColor: owner.tier === 'PREFERRED' ? '#10B98155' : themeColors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {owner.tier === 'PREFERRED' ? (
                  <ShieldCheck size={20} color="#10B981" />
                ) : (
                  <ShieldAlert size={20} color={themeColors.textSecondary} />
                )}
                <Text style={{ fontSize: 14, fontWeight: '800', color: owner.tier === 'PREFERRED' ? '#10B981' : themeColors.text }}>
                  {owner.tier === 'PREFERRED' ? 'TRUSTED PARTNER' : 'STANDARD PARTNER'}
                </Text>
              </View>
              <StatusPill
                label={owner.tier === 'PREFERRED' ? 'Trusted' : 'Standard'}
                variant={owner.tier === 'PREFERRED' ? 'success' : 'neutral'}
              />
            </View>

            {/* Tier Source Explanation */}
            <View style={{ marginTop: 8, gap: 4 }}>
              {owner.admin_trusted_override ? (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                    ★ Manual Override by Admin
                  </Text>
                  {!!owner.trusted_override_by && (
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      Updated by: <Text style={{ fontWeight: '600', color: themeColors.text }}>{owner.trusted_override_by}</Text>
                      {owner.trusted_override_at ? ` on ${new Date(owner.trusted_override_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  )}
                  {!!owner.trusted_override_reason && (
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary, fontStyle: 'italic' }}>
                      Reason: "{owner.trusted_override_reason}"
                    </Text>
                  )}
                </>
              ) : owner.billing_next_date && new Date(owner.billing_next_date) >= new Date() && !owner.billing_suspended ? (
                <Text style={{ fontSize: 12, color: themeColors.success, fontWeight: '600' }}>
                  ✓ Active Subscription (Auto Trusted until {owner.billing_next_date})
                </Text>
              ) : owner.billing_next_date && new Date(owner.billing_next_date) < new Date() ? (
                <Text style={{ fontSize: 12, color: themeColors.error, fontWeight: '600' }}>
                  ⚠ Subscription Expired on {owner.billing_next_date} (Auto reverted to Standard Tier)
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  ℹ Standard Free Tier (No active paid subscription)
                </Text>
              )}
            </View>
          </View>

          <View style={{ gap: 8, marginTop: 12 }}>
            <View style={styles.detailRow}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Plan Type:</Text>
              <Text style={{ fontWeight: '800', color: themeColors.text, fontSize: 13 }}>
                {owner.subscription_type === 'YEARLY' ? 'Yearly Maintenance Plan' : owner.subscription_type === 'MONTHLY' ? 'Monthly Plan (₹199/mo)' : 'Standard / Free'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Billing Status:</Text>
              <Text style={{
                fontWeight: '800',
                color: owner.billing_suspended ? themeColors.error : (owner.billing_next_date && new Date(owner.billing_next_date) < new Date() ? '#F59E0B' : themeColors.success),
                fontSize: 13
              }}>
                {owner.billing_suspended ? 'SUSPENDED' : (owner.billing_next_date && new Date(owner.billing_next_date) < new Date() ? 'EXPIRED' : 'ACTIVE')}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Next Renewal:</Text>
              <Text style={{ fontWeight: '700', color: themeColors.text, fontSize: 13 }}>{owner.billing_next_date || 'N/A'}</Text>
            </View>
          </View>
        </Card>
        </>
        )}

        {activeTab === 'wallet' && (
        <>
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <CalendarClock size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Yearly Maintenance Fee</Text>
            </View>
            {owner.billing_suspended && (
              <StatusPill label="Suspended" variant="danger" />
            )}
          </View>

          {owner.billing_next_date ? (
            <>
              <View style={styles.detailRow}>
                <CalendarClock size={15} color={themeColors.textSecondary} />
                <Text style={[styles.detailText, { color: themeColors.text }]}>
                  Due date: {new Date(owner.billing_next_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {typeof owner.yearly_fee === 'number' && owner.yearly_fee > 0 ? ` • ${formatCurrency(owner.yearly_fee)}` : ''}
                </Text>
              </View>
              {(() => {
                const days = Math.ceil((new Date(owner.billing_next_date as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const overdue = days < 0;
                return (
                  <Text style={[styles.detailText, { marginLeft: 23, color: overdue ? themeColors.error : (days <= 7 ? themeColors.warning : themeColors.textSecondary) }]}>
                    {overdue ? `Overdue by ${Math.abs(days)} day(s)` : `Due in ${days} day(s)`}
                  </Text>
                );
              })()}
            </>
          ) : (
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>Billing cycle not started for this account yet.</Text>
          )}

          <Text style={[styles.nonRefundableNote, { color: themeColors.textMuted }]}>
            This fee is non-refundable once charged.
          </Text>
        </Card>

        {/* 2. Wallet */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Wallet size={18} color={themeColors.success} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Wallet</Text>
            </View>
            <Text style={[styles.balanceText, { color: themeColors.success }]}>{formatCurrency(owner.wallet_balance)}</Text>
          </View>

          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[
                styles.segment,
                { backgroundColor: direction === 'credit' ? themeColors.success : themeColors.background, borderColor: direction === 'credit' ? themeColors.success : themeColors.border },
              ]}
              onPress={() => setDirection('credit')}
            >
              <Plus size={14} color={direction === 'credit' ? '#FFFFFF' : themeColors.textSecondary} />
              <Text style={[styles.segmentText, { color: direction === 'credit' ? '#FFFFFF' : themeColors.textSecondary }]}>Credit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                { backgroundColor: direction === 'debit' ? themeColors.error : themeColors.background, borderColor: direction === 'debit' ? themeColors.error : themeColors.border },
              ]}
              onPress={() => setDirection('debit')}
            >
              <Minus size={14} color={direction === 'debit' ? '#FFFFFF' : themeColors.textSecondary} />
              <Text style={[styles.segmentText, { color: direction === 'debit' ? '#FFFFFF' : themeColors.textSecondary }]}>Debit</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Amount (₹)"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Notes (optional)"
            placeholderTextColor={themeColors.textMuted}
            value={notes}
            onChangeText={setNotes}
          />
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColors.primary }, submittingWallet && styles.buttonDisabled]}
            onPress={handleWalletSubmit}
            disabled={submittingWallet}
          >
            {submittingWallet ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{direction === 'credit' ? 'Add Money' : 'Deduct Money'}</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* 2.5 Transaction Logs */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <History size={18} color="#6366F1" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Transaction Logs ({ledgerTotalCount})</Text>
          </View>
          {ledger.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No transactions recorded yet</Text>
          ) : (
            <>
              {ledger.map((entry) => (
                <View key={entry.id} style={[styles.listRow, { borderTopColor: themeColors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.listRowTitle, { color: entry.entry_type === 'CREDIT' ? themeColors.success : themeColors.error }]}>
                        {entry.entry_type === 'CREDIT' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </Text>
                      {!!entry.reference_type && (
                        <Text style={[styles.referenceTag, { backgroundColor: themeColors.background, color: themeColors.textSecondary }]}>{entry.reference_type.replace(/_/g, ' ')}</Text>
                      )}
                    </View>
                    {!!entry.notes && <Text style={[styles.listRowSubtitle, { color: themeColors.textSecondary }]}>{entry.notes}</Text>}
                    <Text style={[styles.listRowSubtitle, { color: themeColors.textMuted }]}>
                      Balance: {formatCurrency(entry.balance_after)} • {new Date(entry.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))}
              {ledger.length < ledgerTotalCount && (
                <TouchableOpacity
                  style={[styles.loadMoreButton, { borderColor: themeColors.border, backgroundColor: themeColors.background }, ledgerLoadingMore && styles.buttonDisabled]}
                  onPress={loadMoreLedger}
                  disabled={ledgerLoadingMore}
                >
                  {ledgerLoadingMore ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreButtonText, { color: themeColors.primary }]}>Load More ({ledgerTotalCount - ledger.length} remaining)</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </Card>
        </>
        )}

        {activeTab === 'settings' && (
        <>
        <Card style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <Settings size={18} color={themeColors.primary} />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Profile & Contact Settings</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Full Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Full Name"
            placeholderTextColor={themeColors.textMuted}
            value={editFullName}
            onChangeText={setEditFullName}
          />

          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Primary Phone Number</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Primary Phone (10 digits)"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="phone-pad"
            value={editPrimaryNumber}
            onChangeText={setEditPrimaryNumber}
          />

          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>City</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="City"
            placeholderTextColor={themeColors.textMuted}
            value={editCity}
            onChangeText={setEditCity}
          />

          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Aadhar Card Number</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Aadhar Number"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="number-pad"
            value={editAadhar}
            onChangeText={setEditAadhar}
          />

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColors.primary }, savingProfile && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Profile Settings</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* Password Management */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <Lock size={18} color="#F59E0B" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Password Management</Text>
          </View>

          <View style={{ marginBottom: 14 }}>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Original / Current Password</Text>
            <View style={[styles.passwordFieldRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Text style={[styles.passwordDisplayText, { color: themeColors.text }]}>
                {showCurrentPassword ? ((owner as any)?.current_password || 'Not set') : '••••••••'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                {showCurrentPassword ? <EyeOff size={18} color={themeColors.textSecondary} /> : <Eye size={18} color={themeColors.textSecondary} />}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Set New Password</Text>
          <View style={[styles.passwordFieldRow, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: 10 }]}>
            <TextInput
              style={[styles.passwordInputInner, { color: themeColors.text }]}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry={!showNewPassword}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword(!showNewPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              {showNewPassword ? <EyeOff size={18} color={themeColors.textSecondary} /> : <Eye size={18} color={themeColors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <View style={[styles.passwordFieldRow, { backgroundColor: themeColors.background, borderColor: themeColors.border, marginBottom: 14 }]}>
            <TextInput
              style={[styles.passwordInputInner, { color: themeColors.text }]}
              placeholder="Confirm new password"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              {showConfirmPassword ? <EyeOff size={18} color={themeColors.textSecondary} /> : <Eye size={18} color={themeColors.textSecondary} />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: themeColors.primary }, resettingPassword && styles.buttonDisabled]}
            onPress={handlePasswordReset}
            disabled={resettingPassword}
          >
            {resettingPassword ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* Danger Zone */}
        <Card style={[styles.card, { borderColor: themeColors.error, borderWidth: 1.5 }]}>
          <View style={styles.cardHeaderLeft}>
            <AlertTriangle size={18} color={themeColors.error} />
            <Text style={[styles.cardTitle, { color: themeColors.error }]}>Account Actions & Danger Zone</Text>
          </View>
          <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
            Temporarily block access or permanently delete this fleet owner account from the system.
          </Text>

          <TouchableOpacity
            style={[
              styles.dangerButton,
              isAccountBlocked ? { backgroundColor: themeColors.success } : { backgroundColor: themeColors.error },
              updatingStatus && styles.buttonDisabled,
            ]}
            onPress={handleToggleBlockAccount}
            disabled={updatingStatus}
            activeOpacity={0.8}
          >
            {updatingStatus ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {isAccountBlocked ? <ShieldCheck size={16} color="#FFFFFF" /> : <ShieldAlert size={16} color="#FFFFFF" />}
                <Text style={styles.dangerButtonText}>
                  {isAccountBlocked ? 'Unblock Fleet Account' : 'Block Fleet Account'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.dangerOutlineButton,
              { borderColor: themeColors.error, backgroundColor: isDark ? themeColors.surfaceAlt : '#FEF2F2' },
              deletingAccount && styles.buttonDisabled,
            ]}
            onPress={handlePermanentDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.8}
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color={themeColors.error} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Trash2 size={16} color={themeColors.error} />
                <Text style={[styles.dangerOutlineButtonText, { color: themeColors.error }]}>Permanently Delete Account</Text>
              </View>
            )}
          </TouchableOpacity>
        </Card>
        </>
        )}

        {activeTab === 'fleet' && (
        <>
        {/* Cars List */}
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Car size={18} color="#D97706" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>Cars ({cars.length})</Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#D97706',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
              }}
              onPress={() => setAddCarModalVisible(true)}
              activeOpacity={0.8}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>+ Add Car</Text>
            </TouchableOpacity>
          </View>
          {cars.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 14, gap: 10 }}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No cars registered in this fleet yet.</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isDark ? '#D9770622' : '#FEF3C7',
                  borderColor: '#D97706',
                  borderWidth: 1.5,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
                onPress={() => setAddCarModalVisible(true)}
                activeOpacity={0.8}
              >
                <Plus size={15} color="#D97706" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#D97706' }}>+ Register / Add Car</Text>
              </TouchableOpacity>
            </View>
          ) : (
            cars.map((car) => {
              const isOnline = (car.car_status || '').toUpperCase() === 'ONLINE';
              return (
                <TouchableOpacity key={car.id} style={[styles.listRow, { borderTopColor: themeColors.border }]} onPress={() => openCarDocuments(car)} activeOpacity={0.85}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowTitle, { color: themeColors.text }]}>{car.car_name}</Text>
                    <Text style={[styles.listRowSubtitle, { color: themeColors.textSecondary }]}>{car.car_number} • {car.car_type}</Text>
                    <RatingBadge ratingAvg={car.rating_avg} ratingCount={car.rating_count} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <StatusBadge status={car.car_status} type="car" />
                    <Switch
                      value={isOnline}
                      onValueChange={() => handleToggleCarStatus(car.id, car.car_status)}
                      trackColor={{ false: '#EF444460', true: '#10B98160' }}
                      thumbColor={isOnline ? '#10B981' : '#EF4444'}
                      style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                    />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </Card>

        {/* Drivers List */}
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <UserCircle size={18} color="#8B5CF6" />
              <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>Drivers ({drivers.length})</Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#8B5CF6',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
              }}
              onPress={() => setAddDriverModalVisible(true)}
              activeOpacity={0.8}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>+ Add Driver</Text>
            </TouchableOpacity>
          </View>
          {drivers.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 14, gap: 10 }}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>No drivers registered in this fleet yet.</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isDark ? '#8B5CF622' : '#F5F3FF',
                  borderColor: '#8B5CF6',
                  borderWidth: 1.5,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
                onPress={() => setAddDriverModalVisible(true)}
                activeOpacity={0.8}
              >
                <Plus size={15} color="#8B5CF6" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#8B5CF6' }}>+ Register / Add Driver</Text>
              </TouchableOpacity>
            </View>
          ) : (
            drivers.map((driver) => {
              const isOnline = (driver.driver_status || '').toUpperCase() === 'ONLINE';
              return (
                <TouchableOpacity key={driver.id} style={[styles.listRow, { borderTopColor: themeColors.border }]} onPress={() => openDriverDocuments(driver)} activeOpacity={0.85}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowTitle, { color: themeColors.text }]}>{driver.full_name}</Text>
                    <Text style={[styles.listRowSubtitle, { color: themeColors.textSecondary }]}>{driver.primary_number} • Licence: {driver.licence_number}</Text>
                    <RatingBadge ratingAvg={driver.rating_avg} ratingCount={driver.rating_count} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <StatusBadge status={driver.driver_status} type="driver" />
                    <Switch
                      value={isOnline}
                      onValueChange={() => handleToggleDriverStatus(driver.id, driver.driver_status)}
                      trackColor={{ false: '#EF444460', true: '#10B98160' }}
                      thumbColor={isOnline ? '#10B981' : '#EF4444'}
                      style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                    />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </Card>

        {/* Fleet Transfer & Swap (T5 / T6) */}
        <Card style={[styles.card, { borderColor: '#8B5CF640', borderWidth: 1.5 }]}>
          <View style={styles.cardHeaderLeft}>
            <ArrowLeftRight size={18} color="#8B5CF6" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Fleet Transfer & Swap</Text>
          </View>
          <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 12, lineHeight: 18 }}>
            Transfer an existing Duty Driver or registered Car to {owner.full_name}'s fleet. Secure OTP verification and Owner-Admin overrides supported.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.secondaryButton, { flex: 1, backgroundColor: isDark ? '#8B5CF620' : '#F5F3FF', borderColor: '#8B5CF6', borderWidth: 1 }]}
              onPress={() => handleOpenSwapModal('DRIVER')}
              activeOpacity={0.8}
            >
              <UserCircle size={16} color="#8B5CF6" />
              <Text style={[styles.secondaryButtonText, { color: '#8B5CF6', fontWeight: '700' }]}>Swap Driver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { flex: 1, backgroundColor: isDark ? '#3B82F620' : '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1 }]}
              onPress={() => handleOpenSwapModal('CAR')}
              activeOpacity={0.8}
            >
              <Car size={16} color="#3B82F6" />
              <Text style={[styles.secondaryButtonText, { color: '#3B82F6', fontWeight: '700' }]}>Swap Car</Text>
            </TouchableOpacity>
          </View>
        </Card>
        </>
        )}
      </ScrollView>

      {/* Modal for Changing Partner Tier Override */}
      <Modal
        visible={tierModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTierModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <ShieldCheck size={22} color={themeColors.primary} />
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Change Partner Tier</Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Manually set partner tier for {owner?.full_name}. This action will be audited with your admin username and timestamp.
            </Text>

            {/* Target Tier Picker */}
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
              <TouchableOpacity
                style={[
                  styles.tierOptionCard,
                  selectedTierTarget === 'PREFERRED' && { borderColor: '#10B981', backgroundColor: isDark ? '#064E3B33' : '#ECFDF5' },
                  { borderColor: selectedTierTarget === 'PREFERRED' ? '#10B981' : themeColors.border }
                ]}
                onPress={() => setSelectedTierTarget('PREFERRED')}
                activeOpacity={0.8}
              >
                <ShieldCheck size={20} color={selectedTierTarget === 'PREFERRED' ? '#10B981' : themeColors.textSecondary} />
                <Text style={{ fontWeight: '800', fontSize: 13, color: selectedTierTarget === 'PREFERRED' ? '#10B981' : themeColors.text }}>Trusted Partner</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, textAlign: 'center' }}>Priority booking access & network posting</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tierOptionCard,
                  selectedTierTarget === 'STANDARD' && { borderColor: themeColors.primary, backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint },
                  { borderColor: selectedTierTarget === 'STANDARD' ? themeColors.primary : themeColors.border }
                ]}
                onPress={() => setSelectedTierTarget('STANDARD')}
                activeOpacity={0.8}
              >
                <ShieldAlert size={20} color={selectedTierTarget === 'STANDARD' ? themeColors.primary : themeColors.textSecondary} />
                <Text style={{ fontWeight: '800', fontSize: 13, color: selectedTierTarget === 'STANDARD' ? themeColors.primary : themeColors.text }}>Standard Partner</Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary, textAlign: 'center' }}>Default free tier with standard features</Text>
              </TouchableOpacity>
            </View>

            {/* Upgrade the proper way: choose Monthly/Yearly and take payment (wallet, UPI/bank/cash, or a WhatsApp payment link) */}
            {selectedTierTarget === 'PREFERRED' && (
              <TouchableOpacity
                style={{
                  marginBottom: 16,
                  padding: 14,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: '#10B981',
                  backgroundColor: isDark ? '#064E3B33' : '#ECFDF5',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
                onPress={() => {
                  setTierModalVisible(false);
                  router.push({ pathname: '/fleet-subscriptions', params: { search: owner?.primary_number || '', openPay: '1' } } as any);
                }}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 13.5, color: '#047857' }}>Upgrade with payment (Monthly / Yearly)</Text>
                  <Text style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 3, lineHeight: 15 }}>
                    Wallet, UPI / bank / cash, or send a payment link on WhatsApp. Activates automatically.
                  </Text>
                </View>
                <ChevronRight size={18} color="#10B981" />
              </TouchableOpacity>
            )}

            {/* Reason Input */}
            <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Reason for Update <Text style={{ color: themeColors.error }}>*</Text></Text>
            <TextInput
              style={[
                styles.textAreaInput,
                {
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                },
              ]}
              placeholder="e.g., Verified fleet documents, Long-term trusted partner, Trial promo, etc."
              placeholderTextColor={themeColors.textSecondary}
              value={tierOverrideReason}
              onChangeText={setTierOverrideReason}
              multiline
              numberOfLines={3}
            />

            {/* Modal Actions */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                onPress={() => setTierModalVisible(false)}
                disabled={submittingTier}
              >
                <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: themeColors.primary }, submittingTier && styles.buttonDisabled]}
                onPress={handleSaveTierOverride}
                disabled={submittingTier}
              >
                {submittingTier ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save Partner Tier</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal for Fleet Driver / Car Swap (T5 / T6) */}
      <Modal
        visible={swapModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSwapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <ArrowLeftRight size={22} color="#8B5CF6" />
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {swapStep === 'REQUEST' ? `Initiate ${swapType === 'DRIVER' ? 'Driver' : 'Car'} Swap` : swapStep === 'VERIFY' ? 'Enter 6-Digit OTP' : 'Admin Override Swap'}
              </Text>
            </View>

            {swapStep === 'REQUEST' && (
              <>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  Transfer {swapType === 'DRIVER' ? 'a driver' : 'a car'} to <Text style={{ fontWeight: '700', color: themeColors.text }}>{owner?.full_name}</Text>.
                  An OTP will be dispatched to the {swapType === 'DRIVER' ? "driver's phone" : "current car owner's phone"}.
                </Text>

                <Text style={[styles.fieldLabel, { color: themeColors.text, marginTop: 12 }]}>
                  {swapType === 'DRIVER' ? 'Driver UUID or Phone Number' : 'Car Plate Number (e.g. TN01AB1234)'} <Text style={{ color: themeColors.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder={swapType === 'DRIVER' ? 'Enter Driver ID / Mobile' : 'Enter Car Registration Number'}
                  placeholderTextColor={themeColors.textSecondary}
                  value={swapTargetInput}
                  onChangeText={setSwapTargetInput}
                  autoCapitalize={swapType === 'CAR' ? 'characters' : 'none'}
                />

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                    onPress={() => setSwapModalVisible(false)}
                    disabled={swapSubmitting}
                  >
                    <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: '#8B5CF6' }, swapSubmitting && styles.buttonDisabled]}
                    onPress={handleInitiateSwap}
                    disabled={swapSubmitting}
                  >
                    {swapSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalConfirmText}>Request Swap OTP</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {swapStep === 'VERIFY' && (
              <>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {swapInfo || `A 6-digit OTP has been sent to the ${swapType === 'DRIVER' ? 'driver' : 'current owner'}. Enter it below to complete the transfer.`}
                </Text>

                <Text style={[styles.fieldLabel, { color: themeColors.text, marginTop: 12 }]}>6-Digit OTP <Text style={{ color: themeColors.error }}>*</Text></Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text, letterSpacing: 4, textAlign: 'center', fontSize: 18, fontWeight: '800' }]}
                  placeholder="••••••"
                  placeholderTextColor={themeColors.textSecondary}
                  value={swapOtp}
                  onChangeText={setSwapOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <TouchableOpacity
                  onPress={() => setSwapStep('OVERRIDE')}
                  style={{ alignSelf: 'center', marginVertical: 8 }}
                >
                  <Text style={{ color: themeColors.error, fontSize: 12, fontWeight: '700' }}>
                    Owner/Driver unavailable? Use Admin Override →
                  </Text>
                </TouchableOpacity>

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                    onPress={() => setSwapStep('REQUEST')}
                    disabled={swapSubmitting}
                  >
                    <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: '#10B981' }, swapSubmitting && styles.buttonDisabled]}
                    onPress={handleVerifySwap}
                    disabled={swapSubmitting}
                  >
                    {swapSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalConfirmText}>Verify & Complete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {swapStep === 'OVERRIDE' && (
              <>
                <Text style={[styles.modalSubtitle, { color: themeColors.error }]}>
                  ⚠️ Admin Override bypasses OTP verification. Requires Owner admin privileges and is permanently logged in the audit ledger.
                </Text>

                <Text style={[styles.fieldLabel, { color: themeColors.text, marginTop: 12 }]}>Override Reason (min 10 chars) <Text style={{ color: themeColors.error }}>*</Text></Text>
                <TextInput
                  style={[styles.textAreaInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="Detailed justification for manual swap override..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={overrideReason}
                  onChangeText={setOverrideReason}
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                    onPress={() => setSwapStep('VERIFY')}
                    disabled={swapSubmitting}
                  >
                    <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Back to OTP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: themeColors.error }, swapSubmitting && styles.buttonDisabled]}
                    onPress={handleAdminOverride}
                    disabled={swapSubmitting}
                  >
                    {swapSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalConfirmText}>Execute Override</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Manual Car Addition Modal for this Fleet Owner */}
      {owner && (
        <AdminAddCarModal
          visible={addCarModalVisible}
          onClose={() => setAddCarModalVisible(false)}
          vehicleOwnerId={owner.vehicle_owner_id}
          ownerName={owner.full_name}
          onSuccess={fetchDetails}
        />
      )}

      {/* Manual Driver Addition Modal for this Fleet Owner */}
      {owner && (
        <AdminAddDriverModal
          visible={addDriverModalVisible}
          onClose={() => setAddDriverModalVisible(false)}
          vehicleOwnerId={owner.vehicle_owner_id}
          ownerName={owner.full_name}
          ownerPhone={owner.primary_number}
          ownerCity={owner.city}
          ownerAddress={owner.address}
          onSuccess={fetchDetails}
        />
      )}

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tabButtonText: {
    fontSize: 12,
  },
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, marginTop: 1, fontWeight: '500' },
  card: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  activeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeToggleLabel: { fontSize: 12, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailText: { fontSize: 13, flex: 1, fontWeight: '500' },
  balanceText: { fontSize: 18, fontWeight: '800' },
  nonRefundableNote: { fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  secondaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 6, paddingVertical: 10, borderRadius: 8,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 8,
    borderWidth: 1,
  },
  segmentText: { fontSize: 13, fontWeight: '700' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 10,
  },
  primaryButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 13, paddingVertical: 8 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  listRowTitle: { fontSize: 14, fontWeight: '700' },
  listRowSubtitle: { fontSize: 12, marginTop: 1 },
  referenceTag: {
    fontSize: 10.5, fontWeight: '700',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    textTransform: 'capitalize',
  },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3,
  },
  ratingBadgeText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  dangerButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerOutlineButton: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerOutlineButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  passwordFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 46,
  },
  passwordDisplayText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  passwordInputInner: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  tierOptionCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  textAreaInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
