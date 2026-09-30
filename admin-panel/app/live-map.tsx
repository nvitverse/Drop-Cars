import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Navigation,
  Phone,
  Car,
  UserCheck,
  RefreshCw,
  Search,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';

interface FleetDriver {
  id: string;
  driver_name: string;
  phone: string;
  vehicle_number: string;
  vehicle_type: string;
  city: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'OFFLINE';
  wallet_balance: number;
  rating: number;
  latitude: number | null;
  longitude: number | null;
  location_updated_at?: string | null;
  active_trip_id?: string | null;
}

export default function LiveFleetMapScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fleet, setFleet] = useState<FleetDriver[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadFleetData = async () => {
    try {
      setRefreshing(true);
      const res = await apiService.getLiveFleetMap();
      setFleet(res.fleet || []);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load live fleet map data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFleetData();
  }, []);

  const openPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // There is no manual-dispatch screen in this app: assign-car.tsx is the
  // "register a new car under a vehicle owner" form and never reads a
  // driver_id param, so this button used to route to it and silently do
  // nothing useful with the driver we picked here. Manual assignment
  // (backend: POST /orders/{order_id}/manual-assign) needs a specific
  // ORDER to assign, not just a driver - this screen only has a driver, no
  // order context - so a real one-click "dispatch this driver" action
  // can't be wired from here without a new order-selection step. Until
  // that exists, route staff to the Bookings list pre-filtered to live/
  // unassigned orders so they can pick an order and assign a driver to it
  // there, instead of implying a working dispatch action that isn't real.
  const goToUnassignedOrders = () => {
    router.push('/(tabs)/orders?tab=live' as any);
  };

  const filteredFleet = fleet.filter((d) => {
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      d.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone.includes(searchQuery) ||
      d.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.vehicle_number.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const availableCount = fleet.filter((f) => f.status === 'AVAILABLE').length;
  const onTripCount = fleet.filter((f) => f.status === 'ON_TRIP').length;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Navbar Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={themeColors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Live Fleet Radar Map</Text>
            <Text style={[styles.headerSub, { color: themeColors.textSecondary }]}>
              Real-time active driver GPS tracking & dispatch
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={loadFleetData} disabled={refreshing}>
          <RefreshCw size={18} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Counter Cards */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.metricVal, { color: '#10B981' }]}>{availableCount}</Text>
            <Text style={[styles.metricLbl, { color: themeColors.textSecondary }]}>🟢 Online & Free</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.metricVal, { color: '#3B82F6' }]}>{onTripCount}</Text>
            <Text style={[styles.metricLbl, { color: themeColors.textSecondary }]}>🔵 On Active Trip</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.metricVal, { color: themeColors.text }]}>{fleet.length}</Text>
            <Text style={[styles.metricLbl, { color: themeColors.textSecondary }]}>Total Active Fleet</Text>
          </View>
        </View>

        {/* Filter Bar */}
        <View style={styles.filterRow}>
          <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Search size={16} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Search driver name, phone, city, car no..."
              placeholderTextColor={themeColors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {[
              { label: 'All Fleet', val: 'ALL' },
              { label: '🟢 Free Drivers', val: 'AVAILABLE' },
              { label: '🔵 On Trip', val: 'ON_TRIP' },
            ].map((chip) => (
              <TouchableOpacity
                key={chip.val}
                style={[
                  styles.chip,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                  statusFilter === chip.val && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                ]}
                onPress={() => setStatusFilter(chip.val)}>
                <Text style={[styles.chipText, { color: themeColors.text }, statusFilter === chip.val && { color: '#FFF' }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Drivers List Grid */}
        {filteredFleet.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Navigation size={36} color={themeColors.textSecondary} />
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              No active drivers found matching your search.
            </Text>
          </View>
        ) : (
          filteredFleet.map((driver) => (
            <View
              key={driver.id}
              style={[styles.driverCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardTop}>
                <View style={styles.driverMeta}>
                  <Text style={[styles.driverName, { color: themeColors.text }]}>{driver.driver_name}</Text>
                  <Text style={[styles.driverPhone, { color: themeColors.primary }]}>{driver.phone}</Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        driver.status === 'AVAILABLE' ? '#D1FAE5' : '#DBEAFE',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: driver.status === 'AVAILABLE' ? '#059669' : '#1E40AF' },
                    ]}>
                    {driver.status === 'AVAILABLE' ? '🟢 Free / Available' : '🔵 On Active Trip'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDetailsRow}>
                <View style={styles.detailItem}>
                  <Car size={14} color={themeColors.textSecondary} />
                  <Text style={[styles.detailText, { color: themeColors.text }]}>
                    {driver.vehicle_type} ({driver.vehicle_number})
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <MapPin size={14} color="#EF4444" />
                  <Text style={[styles.detailText, { color: themeColors.text }]}>{driver.city}</Text>
                </View>
              </View>

              <View style={styles.walletRatingRow}>
                <Text style={[styles.subDetailText, { color: themeColors.textSecondary }]}>
                  💰 Wallet: ₹{Number(driver.wallet_balance || 0).toFixed(0)}
                </Text>
                <Text style={[styles.subDetailText, { color: themeColors.textSecondary }]}>
                  ⭐ Rating: {driver.rating ? Number(driver.rating).toFixed(1) : 'New'}
                </Text>
                {driver.latitude != null && driver.longitude != null ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${driver.latitude},${driver.longitude}`)}>
                    <Text style={[styles.subDetailText, { color: themeColors.primary, fontWeight: '700' }]}>
                      📍 Open live location{(driver as any).location_updated_at ? ` · ${new Date((driver as any).location_updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.subDetailText, { color: themeColors.textMuted }]}>
                    📍 Location is shared only during an active trip
                  </Text>
                )}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => openPhone(driver.phone)}>
                  <Phone size={14} color="#FFF" />
                  <Text style={styles.actionBtnText}>Call Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]} onPress={goToUnassignedOrders}>
                  <UserCheck size={14} color="#FFF" />
                  <Text style={styles.actionBtnText}>View Pending Bookings</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
  },
  refreshBtn: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricVal: {
    fontSize: 20,
    fontWeight: '800',
  },
  metricLbl: {
    fontSize: 11,
    textAlign: 'center',
  },
  filterRow: {
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  driverCard: {
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  driverMeta: {
    gap: 2,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '700',
  },
  driverPhone: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 8,
    borderRadius: 6,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
  },
  walletRatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subDetailText: {
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
  },
});
