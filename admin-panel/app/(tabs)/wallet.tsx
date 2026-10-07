import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Search,
  Plus,
  Minus,
  Phone,
  User,
  Wallet,
  FileText,
  IndianRupee,
  Building2,
  Car,
  CreditCard,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Segmented, Stat, Btn, EmptyState, SkeletonRow } from '@/components/ui';

type WalletRole = 'vehicle_owner' | 'vendor';
type Direction = 'credit' | 'debit';
type FinanceTab = 'adjust' | 'ledger';

interface WalletTarget {
  role: string;
  id: string;
  reg_id?: string | null;
  full_name: string;
  primary_number: string;
  wallet_balance: number;
  account_status: string;
}

interface ProfileData {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  balance: number;
}

interface LedgerEntry {
  id: string;
  order_id: number;
  entry_type: 'CREDIT' | 'DEBIT';
  amount: number;
  notes: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '₹0.00';
  }
  return `₹${Number(value).toFixed(2)}`;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TABS = [
  { label: 'Adjust Balance', value: 'adjust' },
  { label: 'Account Ledger', value: 'ledger' },
];

const ROLES = [
  { label: 'Fleet Driver', value: 'vehicle_owner' },
  { label: 'Vendor', value: 'vendor' },
];

export default function WalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    prefillRole?: string;
    prefillPhone?: string;
    prefillAmount?: string;
    prefillNotes?: string;
    prefillDirection?: string;
    sourcePayoutRequestId?: string;
  }>();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [activeTab, setActiveTab] = useState<FinanceTab>('adjust');

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

  // Wallet Top-up state
  const [role, setRole] = useState<WalletRole>('vehicle_owner');
  const [direction, setDirection] = useState<Direction>('credit');
  const [searchNumber, setSearchNumber] = useState('');
  const [foundTarget, setFoundTarget] = useState<WalletTarget | null>(null);
  const [searchResults, setSearchResults] = useState<WalletTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Set only when this screen was opened via "Add to Wallet" on a pending
  // Payout Request (see payout-requests.tsx) - after a successful credit
  // for that prefilled target, the source payout request is automatically
  // marked Paid (via 'WALLET') so it can never also be paid a second time
  // through UPI/Bank. Cleared once that follow-up call has been attempted.
  const [sourcePayoutRequestId, setSourcePayoutRequestId] = useState<string | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Account Ledger state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedgerData();
    }
  }, [activeTab]);

  const fetchLedgerData = async () => {
    setLedgerLoading(true);
    try {
      const [profData, ledgerData] = await Promise.all([
        apiService.getAdminProfile().catch(() => null),
        apiService.getAdminLedger().catch(() => []),
      ]);
      if (profData) setProfile(profData);
      if (Array.isArray(ledgerData)) setLedger(ledgerData);
    } catch {
    } finally {
      setLedgerLoading(false);
    }
  };

  const ledgerTotals = useMemo(() => {
    let credit = 0;
    let debit = 0;
    for (const item of ledger) {
      const amt = Number(item.amount) || 0;
      if (item.entry_type === 'CREDIT') credit += amt;
      else if (item.entry_type === 'DEBIT') debit += amt;
    }
    return { credit, debit };
  }, [ledger]);

  const resetForm = () => {
    setAmount('');
    setNotes('');
    setReference('');
  };

  const handleRoleChange = (newRole: WalletRole) => {
    setRole(newRole);
    setFoundTarget(null);
    resetForm();
  };

  const handleSearch = async (roleOverride?: WalletRole, queryOverride?: string, silent?: boolean) => {
    const searchRole = roleOverride || role;
    const query = (queryOverride ?? searchNumber).trim();
    if (!query || query.length < 4) {
      if (!silent) Alert.alert('Error', 'Enter at least 4 digits of the mobile number (or part of the name)');
      return;
    }
    setSearching(true);
    setFoundTarget(null);
    setSearchResults([]);
    try {
      const { results } = await apiService.searchWalletTargets(searchRole, query);
      if (results.length === 0) {
        if (!silent) Alert.alert('Not Found', 'No account matched that search');
      } else if (results.length === 1) {
        setFoundTarget(results[0]);
      } else {
        setSearchResults(results);
      }
    } catch (error: any) {
      if (!silent) Alert.alert('Error', error?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Arrived here via "Add to Wallet" on a Payout Request - pre-fill the
  // target, direction, amount and remarks so staff only has to glance and
  // tap Credit. Runs once; a normal manual visit to this tab has none of
  // these params and behaves exactly as before.
  useEffect(() => {
    if (prefillApplied) return;
    if (!params.prefillPhone) return;
    setPrefillApplied(true);
    const prefillRole: WalletRole = params.prefillRole === 'vendor' ? 'vendor' : 'vehicle_owner';
    setRole(prefillRole);
    setActiveTab('adjust');
    setSearchNumber(params.prefillPhone);
    setDirection(params.prefillDirection === 'debit' ? 'debit' : 'credit');
    if (params.prefillAmount) setAmount(String(params.prefillAmount));
    if (params.prefillNotes) setNotes(String(params.prefillNotes));
    if (params.sourcePayoutRequestId) setSourcePayoutRequestId(String(params.sourcePayoutRequestId));
    handleSearch(prefillRole, String(params.prefillPhone), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prefillPhone]);

  const selectSearchResult = (target: WalletTarget) => {
    setSearchResults([]);
    setFoundTarget(target);
  };

  const handleSubmit = async () => {
    if (!foundTarget) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid positive amount');
      return;
    }
    setSubmitting(true);
    try {
      await apiService.adjustWallet({
        role,
        target_id: foundTarget.id,
        direction,
        amount: numAmount,
        notes: notes.trim() || undefined,
      });
      const updated = await apiService.searchWalletTarget(role, foundTarget.primary_number);
      setFoundTarget(updated);

      // This credit came from "Add to Wallet" on a pending Payout Request -
      // record that request as Paid (via Wallet) now that the money has
      // actually moved, so it can never be paid again through UPI/Bank too.
      // The credit itself has already succeeded at this point; if this
      // follow-up call fails we still tell staff clearly so nothing is
      // silently left in a stuck/double-payable state.
      let paidNote = '';
      if (sourcePayoutRequestId && direction === 'credit') {
        try {
          await apiService.markPayoutPaid(Number(sourcePayoutRequestId), notes.trim() || undefined, 'WALLET');
          paidNote = ' and the payout request was marked as paid';
        } catch (markErr: any) {
          Alert.alert(
            'Wallet credited, but payout not updated',
            `₹${numAmount} was added to ${foundTarget.full_name}'s wallet, but the payout request could not be marked as paid automatically (${markErr?.message || 'unknown error'}). Please open Payout Requests and mark it paid manually so it is not paid twice.`
          );
        } finally {
          setSourcePayoutRequestId(null);
        }
      }

      resetForm();
      showToast(`Successfully ${direction === 'credit' ? 'added' : 'deducted'} ₹${numAmount} ${direction === 'credit' ? 'to' : 'from'} ${foundTarget.full_name}'s wallet${paidNote}.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update wallet balance');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={themeColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (forbidden) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={styles.forbiddenContainer}>
          <ShieldAlert size={48} color={themeColors.error} />
          <Text style={[styles.forbiddenTitle, { color: themeColors.text }]}>Owner Access Required</Text>
          <Text style={[styles.forbiddenSub, { color: themeColors.textSecondary }]}>
            Wallet balance adjustments and financial ledger access are restricted to Owner accounts.
          </Text>
          <Btn label="Go Back" variant="primary" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Finance & Wallet</Text>
        </View>
      </View>

      {/* Segment Tabs */}
      <View style={styles.tabContainer}>
        <Segmented
          options={TABS}
          value={activeTab}
          onChange={(v) => setActiveTab(v as FinanceTab)}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'adjust' ? (
            <View style={{ gap: 12 }}>
              {!!sourcePayoutRequestId && (
                <Card style={[styles.prefillBanner, { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '14' }]}>
                  <Text style={[styles.prefillBannerText, { color: themeColors.primary }]}>
                    From Payout Request #{sourcePayoutRequestId} - credit this and it will be marked paid automatically
                  </Text>
                </Card>
              )}
              {/* Role Picker */}
              <Segmented
                options={ROLES}
                value={role}
                onChange={(v) => handleRoleChange(v as WalletRole)}
              />

              {/* Search Box */}
              <Card style={styles.searchCard}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Find Account</Text>
                <View style={[styles.searchRow, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceAlt }]}>
                  <Search size={16} color={themeColors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder="Enter phone number or name..."
                    placeholderTextColor={themeColors.textMuted}
                    value={searchNumber}
                    onChangeText={setSearchNumber}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                  />
                  <TouchableOpacity
                    onPress={() => handleSearch()}
                    disabled={searching}
                    style={[styles.searchBtn, { backgroundColor: themeColors.primary }]}
                  >
                    {searching ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.searchBtnText}>Search</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {searchResults.length > 0 && (
                  <View style={styles.resultsList}>
                    {searchResults.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
                        onPress={() => selectSearchResult(t)}
                      >
                        <View>
                          <Text style={[styles.resultName, { color: themeColors.text }]}>{t.full_name}</Text>
                          <Text style={[styles.resultPhone, { color: themeColors.textMuted }]}>{t.primary_number}</Text>
                        </View>
                        <Text style={[styles.resultBalance, { color: themeColors.success }]}>{formatCurrency(t.wallet_balance)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Card>

              {/* Target Details & Adjustment Form */}
              {foundTarget && (
                <Card style={styles.adjustCard}>
                  <View style={styles.targetHeader}>
                    <View>
                      <Text style={[styles.targetName, { color: themeColors.text }]}>{foundTarget.full_name}</Text>
                      <Text style={[styles.targetPhone, { color: themeColors.textMuted }]}>{foundTarget.primary_number}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.balanceLabel, { color: themeColors.textMuted }]}>Current Balance</Text>
                      <Text style={[styles.targetBalance, { color: themeColors.success }]}>{formatCurrency(foundTarget.wallet_balance)}</Text>
                    </View>
                  </View>

                  {/* Direction Selector */}
                  <View style={styles.directionRow}>
                    <TouchableOpacity
                      style={[
                        styles.dirBtn,
                        { borderColor: direction === 'credit' ? themeColors.success : themeColors.border },
                        direction === 'credit' && { backgroundColor: themeColors.successLight },
                      ]}
                      onPress={() => setDirection('credit')}
                    >
                      <Plus size={16} color={direction === 'credit' ? themeColors.success : themeColors.textMuted} />
                      <Text style={[styles.dirBtnText, { color: direction === 'credit' ? themeColors.success : themeColors.textSecondary }]}>Add Balance (Credit)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.dirBtn,
                        { borderColor: direction === 'debit' ? themeColors.error : themeColors.border },
                        direction === 'debit' && { backgroundColor: themeColors.errorLight },
                      ]}
                      onPress={() => setDirection('debit')}
                    >
                      <Minus size={16} color={direction === 'debit' ? themeColors.error : themeColors.textMuted} />
                      <Text style={[styles.dirBtnText, { color: direction === 'debit' ? themeColors.error : themeColors.textSecondary }]}>Deduct (Debit)</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Amount Input */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Amount (₹)</Text>
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surfaceAlt }]}
                      placeholder="0.00"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                    />
                  </View>

                  {/* Notes */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Reason / Notes</Text>
                    <TextInput
                      style={[styles.inputField, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.surfaceAlt }]}
                      placeholder="e.g. Deposit settlement, manual correction"
                      placeholderTextColor={themeColors.textMuted}
                      value={notes}
                      onChangeText={setNotes}
                    />
                  </View>

                  <Btn
                    label={submitting ? 'Updating...' : `${direction === 'credit' ? 'Credit' : 'Debit'} ₹${amount || '0'}`}
                    variant={direction === 'credit' ? 'primary' : 'danger'}
                    onPress={handleSubmit}
                    disabled={submitting || !amount}
                    style={{ marginTop: 8 }}
                  />
                </Card>
              )}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {/* Ledger Totals */}
              <View style={styles.statsRow}>
                <Stat label="Total Credits" value={formatCurrency(ledgerTotals.credit)} variant="success" style={{ flex: 1 }} />
                <Stat label="Total Debits" value={formatCurrency(ledgerTotals.debit)} variant="danger" style={{ flex: 1 }} />
              </View>

              {ledgerLoading ? (
                <View style={styles.loadingContainer}>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </View>
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {ledger.map((item, idx) => (
                    <View
                      key={item.id || idx}
                      style={[styles.ledgerRow, { borderBottomColor: themeColors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ledgerNotes, { color: themeColors.text }]}>{item.notes || `Order #${item.order_id}`}</Text>
                        <Text style={[styles.ledgerDate, { color: themeColors.textMuted }]}>{formatDate(item.created_at)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={[
                            styles.ledgerAmount,
                            { color: item.entry_type === 'CREDIT' ? themeColors.success : themeColors.error },
                          ]}
                        >
                          {item.entry_type === 'CREDIT' ? '+' : '-'}{formatCurrency(item.amount)}
                        </Text>
                        <Text style={[styles.ledgerBal, { color: themeColors.textMuted }]}>Bal: {formatCurrency(item.balance_after)}</Text>
                      </View>
                    </View>
                  ))}
                  {ledger.length === 0 && (
                    <EmptyState
                      icon={<FileText size={36} color={themeColors.textMuted} />}
                      title="No transactions"
                      message="Recent financial entries will appear here."
                    />
                  )}
                </Card>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  searchCard: { padding: 12 },
  prefillBanner: { padding: 10, borderWidth: 1 },
  prefillBannerText: { fontSize: 12.5, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  searchBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  searchBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  resultsList: { marginTop: 8 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { fontSize: 13, fontWeight: '700' },
  resultPhone: { fontSize: 11 },
  resultBalance: { fontSize: 13, fontWeight: '700' },
  adjustCard: { padding: 14 },
  targetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  targetName: { fontSize: 15, fontWeight: '700' },
  targetPhone: { fontSize: 12 },
  balanceLabel: { fontSize: 10, textTransform: 'uppercase', fontWeight: '600' },
  targetBalance: { fontSize: 16, fontWeight: '800' },
  directionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dirBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  dirBtnText: { fontSize: 12, fontWeight: '700' },
  inputGroup: { marginBottom: 10 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  inputField: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  statsRow: { flexDirection: 'row', gap: 10 },
  loadingContainer: { gap: 8 },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ledgerNotes: { fontSize: 13, fontWeight: '600' },
  ledgerDate: { fontSize: 11, marginTop: 2 },
  ledgerAmount: { fontSize: 13, fontWeight: '700' },
  ledgerBal: { fontSize: 11, marginTop: 2 },
  forbiddenContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  forbiddenTitle: { fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 4 },
  forbiddenSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
