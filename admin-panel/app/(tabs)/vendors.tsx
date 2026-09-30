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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Phone, MapPin, Wallet, Building2, Store } from 'lucide-react-native';
import { apiService } from '@/services/api';
import ActionSheet from '@/components/ActionSheet';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, EmptyState, SkeletonRow } from '@/components/ui';

interface Vendor {
  id: string;
  vendor_id: string;
  full_name: string;
  primary_number: string;
  wallet_balance: number;
  bank_balance: number;
  address: string;
  city: string;
  account_status: string;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function VendorsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchVendors = async (reset = true) => {
    try {
      setError(null);
      const skip = reset ? 0 : vendors.length;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getVendors(skip, PAGE_SIZE);
      setVendors(prev => (reset ? data.vendors : [...prev, ...data.vendors]));
      setHasMore(data.vendors.length === PAGE_SIZE);
      setTotalCount(data.total_count);
    } catch (error) {
      if (reset) setError('Failed to load vendors. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchVendors(true);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVendors(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchVendors(false);
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selectedVendor) return;
    try {
      await apiService.updateVendorAccountStatus(selectedVendor.vendor_id, status);
      setVendors(vendors.map(vendor => 
        vendor.vendor_id === selectedVendor.vendor_id 
          ? { ...vendor, account_status: status }
          : vendor
      ));
    } catch (error) {
      console.error('Failed to update vendor status:', error);
    }
  };

  const filteredVendors = vendors.filter(vendor =>
    vendor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.primary_number.includes(searchQuery) ||
    vendor.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const renderVendorItem = ({ item }: { item: Vendor }) => (
    <Card
      style={styles.vendorCard}
      onPress={() => router.push({ pathname: '/vendor-detail', params: { vendorId: item.vendor_id } })}
      onLongPress={() => {
        setSelectedVendor(item);
        setShowStatusSheet(true);
      }}
    >
      <View style={styles.vendorHeader}>
        <View style={[styles.avatarBox, { backgroundColor: themeColors.primaryLight }]}>
          <Store size={18} color={themeColors.primary} />
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={styles.vendorNameRow}>
            <Text style={[styles.vendorName, { color: themeColors.text }]} numberOfLines={1}>{item.full_name}</Text>
            <StatusPill status={item.account_status} variant={getStatusVariant(item.account_status)} size="sm" />
          </View>
          <View style={styles.vendorDetails}>
            <View style={styles.detailItem}>
              <Phone size={12} color={themeColors.textMuted} />
              <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{item.primary_number}</Text>
            </View>
            {!!item.city && (
              <View style={styles.detailItem}>
                <MapPin size={12} color={themeColors.textMuted} />
                <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{item.city}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.balanceInfo}>
          <Text style={[styles.balanceLabel, { color: themeColors.textMuted }]}>Wallet</Text>
          <Text style={[styles.balanceAmount, { color: themeColors.success }]}>{formatCurrency(item.wallet_balance)}</Text>
          {item.bank_balance > 0 && (
            <Text style={[styles.bankText, { color: themeColors.textMuted }]}>Bank: {formatCurrency(item.bank_balance)}</Text>
          )}
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Vendors</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{totalCount}</Text>
          </View>
        </View>
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search vendors..."
          placeholderTextColor={themeColors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
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
          data={filteredVendors}
          renderItem={renderVendorItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={<Store size={36} color={themeColors.textMuted} />}
              title={searchQuery ? 'No vendors found' : 'No registered vendors'}
              message={searchQuery ? `No matching vendors for "${searchQuery}"` : 'Vendor accounts will appear here.'}
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
        title="Update Vendor Status"
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
  vendorCard: {
    marginBottom: 4,
    padding: 12,
  },
  vendorHeader: {
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
  vendorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  vendorName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  bankText: {
    fontSize: 10,
    marginTop: 1,
  },
  vendorDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});