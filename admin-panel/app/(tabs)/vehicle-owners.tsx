import { useRememberedCounts } from '@/hooks/useRememberedCounts';
import { LiveNumber } from '@/components/ui';
import React, { useState, useEffect, useCallback } from 'react';
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
  Platform,
  StatusBar as RNStatusBar,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Phone,
  MapPin,
  Wallet,
  Car,
  User,
  ShieldCheck,
  X,
  Plus,
  ChevronRight,
  Crown,
  Star,
  Shield,
  MessageCircle,
  PhoneCall,
  ArrowLeft,
  Users,
  CheckCircle2,
  Filter,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import ActionSheet from '@/components/ActionSheet';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, EmptyState, SkeletonRow } from '@/components/ui';
import { colors, shadows } from '@/constants/theme';
import AdminCreateAccountModal from '@/components/AdminCreateAccountModal';

export interface VehicleOwner {
  id: string;
  vehicle_owner_id: string;
  full_name: string;
  primary_number: string;
  secondary_number?: string;
  wallet_balance: number;
  address: string;
  city: string;
  account_status: string;
  created_at: string;
  tier?: 'PREFERRED' | 'STANDARD' | null;
  subscription_type?: string | null;
  admin_trusted_override?: boolean;
  car_count: number;
  driver_count: number;
}

const PAGE_SIZE = 30;

type StatusTabFilter = 'all' | 'ACTIVE' | 'INACTIVE';
type TierTabFilter = 'all' | 'STANDARD' | 'TRUSTED' | 'MONTHLY' | 'YEARLY';

const STATUS_FILTER_TABS: { label: string; value: StatusTabFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

const TIER_FILTERS: { id: TierTabFilter; label: string; icon: any; color: string }[] = [
  { id: 'all', label: 'All Tiers', icon: Users, color: '#64748B' },
  { id: 'TRUSTED', label: 'Trusted (All)', icon: ShieldCheck, color: '#0EA5E9' },
  { id: 'MONTHLY', label: 'Trusted Monthly', icon: Star, color: '#8B5CF6' },
  { id: 'YEARLY', label: 'Trusted Yearly', icon: Crown, color: '#F59E0B' },
  { id: 'STANDARD', label: 'Standard Users', icon: Car, color: '#64748B' },
];

export default function VehicleOwnersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);
  const { isDark, themeColors } = useTheme();

  const [vehicleOwners, setVehicleOwners] = useState<VehicleOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [statusTab, setStatusTab] = useState<StatusTabFilter>('all');
  const [tierTab, setTierTab] = useState<TierTabFilter>('all');
  const [totalCount, setTotalCount] = useState(0);
  const { ready: countsReady, markFresh } = useRememberedCounts('owners_counts_v1', { totalCount }, { totalCount: setTotalCount });

  const [selectedOwner, setSelectedOwner] = useState<VehicleOwner | null>(null);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const ownersCountRef = React.useRef(0);
  useEffect(() => {
    ownersCountRef.current = vehicleOwners.length;
  }, [vehicleOwners.length]);

  const fetchVehicleOwners = useCallback(
    async (reset = true, search = activeSearch, status = statusTab, tier = tierTab) => {
      try {
        setError(null);
        const skip = reset ? 0 : ownersCountRef.current;
        if (!reset) setLoadingMore(true);
        else setLoading(true);

        const data = await apiService.getVehicleOwners(
          skip,
          PAGE_SIZE,
          search || undefined,
          status !== 'all' ? status : undefined,
          tier !== 'all' ? tier : undefined
        );

        const newOwners = Array.isArray(data?.vehicle_owners) ? data.vehicle_owners : [];
        setVehicleOwners((prev) => (reset ? newOwners : [...prev, ...newOwners]));
        setHasMore(newOwners.length === PAGE_SIZE);
        setTotalCount(typeof data?.total_count === 'number' ? data.total_count : (reset ? newOwners.length : ownersCountRef.current + newOwners.length));
        markFresh(reset && !search && status === 'all' && tier === 'all');
      } catch (err) {
        if (reset) setError('Failed to load fleet partners. Pull to refresh.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [activeSearch, statusTab, tierTab]
  );

  useEffect(() => {
    fetchVehicleOwners(true, activeSearch, statusTab, tierTab);
  }, [statusTab, tierTab]);

  const runSearch = () => {
    const term = searchInput.trim();
    setActiveSearch(term);
    fetchVehicleOwners(true, term, statusTab, tierTab);
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
    fetchVehicleOwners(true, '', statusTab, tierTab);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchVehicleOwners(true, activeSearch, statusTab, tierTab);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore && vehicleOwners.length >= PAGE_SIZE) {
      fetchVehicleOwners(false, activeSearch, statusTab, tierTab);
    }
  };

  const handleStatusToggle = async (vehicleOwnerId: string, newStatus: string) => {
    try {
      setVehicleOwners((prev) =>
        prev.map((owner) =>
          owner.vehicle_owner_id === vehicleOwnerId ? { ...owner, account_status: newStatus } : owner
        )
      );
      await apiService.updateVehicleOwnerAccountStatus(vehicleOwnerId, newStatus);
    } catch (err) {
      fetchVehicleOwners(true, activeSearch, statusTab, tierTab);
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!selectedOwner) return;
    try {
      await apiService.updateVehicleOwnerAccountStatus(selectedOwner.vehicle_owner_id, status);
      setVehicleOwners((prev) =>
        prev.map((owner) =>
          owner.vehicle_owner_id === selectedOwner.vehicle_owner_id ? { ...owner, account_status: status } : owner
        )
      );
    } catch (err) {
      console.warn('Status update error:', err);
    }
  };

  const handleCallPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean) Linking.openURL(`tel:${clean}`);
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const clean = phone.replace(/\D/g, '');
    const target = clean.length === 10 ? `91${clean}` : clean;
    const text = encodeURIComponent(`Hello ${name}, regarding your Drop Cars Fleet Partner account:`);
    Linking.openURL(`https://api.whatsapp.com/send?phone=${target}&text=${text}`);
  };

  const formatCurrency = (amount: number) => {
    return `₹${(amount || 0).toLocaleString('en-IN')}`;
  };

  const getTierBadge = (item: VehicleOwner) => {
    const sub = (item.subscription_type || '').toUpperCase();
    if (sub === 'YEARLY') {
      return {
        label: 'Trusted Yearly',
        icon: Crown,
        color: '#D97706',
        bg: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
        border: '#F59E0B',
      };
    }
    if (sub === 'MONTHLY') {
      return {
        label: 'Trusted Monthly',
        icon: Star,
        color: '#7C3AED',
        bg: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE',
        border: '#8B5CF6',
      };
    }
    if (item.admin_trusted_override || item.tier === 'PREFERRED') {
      return {
        label: 'Trusted Partner',
        icon: ShieldCheck,
        color: '#0284C7',
        bg: isDark ? 'rgba(2, 132, 199, 0.2)' : '#E0F2FE',
        border: '#38BDF8',
      };
    }
    return {
      label: 'Standard',
      icon: Car,
      color: '#64748B',
      bg: isDark ? 'rgba(100, 116, 139, 0.2)' : '#F1F5F9',
      border: 'transparent',
    };
  };

  const renderOwnerItem = ({ item }: { item: VehicleOwner }) => {
    const isActive = (item.account_status || '').toUpperCase() === 'ACTIVE';
    const tierInfo = getTierBadge(item);
    const initials = (item.full_name || 'FO')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <TouchableOpacity
        style={[
          styles.ownerCard,
          {
            backgroundColor: isDark ? themeColors.surface : '#FFFFFF',
            borderColor: themeColors.border,
          },
        ]}
        onPress={() => router.push(`/fleet-owner-detail?ownerId=${item.vehicle_owner_id}` as any)}
        onLongPress={() => {
          setSelectedOwner(item);
          setShowStatusSheet(true);
        }}
        activeOpacity={0.88}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar with Initials & Active indicator */}
          <View style={{ position: 'relative' }}>
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  borderColor: isActive ? '#10B981' : themeColors.border,
                },
              ]}
            >
              <Text style={[styles.avatarInitials, { color: isActive ? '#10B981' : themeColors.textSecondary }]}>
                {initials}
              </Text>
            </View>
            <View
              style={[
                styles.avatarStatusDot,
                { backgroundColor: isActive ? '#10B981' : '#94A3B8' },
              ]}
            />
          </View>

          {/* Center Details */}
          <View style={{ flex: 1 }}>
            {/* Header: Name + Status Badge + Tier Badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <Text style={[styles.ownerName, { color: themeColors.text }]} numberOfLines={1}>
                {item.full_name || 'Fleet Owner'}
              </Text>

              {/* Status Pill */}
              <View
                style={{
                  backgroundColor: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: isActive ? '#10B98140' : '#EF444440',
                }}
              >
                <Text style={{ color: isActive ? '#10B981' : '#EF4444', fontSize: 10, fontFamily: 'Inter-Bold', fontWeight: '800' }}>
                  {item.account_status || 'ACTIVE'}
                </Text>
              </View>

              {/* Tier Pill */}
              <View
                style={[
                  styles.tierBadgeWrap,
                  { backgroundColor: tierInfo.bg, borderColor: tierInfo.border },
                ]}
              >
                <tierInfo.icon size={11} color={tierInfo.color} />
                <Text style={[styles.tierBadgeText, { color: tierInfo.color }]}>{tierInfo.label}</Text>
              </View>
            </View>

            {/* Meta Row: Phone, City, Call & WhatsApp shortcuts */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
              {/* Phone with dialer click */}
              <TouchableOpacity
                onPress={() => handleCallPhone(item.primary_number)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <PhoneCall size={12} color="#0EA5E9" />
                <Text style={[styles.metaText, { color: '#0EA5E9', fontWeight: '700' }]}>
                  {item.primary_number}
                </Text>
              </TouchableOpacity>

              {/* WhatsApp Quick Icon */}
              <TouchableOpacity
                onPress={() => handleWhatsApp(item.primary_number, item.full_name)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MessageCircle size={12} color="#10B981" />
                <Text style={[styles.metaText, { color: '#10B981', fontWeight: '700' }]}>Chat</Text>
              </TouchableOpacity>

              {/* City */}
              {!!item.city && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MapPin size={11} color={themeColors.textMuted} />
                  <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>{item.city}</Text>
                </View>
              )}
            </View>

            {/* Fleet Stats Chips: Cars & Drivers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={[styles.statChip, { backgroundColor: isDark ? themeColors.surfaceAlt : '#F8FAFC', borderColor: themeColors.border }]}>
                <Car size={11} color="#3B82F6" />
                <Text style={[styles.statChipText, { color: themeColors.text }]}>
                  <Text style={{ fontWeight: '800' }}>{item.car_count || 0}</Text> Cars
                </Text>
              </View>

              <View style={[styles.statChip, { backgroundColor: isDark ? themeColors.surfaceAlt : '#F8FAFC', borderColor: themeColors.border }]}>
                <User size={11} color="#8B5CF6" />
                <Text style={[styles.statChipText, { color: themeColors.text }]}>
                  <Text style={{ fontWeight: '800' }}>{item.driver_count || 0}</Text> Drivers
                </Text>
              </View>
            </View>
          </View>

          {/* Right Column: Wallet & Status Toggle */}
          <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: themeColors.textMuted, letterSpacing: 0.5 }}>
                WALLET
              </Text>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', fontWeight: '900', color: '#10B981', marginTop: 1 }}>
                {formatCurrency(item.wallet_balance)}
              </Text>
            </View>

            {/* Status Switch with Label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: isActive ? '#10B981' : themeColors.textMuted }}>
                {isActive ? 'ON' : 'OFF'}
              </Text>
              <Switch
                value={isActive}
                onValueChange={(val) => handleStatusToggle(item.vehicle_owner_id, val ? 'ACTIVE' : 'INACTIVE')}
                trackColor={{ false: isDark ? '#334155' : '#E2E8F0', true: '#10B98160' }}
                thumbColor={isActive ? '#10B981' : (isDark ? '#64748B' : '#CBD5E1')}
                style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, flex: 1 }]}>
      <StatusBar style="light" />

      {/* ── 1. Curved Operations-Grade Header Banner ── */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E1B4B'] : ['#2A2665', '#1B1446']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerBanner, { paddingTop: topPadding + 8 }]}
      >
        <View style={styles.headerTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBackBtn}
              activeOpacity={0.8}
            >
              <ArrowLeft size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.headerTitle}>Fleet Directory</Text>
                <View style={styles.headerCountBadge}>
                  <LiveNumber ready={countsReady} width={24} height={14}><Text style={styles.headerCountText}>{totalCount}</Text></LiveNumber>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>
                Fleet partners, verified cars & driver directories
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerAddBtn}
              onPress={() => router.push('/create-fleet-owner' as any)}
              activeOpacity={0.85}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={styles.headerAddBtnText}>+ New Fleet</Text>
            </TouchableOpacity>
            <ThemeToggle size={18} />
          </View>
        </View>

        {/* Primary Status Switcher: [ All | Active | Inactive ] */}
        <View style={styles.statusSegmentWrap}>
          {STATUS_FILTER_TABS.map((tab) => {
            const isActive = statusTab === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                style={[
                  styles.statusSegmentBtn,
                  isActive && styles.statusSegmentBtnActive,
                ]}
                onPress={() => setStatusTab(tab.value)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.statusSegmentText,
                    isActive ? { color: '#FFFFFF', fontWeight: '800' } : { color: 'rgba(255, 255, 255, 0.7)' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* ── 2. Secondary Tier & Membership Filter Horizontal Scroll ── */}
      <View style={{ backgroundColor: themeColors.surface, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}
        >
          {TIER_FILTERS.map((f) => {
            const isActive = tierTab === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                onPress={() => setTierTab(f.id)}
                activeOpacity={0.8}
                style={[
                  styles.tierFilterChip,
                  {
                    backgroundColor: isActive
                      ? (isDark ? '#3B82F630' : '#EFF6FF')
                      : (isDark ? themeColors.surfaceAlt : '#F8FAFC'),
                    borderColor: isActive ? '#3B82F6' : themeColors.border,
                  },
                ]}
              >
                <f.icon size={13} color={isActive ? '#3B82F6' : themeColors.textSecondary} />
                <Text
                  style={[
                    styles.tierFilterChipText,
                    {
                      color: isActive ? '#3B82F6' : themeColors.textSecondary,
                      fontWeight: isActive ? '800' : '600',
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 3. Search Bar with Instant Submit ── */}
      <View style={[styles.searchBarWrap, { backgroundColor: themeColors.background }]}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Search size={15} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search by name, mobile, city, driver..."
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

        <TouchableOpacity
          style={styles.searchSubmitBtn}
          onPress={runSearch}
          activeOpacity={0.85}
        >
          <Search size={13} color="#FFFFFF" />
          <Text style={styles.searchSubmitBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* ── 4. Lazy-Loaded Infinite Scroll Fleet List ── */}
      {loading && !refreshing && vehicleOwners.length === 0 ? (
        <View style={styles.loadingWrapper}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={vehicleOwners}
          renderItem={renderOwnerItem}
          keyExtractor={(item) => String(item.id || item.vehicle_owner_id)}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 110 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.15}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            error ? (
              <View style={{ padding: 24, alignItems: 'center', gap: 10 }}>
                <Car size={40} color={colors.primary} />
                <Text style={{ color: themeColors.text, fontSize: 15, fontWeight: '800' }}>Unable to load Fleet Directory</Text>
                <Text style={{ color: themeColors.textSecondary, fontSize: 12.5, textAlign: 'center' }}>{error}</Text>
                <TouchableOpacity
                  onPress={() => fetchVehicleOwners(true, activeSearch, statusTab, tierTab)}
                  style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 4 }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Tap to Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <EmptyState
                icon={<Car size={40} color={themeColors.textMuted} />}
                title={activeSearch || tierTab !== 'all' || statusTab !== 'all' ? 'No matching fleet partners' : 'No fleet partners registered'}
                message={activeSearch ? `No results for "${activeSearch}"` : 'Fleet partner accounts will show up here.'}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoaderWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.footerLoaderText, { color: themeColors.textSecondary }]}>
                  Loading more fleet partners...
                </Text>
              </View>
            ) : hasMore && vehicleOwners.length > 0 ? (
              <TouchableOpacity
                onPress={handleLoadMore}
                style={[styles.loadMoreBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                activeOpacity={0.8}
              >
                <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>
                  Load More ({totalCount - vehicleOwners.length} remaining)
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Quick Account Creation Modal */}
      <AdminCreateAccountModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        initialType="fleet"
        onSuccess={() => fetchVehicleOwners(true)}
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={showStatusSheet}
        onClose={() => setShowStatusSheet(false)}
        title="Update Fleet Driver Status"
        options={[
          { label: 'Active', value: 'ACTIVE', color: '#10B981' },
          { label: 'Inactive', value: 'INACTIVE', color: '#EF4444' },
          { label: 'Pending', value: 'PENDING', color: '#F59E0B' },
        ]}
        onSelect={handleStatusUpdate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    ...shadows.card,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  headerCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#10B981',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  headerAddBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  statusSegmentWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 4,
  },
  statusSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  statusSegmentBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  statusSegmentText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  tierFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierFilterChipText: {
    fontSize: 11.5,
    fontFamily: 'Inter-Bold',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    padding: 0,
  },
  searchSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 10,
  },
  searchSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  loadingWrapper: {
    padding: 14,
    gap: 10,
  },
  listContainer: {
    padding: 14,
    gap: 10,
  },
  ownerCard: {
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    ...shadows.card,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarInitials: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  ownerName: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  tierBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 0.8,
  },
  tierBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  metaText: {
    fontSize: 11.5,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statChipText: {
    fontSize: 11,
  },
  footerLoaderWrap: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadMoreBtn: {
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
});