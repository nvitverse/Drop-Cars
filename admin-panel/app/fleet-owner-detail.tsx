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
} from 'lucide-react-native';
import { apiService, resetUserPassword } from '@/services/api';
import StatusBadge from '@/components/StatusBadge';
import ErrorMessage from '@/components/ErrorMessage';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, Btn } from '@/components/ui';

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
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>{owner.full_name}</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Fleet Account</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemeToggle size={20} />
              <TouchableOpacity
                style={{
                  backgroundColor: themeColors.primary,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
                onPress={openDocuments}
                activeOpacity={0.8}
              >
                <FileCheck size={13} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>Docs</Text>
              </TouchableOpacity>
              <StatusBadge status={owner.account_status} />
            </View>
            {!!owner.tier && (
              <StatusPill label={owner.tier === 'PREFERRED' ? 'Trusted' : 'Standard'} variant={owner.tier === 'PREFERRED' ? 'info' : 'neutral'} />
            )}
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

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint }]} onPress={openDocuments}>
            <FileCheck size={16} color={themeColors.primary} />
            <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>View & Verify Documents</Text>
          </TouchableOpacity>
        </Card>

        {/* Subscription Status Card */}
        <Card style={[styles.card, { marginTop: 12 }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <ShieldCheck size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Subscription Status</Text>
            </View>
            <StatusPill label={owner.subscription_type || 'FREE'} variant={owner.subscription_type ? 'success' : 'neutral'} />
          </View>

          <View style={{ gap: 8, marginTop: 8 }}>
            <View style={styles.detailRow}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Current Tier:</Text>
              <Text style={{ fontWeight: '800', color: themeColors.text, fontSize: 13 }}>
                {owner.subscription_type === 'YEARLY' ? 'PRO (Yearly)' : owner.subscription_type === 'MONTHLY' ? 'PRO (Monthly)' : 'FREE / STANDARD'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>Status:</Text>
              <Text style={{ fontWeight: '800', color: owner.billing_suspended ? themeColors.error : themeColors.success, fontSize: 13 }}>
                {owner.billing_suspended ? 'SUSPENDED' : 'ACTIVE'}
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
          <View style={styles.cardHeaderLeft}>
            <Car size={18} color={themeColors.warning} />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Cars ({cars.length})</Text>
          </View>
          {cars.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No cars registered</Text>
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
          <View style={styles.cardHeaderLeft}>
            <UserCircle size={18} color="#8B5CF6" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Drivers ({drivers.length})</Text>
          </View>
          {drivers.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No drivers registered</Text>
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
        </>
        )}
      </ScrollView>
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
});
