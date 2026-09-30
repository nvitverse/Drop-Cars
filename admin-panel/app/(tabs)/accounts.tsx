import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Switch,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Building2, Car, UserCircle, FileText, Info, Power, Trash2, CheckSquare, Square, ListChecks, X, ChevronRight as ChevronRightIcon, ShieldCheck as ShieldCheckIcon, ShieldAlert as ShieldAlertIcon, Users, ArrowUpDown } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiService } from '@/services/api';
import { formatCarType } from '@/utils/format';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import StatusBadge from '@/components/StatusBadge';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface Account {
  id: string;
  reg_id?: string | null; // Human-friendly registration number (YY#####)
  name: string;
  account_type: 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car';
  account_status: string;
  driver_status?: string; // For drivers and quickdrivers
  primary_number?: string | null; // Mobile number
  // Set only when an admin deliberately blocked this account (vendor/
  // vehicle_owner only) - distinguishes "manually blocked" from "just
  // never activated" within the Inactive tab.
  blocked_reason?: string | null;
  permanently_blocked?: boolean;
  permanently_blocked_reason?: string | null;
  // How many of this account's own documents (KYC/RC/insurance/licence,
  // plus a fleet driver's cars) are still PENDING review.
  pending_documents_count?: number;
}

type AccountTypeFilter = 'all' | 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car';
type StatusFilter = 'all' | 'active' | 'inactive' | 'blocked';

// Labels renamed for clarity - "vehicle_owner" accounts are fleet/car
// owners (not drivers), and "quickdriver" accounts are the actual driving
// staff, but the old labels ("Drivers" / "Duty Drivers") had it backwards
// from what a new staff member would expect.
const ACCOUNT_TYPE_TABS: { label: string; value: AccountTypeFilter; color: string }[] = [
  { label: 'All', value: 'all', color: colors.textSecondary },
  { label: 'Fleets', value: 'vehicle_owner', color: colors.success },
  { label: 'Cars', value: 'car', color: colors.warning },
  { label: 'Drivers', value: 'quickdriver', color: '#8B5CF6' },
  { label: 'Vendors', value: 'vendor', color: colors.primary },
];

// One shared vocabulary across every account type in this screen (fleet
// owners, drivers, vendors) - Active/Inactive/Blocked. The backend maps
// each to that type's own status fields (account_status for owners/
// vendors, driver_status for drivers), so the SAME three tabs work no
// matter which "Fleets/Cars/Drivers/Vendors" filter is selected above,
// including "All" mixing every type together - previously this screen
// only ever showed the owner/vendor Active/Inactive tabs, which is what
// made status filtering meaningless whenever a driver was in view.
//
// "Blocked" is deliberately its own tab, not folded into "Inactive" - an
// admin blocking an account (a punitive action, permanently_blocked, or a
// driver's own BLOCKED operational status) is a different fact from an
// account simply being switched off or not yet verified. See
// crud/admin_management.py's driver/vendor/owner_base_query for the
// matching backend split.
const STATUS_TABS: { label: string; value: StatusFilter; color: string }[] = [
  { label: 'All', value: 'all', color: colors.textSecondary },
  { label: 'Active', value: 'active', color: colors.success },
  { label: 'Inactive', value: 'inactive', color: colors.textMuted },
  { label: 'Blocked', value: 'blocked', color: colors.error },
];

type SortBy = 'attention' | 'name' | 'docs' | 'recent';

const SORT_OPTIONS: { label: string; value: SortBy }[] = [
  { label: 'Needs Attention', value: 'attention' },
  { label: 'Name (A-Z)', value: 'name' },
  { label: 'Most Docs Pending', value: 'docs' },
  { label: 'Recently Added', value: 'recent' },
];

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return 'N/A';
  }
  return `₹${Number(value).toFixed(2)}`;
};

const PAGE_SIZE = 50;

export default function AccountsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { toast, showToast } = useToast();
  const { isDark, themeColors } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skipCount, setSkipCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Permanent removal is Owner-only (backend enforces this too) - Staff
  // accounts never see the option at all, avoiding a confusing 403.
  const [isOwner, setIsOwner] = useState(true);
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountTypeFilter>(() => {
    const requested = params.type;
    return requested === 'quickdriver' || requested === 'vehicle_owner' || requested === 'vendor'
      ? requested
      : 'all';
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('attention');
  const [typeFilterLoading, setTypeFilterLoading] = useState(false);
  const [statusFilterLoading, setStatusFilterLoading] = useState(false);
  const isFilterLoading = typeFilterLoading || statusFilterLoading;
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [accountDetails, setAccountDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [accountMobileNumbers, setAccountMobileNumbers] = useState<Record<string, string>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchAccounts = async (isFilterChange = false, loadMore = false) => {
    try {
      setError(null);
      const accountTypeParam = accountTypeFilter !== 'all' ? accountTypeFilter : undefined;
      const statusParam = statusFilter !== 'all' ? statusFilter : undefined;
      const searchParam = searchQuery.trim() || undefined;
      const skip = loadMore ? skipCount : 0;
      if (loadMore) setLoadingMore(true);

      const data = await apiService.getAllAccounts(skip, PAGE_SIZE, accountTypeParam, statusParam, searchParam);

      const combined = loadMore ? [...accounts, ...data.accounts] : data.accounts;

      // Sorting itself happens client-side just before render (see
      // sortedAccounts below) - it only reorders rows already on screen,
      // so switching the Sort option doesn't need a new network call.
      // Backend order (created_at desc per type) is kept here as the
      // natural/"Recently Added" ordering.
      setAccounts(combined);
      setHasMore(data.accounts.length === PAGE_SIZE);
      setSkipCount(skip + data.accounts.length);
      setTotalCount(data.total_count);
      // Mobile numbers now come directly in the list response (primary_number)
      // - the old per-account background fetches made the screen feel slow.
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      if (!loadMore) setError('Failed to load accounts. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setTypeFilterLoading(false);
      setStatusFilterLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && !isFilterLoading && hasMore) {
      fetchAccounts(false, true);
    }
  };

  const getStatusForAccount = (account: Account): string => {
    // For drivers and quickdrivers, use driver_status
    if (account.account_type === 'driver' || account.account_type === 'quickdriver') {
      return account.driver_status || account.account_status || 'BLOCKED';
    }
    // For vendors and vehicle_owners, use account_status
    return account.account_status || 'Inactive';
  };

  // "Inactive" and "Blocked" are different facts about an account (see the
  // STATUS_TABS comment above) - isBlockedStatus/isInactiveStatus are
  // deliberately non-overlapping so a card is never sorted or labeled as
  // both at once. PROCESSING (a driver pending fleet-owner verification -
  // never approved yet, not an admin action) counts as Inactive, same as
  // it always has - it's just no longer lumped in with BLOCKED.
  // "Blocked" means only permanently_blocked (the Owner-only fraud action)
  // now - a driver's driver_status===BLOCKED is what the plain admin
  // enable/disable toggle sets (see getTargetStatus below), which is a
  // routine, reversible action, not a punitive one, so it's labeled
  // "Inactive" everywhere instead (see isInactiveStatus/getStatusLabel).
  const isBlockedStatus = (account: Account): boolean => !!account.permanently_blocked;

  const isInactiveStatus = (status: string, accountType: string): boolean => {
    if (accountType === 'vendor' || accountType === 'vehicle_owner') {
      return status === 'INACTIVE' || status === 'Inactive' || status === 'PENDING';
    } else if (accountType === 'driver' || accountType === 'quickdriver') {
      // BLOCKED here is the admin toggle's "off" state (see
      // getTargetStatus) - grouped with PROCESSING (pending verification)
      // as "not currently usable", same bucket vendors/owners' INACTIVE
      // sits in. ONLINE/OFFLINE/DRIVING are all driver-controlled, live
      // duty states and never count as inactive - see isActiveStatus.
      return status === 'BLOCKED' || status === 'PROCESSING';
    }
    return false;
  };

  // Active/Inactive is the ADMIN's control (is this account usable at
  // all); Online/Offline/Driving is a separate, driver-controlled status
  // that only exists while the account is active - toggling this OFF only
  // ever needs to disable the account, never claim to know the driver's
  // current duty state (see getTargetStatus), so OFFLINE counts as
  // "active" here same as ONLINE/DRIVING.
  const isActiveStatus = (status: string, accountType: string): boolean => {
    if (accountType === 'vendor' || accountType === 'vehicle_owner') {
      return status === 'ACTIVE' || status === 'Active';
    } else if (accountType === 'driver' || accountType === 'quickdriver') {
      return status === 'ONLINE' || status === 'DRIVING' || status === 'OFFLINE';
    }
    return false;
  };

  const getToggleStatus = (account: Account): boolean => {
    const status = getStatusForAccount(account);
    return isActiveStatus(status, account.account_type);
  };

  const getTargetStatus = (account: Account, toggleValue: boolean): string => {
    if (account.account_type === 'vendor' || account.account_type === 'vehicle_owner') {
      return toggleValue ? 'Active' : 'Inactive';
    } else if (account.account_type === 'driver' || account.account_type === 'quickdriver') {
      // Re-enabling (toggleValue=true) sets OFFLINE, not ONLINE - going
      // online is the driver's own call from their app (quick-dashboard.tsx's
      // Duty Status toggle), not something admin should assert on their
      // behalf. Disabling (false) sets BLOCKED, the one driver_status value
      // only admin ever sets - labeled "Inactive" (see isInactiveStatus),
      // distinct from the separate permanently_blocked fraud action.
      return toggleValue ? 'OFFLINE' : 'BLOCKED';
    }
    return toggleValue ? 'Active' : 'Inactive';
  };

  const handleToggleStatus = async (account: Account, newValue: boolean) => {
    const newStatus = getTargetStatus(account, newValue);
    
    // Ensure account ID is a string
    const accountId = String(account.id);
    
    // Optimistically update UI
    setAccounts(accounts.map(acc => {
      if (acc.id === account.id) {
        if (account.account_type === 'driver' || account.account_type === 'quickdriver') {
          return { ...acc, driver_status: newStatus };
        } else {
          return { ...acc, account_status: newStatus };
        }
      }
      return acc;
    }));

    setUpdatingStatus(prev => new Set(prev).add(account.id));

    try {
      await apiService.updateAccountStatus(accountId, account.account_type, newStatus);
      // Refresh to get accurate data
      await fetchAccounts();
      showToast(`${account.name} marked ${getTargetStatus(account, newValue)}`, 'success');
    } catch (error: any) {
      // Revert on error
      setAccounts(accounts.map(acc => {
        if (acc.id === account.id) {
          return account; // Restore original account object
        }
        return acc;
      }));
      
      Alert.alert('Error', error?.message || 'Failed to update account status');
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  };

  const [blockReasonModalVisible, setBlockReasonModalVisible] = useState(false);
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [blockTargetAccount, setBlockTargetAccount] = useState<Account | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const BLOCK_REASON_PRESETS = [
    'Fake/forged documents uploaded',
    'Repeated cancellations / no-shows',
    'Customer complaints (safety)',
    'Fraudulent payment activity',
  ];

  const handlePermanentBlock = (account: Account) => {
    setShowInfoModal(false);
    setBlockTargetAccount(account);
    setBlockReasonInput('');
    setBlockReasonModalVisible(true);
  };

  const submitPermanentBlock = async () => {
    if (!blockTargetAccount || !blockReasonInput.trim()) {
      Alert.alert('Reason required', 'Enter or pick a reason for the permanent block.');
      return;
    }
    setBlockSubmitting(true);
    try {
      await apiService.permanentBlockAccount(
        String(blockTargetAccount.id),
        blockTargetAccount.account_type as 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver',
        blockReasonInput.trim()
      );
      setBlockReasonModalVisible(false);
      setShowInfoModal(false);
      showToast(`${blockTargetAccount.name} permanently blocked`, 'success');
      fetchAccounts();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to permanently block this account');
    } finally {
      setBlockSubmitting(false);
    }
  };

  const handlePermanentUnblock = (account: Account) => {
    Alert.alert(
      'Remove permanent block?',
      `${account.name} will be able to be reactivated normally again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Block',
          onPress: async () => {
            if (unblockingId === String(account.id)) return;
            setUnblockingId(String(account.id));
            try {
              await apiService.permanentUnblockAccount(
                String(account.id),
                account.account_type as 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'
              );
              setShowInfoModal(false);
              showToast(`Permanent block removed for ${account.name}`, 'success');
              fetchAccounts();
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to remove permanent block');
            } finally {
              setUnblockingId((cur) => (cur === String(account.id) ? null : cur));
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = (account: Account) => {
    const typeLabel = getAccountTypeLabel(account.account_type);
    Alert.alert(
      `Remove ${typeLabel}?`,
      `This permanently deletes "${account.name}". This cannot be undone. Only use this to clean up duplicate records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => confirmDeleteAccount(account),
        },
      ]
    );
  };

  const confirmDeleteAccount = async (account: Account) => {
    const accountId = String(account.id);
    setDeletingId(account.id);
    try {
      await apiService.deleteAccount(
        accountId,
        account.account_type as 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver' | 'car'
      );
      // Remove from local list immediately
      setAccounts(prev => prev.filter(acc => acc.id !== account.id));
      showToast(`${getAccountTypeLabel(account.account_type)} "${account.name}" was removed.`, 'success');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to remove account');
    } finally {
      setDeletingId(null);
    }
  };

  // Shared by both bulk actions - each account type maps a plain "on/off"
  // toggle to its own status vocabulary via getTargetStatus (Active/
  // Inactive for vendors & fleet drivers, ONLINE/BLOCKED for drivers &
  // quickdrivers), same mapping the single-row toggle already uses, so
  // bulk and single-row actions can never disagree on what "off" means
  // for a given account type.
  const handleBulkStatusChange = async (activate: boolean) => {
    const targets = accounts.filter((a) => selectedIds.has(a.id) && a.account_type !== 'car');
    if (targets.length === 0) return;
    const verb = activate ? 'activate' : 'deactivate';
    setBulkUpdating(true);
    try {
      const payload = targets.map((a) => ({
        account_id: String(a.id),
        account_type: a.account_type as 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver',
        account_status: getTargetStatus(a, activate),
      }));
      // account_status is per-account-type already (mixed selections send
      // mixed statuses); this top-level label is only used by the backend
      // as a fallback default, so either constant here is fine.
      const result = await apiService.bulkUpdateAccountStatus(payload, activate ? 'Active' : 'Inactive');
      await fetchAccounts();
      setSelectMode(false);
      setSelectedIds(new Set());
      if (result.failed_count > 0) {
        showToast(`${result.updated_count} ${verb}d, ${result.failed_count} failed`, 'error');
      } else {
        showToast(`${result.updated_count} account${result.updated_count === 1 ? '' : 's'} ${verb}d`, 'success');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || `Failed to ${verb} accounts`);
    } finally {
      setBulkUpdating(false);
    }
  };

  useEffect(() => {
    const isInitialLoad = loading && accounts.length === 0;
    fetchAccounts(!isInitialLoad);
  }, [accountTypeFilter, statusFilter]);

  useEffect(() => {
    apiService.getCachedAdminRole().then((role) => setIsOwner(role === 'Owner'));
  }, []);

  const handleAccountTypeFilterChange = (value: AccountTypeFilter) => {
    if (value === 'car') {
      router.push('/cars');
      return;
    }
    if (value === accountTypeFilter || isFilterLoading) return;
    setTypeFilterLoading(true);
    setAccountTypeFilter(value);
    // Drivers and Fleets/Vendors use different status vocabularies
    // (Online/Offline vs Active/Inactive) - carrying a selection across
    // would silently apply a filter that means nothing for the new type.
    setStatusFilter('all');
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    if (value === statusFilter || isFilterLoading) return;
    setStatusFilterLoading(true);
    setStatusFilter(value);
  };

  // Server-side search, on explicit Search tap/Enter only (not live-as-
  // you-type) - same convention as cars.tsx, to avoid firing a request per
  // pause in typing. Needed because the account list is paginated (2,400+
  // rows) - the client-side filter below only ever searched whatever page
  // had already been scrolled into view, silently missing real matches
  // further down the list. At least 2 characters, so an accidental
  // Search tap on an empty/1-char box doesn't fire a near-full-table query.
  const runSearch = () => {
    if (searchQuery.trim().length > 0 && searchQuery.trim().length < 2) {
      Alert.alert('Type more to search', 'Enter at least 2 characters to search.');
      return;
    }
    fetchAccounts(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAccounts();
  };

  const handleDocumentPress = (account: Account) => {
    // Only navigate to documents for non-car accounts
    if (account.account_type !== 'car') {
      router.push({
        pathname: '/account-documents',
        params: {
          accountId: account.id,
          accountType: account.account_type,
          accountName: account.name,
        },
      });
    }
  };

  const handleInfoPress = async (account: Account) => {
    // Only show info for non-car accounts
    if (account.account_type === 'car') {
      Alert.alert('Info', 'Car accounts do not have detailed information available.');
      return;
    }

    setSelectedAccount(account);
    setShowInfoModal(true);
    setLoadingDetails(true);
    setAccountDetails(null);

    try {
      const details = await apiService.getAccountDetails(
        account.id,
        account.account_type as 'vendor' | 'vehicle_owner' | 'driver' | 'quickdriver'
      );
      setAccountDetails(details);
      
      // Store mobile number if available
      const accountData = details.vendor || details.vehicle_owner || details.driver || details.quickdriver || details;
      if (accountData?.primary_number) {
        setAccountMobileNumbers(prev => ({
          ...prev,
          [account.id]: accountData.primary_number
        }));
      }
    } catch (error: any) {
      console.error('Failed to fetch account details:', error);
      Alert.alert('Error', error?.message || 'Failed to load account details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Tapping a card (outside select mode) opens the full account page - a
  // dedicated one already exists for fleet drivers and vendors (with every
  // action: wallet, cars, documents, block/unblock). Drivers and cars don't
  // have one yet, so those fall back to the same Info modal the "Info"
  // chip already opens rather than a dead tap.
  const handleCardPress = (account: Account) => {
    if (account.account_type === 'vehicle_owner') {
      router.push(`/fleet-owner-detail?ownerId=${account.id}` as any);
      return;
    }
    if (account.account_type === 'vendor') {
      router.push(`/vendor-detail?vendorId=${account.id}` as any);
      return;
    }
    handleInfoPress(account);
  };

  const filteredAccounts = accounts.filter(account => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) return true;

    const mobileNumber = accountMobileNumbers[account.id] || account.primary_number || '';
    return (
      account.name.toLowerCase().includes(searchLower) ||
      mobileNumber.toLowerCase().includes(searchLower) ||
      (account.reg_id || '').toLowerCase().includes(searchLower)
    );
  });

  // Sorting is purely client-side (see fetchAccounts) - only reorders rows
  // already loaded, so picking a different option is instant.
  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'docs') return (b.pending_documents_count || 0) - (a.pending_documents_count || 0);
    if (sortBy === 'recent') return 0; // backend's own created_at-desc order per type
    // 'attention' (default): Blocked first, then Inactive, then Active -
    // the two "needs a look" groups stay separate rather than interleaved,
    // matching the Blocked/Inactive split everywhere else on this screen.
    const aBlocked = isBlockedStatus(a);
    const bBlocked = isBlockedStatus(b);
    if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;
    const aInactive = isInactiveStatus(getStatusForAccount(a), a.account_type);
    const bInactive = isInactiveStatus(getStatusForAccount(b), b.account_type);
    if (aInactive !== bInactive) return aInactive ? -1 : 1;
    return 0;
  });

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'vendor':
        return <Building2 size={18} color={colors.primary} />;
      case 'vehicle_owner':
        return <Car size={18} color={colors.success} />;
      case 'driver':
      case 'quickdriver':
        return <UserCircle size={18} color="#8B5CF6" />;
      case 'car':
        return <Car size={18} color={colors.warning} />;
      default:
        return <UserCircle size={18} color={colors.textSecondary} />;
    }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'vendor':
        return 'Vendor';
      case 'vehicle_owner':
        return 'Fleet Driver';
      case 'driver':
      case 'quickdriver':
        return 'Driver';
      case 'car':
        return 'Car';
      default:
        return type;
    }
  };

  // Was previously collapsing every non-online driver - OFFLINE, PROCESSING
  // (pending verification, never approved yet), and the real BLOCKED
  // status alike - down to a single "Blocked" label, which is exactly the
  // confusion the Active/Inactive/Blocked split above exists to avoid: a
  // brand new, never-reviewed driver read identically to one an admin
  // actually blocked. Each status now maps to the label that's actually
  // true of it.
  const getStatusLabel = (account: Account): string => {
    const status = getStatusForAccount(account);
    if (isBlockedStatus(account)) return 'Blocked';
    if (account.account_type === 'vendor' || account.account_type === 'vehicle_owner') {
      return status === 'Active' || status === 'ACTIVE' ? 'Active' : 'Inactive';
    } else if (account.account_type === 'driver' || account.account_type === 'quickdriver') {
      // ONLINE/OFFLINE/DRIVING are the driver's own live duty status (set
      // from their app, not by admin) - shown as-is rather than collapsed
      // into Active/Inactive, since a driver being OFFLINE right now is a
      // normal state, not something admin did. Only BLOCKED (admin's
      // disable toggle) and PROCESSING (pending verification) read as
      // "Inactive" - the account itself isn't usable.
      if (status === 'ONLINE') return 'Online';
      if (status === 'DRIVING') return 'Driving';
      if (status === 'OFFLINE') return 'Offline';
      return 'Inactive';
    }
    return status;
  };

  const renderAccountItem = ({ item }: { item: Account }) => {
    const status = getStatusForAccount(item);
    const isInactive = isInactiveStatus(status, item.account_type);
    const isUpdating = updatingStatus.has(item.id);
    const toggleValue = getToggleStatus(item);
    const statusLabel = getStatusLabel(item);
    const mobileNumber = accountMobileNumbers[item.id] || item.primary_number || '';
    
    const isSelectable = item.account_type !== 'car';
    const isSelected = selectedIds.has(item.id);

    const cardBody = (
      <>
        {/* Top Line: Avatar, Name and Mobile Number */}
        <View style={styles.accountTopLine}>
          {selectMode && isSelectable && (
            isSelected
              ? <CheckSquare size={22} color={colors.primary} style={{ marginTop: 8 }} />
              : <Square size={22} color={colors.textMuted} style={{ marginTop: 8 }} />
          )}
          <View style={[styles.avatarCircle, isInactive ? styles.avatarCircleMuted : styles.avatarCircleActive]}>
            {getAccountTypeIcon(item.account_type)}
          </View>
          <View style={styles.accountNameMobileContainer}>
            <Text style={[styles.accountTypeLabel, { color: isDark ? '#818CF8' : colors.primary }]}>
              {getAccountTypeLabel(item.account_type)}
            </Text>
            <Text style={[styles.accountName, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>
            <View style={styles.accountMetaRow}>
              {!!item.reg_id && (
                <Text style={[styles.accountRegId, { color: themeColors.textSecondary }]} numberOfLines={1}>
                  #{item.reg_id}
                </Text>
              )}
              {mobileNumber ? (
                <Text style={[styles.accountMobile, { color: themeColors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {mobileNumber}
                </Text>
              ) : !item.reg_id ? (
                <Text style={[styles.accountId, { color: themeColors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">
                  ID: {item.id}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <StatusBadge
              status={statusLabel}
              type={item.account_type === 'driver' || item.account_type === 'quickdriver' ? 'driver' : 'account'}
            />
            {!!item.blocked_reason && (
              <View style={styles.blockedTag}>
                <Text style={styles.blockedTagText}>Blocked</Text>
              </View>
            )}
            {!!item.pending_documents_count && item.pending_documents_count > 0 && (
              <View style={styles.docsPendingTag}>
                <Text style={styles.docsPendingTagText}>{item.pending_documents_count} doc{item.pending_documents_count > 1 ? 's' : ''} pending</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bottom Line: Three Buttons - hidden in select mode, where tapping
            the card itself toggles selection instead. Each chip now carries
            its own tint so the row reads at a glance instead of four
            identical grey pills. */}
        {!selectMode && (
          <View style={styles.accountActions}>
            {/* Info Button */}
            {item.account_type !== 'car' && (
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: isDark ? '#312E81' : colors.primaryTint }]}
                onPress={() => handleInfoPress(item)}
                activeOpacity={0.75}
              >
                <Info size={15} color={isDark ? '#818CF8' : colors.primary} />
                <Text style={[styles.actionChipText, { color: isDark ? '#818CF8' : colors.primary }]}>Info</Text>
              </TouchableOpacity>
            )}

            {/* Document Button */}
            {item.account_type !== 'car' && (
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: isDark ? '#064E3B' : colors.successTint }]}
                onPress={() => handleDocumentPress(item)}
                activeOpacity={0.75}
              >
                <FileText size={15} color={isDark ? '#34D399' : colors.success} />
                <Text style={[styles.actionChipText, { color: isDark ? '#34D399' : colors.success }]}>Docs</Text>
              </TouchableOpacity>
            )}

            {/* Toggle Button */}
            <TouchableOpacity
              style={[styles.actionChip, { backgroundColor: toggleValue ? (isDark ? '#064E3B' : colors.successTint) : themeColors.surface, borderWidth: toggleValue ? 0 : 1, borderColor: themeColors.border }]}
              onPress={() => handleToggleStatus(item, !toggleValue)}
              disabled={isUpdating}
              activeOpacity={0.75}
            >
              <Power size={15} color={toggleValue ? (isDark ? '#34D399' : colors.success) : themeColors.textSecondary} />
              <Text style={[styles.actionChipText, { color: toggleValue ? (isDark ? '#34D399' : colors.success) : themeColors.textSecondary }]}>
                {statusLabel}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );

    if (selectMode) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!isSelectable}
          onPress={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              return next;
            });
          }}
          style={[
            styles.accountCard,
            { backgroundColor: themeColors.surface, borderColor: themeColors.border },
            isInactive && styles.accountCardInactive,
            isSelected && styles.accountCardSelected,
            !isSelectable && { opacity: 0.5 },
          ]}
        >
          {cardBody}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => handleCardPress(item)}
        style={[
          styles.accountCard,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          isInactive && styles.accountCardInactive,
        ]}
      >
        {cardBody}
      </TouchableOpacity>
    );
  };

  const renderAccountDetailsModal = () => {
    if (!selectedAccount || !showInfoModal) return null;

    const account = accountDetails ? (accountDetails.vendor || accountDetails.vehicle_owner || accountDetails.driver || accountDetails.quickdriver || accountDetails) : null;

    return (
      <Modal
        visible={showInfoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Account Details</Text>
            <TouchableOpacity
              onPress={() => setShowInfoModal(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          {loadingDetails ? (
            <View style={styles.modalLoadingContainer}>
              <LoadingSpinner />
            </View>
          ) : account ? (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Basic Information</Text>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{account.full_name || account.name || 'N/A'}</Text>
                </View>

                {account.reg_id && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reg. Number:</Text>
                    <Text style={[styles.detailValue, styles.regIdValue]}>#{account.reg_id}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Type:</Text>
                  <Text style={styles.detailValue}>{getAccountTypeLabel(selectedAccount.account_type)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <StatusBadge
                    status={getStatusLabel(selectedAccount)}
                    type={selectedAccount.account_type === 'driver' || selectedAccount.account_type === 'quickdriver' ? 'driver' : 'account'}
                  />
                </View>

                {account.primary_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Primary Number:</Text>
                    <Text style={styles.detailValue}>{account.primary_number}</Text>
                  </View>
                )}

                {account.secondary_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Secondary Number:</Text>
                    <Text style={styles.detailValue}>{account.secondary_number}</Text>
                  </View>
                )}

                {account.aadhar_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Aadhar Number:</Text>
                    <Text style={styles.detailValue}>{account.aadhar_number}</Text>
                  </View>
                )}

                {account.licence_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Licence Number:</Text>
                    <Text style={styles.detailValue}>{account.licence_number}</Text>
                  </View>
                )}

                {account.gpay_number && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>GPay Number:</Text>
                    <Text style={styles.detailValue}>{account.gpay_number}</Text>
                  </View>
                )}

                {account.address && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address:</Text>
                    <Text style={styles.detailValue}>{account.address}</Text>
                  </View>
                )}

                {account.city && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>City:</Text>
                    <Text style={styles.detailValue}>{account.city}</Text>
                  </View>
                )}

                {account.pincode && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Pincode:</Text>
                    <Text style={styles.detailValue}>{account.pincode}</Text>
                  </View>
                )}

                {account.wallet_balance !== undefined && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Wallet Balance:</Text>
                    <Text style={styles.detailValue}>{formatCurrency(account.wallet_balance)}</Text>
                  </View>
                )}

                {account.bank_balance !== undefined && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Bank Balance:</Text>
                    <Text style={styles.detailValue}>{formatCurrency(account.bank_balance)}</Text>
                  </View>
                )}

                {account.created_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Created At:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(account.created_at).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>

              {/* Cars Section for Fleet Drivers */}
              {accountDetails.cars && accountDetails.cars.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Cars ({accountDetails.cars.length})</Text>
                  {accountDetails.cars.map((car: any, index: number) => (
                    <View key={car.id || index} style={styles.carCard}>
                      <Text style={styles.carName}>{car.car_name}</Text>
                      <Text style={styles.carDetails}>
                        {formatCarType(car.car_type)} • {car.car_number} • {car.year_of_the_car}
                      </Text>
                      <Text style={styles.carStatus}>Status: {car.car_status}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Drivers Section for Fleet Drivers */}
              {accountDetails.drivers && accountDetails.drivers.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Drivers ({accountDetails.drivers.length})</Text>
                  {accountDetails.drivers.map((driver: any, index: number) => (
                    <View key={driver.id || index} style={styles.driverCard}>
                      <Text style={styles.driverName}>{driver.full_name}</Text>
                      <Text style={styles.driverDetails}>
                        {driver.primary_number} • {driver.licence_number}
                      </Text>
                      <Text style={styles.driverStatus}>Status: {driver.driver_status}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions - deliberately last: info and documents first, the
                  things that change the account come after you've actually
                  reviewed them. */}
              {selectedAccount.account_type !== 'car' && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Actions</Text>
                  <TouchableOpacity
                    style={styles.actionListItem}
                    onPress={() => {
                      setShowInfoModal(false);
                      handleDocumentPress(selectedAccount);
                    }}
                  >
                    <FileText size={18} color={colors.success} />
                    <Text style={styles.actionListItemText}>View / Verify Documents</Text>
                    <ChevronRightIcon size={16} color={colors.textMuted} />
                  </TouchableOpacity>

                  {isOwner && (account.permanently_blocked ? (
                    <TouchableOpacity
                      style={styles.actionListItem}
                      onPress={() => handlePermanentUnblock(selectedAccount)}
                    >
                      <ShieldCheckIcon size={18} color={colors.success} />
                      <Text style={styles.actionListItemText}>Remove Permanent Block</Text>
                      <ChevronRightIcon size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionListItem}
                      onPress={() => handlePermanentBlock(selectedAccount)}
                    >
                      <ShieldAlertIcon size={18} color={colors.error} />
                      <Text style={[styles.actionListItemText, { color: colors.error }]}>Permanent Block (Fraud)</Text>
                      <ChevronRightIcon size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                  {!!account.permanently_blocked_reason && (
                    <Text style={styles.permanentBlockReasonText}>Reason: {account.permanently_blocked_reason}</Text>
                  )}

                  {isOwner && (
                    <TouchableOpacity
                      style={[styles.actionListItem, { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setShowInfoModal(false);
                        handleDeleteAccount(selectedAccount);
                      }}
                    >
                      <Trash2 size={18} color={colors.error} />
                      <Text style={[styles.actionListItemText, { color: colors.error }]}>Remove Account</Text>
                      <ChevronRightIcon size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.modalLoadingContainer}>
              <Text style={styles.emptyText}>No account details available</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  if (error && !loading && !isFilterLoading) {
    return <ErrorMessage message={error} onRetry={fetchAccounts} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">Drivers & vendors</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>{totalCount} registered accounts</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <ThemeToggle size={20} />
            {selectMode && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? '#312E81' : colors.primaryTint, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }}
                onPress={() => {
                  const selectableIds = filteredAccounts.filter((a) => a.account_type !== 'car').map((a) => a.id);
                  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
                  setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
                }}
              >
                <CheckSquare size={16} color={isDark ? '#818CF8' : colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#818CF8' : colors.primary }}>
                  {filteredAccounts.filter((a) => a.account_type !== 'car').every((a) => selectedIds.has(a.id)) && filteredAccounts.some((a) => a.account_type !== 'car') ? 'Clear All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}
            {!selectMode && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: themeColors.surface, borderWidth: 1, borderColor: themeColors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 }}
                onPress={() => {
                  Alert.alert(
                    'Sort by',
                    undefined,
                    [
                      ...SORT_OPTIONS.map((opt) => ({
                        text: opt.value === sortBy ? `✓ ${opt.label}` : opt.label,
                        onPress: () => setSortBy(opt.value),
                      })),
                      { text: 'Cancel', style: 'cancel' as const },
                    ]
                  );
                }}
              >
                <ArrowUpDown size={14} color={themeColors.textSecondary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.textSecondary }}>Sort</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: selectMode ? (isDark ? '#7F1D1D' : colors.error + '15') : (isDark ? '#312E81' : colors.primaryTint), paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
              onPress={() => {
                setSelectMode((prev) => !prev);
                setSelectedIds(new Set());
              }}
            >
              {selectMode ? <X size={16} color={isDark ? '#F87171' : colors.error} /> : <ListChecks size={16} color={isDark ? '#818CF8' : colors.primary} />}
              <Text style={{ fontSize: 13, fontWeight: '700', color: selectMode ? (isDark ? '#F87171' : colors.error) : (isDark ? '#818CF8' : colors.primary) }}>
                {selectMode ? 'Cancel' : 'Select'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={18} color={themeColors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by name, mobile, or reg number..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={runSearch}
          placeholderTextColor={themeColors.textMuted}
          keyboardType="default"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); fetchAccounts(true); }} style={styles.searchClearButton}>
            <Text style={styles.searchClearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={runSearch} style={styles.searchGoButton}>
          <Text style={styles.searchGoButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterTabsRow}>
        {ACCOUNT_TYPE_TABS.map((tab) => {
          const isActive = accountTypeFilter === tab.value;

          return (
            <TouchableOpacity
              key={tab.value}
              style={[
                styles.filterTab,
                isActive && { backgroundColor: tab.color, borderColor: tab.color },
              ]}
              onPress={() => handleAccountTypeFilterChange(tab.value)}
              disabled={isFilterLoading}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterTabsRow}>
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.value;

          return (
            <TouchableOpacity
              key={tab.value}
              style={[
                styles.filterTab,
                isActive && { backgroundColor: tab.color, borderColor: tab.color },
              ]}
              onPress={() => handleStatusFilterChange(tab.value)}
              disabled={isFilterLoading}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        style={styles.list}
        data={sortedAccounts}
        renderItem={renderAccountItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContainer, selectMode && selectedIds.size > 0 && { paddingBottom: 90 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.footerLoader} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No accounts found</Text>
          </View>
        }
      />

      {(loading || isFilterLoading) && <LoadingSpinner overlay />}

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.bulkBar}>
          <View style={styles.bulkBarCountWrap}>
            <View style={styles.bulkBarCountBadge}>
              <Text style={styles.bulkBarCountBadgeText}>{selectedIds.size}</Text>
            </View>
            <Text style={styles.bulkBarText}>selected</Text>
          </View>
          <View style={styles.bulkBtnGroup}>
            <TouchableOpacity
              style={[styles.bulkActionBtn, styles.bulkDeactivateBtn, bulkUpdating && { opacity: 0.6 }]}
              onPress={() => handleBulkStatusChange(false)}
              disabled={bulkUpdating}
            >
              {bulkUpdating ? (
                <ActivityIndicator size="small" color={colors.warning} />
              ) : (
                <>
                  <Power size={15} color={colors.warning} />
                  <Text style={[styles.bulkActionBtnText, { color: colors.warning }]}>Deactivate</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkActionBtn, styles.bulkActivateBtn, bulkUpdating && { opacity: 0.6 }]}
              onPress={() => handleBulkStatusChange(true)}
              disabled={bulkUpdating}
            >
              {bulkUpdating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <CheckSquare size={15} color="white" />
                  <Text style={styles.bulkActionBtnText}>Activate</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {renderAccountDetailsModal()}

      <Modal
        visible={blockReasonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockReasonModalVisible(false)}
      >
        <View style={styles.blockModalOverlay}>
          <View style={styles.blockModalCard}>
            <Text style={styles.blockModalTitle}>Permanent Block</Text>
            <Text style={styles.blockModalSubtitle}>
              {blockTargetAccount?.name} will be blocked and marked as a confirmed fraud/bad-actor account - separate from a normal Inactive toggle. Pick or type a reason:
            </Text>
            {BLOCK_REASON_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.blockReasonPreset, blockReasonInput === preset && styles.blockReasonPresetActive]}
                onPress={() => setBlockReasonInput(preset)}
              >
                <Text style={[styles.blockReasonPresetText, blockReasonInput === preset && styles.blockReasonPresetTextActive]}>{preset}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.blockModalInput}
              placeholder="Or type a custom reason..."
              placeholderTextColor="#9CA3AF"
              value={blockReasonInput}
              onChangeText={setBlockReasonInput}
              multiline
            />
            <View style={styles.blockModalButtonsRow}>
              <TouchableOpacity
                style={[styles.blockModalButton, { backgroundColor: '#F3F4F6' }]}
                onPress={() => setBlockReasonModalVisible(false)}
              >
                <Text style={{ color: '#374151', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.blockModalButton, { backgroundColor: colors.error, opacity: blockSubmitting ? 0.6 : 1 }]}
                onPress={submitPermanentBlock}
                disabled={blockSubmitting}
              >
                {blockSubmitting ? <ActivityIndicator size="small" color="white" /> : <Text style={{ color: 'white', fontWeight: '700' }}>Block Permanently</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
  },
  list: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  searchGoButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchGoButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchClearButton: {
    paddingHorizontal: 4,
  },
  searchClearButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 6,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  accountCardInactive: {
    // Status is already communicated by the StatusBadge pill up top - a
    // whole-card yellow tint on every inactive row (the old treatment) just
    // added visual noise across a long list. Kept as a hook in case a
    // lighter touch is wanted later, intentionally a no-op for now.
  },
  blockedTag: {
    backgroundColor: colors.errorTint,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  blockedTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  docsPendingTag: {
    backgroundColor: colors.warningTint,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  docsPendingTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: 0.2,
  },
  accountCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  bulkBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  bulkBarCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkBarCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 6,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  bulkBarCountBadgeText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
  },
  bulkBarText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    fontSize: 13,
  },
  bulkBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  bulkActionBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
  bulkActivateBtn: {
    backgroundColor: colors.success,
  },
  bulkDeactivateBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  accountTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleActive: {
    backgroundColor: colors.primaryTint,
  },
  avatarCircleMuted: {
    backgroundColor: colors.background,
  },
  accountNameMobileContainer: {
    flex: 1,
    gap: 2,
  },
  accountTypeLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  accountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  accountRegId: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  accountMobile: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  regIdValue: {
    fontWeight: '700',
    color: colors.primary,
  },
  accountId: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionChipIconOnly: {
    paddingHorizontal: 9,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  actionListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionListItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  permanentBlockReasonText: {
    fontSize: 12,
    color: colors.error,
    fontStyle: 'italic',
    paddingBottom: 10,
    marginTop: -4,
  },
  blockModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  blockModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  blockModalTitle: { fontSize: 18, fontWeight: '800', color: colors.error, marginBottom: 6 },
  blockModalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  blockReasonPreset: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  blockReasonPresetActive: {
    borderColor: colors.error,
    backgroundColor: colors.errorTint,
  },
  blockReasonPresetText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  blockReasonPresetTextActive: { color: colors.error, fontWeight: '700' },
  blockModalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    minHeight: 70,
    textAlignVertical: 'top',
    marginTop: 4,
    marginBottom: 16,
  },
  blockModalButtonsRow: { flexDirection: 'row', gap: 10 },
  blockModalButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  detailSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 2,
    textAlign: 'right',
  },
  carCard: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  carName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  carDetails: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  carStatus: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  driverCard: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  driverDetails: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  driverStatus: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  footerLoader: {
    paddingVertical: 20,
  },
});
