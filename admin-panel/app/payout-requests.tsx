import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Wallet, Check, X, Plus, Search, Car, Building2 } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Fleet drivers'/vendors' self-serve cash-out requests (Settings > Wallet), plus
// admin-initiated direct payouts. Manual settlement - admin pays the owner/vendor
// outside the app, then marks it here. Same pattern as every other manual-money
// flow in this codebase.
interface PayoutRequestRow {
  id: number;
  vehicle_owner_id: string | null;
  vendor_id: string | null;
  role: 'VEHICLE_OWNER' | 'VENDOR';
  amount: number;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  requested_at: string;
  processed_at?: string | null;
  notes?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  paid_via?: string | null;
  initiated_by_admin: boolean;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_account_holder_name?: string | null;
  upi_id?: string | null;
  gpay_number?: string | null;
}

type PaidVia = 'WALLET' | 'UPI' | 'BANK';
type DirectPayRole = 'vehicle_owner' | 'vendor';

interface WalletTarget {
  role: string;
  id: string;
  reg_id?: string | null;
  full_name: string;
  primary_number: string;
  wallet_balance: number;
  account_status: string;
}

const TABS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REJECTED', label: 'Rejected' },
];

const PAGE_SIZE = 50;

export default function PayoutRequestsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [activeTab, setActiveTab] = useState('PENDING');
  const [requests, setRequests] = useState<PayoutRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skipCount, setSkipCount] = useState(0);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PayoutRequestRow | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Mark Paid modal (lets admin pick UPI/Bank before confirming)
  const [payTarget, setPayTarget] = useState<PayoutRequestRow | null>(null);
  const [payVia, setPayVia] = useState<PaidVia | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // Pay Directly modal (admin-initiated payout, no prior request)
  const [directPayVisible, setDirectPayVisible] = useState(false);
  const [directRole, setDirectRole] = useState<DirectPayRole>('vehicle_owner');
  const [directSearchNumber, setDirectSearchNumber] = useState('');
  const [directTarget, setDirectTarget] = useState<WalletTarget | null>(null);
  const [directSearching, setDirectSearching] = useState(false);
  const [directAmount, setDirectAmount] = useState('');
  const [directRemark, setDirectRemark] = useState('');
  const [directPaidVia, setDirectPaidVia] = useState<PaidVia | null>(null);
  const [directSubmitting, setDirectSubmitting] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  const fetchRequests = useCallback(async (statusFilter: string, skip: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true);
      const data = await apiService.getPayoutRequests(statusFilter, skip, PAGE_SIZE);
      const items = data || [];
      setRequests(prev => (append ? [...prev, ...items] : items));
      setHasMore(items.length === PAGE_SIZE);
      setSkipCount(skip + items.length);
    } catch (e: any) {
      const msg = e?.message === 'Failed to fetch'
        ? 'Network error: Failed to connect to server. Please check backend.'
        : (e?.message || 'Failed to load payout requests');
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [showToast]);

  useEffect(() => {
    setLoading(true);
    setSkipCount(0);
    fetchRequests(activeTab, 0, false);
  }, [activeTab, fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests(activeTab, 0, false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchRequests(activeTab, skipCount, true);
    }
  };

  const handleMarkPaid = (req: PayoutRequestRow) => {
    setPayVia(null);
    setPayError(null);
    setPayTarget(req);
  };

  // Jumps to Finance & Wallet with the target/amount/remarks already filled
  // in and Credit selected - staff just has to glance and tap. That screen
  // marks THIS request Paid automatically once the credit succeeds, so it
  // can never also be paid via UPI/Bank afterwards.
  const handleAddToWallet = (req: PayoutRequestRow) => {
    if (!req.owner_phone) {
      showToast('No phone number on file for this account - cannot open Wallet.', 'error');
      return;
    }
    router.push({
      pathname: '/(tabs)/wallet',
      params: {
        prefillRole: req.role === 'VENDOR' ? 'vendor' : 'vehicle_owner',
        prefillPhone: req.owner_phone,
        prefillAmount: String(req.amount),
        prefillNotes: `Payout request #${req.id} paid via wallet`,
        prefillDirection: 'credit',
        sourcePayoutRequestId: String(req.id),
      },
    } as any);
  };

  const submitMarkPaid = async () => {
    if (!payTarget) return;
    setActioningId(payTarget.id);
    setPayError(null);
    try {
      await apiService.markPayoutPaid(payTarget.id, undefined, payVia || undefined);
      setPayTarget(null);
      setPayVia(null);
      showToast('Payout marked as paid successfully', 'success');
      fetchRequests(activeTab, 0, false);
    } catch (e: any) {
      const errorMsg = e?.message === 'Failed to fetch'
        ? 'Network error: Server unavailable. Check backend connection.'
        : (e?.message || 'Failed to mark as paid');
      setPayError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const resetDirectPayForm = () => {
    setDirectRole('vehicle_owner');
    setDirectSearchNumber('');
    setDirectTarget(null);
    setDirectAmount('');
    setDirectRemark('');
    setDirectPaidVia(null);
    setDirectError(null);
  };

  const openDirectPay = () => {
    resetDirectPayForm();
    setDirectPayVisible(true);
  };

  const handleDirectRoleChange = (role: DirectPayRole) => {
    setDirectRole(role);
    setDirectTarget(null);
    setDirectSearchNumber('');
    setDirectError(null);
  };

  const handleDirectSearch = async () => {
    if (!directSearchNumber.trim() || directSearchNumber.trim().length < 10) {
      setDirectError('Please enter a valid 10-digit mobile number');
      return;
    }
    setDirectSearching(true);
    setDirectTarget(null);
    setDirectError(null);
    try {
      const result = await apiService.searchWalletTarget(directRole, directSearchNumber.trim());
      setDirectTarget(result);
    } catch (e: any) {
      const msg = e?.message || 'No account found with this phone number';
      setDirectError(msg);
      showToast(msg, 'error');
    } finally {
      setDirectSearching(false);
    }
  };

  const submitDirectPay = async () => {
    if (!directTarget) return;
    const numAmount = parseFloat(directAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setDirectError('Please enter a valid positive amount');
      return;
    }
    if (!directRemark.trim()) {
      setDirectError('Remark is required');
      return;
    }
    setDirectSubmitting(true);
    setDirectError(null);
    try {
      await apiService.createAdminInitiatedPayout({
        vehicle_owner_id: directRole === 'vehicle_owner' ? directTarget.id : undefined,
        vendor_id: directRole === 'vendor' ? directTarget.id : undefined,
        amount: numAmount,
        remark: directRemark.trim(),
        paid_via: directPaidVia || undefined,
      });
      setDirectPayVisible(false);
      resetDirectPayForm();
      showToast(`Paid ₹${numAmount} to ${directTarget.full_name}.`, 'success');
      fetchRequests(activeTab, 0, false);
    } catch (e: any) {
      const errorMsg = e?.message === 'Failed to fetch'
        ? 'Network error: Server unavailable. Check backend connection.'
        : (e?.message || 'Failed to submit direct payout');
      setDirectError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setDirectSubmitting(false);
    }
  };

  const handleRejectOpen = (req: PayoutRequestRow) => {
    setRejectError(null);
    setRejectNotes('');
    setRejectTarget(req);
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setActioningId(rejectTarget.id);
    setRejectError(null);
    try {
      await apiService.rejectPayoutRequest(rejectTarget.id, rejectNotes || undefined);
      setRejectTarget(null);
      setRejectNotes('');
      showToast('Payout request rejected', 'success');
      fetchRequests(activeTab, 0, false);
    } catch (e: any) {
      const errorMsg = e?.message === 'Failed to fetch'
        ? 'Network error: Server unavailable. Check backend connection.'
        : (e?.message || 'Failed to reject request');
      setRejectError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const renderItem = ({ item }: { item: PayoutRequestRow }) => (
    <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.amount, { color: themeColors.text }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
        <Text style={[styles.date, { color: themeColors.textSecondary }]}>
          {new Date(item.requested_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      <Text style={[styles.ownerId, { color: themeColors.textSecondary }]}>{item.owner_name || 'Unknown'}{item.owner_phone ? ` · ${item.owner_phone}` : ''}</Text>
      <View style={styles.badgeRow}>
        <View style={[styles.roleBadge, item.role === 'VENDOR' ? styles.roleBadgeVendor : styles.roleBadgeOwner]}>
          {item.role === 'VENDOR' ? <Building2 size={11} color="#7C3AED" /> : <Car size={11} color="#3B82F6" />}
          <Text style={[styles.roleBadgeText, item.role === 'VENDOR' ? { color: '#7C3AED' } : { color: '#3B82F6' }]}>
            {item.role === 'VENDOR' ? 'Vendor' : 'Fleet Driver'}
          </Text>
        </View>
        {item.initiated_by_admin && (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>Admin Initiated</Text>
          </View>
        )}
      </View>

      {(item.bank_account_number || item.upi_id || item.gpay_number) ? (
        <View style={styles.paymentDetailsBox}>
          <Text style={styles.paymentDetailsLabel}>Send payment to</Text>
          {!!item.bank_account_number && (
            <Text style={styles.paymentDetailsRow}>
              Bank: {item.bank_account_holder_name ? `${item.bank_account_holder_name} · ` : ''}{item.bank_account_number}{item.bank_ifsc ? ` · IFSC ${item.bank_ifsc}` : ''}
            </Text>
          )}
          {!!item.upi_id && <Text style={styles.paymentDetailsRow}>UPI: {item.upi_id}</Text>}
          {!!item.gpay_number && <Text style={styles.paymentDetailsRow}>GPay: {item.gpay_number}</Text>}
        </View>
      ) : (
        <Text style={[styles.paymentDetailsMissing, { color: isDark ? '#FBBF24' : '#B45309' }]}>No bank/UPI details on file for this account</Text>
      )}

      {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
      {!!item.paid_via && <Text style={styles.paidVia}>Paid via {item.paid_via}</Text>}

      {item.status === 'PENDING' && (
        <>
          <TouchableOpacity
            style={[styles.actionBtn, styles.walletBtn]}
            onPress={() => handleAddToWallet(item)}
            disabled={actioningId === item.id}
          >
            <Wallet size={15} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Add to Wallet</Text>
          </TouchableOpacity>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.payBtn]}
              onPress={() => handleMarkPaid(item)}
              disabled={actioningId === item.id}
            >
              {actioningId === item.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Check size={15} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Mark Paid</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => setRejectTarget(item)}
              disabled={actioningId === item.id}
            >
              <X size={15} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Wallet size={18} color="#3B82F6" />
        <Text style={[styles.title, { color: themeColors.text }]}>Payout Requests</Text>
        <ThemeToggle size={20} />
        <TouchableOpacity style={styles.payDirectlyBtn} onPress={openDirectPay}>
          <Plus size={15} color="#FFFFFF" />
          <Text style={styles.payDirectlyBtnText}>Pay Directly</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { backgroundColor: themeColors.background }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border, borderWidth: 1 },
              activeTab === tab.key && styles.tabActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, { color: themeColors.textSecondary }, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#3B82F6" /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color="#3B82F6" style={styles.footerLoader} />
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>No {activeTab.toLowerCase()} requests</Text>}
        />
      )}

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Reject Payout Request</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>₹{rejectTarget?.amount} - reason (optional)</Text>
            {!!rejectError && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{rejectError}</Text>
              </View>
            )}
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. Balance mismatch, contact owner"
              placeholderTextColor={themeColors.textMuted}
              value={rejectNotes}
              onChangeText={(txt) => { setRejectNotes(txt); setRejectError(null); }}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]} onPress={() => { setRejectTarget(null); setRejectNotes(''); setRejectError(null); }}>
                <Text style={[styles.modalCancelText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalRejectBtn} onPress={submitReject} disabled={actioningId === rejectTarget?.id}>
                {actioningId === rejectTarget?.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={styles.modalRejectText}>Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!payTarget} transparent animationType="fade" onRequestClose={() => setPayTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Mark as Paid?</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Confirm you've transferred ₹{payTarget?.amount} to this {payTarget?.role === 'VENDOR' ? 'vendor' : 'fleet driver'} outside the app.
            </Text>
            {!!payError && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{payError}</Text>
              </View>
            )}
            <Text style={[styles.paidViaLabel, { color: themeColors.textSecondary }]}>Paid via (optional)</Text>
            <View style={styles.paidViaRow}>
              <TouchableOpacity
                style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, payVia === 'WALLET' && styles.paidViaBtnActive]}
                onPress={() => { setPayVia(payVia === 'WALLET' ? null : 'WALLET'); setPayError(null); }}
              >
                <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, payVia === 'WALLET' && styles.paidViaBtnTextActive]}>Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, payVia === 'UPI' && styles.paidViaBtnActive]}
                onPress={() => { setPayVia(payVia === 'UPI' ? null : 'UPI'); setPayError(null); }}
              >
                <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, payVia === 'UPI' && styles.paidViaBtnTextActive]}>UPI</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, payVia === 'BANK' && styles.paidViaBtnActive]}
                onPress={() => { setPayVia(payVia === 'BANK' ? null : 'BANK'); setPayError(null); }}
              >
                <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, payVia === 'BANK' && styles.paidViaBtnTextActive]}>Bank</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.paidViaHint, { color: themeColors.textMuted }]}>
              Choosing Wallet here only RECORDS that it was paid via wallet - it does not move any money. To actually credit the wallet, use "Add to Wallet" on the request card instead.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]} onPress={() => { setPayTarget(null); setPayVia(null); setPayError(null); }}>
                <Text style={[styles.modalCancelText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPayBtn} onPress={submitMarkPaid} disabled={actioningId === payTarget?.id}>
                {actioningId === payTarget?.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={styles.modalRejectText}>Confirm Paid</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={directPayVisible} transparent animationType="slide" onRequestClose={() => setDirectPayVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.directModalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.directModalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Pay Directly</Text>
              <TouchableOpacity onPress={() => setDirectPayVisible(false)} accessibilityLabel="Close">
                <X size={20} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>Pay a fleet driver or vendor without a prior request.</Text>

            {!!directError && (
              <View style={styles.inlineErrorBox}>
                <Text style={styles.inlineErrorText}>{directError}</Text>
              </View>
            )}

            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segment, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }, directRole === 'vehicle_owner' && styles.segmentActive]}
                onPress={() => handleDirectRoleChange('vehicle_owner')}
              >
                <Car size={15} color={directRole === 'vehicle_owner' ? '#FFFFFF' : themeColors.textSecondary} />
                <Text style={[styles.segmentText, { color: themeColors.textSecondary }, directRole === 'vehicle_owner' && styles.segmentTextActive]}>Fleet Driver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }, directRole === 'vendor' && styles.segmentActive]}
                onPress={() => handleDirectRoleChange('vendor')}
              >
                <Building2 size={15} color={directRole === 'vendor' ? '#FFFFFF' : themeColors.textSecondary} />
                <Text style={[styles.segmentText, { color: themeColors.textSecondary }, directRole === 'vendor' && styles.segmentTextActive]}>Vendor</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.directSearchRow}>
              <TextInput
                style={[styles.directSearchInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="Enter 10-digit phone number"
                placeholderTextColor={themeColors.textMuted}
                value={directSearchNumber}
                onChangeText={setDirectSearchNumber}
                keyboardType="phone-pad"
                maxLength={10}
              />
              <TouchableOpacity style={styles.directSearchBtn} onPress={handleDirectSearch} disabled={directSearching} accessibilityLabel="Search">
                {directSearching ? <LoadingSpinner size="small" color="white" /> : <Search size={18} color="white" />}
              </TouchableOpacity>
            </View>

            {directTarget && (
              <>
                <View style={[styles.directTargetCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.targetName, { color: themeColors.text }]}>{directTarget.full_name}</Text>
                  <Text style={[styles.targetSub, { color: themeColors.textSecondary }]}>{directTarget.primary_number}</Text>
                  <Text style={[styles.targetSub, { color: themeColors.textSecondary }]}>Wallet balance: ₹{Number(directTarget.wallet_balance || 0).toLocaleString('en-IN')}</Text>
                </View>

                <Text style={[styles.paidViaLabel, { color: themeColors.textSecondary }]}>Amount (₹)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="e.g. 1500"
                  placeholderTextColor={themeColors.textMuted}
                  value={directAmount}
                  onChangeText={setDirectAmount}
                  keyboardType="numeric"
                />

                <Text style={[styles.paidViaLabel, { color: themeColors.textSecondary }]}>Remark (required)</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="e.g. Manual settlement for July"
                  placeholderTextColor={themeColors.textMuted}
                  value={directRemark}
                  onChangeText={setDirectRemark}
                  multiline
                />

                <Text style={[styles.paidViaLabel, { color: themeColors.textSecondary }]}>Paid via (optional)</Text>
                <View style={styles.paidViaRow}>
                  <TouchableOpacity
                    style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, directPaidVia === 'WALLET' && styles.paidViaBtnActive]}
                    onPress={() => setDirectPaidVia(directPaidVia === 'WALLET' ? null : 'WALLET')}
                  >
                    <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, directPaidVia === 'WALLET' && styles.paidViaBtnTextActive]}>Wallet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, directPaidVia === 'UPI' && styles.paidViaBtnActive]}
                    onPress={() => setDirectPaidVia(directPaidVia === 'UPI' ? null : 'UPI')}
                  >
                    <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, directPaidVia === 'UPI' && styles.paidViaBtnTextActive]}>UPI</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paidViaBtn, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6', borderColor: themeColors.border }, directPaidVia === 'BANK' && styles.paidViaBtnActive]}
                    onPress={() => setDirectPaidVia(directPaidVia === 'BANK' ? null : 'BANK')}
                  >
                    <Text style={[styles.paidViaBtnText, { color: themeColors.textSecondary }, directPaidVia === 'BANK' && styles.paidViaBtnTextActive]}>Bank</Text>
                  </TouchableOpacity>
                </View>
                {directPaidVia === 'WALLET' && (
                  <Text style={[styles.paidViaHint, { color: themeColors.textMuted }]}>
                    This only records "Wallet" as the payment method - it does not credit their wallet. To actually credit the wallet, close this and use Finance & Wallet directly.
                  </Text>
                )}

                <TouchableOpacity style={styles.directSubmitBtn} onPress={submitDirectPay} disabled={directSubmitting}>
                  {directSubmitting ? <LoadingSpinner size="small" color="white" /> : (
                    <Text style={styles.modalRejectText}>Pay ₹{directAmount || '0'}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937', flex: 1 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#3B82F6' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: 'white' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: 'white', borderRadius: 6, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 24, fontWeight: '800', color: '#1D4ED8' },
  date: { fontSize: 12, color: '#9CA3AF' },
  ownerId: { fontSize: 15, fontWeight: '700', color: '#1D4ED8', marginTop: 8 },
  notes: { fontSize: 13, color: '#6B7280', marginTop: 6, fontStyle: 'italic' },
  paymentDetailsBox: {
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, gap: 3,
  },
  paymentDetailsLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  paymentDetailsRow: { fontSize: 12.5, color: '#374151', fontWeight: '500' },
  paymentDetailsMissing: { fontSize: 12, color: '#B45309', marginTop: 8, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 6, paddingVertical: 9,
  },
  payBtn: { backgroundColor: '#10B981' },
  walletBtn: { backgroundColor: '#4F46E5', marginTop: 12 },
  rejectBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: 'white' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 13 },
  footerLoader: { paddingVertical: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', borderRadius: 8, padding: 20, width: '85%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  modalInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: 10,
    fontSize: 13, minHeight: 60, textAlignVertical: 'top', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  modalCancelText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  modalRejectBtn: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, minWidth: 70, alignItems: 'center' },
  modalRejectText: { fontSize: 13, fontWeight: '700', color: 'white' },
  modalPayBtn: { backgroundColor: '#10B981', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, minWidth: 70, alignItems: 'center' },

  payDirectlyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7,
  },
  payDirectlyBtnText: { fontSize: 12, fontWeight: '700', color: 'white' },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  roleBadgeOwner: { backgroundColor: '#EFF6FF' },
  roleBadgeVendor: { backgroundColor: '#F5F3FF' },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  adminBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  paidVia: { fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '600' },

  paidViaLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  paidViaRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  paidViaBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: 'white',
  },
  paidViaBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  paidViaBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  paidViaBtnTextActive: { color: 'white' },
  paidViaHint: { fontSize: 11.5, lineHeight: 15, marginTop: -8, marginBottom: 14 },

  directModalCard: { backgroundColor: 'white', borderRadius: 8, padding: 20, width: '90%', maxHeight: '85%' },
  directModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  segmentRow: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 6, padding: 3, gap: 4, marginTop: 12, marginBottom: 12 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 6 },
  segmentActive: { backgroundColor: '#3B82F6' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  segmentTextActive: { color: 'white' },
  directSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, paddingLeft: 4,
  },
  directSearchInput: { flex: 1, fontSize: 14, paddingVertical: 10, paddingHorizontal: 10, color: '#1F2937' },
  directSearchBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 10, borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  directTargetCard: {
    backgroundColor: '#F0FDF4', borderRadius: 6, padding: 12, marginTop: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  targetName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  targetSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  directSubmitBtn: { backgroundColor: '#10B981', borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 4 },
  inlineErrorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  inlineErrorText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
