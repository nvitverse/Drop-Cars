import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar as RNStatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Car,
  Building2,
  CarFront,
  User,
  Briefcase,
  UserCheck,
  Star,
  MapPin,
  Radio,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Clock,
  UserPlus,
  Plus,
  Sparkles,
  Users,
  CreditCard,
} from 'lucide-react-native';
import { colors, shadows } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { apiService } from '@/services/api';
import AdminCreateAccountModal from '@/components/AdminCreateAccountModal';

export default function FleetHubScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  const [counts, setCounts] = useState<{ fleet_owners: number; drivers: number; cars: number; vendors: number } | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<{
    drivers_online: number;
    drivers_driving: number;
    drivers_total: number;
    cars_verified: number;
    cars_total: number;
    pending_fleet_doc_reviews: number;
    owner_wallet_total: number;
    vendor_wallet_total: number;
    owners_wallet_at_risk: number;
    avg_driver_rating: number;
    avg_car_rating: number;
    billing_overdue_count: number;
    revenue_last_7_days: Array<{ date: string; profit: number }>;
  } | null>(null);

  // Manual Onboarding Modal State
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createModalType, setCreateModalType] = useState<'fleet' | 'vendor' | 'customer'>('fleet');

  const loadCounts = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setCountsLoading(true);
      setCountsError(false);
      const data = await apiService.getFleetHubCounts();
      setCounts(data);
      if (data.reports) setReports(data.reports);
    } catch (e) {
      setCountsError(true);
    } finally {
      setCountsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const headerGradientColors: [string, string] = isDark
    ? ['#0F172A', '#1E1B4B']
    : ['#1E1B4B', '#2E1065'];

  const onlineCount = reports?.drivers_online ?? 0;
  const docsPending = reports?.pending_fleet_doc_reviews ?? 0;

  const openCreateModal = (type: 'fleet' | 'vendor' | 'customer') => {
    setCreateModalType(type);
    setCreateModalVisible(true);
  };

  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, flex: 1 }]}>
      <StatusBar style="light" />

      {/* 1. Unified Rich Executive Header */}
      <LinearGradient
        colors={headerGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroBanner, { paddingTop: topPadding + 8 }]}
      >
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Fleet & Partners</Text>
            <Text style={styles.heroSubTitle}>
              Vehicles, driver verification & fleet directories
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle size={20} />
            <TouchableOpacity
              onPress={() => loadCounts(true)}
              style={[styles.heroRefreshBtn, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]}
              activeOpacity={0.7}
            >
              <RefreshCw size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 1-Tap Quick Action Dock Inside Header - Direct Navigation to Dedicated App-Grade Pages */}
        <View style={styles.quickDock}>
          <TouchableOpacity
            style={styles.dockItem}
            activeOpacity={0.8}
            onPress={() => router.push('/create-fleet-owner' as any)}
          >
            <View style={[styles.dockIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.25)' }]}>
              <Car size={16} color="#34D399" />
            </View>
            <Text style={styles.dockText}>+ New Fleet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockItem}
            activeOpacity={0.8}
            onPress={() => router.push('/create-vendor' as any)}
          >
            <View style={[styles.dockIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.25)' }]}>
              <Building2 size={16} color="#60A5FA" />
            </View>
            <Text style={styles.dockText}>+ New Vendor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockItem}
            activeOpacity={0.8}
            onPress={() => router.push('/create-b2b-client' as any)}
          >
            <View style={[styles.dockIconBox, { backgroundColor: 'rgba(236, 72, 153, 0.25)' }]}>
              <Briefcase size={16} color="#F472B6" />
            </View>
            <Text style={styles.dockText}>+ New B2B</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockItem}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/accounts' as any)}
          >
            <View style={[styles.dockIconBox, { backgroundColor: 'rgba(255, 255, 255, 0.18)' }]}>
              <Users size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.dockText}>All Profiles</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCounts(true)} colors={[colors.primary]} />}
      >
        {countsLoading && !refreshing && (
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontWeight: '600' }}>Loading fleet snapshot...</Text>
          </View>
        )}

        {!countsLoading && countsError && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => loadCounts()}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: 12,
              backgroundColor: isDark ? '#7F1D1D40' : '#FEE2E2',
              borderWidth: 1,
              borderColor: '#EF444460',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <AlertTriangle size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: isDark ? '#FCA5A5' : '#991B1B' }}>Could not load live fleet counts</Text>
              <Text style={{ fontSize: 11.5, color: isDark ? '#FECACA' : '#B91C1C', marginTop: 1 }}>Tap to retry connection</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 2. Live Fleet KPI Bento Grid (2x2) */}
        {reports && (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted, marginBottom: 8 }]}>
              LIVE FLEET STATUS
            </Text>

            <View style={styles.bentoGrid}>
              {/* Tile 1: Drivers Online */}
              <View
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#064E3B25' : '#F0FDF4',
                    borderColor: isDark ? '#10B98150' : '#BBF7D0',
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#10B98120' }]}>
                    <Radio size={18} color="#10B981" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>Live</Text>
                  </View>
                </View>
                <View>
                  <Text style={[styles.bentoStatValue, { color: isDark ? '#6EE7B7' : '#065F46' }]}>
                    {reports.drivers_online} <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>/ {reports.drivers_total || counts?.drivers || 0}</Text>
                  </Text>
                  <Text style={[styles.bentoTitle, { color: themeColors.text, marginTop: 2 }]}>Drivers Online</Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]}>Ready for dispatch</Text>
                </View>
              </View>

              {/* Tile 2: Cars Verified */}
              <View
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#0C2B4025' : '#F0F9FF',
                    borderColor: isDark ? '#0EA5E950' : '#BAE6FD',
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#0EA5E920' }]}>
                    <CarFront size={18} color="#0EA5E9" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: '#0EA5E9' }]}>
                    <Text style={styles.bentoBadgeText}>Verified</Text>
                  </View>
                </View>
                <View>
                  <Text style={[styles.bentoStatValue, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
                    {reports.cars_verified} <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.textSecondary }}>/ {reports.cars_total || counts?.cars || 0}</Text>
                  </Text>
                  <Text style={[styles.bentoTitle, { color: themeColors.text, marginTop: 2 }]}>Cars Verified</Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]}>Active vehicle fleet</Text>
                </View>
              </View>

              {/* Tile 3: Driving Now */}
              <View
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#3D280825' : '#FFFBEB',
                    borderColor: isDark ? '#F59E0B50' : '#FDE68A',
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#F59E0B20' }]}>
                    <Clock size={18} color="#F59E0B" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: '#D97706' }]}>
                    <Text style={styles.bentoBadgeText}>On Trip</Text>
                  </View>
                </View>
                <View>
                  <Text style={[styles.bentoStatValue, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                    {reports.drivers_driving}
                  </Text>
                  <Text style={[styles.bentoTitle, { color: themeColors.text, marginTop: 2 }]}>Driving Now</Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]}>Running live trips</Text>
                </View>
              </View>

              {/* Tile 4: Documents to check */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push('/documents-review-queue' as any)}
                style={[
                  styles.bentoCard,
                  {
                    backgroundColor: isDark ? '#3B1B5425' : '#FAF5FF',
                    borderColor: docsPending > 0 ? (isDark ? '#8B5CF660' : '#DDD6FE') : themeColors.border,
                  },
                ]}
              >
                <View style={styles.bentoHeader}>
                  <View style={[styles.bentoIconBox, { backgroundColor: '#8B5CF620' }]}>
                    <ShieldAlert size={18} color="#8B5CF6" />
                  </View>
                  <View style={[styles.bentoBadge, { backgroundColor: docsPending > 0 ? '#8B5CF6' : '#10B981' }]}>
                    <Text style={styles.bentoBadgeText}>
                      {docsPending > 0 ? `${docsPending} Pending` : 'Clear'}
                    </Text>
                  </View>
                </View>
                <View>
                  <Text style={[styles.bentoStatValue, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                    {docsPending}
                  </Text>
                  <Text style={[styles.bentoTitle, { color: themeColors.text, marginTop: 2 }]}>Docs to Check</Text>
                  <Text style={[styles.bentoSubtitle, { color: themeColors.textSecondary }]}>Licence, RC & KYC</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 3. Section 1: Fleet & Vehicles Directory */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted, marginBottom: 8 }]}>
            FLEET VEHICLES & DRIVERS DIRECTORY
          </Text>

          <View style={styles.denseList}>
            {/* Fleet Subscriptions & Billing Status */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/fleet-subscriptions' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#8B5CF615' }]}>
                <CreditCard size={19} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.denseTitle, { color: themeColors.text }]}>Fleet Subscriptions</Text>
                  <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>TRACKING</Text>
                  </View>
                </View>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Payment channels, manual mark-paid, pause/resume logs & trusted status
                </Text>
              </View>
              {(reports?.billing_overdue_count ?? 0) > 0 ? (
                <View style={[styles.denseBadge, { backgroundColor: '#EF4444' }]}>
                  <Text style={[styles.denseBadgeText, { color: '#FFFFFF', fontWeight: '800' }]}>
                    {reports?.billing_overdue_count} Overdue
                  </Text>
                </View>
              ) : (
                <ChevronRight size={16} color={themeColors.textSecondary} />
              )}
            </TouchableOpacity>

            {/* Fleet Drivers (Owners) */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/vehicle-owners' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#10B98115' }]}>
                <Car size={19} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Fleet Drivers</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Owner profile, wallet balance, attached cars & drivers
                </Text>
              </View>
              {(counts?.fleet_owners ?? 0) > 0 && (
                <View style={[styles.denseBadge, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.denseBadgeText, { color: themeColors.text }]}>
                    {counts?.fleet_owners.toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Driver Lookup */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/find-driver' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#EF444415' }]}>
                <MapPin size={19} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Driver Lookup</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Live status, current trip assignment & direct contact
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Cars & Cabs */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/cars' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#F59E0B15' }]}>
                <CarFront size={19} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Cars & Cabs</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Check RC, insurance, FC validity & model classification
                </Text>
              </View>
              {(counts?.cars ?? 0) > 0 && (
                <View style={[styles.denseBadge, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.denseBadgeText, { color: themeColors.text }]}>
                    {counts?.cars.toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Section 2: Business Partners & Clients Directory */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted, marginBottom: 8 }]}>
            BUSINESS PARTNERS & CLIENTS DIRECTORY
          </Text>

          <View style={styles.denseList}>
            {/* Vendors */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/vendors' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#3B82F615' }]}>
                <Building2 size={19} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Vendors & Travel Desks</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Vendor profile, wallet, bookings & business billing
                </Text>
              </View>
              {(counts?.vendors ?? 0) > 0 && (
                <View style={[styles.denseBadge, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.denseBadgeText, { color: themeColors.text }]}>
                    {counts?.vendors.toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Customers & B2B */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/customers' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#EC489915' }]}>
                <UserCheck size={19} color="#EC4899" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Customers & B2B Clients</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Passenger profiles, corporate bookings & loyalty
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Own Fleet */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/own-fleet' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#0EA5E915' }]}>
                <Briefcase size={19} color="#0EA5E9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Own Fleet</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Company cars, drivers, daily duty attendance & payroll
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>

            {/* Ratings & Quality */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/ratings-analytics' as any)}
              style={[styles.denseRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            >
              <View style={[styles.denseIconBox, { backgroundColor: '#D9770615' }]}>
                <Star size={19} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.denseTitle, { color: themeColors.text }]}>Ratings & Quality</Text>
                <Text style={[styles.denseSubtitle, { color: themeColors.textSecondary }]}>
                  Driver trip ratings, low-rating alerts & leaderboard
                </Text>
              </View>
              <ChevronRight size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroBanner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 21,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  heroBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  heroSubTitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    marginTop: 2,
  },
  heroCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  heroRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dockItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  dockIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  sectionWrap: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bentoCard: {
    width: '48.4%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  bentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bentoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bentoBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  bentoStatValue: {
    fontSize: 18,
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  bentoTitle: {
    fontSize: 12.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  bentoSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  denseList: {
    gap: 8,
  },
  denseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  denseIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denseTitle: {
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  denseSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  denseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  denseBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
});
