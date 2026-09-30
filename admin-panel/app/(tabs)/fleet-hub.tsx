import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar as RNStatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Car, Building2, Layers, CarFront, User, Briefcase, UserCheck, Star, MapPin, Radio, ShieldCheck, AlertTriangle } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { Section, Row, Stat } from '@/components/ui';
import { apiService } from '@/services/api';

// The single entry point for fleet-side account management, split by who's
// actually being managed - replaces the old flat list that mixed vendors,
// fleet drivers, duty drivers, and cars into one undifferentiated feed.
// Fleet Drivers and Drivers get separate cards (not one combined "Fleets &
// Drivers" card) since they're different account types with different
// status vocabularies (Active/Inactive vs Online/Offline) - see
// (tabs)/accounts.tsx's OWNER_VENDOR_STATUS_TABS/DRIVER_STATUS_TABS.
// Customers aren't a card here since they already have their own dedicated
// bottom tab (no need for a second path to the same screen).
const CATEGORIES: Array<{
  key: string;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  tint: string;
  route: string;
}> = [
  {
    key: 'fleet',
    label: 'Fleet drivers',
    subtitle: 'Owner profile, wallet and cars',
    icon: <Car size={24} color="#10B981" />,
    color: '#10B981',
    tint: '#F0FDF4',
    route: '/(tabs)/vehicle-owners',
  },
  {
    key: 'drivers',
    label: 'Drivers',
    subtitle: 'Status and documents of every driver',
    icon: <User size={24} color="#8B5CF6" />,
    color: '#8B5CF6',
    tint: '#F5F3FF',
    route: '/(tabs)/accounts?type=quickdriver',
  },
  {
    key: 'find_driver',
    label: 'Driver lookup',
    subtitle: 'Live status, current trip, car, location & contact',
    icon: <MapPin size={24} color="#EF4444" />,
    color: '#EF4444',
    tint: '#FEF2F2',
    route: '/find-driver',
  },
  {
    key: 'cars',
    label: 'Cars',
    subtitle: 'Check RC and insurance, change status',
    icon: <CarFront size={24} color="#F59E0B" />,
    color: '#F59E0B',
    tint: '#FFFBEB',
    route: '/cars',
  },
  {
    key: 'customers',
    label: 'Customers',
    subtitle: 'Profiles, home city and offers',
    icon: <UserCheck size={24} color="#EC4899" />,
    color: '#EC4899',
    tint: '#FDF2F8',
    route: '/(tabs)/customers',
  },
  {
    key: 'ratings',
    label: 'Ratings & quality',
    subtitle: 'Ratings, low-rating alerts, driver leaderboard',
    icon: <Star size={24} color="#F59E0B" fill="#F59E0B" />,
    color: '#F59E0B',
    tint: '#FEF3C7',
    route: '/ratings-analytics',
  },
  {
    key: 'vendors',
    label: 'Vendors',
    subtitle: 'Vendor profile, wallet and documents',
    icon: <Building2 size={24} color="#3B82F6" />,
    color: '#3B82F6',
    tint: '#EFF6FF',
    route: '/(tabs)/vendors',
  },
];

import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

export default function FleetHubScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 12);

  // Was seeded with hardcoded plausible-looking numbers (fleet_owners: 142,
  // drivers: 3157, cars: 892, vendors: 64) and the fetch failure below was
  // swallowed silently, so a real network/API failure left those fake
  // numbers on screen with no visible difference from real data. Start at
  // null/loading instead, and only ever show real counts or an explicit
  // error - never a guessed placeholder.
  const [counts, setCounts] = React.useState<{ fleet_owners: number; drivers: number; cars: number; vendors: number } | null>(null);
  const [countsLoading, setCountsLoading] = React.useState(true);
  const [countsError, setCountsError] = React.useState(false);
  const [reports, setReports] = React.useState<{
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

  const loadCounts = React.useCallback(async () => {
    try {
      setCountsLoading(true);
      setCountsError(false);
      const data = await apiService.getFleetHubCounts();
      setCounts(data);
      if (data.reports) setReports(data.reports);
    } catch (e) {
      setCountsError(true);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const getCountForKey = (key: string) => {
    if (!counts) return 0;
    if (key === 'fleet') return counts.fleet_owners;
    if (key === 'drivers') return counts.drivers;
    if (key === 'cars') return counts.cars;
    if (key === 'vendors') return counts.vendors;
    return 0;
  };

  const ICONS: Record<string, any> = { fleet: Car, drivers: User, find_driver: MapPin, cars: CarFront, our_fleet: Briefcase, customers: UserCheck, ratings: Star, vendors: Building2 };
  const total = (n: number) => (n > 0 ? <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.textSecondary }}>{n.toLocaleString('en-IN')}</Text> : null);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: topPadding + 8, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Fleet & Partners</Text>
        <ThemeToggle size={20} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {countsLoading && (
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={themeColors.primary} />
            <Text style={{ color: themeColors.textSecondary, fontSize: 14 }}>Loading...</Text>
          </View>
        )}

        {!countsLoading && countsError && (
          <Section>
            <Row icon={AlertTriangle} color="#DC2626" title="Could not load the numbers" subtitle="Tap to try again" onPress={loadCounts} last />
          </Section>
        )}

        {reports && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: themeColors.surface, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
            <View style={{ width: '50%' }}><Stat label="Drivers online" value={`${reports.drivers_online} / ${reports.drivers_total}`} /></View>
            <View style={{ width: '50%' }}><Stat label="Cars verified" value={`${reports.cars_verified} / ${reports.cars_total}`} /></View>
            <View style={{ width: '50%' }}><Stat label="Driving now" value={reports.drivers_driving} /></View>
            <TouchableOpacity style={{ width: '50%' }} activeOpacity={0.7} onPress={() => router.push('/(tabs)/accounts?type=quickdriver' as any)}>
              <Stat label="Documents to check" value={reports.pending_fleet_doc_reviews} tone={reports.pending_fleet_doc_reviews > 0 ? themeColors.error : undefined} />
            </TouchableOpacity>
          </View>
        )}

        <Section title="Accounts">
          {CATEGORIES.map((cat, i) => (
            <Row
              key={cat.key}
              icon={ICONS[cat.key] || Car}
              color={cat.color}
              title={cat.label}
              subtitle={cat.subtitle}
              right={total(getCountForKey(cat.key))}
              last={i === CATEGORIES.length - 1}
              onPress={() => router.push(cat.route as any)}
            />
          ))}
        </Section>

        <Section title="Company fleet">
          <Row icon={Briefcase} color="#0EA5E9" title="Own fleet" subtitle="Company cars, drivers, attendance, payroll & expenses" onPress={() => router.push('/own-fleet' as any)} last />
        </Section>

        <Section>
          <Row icon={Layers} color={themeColors.textSecondary} title="Search all accounts" subtitle="Find anyone, do bulk actions" onPress={() => router.push('/(tabs)/accounts')} last />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter-ExtraBold' },
});
