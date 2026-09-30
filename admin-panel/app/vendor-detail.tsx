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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Phone,
  MapPin,
  Wallet,
  Building2,
  Lock,
  FileCheck,
  Plus,
  Minus,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  CreditCard,
  History,
  Eye,
  EyeOff,
  Sliders,
  UserCheck,
  Package,
  ChevronRight,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, resetUserPassword } from '@/services/api';
import StatusBadge from '@/components/StatusBadge';
import ErrorMessage from '@/components/ErrorMessage';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, Btn } from '@/components/ui';

interface VendorProfile {
  id: string;
  vendor_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string | null;
  gpay_number: string;
  wallet_balance: number;
  bank_balance: number;
  aadhar_number: string;
  aadhar_status?: string | null;
  address: string;
  city: string;
  pincode: string;
  account_status: string;
  current_password?: string | null;
  allow_vendor_as_customer?: boolean;
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

export default function VendorDetailScreen() {
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  const { toast, showToast } = useToast();
  const { isDark, themeColors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [vendorBookings, setVendorBookings] = useState<any[]>([]);
  const [vendorBookingsTotal, setVendorBookingsTotal] = useState(0);
  const [vendorBookingsLoading, setVendorBookingsLoading] = useState(true);
  const [allowVendorAsCustomer, setAllowVendorAsCustomer] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const isAccountBlocked = (vendor?.account_status || '').toUpperCase() === 'BLOCKED';

  const handleToggleBlockAccount = () => {
    if (!vendor) return;
    const nextStatus = isAccountBlocked ? 'Active' : 'Blocked';
    Alert.alert(
      isAccountBlocked ? 'Unblock Vendor Account' : 'Block Vendor Account',
      isAccountBlocked
        ? `Are you sure you want to unblock ${vendor.full_name}'s vendor account? They will regain access to post and manage bookings.`
        : `Are you sure you want to block ${vendor.full_name}'s vendor account? They will be locked out from logging in and posting bookings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isAccountBlocked ? 'Unblock Account' : 'Block Account',
          style: isAccountBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              await apiService.updateVendorAccountStatus(vendor.vendor_id, nextStatus);
              setVendor(prev => prev ? { ...prev, account_status: nextStatus } : null);
              showToast(`Vendor account ${isAccountBlocked ? 'unblocked' : 'blocked'} successfully!`, 'success');
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
    if (!vendor) return;
    Alert.alert(
      'Permanently Delete Vendor Account',
      `Are you sure you want to permanently delete ${vendor.full_name}'s vendor account?\n\nThis action cannot be undone and will completely remove this vendor from the platform.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await apiService.deleteAccount(vendor.vendor_id, 'vendor');
              showToast('Vendor account permanently deleted.', 'success');
              setTimeout(() => {
                router.replace('/(tabs)/settings');
              }, 600);
            } catch (err: any) {
              Alert.alert('Cannot Delete Account', err?.message || 'Failed to permanently delete vendor account.');
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const fetchDetails = useCallback(async () => {
    if (!vendorId) return;
    setError(null);
    try {
      const data = await apiService.getVendorDetails(vendorId);
      const privKey = `@vendor_privilege_self_customer_${vendorId}`;
      const savedPriv = await AsyncStorage.getItem(privKey);
      const isAllowed = savedPriv === 'true' || Boolean(data?.allow_vendor_as_customer);
      setAllowVendorAsCustomer(isAllowed);
      setVendor({ ...data, allow_vendor_as_customer: isAllowed });
      apiService.getVendorLedger(vendorId).then((res) => setLedger(res.entries || [])).catch(() => setLedger([]));
      setVendorBookingsLoading(true);
      apiService.getOrders(0, 20, 'newest', vendorId)
        .then((res) => { setVendorBookings(res.orders || []); setVendorBookingsTotal(res.total_count || 0); })
        .catch(() => { setVendorBookings([]); setVendorBookingsTotal(0); })
        .finally(() => setVendorBookingsLoading(false));
    } catch (err: any) {
      setError(err?.message || 'Failed to load vendor details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorId]);

  const handleToggleVendorAsCustomerPrivilege = async (val: boolean) => {
    setAllowVendorAsCustomer(val);
    setVendor(prev => prev ? { ...prev, allow_vendor_as_customer: val } : null);
    if (vendorId) {
      const privKey = `@vendor_privilege_self_customer_${vendorId}`;
      await AsyncStorage.setItem(privKey, val ? 'true' : 'false');
    }
    showToast(
      val
        ? 'Vendor as Customer auto-fill ENABLED for this vendor.'
        : 'Vendor as Customer auto-fill DISABLED for this vendor.',
      'success'
    );
  };

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDetails();
  };

  const handleToggleStatus = async (value: boolean) => {
    if (!vendor) return;
    const newStatus = value ? 'Active' : 'Inactive';
    setUpdatingStatus(true);
    try {
      await apiService.updateVendorAccountStatus(vendor.vendor_id, newStatus);
      setVendor({ ...vendor, account_status: newStatus });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update account status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleWalletSubmit = async () => {
    if (!vendor) return;
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Enter a valid positive whole-rupee amount');
      return;
    }
    setSubmittingWallet(true);
    try {
      const result = await apiService.adjustWallet({
        role: 'vendor',
        target_id: vendor.vendor_id,
        direction,
        amount: numAmount,
        notes: notes.trim() || undefined,
      });
      setVendor({ ...vendor, wallet_balance: result.new_wallet_balance });
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
    if (!vendor) return;
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
      await resetUserPassword('Vendor', vendor.vendor_id, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast(`Password reset for ${vendor.full_name}.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const openDocuments = () => {
    if (!vendor) return;
    router.push({
      pathname: '/account-documents',
      params: { accountId: vendor.vendor_id, accountType: 'vendor', accountName: vendor.full_name },
    });
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

  if (!vendor) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.textSecondary }}>Vendor not found</Text>
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
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>{vendor.full_name}</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>Vendor Account</Text>
          </View>
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
            <StatusBadge status={vendor.account_status} />
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
      >
        {/* 1. Profile */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Building2 size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Profile</Text>
            </View>
            <View style={styles.activeToggleRow}>
              <Text style={[styles.activeToggleLabel, { color: themeColors.textSecondary }]}>Active</Text>
              {updatingStatus ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Switch
                  value={vendor.account_status?.toLowerCase() === 'active'}
                  onValueChange={handleToggleStatus}
                  trackColor={{ false: themeColors.border, true: themeColors.success }}
                />
              )}
            </View>
          </View>

          <View style={styles.detailRow}>
            <Phone size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>{vendor.primary_number}</Text>
          </View>
          <View style={styles.detailRow}>
            <MapPin size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>{vendor.address}, {vendor.city} - {vendor.pincode}</Text>
          </View>
          <View style={styles.detailRow}>
            <CreditCard size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>GPay: {vendor.gpay_number} • Bank: {formatCurrency(vendor.bank_balance)}</Text>
          </View>
          <View style={styles.detailRow}>
            <ShieldCheck size={15} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.text }]}>Aadhar: {vendor.aadhar_number}</Text>
            {!!vendor.aadhar_status && <StatusBadge status={vendor.aadhar_status} type="document" />}
          </View>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.primaryTint }]} onPress={openDocuments}>
            <FileCheck size={16} color={themeColors.primary} />
            <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>View & Verify Documents</Text>
          </TouchableOpacity>
        </Card>

        {/* Feature Permissions: Vendor as Customer */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Sliders size={18} color={themeColors.primary} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Feature Permissions</Text>
            </View>
            <StatusPill
              status={allowVendorAsCustomer ? 'Active' : 'Disabled'}
              variant={allowVendorAsCustomer ? 'success' : 'neutral'}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <View style={{ flex: 1, marginRight: 14 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: themeColors.text }}>
                "Vendor as Customer" Auto-Fill
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 3, lineHeight: 17 }}>
                {allowVendorAsCustomer
                  ? 'Active: This vendor is permitted to check the "Vendor" box and auto-fill contact details in their app.'
                  : 'Disabled: The "Vendor" auto-fill checkbox will remain hidden for this vendor.'}
              </Text>
            </View>
            <Switch
              value={allowVendorAsCustomer}
              onValueChange={handleToggleVendorAsCustomerPrivilege}
              trackColor={{ false: themeColors.border, true: themeColors.success }}
            />
          </View>
        </Card>

        {/* 2. Wallet */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Wallet size={18} color={themeColors.success} />
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>Wallet</Text>
            </View>
            <Text style={[styles.balanceText, { color: themeColors.success }]}>{formatCurrency(vendor.wallet_balance)}</Text>
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
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Transaction Logs ({ledger.length})</Text>
          </View>
          {ledger.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No transactions recorded yet</Text>
          ) : (
            ledger.map((entry) => (
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
            ))
          )}
        </Card>

        {/* 2.6 Bookings Posted - what this vendor has posted, tap a row for
            full details (backend: GET /admin/orders?vendor_id=... - the
            same list-all-orders endpoint, just filtered). */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <Package size={18} color="#0EA5E9" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Bookings Posted ({vendorBookingsTotal})</Text>
          </View>
          {vendorBookingsLoading ? (
            <ActivityIndicator size="small" color={themeColors.primary} style={{ marginVertical: 10 }} />
          ) : vendorBookings.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No bookings posted yet</Text>
          ) : (
            vendorBookings.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.listRow, { borderTopColor: themeColors.border }]}
                onPress={() => router.push(`/trip-detail?orderId=${o.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.listRowTitle, { color: themeColors.text }]}>#{o.id} · {o.customer_name || 'Customer'}</Text>
                    <StatusBadge status={o.trip_status || 'N/A'} type="order" />
                  </View>
                  <Text style={[styles.listRowSubtitle, { color: themeColors.textSecondary }]}>
                    {o.trip_type || ''}{o.car_type ? ` · ${String(o.car_type).replace(/_/g, ' ')}` : ''}
                  </Text>
                  <Text style={[styles.listRowSubtitle, { color: themeColors.textMuted }]}>
                    {formatCurrency(o.vendor_price ?? o.estimated_price ?? 0)} • {o.start_date_time ? new Date(o.start_date_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                  </Text>
                </View>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            ))
          )}
          {vendorBookingsTotal > 0 && (
            <TouchableOpacity
              style={{ paddingVertical: 10, alignItems: 'center' }}
              onPress={() => router.push({ pathname: '/vendor-bookings', params: { vendorId, vendorName: vendor?.full_name || '' } } as any)}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: themeColors.primary }}>
                Open all {vendorBookingsTotal} bookings with stats & filters →
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* 3. Password Management */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderLeft}>
            <Lock size={18} color="#F59E0B" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Password Management</Text>
          </View>

          {/* Original / Current Password */}
          <View style={{ marginBottom: 14 }}>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Original / Current Password</Text>
            <View style={[styles.passwordFieldRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <Text style={[styles.passwordDisplayText, { color: themeColors.text }]}>
                {showCurrentPassword ? (vendor?.current_password || 'Not set') : '••••••••'}
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

        {/* 4. Danger Zone */}
        <Card style={[styles.card, { borderColor: themeColors.error, borderWidth: 1.5 }]}>
          <View style={styles.cardHeaderLeft}>
            <AlertTriangle size={18} color={themeColors.error} />
            <Text style={[styles.cardTitle, { color: themeColors.error }]}>Account Actions & Danger Zone</Text>
          </View>
          <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
            Temporarily block access or permanently delete this vendor account from the platform.
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
                  {isAccountBlocked ? 'Unblock Vendor Account' : 'Block Vendor Account'}
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
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
