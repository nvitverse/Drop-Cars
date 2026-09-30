import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Phone, MapPin, Wallet, Car, User, ShieldCheck, X } from 'lucide-react-native';
import { apiService } from '@/services/api';
import ActionSheet from '@/components/ActionSheet';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Segmented, EmptyState, SkeletonRow } from '@/components/ui';

interface VehicleOwner {
  id: string;
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  wallet_balance: number;
  address: string;
  city: string;
  account_status: string;
  created_at: string;
  tier?: 'PREFERRED' | 'STANDARD' | null;
  car_count: number;
  driver_count: number;
}

const PAGE_SIZE = 50;

type StatusTabFilter = 'all' | 'ACTIVE' | 'INACTIVE';

const STATUS_FILTER_TABS: { label: string; value: StatusTabFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

export default function VehicleOwnersScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [vehicleOwners, setVehicleOwners] = useState<VehicleOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<VehicleOwner | null>(null);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [statusTab, setStatusTab] = useState<StatusTabFilter>('all');
  const [statusTabLoading, setStatusTabLoading] = useState(false);

  const fetchVehicleOwners = async (reset = true, search = activeSearch, status = statusTab) => {
    try {
      setError(null);
      const skip = reset ? 0 : vehicleOwners.length;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getVehicleOwners(skip, PAGE_SIZE, search || undefined, status !== 'all' ? status : undefined);
      setVehicleOwners(prev => (reset ? data.vehicle_owners : [...prev, ...data.vehicle_owners]));
      setHasMore(data.vehicle_owners.length === PAGE_SIZE);
      setTotalCount(data.total_count);
    } catch (error) {
      if (reset) setError('Failed to load fleets. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setStatusTabLoading(false);
    }
  };

  const runSearch = () => {
    const term = searchInput.trim();
    setActiveSearch(term);
    setLoading(true);
    fetchVehicleOwners(true, term);
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
    setLoading(true);
    fetchVehicleOwners(true, '');
  };

  const handleStatusTabChange = (value: StatusTabFilter) => {
    if (value === statusTab || statusTabLoading) return;
    setStatusTab(value);
    setStatusTabLoading(true);
    fetchVehicleOwners(true, activeSearch, value);
  };

  useEffect(() => {
    fetchVehicleOwners(true);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVehicleOwners(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchVehicleOwners(false);
    }
  };

  const handleStatusToggle = async (vehicleOwnerId: string, newStatus: string) => {
    try {
      setVehicleOwners(prev => prev.map(owner =>
        owner.vehicle_owner_id === vehicleOwnerId
          ? { ...owner, account_status: newStatus }
          : owner
      ));
      await apiService.updateVehicleOwnerAccountStatus(vehicleOwnerId, newStatus);
    } catch (error) {
      console.error('Failed to update fleet driver status:', error);
      fetchVehicleOwners(true);
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selectedOwner) return;
    try {
      await apiService.updateVehicleOwnerAccountStatus(selectedOwner.vehicle_owner_id, status);
      setVehicleOwners(vehicleOwners.map(owner => 
        owner.vehicle_owner_id === selectedOwner.vehicle_owner_id 
          ? { ...owner, account_status: status }
          : owner
      ));
    } catch (error) {
      console.error('Failed to update fleet driver status:', error);
    }
  };

  const statusOptions = [
    { label: 'Active', value: 'ACTIVE', color: '#10B981' },
    { label: 'Inactive', value: 'INACTIVE', color: '#EF4444' },
    { label: 'Pending', value: 'PENDING', color: '#F59E0B' },
  ];

  const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') return 'success';
    if (s === 'PENDING') return 'warning';
    if (s === 'INACTIVE' || s === 'SUSPENDED' || s === 'BLOCKED') return 'danger';
    return 'neutral';
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const renderOwnerItem = ({ item }: { item: VehicleOwner }) => {
    const isActive = item.account_status === 'ACTIVE';
    return (
      <Card
        style={styles.ownerCard}
        onPress={() => router.push(`/fleet-owner-detail?ownerId=${item.vehicle_owner_id}` as any)}
        onLongPress={() => {
          setSelectedOwner(item);
          setShowStatusSheet(true);
        }}
      >
        <View style={styles.ownerHeader}>
          <View style={[styles.avatarBox, { backgroundColor: themeColors.primaryLight }]}>
            <Car size={18} color={themeColors.primary} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.ownerName, { color: themeColors.text }]} numberOfLines={1}>{item.full_name}</Text>
              <StatusPill status={item.account_status} variant={getStatusVariant(item.account_status)} size="sm" />
              {item.tier === 'PREFERRED' && (
                <View style={[styles.tierBadge, { backgroundColor: themeColors.primaryLight }]}>
                  <ShieldCheck size={11} color={themeColors.primary} />
                  <Text style={[styles.tierText, { color: themeColors.primary }]}>Trusted</Text>
                </View>
              )}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Phone size={11} color={themeColors.textMuted} />
                <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{item.primary_number}</Text>
              </View>
              {!!item.city && (
                <View style={styles.metaItem}>
                  <MapPin size={11} color={themeColors.textMuted} />
                  <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{item.city}</Text>
                </View>
              )}
            </View>
            <View style={styles.fleetRow}>
              <View style={[styles.fleetTag, { backgroundColor: themeColors.surfaceAlt }]}>
                <Car size={11} color={themeColors.textSecondary} />
                <Text style={[styles.fleetTagText, { color: themeColors.textSecondary }]}>{item.car_count || 0} Cars</Text>
              </View>
              <View style={[styles.fleetTag, { backgroundColor: themeColors.surfaceAlt }]}>
                <User size={11} color={themeColors.textSecondary} />
                <Text style={[styles.fleetTagText, { color: themeColors.textSecondary }]}>{item.driver_count || 0} Drivers</Text>
              </View>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <Text style={[styles.balanceLabel, { color: themeColors.textMuted }]}>Wallet</Text>
            <Text style={[styles.balanceAmount, { color: themeColors.success }]}>{formatCurrency(item.wallet_balance)}</Text>
            <Switch
              value={isActive}
              onValueChange={(val) => handleStatusToggle(item.vehicle_owner_id, val ? 'ACTIVE' : 'INACTIVE')}
              trackColor={{ false: themeColors.border, true: themeColors.success }}
              thumbColor={themeColors.surface}
              style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }], marginTop: 4 }}
            />
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Vehicle Owners</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{totalCount}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Segmented
          options={STATUS_FILTER_TABS}
          value={statusTab}
          onChange={(v) => handleStatusTabChange(v as StatusTabFilter)}
        />
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search fleet drivers..."
          placeholderTextColor={themeColors.textMuted}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={{ padding: 4 }}>
            <X size={14} color={themeColors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={vehicleOwners}
          renderItem={renderOwnerItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={<Car size={36} color={themeColors.textMuted} />}
              title={activeSearch ? 'No fleet drivers found' : 'No vehicle owners'}
              message={activeSearch ? `No results matching "${activeSearch}"` : 'Vehicle owner accounts will show up here.'}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            ) : null
          }
        />
      )}

      <ActionSheet
        visible={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        title="Update Fleet Driver Status"
        options={statusOptions}
        onSelect={handleStatusUpdate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  loadingContainer: {
    padding: 16,
    gap: 8,
  },
  listContainer: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  ownerCard: {
    marginBottom: 4,
    padding: 12,
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  ownerName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  fleetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  fleetTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fleetTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});