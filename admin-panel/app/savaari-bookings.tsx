import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Filter,
  Trash2,
  BellRing,
  Zap,
  Clock,
  MapPin,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import Toast, { useToast } from '@/components/Toast';
import { Card, StatusPill, EmptyState } from '@/components/ui';

interface SavaariBooking {
  id: string;
  booking_id: string;
  pickup_city: string | null;
  drop_city: string | null;
  car_type: string | null;
  trip_type: string | null;
  price: number | null;
  pickup_time_str: string | null;
  savaari_url: string;
  is_notified: boolean;
  acceptance_status: 'ACCEPTED' | 'MISSED' | null;
  detected_at: string;
}

interface AlertFilter {
  id: string;
  filter_name: string;
  pickup_city: string | null;
  drop_city: string | null;
  car_type: string | null;
  min_price: number | null;
  is_active: boolean;
}

export default function SavaariBookingsScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();
  const { toast, showToast } = useToast();

  const [bookings, setBookings] = useState<SavaariBooking[]>([]);
  const [filters, setFilters] = useState<AlertFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'UNACTIONED' | 'ACCEPTED' | 'MISSED'>('UNACTIONED');

  // Filter Modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterPickup, setFilterPickup] = useState('');
  const [filterDrop, setFilterDrop] = useState('');
  const [filterCar, setFilterCar] = useState('');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [savingFilter, setSavingFilter] = useState(false);

  // Monitor Stats
  const [stats, setStats] = useState<{
    total_detected: number;
    accepted: number;
    missed: number;
    unactioned: number;
    active_filters: number;
  } | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await apiService.getSavaariBookings(search, statusTab === 'ALL' ? undefined : statusTab);
      setBookings(data as any);
      const statsData = await apiService.getSavaariStatus();
      setStats(statsData);
    } catch (err: any) {
      console.error('Failed to load Savaari bookings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusTab]);

  const fetchFilters = useCallback(async () => {
    try {
      const data = await apiService.getSavaariFilters();
      setFilters(data as any);
    } catch (err) {
      console.error('Failed to load Savaari filters:', err);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchFilters();
  }, [fetchBookings, fetchFilters]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
    fetchFilters();
  };

  const handleOpenSavaariLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert('Error', 'Unable to open Savaari portal browser.');
    }
  };

  const handleUpdateStatus = async (bookingId: string, newStatus: 'ACCEPTED' | 'MISSED' | 'CLEAR') => {
    try {
      await apiService.updateSavaariBookingStatus(bookingId, newStatus);
      showToast(newStatus === 'CLEAR' ? 'Status cleared' : `Marked as ${newStatus}`, 'success');
      fetchBookings();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update status');
    }
  };

  const handleSimulateBooking = async () => {
    try {
      const res = await apiService.simulateSavaariBooking({
        pickup_city: 'Chennai',
        drop_city: 'Tiruvannamalai',
        car_type: 'Etios',
        price: 3800,
      });
      showToast(`Test booking ${res.booking_id} created & alert sent!`, 'success');
      fetchBookings();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Simulation failed');
    }
  };

  const handleCreateFilter = async () => {
    if (!filterName.trim()) {
      Alert.alert('Validation Error', 'Filter name is required (e.g. Chennai High Price)');
      return;
    }
    setSavingFilter(true);
    try {
      await apiService.createSavaariFilter({
        filter_name: filterName.trim(),
        pickup_city: filterPickup.trim() || undefined,
        drop_city: filterDrop.trim() || undefined,
        car_type: filterCar.trim() || undefined,
        min_price: filterMinPrice ? parseFloat(filterMinPrice) : undefined,
      });
      showToast('Alert filter created successfully', 'success');
      setShowFilterModal(false);
      setFilterName('');
      setFilterPickup('');
      setFilterDrop('');
      setFilterCar('');
      setFilterMinPrice('');
      fetchFilters();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create filter');
    } finally {
      setSavingFilter(false);
    }
  };

  const handleDeleteFilter = async (id: string) => {
    Alert.alert('Delete Filter', 'Are you sure you want to remove this alert rule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.deleteSavaariFilter(id);
            showToast('Filter deleted', 'success');
            fetchFilters();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to delete filter');
          }
        },
      },
    ]);
  };

  const renderBookingCard = ({ item }: { item: SavaariBooking }) => {
    const isHighPrice = (item.price || 0) >= 2800;

    return (
      <Card style={styles.card}>
        {/* Header Badge Row */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <StatusPill label="Savaari" variant="info" />
            <Text style={[styles.bookingIdText, { color: themeColors.text }]}>#{item.booking_id}</Text>
          </View>
          {isHighPrice && (
            <StatusPill label="HIGH PRICE" variant="warning" />
          )}
        </View>

        {/* Route Info */}
        <View style={styles.routeRow}>
          <MapPin size={15} color={themeColors.success} />
          <Text style={[styles.routeText, { color: themeColors.text }]}>
            {item.pickup_city || 'Chennai'} → {item.drop_city || 'Destination'}
          </Text>
        </View>

        {/* Details Grid */}
        <View style={[styles.detailsRow, { borderColor: themeColors.border }]}>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Car Type</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>{item.car_type || 'Etios / Sedan'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Fare Price</Text>
            <Text style={[styles.priceValue, { color: themeColors.success }]}>
              {item.price ? `₹${item.price.toLocaleString('en-IN')}` : 'N/A'}
            </Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Trip Type</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>{item.trip_type || 'Oneway'}</Text>
          </View>
        </View>

        {item.pickup_time_str && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Clock size={13} color={themeColors.textMuted} />
            <Text style={{ fontSize: 12, color: themeColors.textSecondary, fontWeight: '500' }}>Pickup: {item.pickup_time_str}</Text>
          </View>
        )}

        {/* Primary Action Button: Direct Deep Link to Savaari Portal */}
        <TouchableOpacity
          style={[styles.openSavaariButton, { backgroundColor: themeColors.success }]}
          onPress={() => handleOpenSavaariLink(item.savaari_url)}
          activeOpacity={0.8}
        >
          <ExternalLink size={15} color="#FFFFFF" />
          <Text style={styles.openSavaariText}>Open in Savaari & Accept Booking</Text>
        </TouchableOpacity>

        {/* Status Action Buttons */}
        <View style={styles.actionRow}>
          {item.acceptance_status === 'ACCEPTED' ? (
            <TouchableOpacity style={[styles.statusPill, { backgroundColor: isDark ? themeColors.surfaceAlt : '#DCFCE7', borderColor: themeColors.success, borderWidth: 1 }]} onPress={() => handleUpdateStatus(item.booking_id, 'CLEAR')}>
              <CheckCircle2 size={14} color={themeColors.success} />
              <Text style={{ color: themeColors.success, fontWeight: '700', fontSize: 12 }}>Accepted by Us (Tap to undo)</Text>
            </TouchableOpacity>
          ) : item.acceptance_status === 'MISSED' ? (
            <TouchableOpacity style={[styles.statusPill, { backgroundColor: isDark ? themeColors.surfaceAlt : '#FEE2E2', borderColor: themeColors.error, borderWidth: 1 }]} onPress={() => handleUpdateStatus(item.booking_id, 'CLEAR')}>
              <XCircle size={14} color={themeColors.error} />
              <Text style={{ color: themeColors.error, fontWeight: '700', fontSize: 12 }}>Missed (Tap to undo)</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: themeColors.success }]}
                onPress={() => handleUpdateStatus(item.booking_id, 'ACCEPTED')}
              >
                <CheckCircle2 size={14} color="#FFF" />
                <Text style={styles.smallBtnText}>Mark Accepted</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: themeColors.error }]}
                onPress={() => handleUpdateStatus(item.booking_id, 'MISSED')}
              >
                <XCircle size={14} color="#FFF" />
                <Text style={styles.smallBtnText}>Mark Missed</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Savaari Booking Monitor</Text>
        </View>
        <TouchableOpacity style={[styles.testBtn, { backgroundColor: themeColors.primary }]} onPress={handleSimulateBooking}>
          <Zap size={14} color="#FFF" />
          <Text style={styles.testBtnText}>Test Alert</Text>
        </TouchableOpacity>
      </View>

      {/* Monitor Status Banner */}
      {stats && (
        <View style={[styles.statsBanner, { backgroundColor: isDark ? themeColors.surfaceAlt : '#EFF6FF', borderColor: themeColors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: themeColors.text }]}>{stats.unactioned}</Text>
            <Text style={[styles.statLbl, { color: themeColors.textSecondary }]}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: themeColors.success }]}>{stats.accepted}</Text>
            <Text style={[styles.statLbl, { color: themeColors.textSecondary }]}>Accepted</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: themeColors.error }]}>{stats.missed}</Text>
            <Text style={[styles.statLbl, { color: themeColors.textSecondary }]}>Missed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: themeColors.text }]}>{stats.active_filters}</Text>
            <Text style={[styles.statLbl, { color: themeColors.textSecondary }]}>Active Rules</Text>
          </View>
        </View>
      )}

      {/* Search & Rule Manager Bar */}
      <View style={styles.filterSection}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Search size={16} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search booking ID, city, car..."
            placeholderTextColor={themeColors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={[styles.ruleBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} onPress={() => setShowFilterModal(true)}>
          <Filter size={15} color={themeColors.primary} />
          <Text style={[styles.ruleBtnText, { color: themeColors.primary }]}>Rules ({filters.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Status Segment Tabs */}
      <View style={styles.tabContainer}>
        {(['UNACTIONED', 'ALL', 'ACCEPTED', 'MISSED'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              styles.tabItem,
              { backgroundColor: statusTab === t ? themeColors.primary : themeColors.surface, borderColor: themeColors.border },
            ]}
            onPress={() => setStatusTab(t)}
          >
            <Text style={[styles.tabText, { color: statusTab === t ? '#FFF' : themeColors.textSecondary }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bookings Feed */}
      {loading ? (
        <ActivityIndicator size="large" color={themeColors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBookingCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
          ListEmptyComponent={
            <EmptyState
              icon={BellRing}
              title="No Savaari bookings found"
              message="Tap 'Test Alert' above to simulate a new Savaari vendor booking with sound notification!"
            />
          }
        />
      )}

      {/* Alert Rules Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Savaari Notification Rules</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <XCircle size={22} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 8, color: themeColors.text }}>
                Active Alert Filters ({filters.length})
              </Text>
              {filters.length === 0 ? (
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  No rules created. (All new bookings trigger notifications)
                </Text>
              ) : (
                filters.map((f) => (
                  <View key={f.id} style={[styles.filterChipRow, { borderBottomColor: themeColors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }}>{f.filter_name}</Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        {f.pickup_city ? `Pickup: ${f.pickup_city} ` : ''}
                        {f.min_price ? `Min Price: ₹${f.min_price} ` : ''}
                        {f.car_type ? `Car: ${f.car_type}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteFilter(f.id)}>
                      <Trash2 size={16} color={themeColors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 10, color: themeColors.text }}>
              + Create New Filter
            </Text>

            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              placeholder="Rule Name (e.g. Chennai High Price)"
              placeholderTextColor={themeColors.textMuted}
              value={filterName}
              onChangeText={setFilterName}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                placeholder="Pickup City (e.g. Chennai)"
                placeholderTextColor={themeColors.textMuted}
                value={filterPickup}
                onChangeText={setFilterPickup}
              />
              <TextInput
                style={[styles.modalInput, { flex: 1, color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                placeholder="Min Price ₹ (e.g. 2800)"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="numeric"
                value={filterMinPrice}
                onChangeText={setFilterMinPrice}
              />
            </View>

            <TextInput
              style={[styles.modalInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              placeholder="Car Type (e.g. Etios, Innova - Optional)"
              placeholderTextColor={themeColors.textMuted}
              value={filterCar}
              onChangeText={setFilterCar}
            />

            <TouchableOpacity style={[styles.createRuleBtn, { backgroundColor: themeColors.primary }]} onPress={handleCreateFilter} disabled={savingFilter}>
              {savingFilter ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.createRuleBtnText}>Save Notification Filter</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  testBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  statsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLbl: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  filterSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: { flex: 1, marginLeft: 6, fontSize: 13 },
  ruleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  ruleBtnText: { fontSize: 12, fontWeight: '700' },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  tabText: { fontSize: 11, fontWeight: '700' },
  card: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingIdText: { fontSize: 14, fontWeight: '800' },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  routeText: { fontSize: 15, fontWeight: '700' },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailCol: { flex: 1 },
  detailLabel: { fontSize: 10.5, fontWeight: '600' },
  detailValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  priceValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  openSavaariButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  openSavaariText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  smallBtnText: { color: '#FFF', fontSize: 11.5, fontWeight: '700' },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  filterChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  createRuleBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  createRuleBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
