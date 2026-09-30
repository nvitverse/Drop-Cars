import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, UserCheck, Mail, Phone, UsersRound, Building2, Sparkles } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Segmented, EmptyState, SkeletonRow } from '@/components/ui';

interface Customer {
  id: string;
  customer_id: string;
  full_name: string;
  primary_number: string;
  email?: string | null;
  saved_addresses?: any[] | null;
  segment?: 'INDIVIDUAL' | 'B2B' | 'CORPORATE';
  company_name?: string | null;
  created_at: string;
}

const SEGMENT_TABS: { label: string; value: 'ALL' | 'INDIVIDUAL' | 'B2B' | 'CORPORATE' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Individual', value: 'INDIVIDUAL' },
  { label: 'B2B', value: 'B2B' },
  { label: 'Corporate', value: 'CORPORATE' },
];

const SEGMENT_LABEL: Record<string, string> = { INDIVIDUAL: 'Individual', B2B: 'B2B', CORPORATE: 'Corporate' };
const SEGMENT_VARIANT: Record<string, 'neutral' | 'info' | 'warning'> = { INDIVIDUAL: 'neutral', B2B: 'info', CORPORATE: 'warning' };

const PAGE_SIZE = 50;

export default function CustomersScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | 'INDIVIDUAL' | 'B2B' | 'CORPORATE'>('ALL');
  const [totalCount, setTotalCount] = useState(0);
  const [newCustomersToday, setNewCustomersToday] = useState<number | null>(null);

  const fetchCustomers = async (reset = true, segment = segmentFilter) => {
    try {
      setError(null);
      const skip = reset ? 0 : customers.length;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getCustomers(skip, PAGE_SIZE, undefined, segment === 'ALL' ? undefined : segment);
      const items = data.customers || [];
      setCustomers(prev => (reset ? items : [...prev, ...items]));
      setTotalCount(data.total_count || 0);
      setHasMore(items.length === PAGE_SIZE);

      if (reset) {
        apiService.getBusinessSnapshot().then((snap) => {
          if (snap && snap.new_customers_today != null) {
            setNewCustomersToday(snap.new_customers_today);
          }
        }).catch(() => {});
      }
    } catch (e: any) {
      console.error('Failed to fetch customers:', e);
      if (reset) {
        setError('Customer data isn’t available right now.');
        setCustomers([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCustomers(true);
  }, []);

  const onSelectSegmentTab = (segment: typeof segmentFilter) => {
    if (segment === segmentFilter) return;
    setSegmentFilter(segment);
    setLoading(true);
    fetchCustomers(true, segment);
  };

  const handleChangeSegment = (item: Customer) => {
    Alert.alert(
      `Set segment for ${item.full_name}`,
      undefined,
      [
        { text: 'Individual', onPress: () => saveSegment(item, 'INDIVIDUAL') },
        { text: 'B2B', onPress: () => saveSegment(item, 'B2B') },
        { text: 'Corporate', onPress: () => saveSegment(item, 'CORPORATE') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const saveSegment = async (item: Customer, segment: 'INDIVIDUAL' | 'B2B' | 'CORPORATE') => {
    setCustomers((prev) => prev.map((c) => (c.id === item.id ? { ...c, segment } : c)));
    try {
      await apiService.updateCustomerSegment(item.id, segment);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update segment');
      fetchCustomers(true);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomers(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchCustomers(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(query) ||
        c.primary_number.includes(query) ||
        (c.email || '').toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

  const openCustomer = (item: Customer) => {
    router.push({
      pathname: '/customer-detail',
      params: {
        customerId: item.customer_id,
        customerDetailsId: item.id,
        fullName: item.full_name,
        primaryNumber: item.primary_number,
        email: item.email || '',
      },
    });
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const segment = item.segment || 'INDIVIDUAL';
    return (
      <Card
        onPress={() => openCustomer(item)}
        style={styles.customerCard}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.avatarBox, { backgroundColor: themeColors.primaryLight }]}>
            {segment === 'INDIVIDUAL' ? (
              <UserCheck size={18} color={themeColors.primary} />
            ) : (
              <Building2 size={18} color={themeColors.primary} />
            )}
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.nameText, { color: themeColors.text }]} numberOfLines={1}>{item.full_name}</Text>
            {!!item.company_name && (
              <Text style={[styles.companyText, { color: themeColors.textSecondary }]} numberOfLines={1}>{item.company_name}</Text>
            )}
            <View style={styles.metaRow}>
              <Phone size={12} color={themeColors.textMuted} />
              <Text style={[styles.phoneText, { color: themeColors.textSecondary }]}>{item.primary_number}</Text>
            </View>
            {!!item.email && (
              <View style={styles.metaRow}>
                <Mail size={12} color={themeColors.textMuted} />
                <Text style={[styles.phoneText, { color: themeColors.textMuted }]} numberOfLines={1}>{item.email}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => handleChangeSegment(item)}
            activeOpacity={0.7}
          >
            <StatusPill
              label={SEGMENT_LABEL[segment]}
              variant={SEGMENT_VARIANT[segment]}
              size="sm"
            />
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Customers</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{totalCount}</Text>
          </View>
        </View>
        {newCustomersToday != null && newCustomersToday > 0 && (
          <View style={[styles.newTodayBadge, { backgroundColor: themeColors.successLight }]}>
            <Sparkles size={11} color={themeColors.success} />
            <Text style={[styles.newTodayText, { color: themeColors.success }]}>+{newCustomersToday} today</Text>
          </View>
        )}
      </View>

      {/* Segment Tabs */}
      <View style={styles.tabContainer}>
        <Segmented
          options={SEGMENT_TABS}
          value={segmentFilter}
          onChange={(v) => onSelectSegmentTab(v as any)}
        />
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by name, phone or email..."
          placeholderTextColor={themeColors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* List / Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomerItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon={<UsersRound size={36} color={themeColors.textMuted} />}
              title={searchQuery ? 'No customers found' : 'No registered customers'}
              message={searchQuery ? `No matching customers for "${searchQuery}"` : 'Customer profiles will show up here.'}
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
  newTodayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  newTodayText: {
    fontSize: 11,
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
  listContent: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  customerCard: {
    marginBottom: 4,
    padding: 12,
  },
  cardHeader: {
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
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  companyText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});
