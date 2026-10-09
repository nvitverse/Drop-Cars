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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Car, Info, FileText, Trash2, Star, ChevronRight, X } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { formatCarType } from '@/utils/format';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Segmented, EmptyState, SkeletonRow } from '@/components/ui';

interface CarItem {
  id: string;
  vehicle_owner_id: string;
  car_name: string;
  car_type: string;
  car_number: string;
  year_of_the_car: string;
  car_status: string;
  vehicle_owner_name: string;
  vehicle_owner_reg_id?: string | null;
  created_at: string;
  rating_avg?: number | null;
  rating_count?: number | null;
}

type StatusFilter = 'all' | 'ONLINE' | 'DRIVING' | 'BLOCKED' | 'PROCESSING';

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Verified', value: 'ONLINE' },
  { label: 'Driving', value: 'DRIVING' },
  { label: 'Unverified', value: 'PROCESSING' },
  { label: 'Blocked', value: 'BLOCKED' },
];

const extractDigits = (value: string): string => value.replace(/\D/g, '');

const matchesCarSearch = (car: CarItem, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const queryDigits = extractDigits(query);

  const textMatches =
    (car.car_name || '').toLowerCase().includes(normalizedQuery) ||
    (car.car_number || '').toLowerCase().includes(normalizedQuery) ||
    (car.vehicle_owner_name || '').toLowerCase().includes(normalizedQuery);

  if (textMatches) return true;

  if (queryDigits.length > 0) {
    const carNumberDigits = extractDigits(car.car_number);
    if (carNumberDigits.includes(queryDigits)) return true;
    if (carNumberDigits.endsWith(queryDigits)) return true;
    if (queryDigits.length >= 4 && carNumberDigits.slice(-4) === queryDigits.slice(-4)) {
      return true;
    }
  }

  return false;
};

const PAGE_SIZE = 50;

export default function CarsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [cars, setCars] = useState<CarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skipCount, setSkipCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterLoading, setFilterLoading] = useState(false);
  const [vehicleOwnerIdFilter, setVehicleOwnerIdFilter] = useState<string>('');
  const [totalCount, setTotalCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [drivingCount, setDrivingCount] = useState(0);
  const [selectedCar, setSelectedCar] = useState<CarItem | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  useEffect(() => {
    apiService.getCachedAdminRole().then((role) => setIsOwner(role === 'Owner'));
  }, []);

  const fetchCars = async (isFilterChange = false, loadMore = false) => {
    try {
      setError(null);
      if (isFilterChange) setFilterLoading(true);
      if (loadMore) setLoadingMore(true);

      const statusParam = statusFilter !== 'all' ? statusFilter : undefined;
      const vehicleOwnerParam = vehicleOwnerIdFilter.trim() || undefined;
      const searchParam = searchQuery.trim() || undefined;
      const skip = loadMore ? skipCount : 0;

      const data = await apiService.getCars(skip, PAGE_SIZE, statusParam, undefined, vehicleOwnerParam, searchParam);

      const sortedCars = [...data.cars].sort((a, b) => {
        const aInactive = a.car_status === 'BLOCKED' || a.car_status === 'PROCESSING';
        const bInactive = b.car_status === 'BLOCKED' || b.car_status === 'PROCESSING';
        if (aInactive && !bInactive) return -1;
        if (!aInactive && bInactive) return 1;
        return 0;
      });

      setCars(prev => (loadMore ? [...prev, ...sortedCars] : sortedCars));
      setHasMore(data.cars.length === PAGE_SIZE);
      setSkipCount(skip + data.cars.length);
      setTotalCount(data.total_count);
      setOnlineCount(data.online_count);
      setBlockedCount(data.blocked_count);
      setProcessingCount(data.processing_count);
      setDrivingCount(data.driving_count);
    } catch (error) {
      console.error('Failed to fetch cars:', error);
      if (!loadMore) setError('Failed to load cars. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFilterLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const isInitialLoad = loading && cars.length === 0;
    fetchCars(!isInitialLoad);
  }, [statusFilter, vehicleOwnerIdFilter]);

  const runSearch = () => {
    if (searchQuery.trim().length > 0 && searchQuery.trim().length < 2) {
      Alert.alert('Type more to search', 'Enter at least 2 characters to search.');
      return;
    }
    fetchCars(true);
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    if (value === statusFilter || filterLoading) return;
    setFilterLoading(true);
    setStatusFilter(value);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCars();
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && !filterLoading && hasMore) {
      fetchCars(false, true);
    }
  };

  const isActiveStatus = (status: string): boolean => {
    return status === 'ONLINE' || status === 'DRIVING';
  };

  const handleToggleStatus = async (car: CarItem, newValue: boolean) => {
    if (car.car_status === 'BLOCKED' && newValue === true) {
      const role = await apiService.getCachedAdminRole();
      if (role !== 'Owner' && role !== 'Manager') {
        Alert.alert(
          'Access Denied',
          'Unblocking cars requires Manager or Owner privileges. Please contact your manager.'
        );
        return;
      }
    }

    const newStatus = newValue ? 'ONLINE' : 'BLOCKED';
    const carId = String(car.id);
    
    setCars(cars.map(c => 
      c.id === car.id 
        ? { ...c, car_status: newStatus }
        : c
    ));

    setUpdatingStatus(prev => new Set(prev).add(car.id));

    try {
      await apiService.updateCarAccountStatus(carId, newStatus);
      await fetchCars();
    } catch (error: any) {
      setCars(cars.map(c => 
        c.id === car.id 
          ? { ...c, car_status: car.car_status }
          : c
      ));
      Alert.alert('Error', error?.message || 'Failed to update car status');
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(car.id);
        return next;
      });
    }
  };

  const filteredCars = cars.filter(car => matchesCarSearch(car, searchQuery));

  const getStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' => {
    switch (status) {
      case 'ONLINE': return 'success';
      case 'DRIVING': return 'info';
      case 'BLOCKED': return 'danger';
      case 'PROCESSING': return 'warning';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'ONLINE': return 'Verified';
      case 'DRIVING': return 'Driving';
      case 'BLOCKED': return 'Blocked';
      case 'PROCESSING': return 'Unverified';
      default: return status;
    }
  };

  const handleDocumentPress = (car: CarItem) => {
    router.push({
      pathname: '/car-documents',
      params: {
        carId: car.id,
        vehicleOwnerId: car.vehicle_owner_id,
        carName: car.car_name,
      },
    });
  };

  const handleInfoPress = (car: CarItem) => {
    setSelectedCar(car);
    setShowInfoModal(true);
  };

  const handleDeleteCar = (car: CarItem) => {
    Alert.alert(
      'Remove Car?',
      `This permanently deletes "${car.car_name} (${car.car_number})". This cannot be undone. Only use this to clean up duplicate or wrong entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteAccount(String(car.id), 'car');
              setCars(prev => prev.filter(c => c.id !== car.id));
              Alert.alert('Removed', `Car "${car.car_name}" was removed.`);
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to remove car');
            }
          },
        },
      ]
    );
  };

  const renderCarItem = ({ item }: { item: CarItem }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => handleInfoPress(item)}
      >
        <Card style={styles.carCard}>
          <View style={styles.cardHeader}>
            <View style={[styles.avatarBox, { backgroundColor: item.car_status === 'ONLINE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.12)' }]}>
              <Car size={20} color={item.car_status === 'ONLINE' ? '#10B981' : themeColors.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.carName, { color: themeColors.text }]} numberOfLines={1}>{item.car_name}</Text>
                <StatusPill
                  label={getStatusLabel(item.car_status)}
                  variant={getStatusVariant(item.car_status)}
                  size="sm"
                />
              </View>
              <Text style={[styles.carNumber, { color: themeColors.primary }]}>{item.car_number}</Text>
              <Text style={[styles.carType, { color: themeColors.textSecondary }]}>{formatCarType(item.car_type)} • {item.year_of_the_car}</Text>
              {!!item.rating_count && (
                <View style={styles.ratingRow}>
                  <Star size={11} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[styles.ratingText, { color: themeColors.textSecondary }]}>{(item.rating_avg || 0).toFixed(1)} ({item.rating_count})</Text>
                </View>
              )}
              <Text style={[styles.ownerName, { color: themeColors.textMuted }]} numberOfLines={1}>Owner: {item.vehicle_owner_name}</Text>
            </View>

            <View style={styles.rightActions}>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' }]}
                  onPress={(e) => { e.stopPropagation(); handleDocumentPress(item); }}
                >
                  <FileText size={14} color="#10B981" />
                </TouchableOpacity>
                {isOwner && (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: themeColors.errorLight }]}
                    onPress={(e) => { e.stopPropagation(); handleDeleteCar(item); }}
                  >
                    <Trash2 size={14} color={themeColors.error} />
                  </TouchableOpacity>
                )}
                <View style={{ padding: 4 }}>
                  <ChevronRight size={18} color={themeColors.textMuted} />
                </View>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Cars</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{totalCount}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Segmented
          options={STATUS_TABS}
          value={statusFilter}
          onChange={(v) => handleStatusFilterChange(v as StatusFilter)}
        />
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search cars by name, number, owner..."
          placeholderTextColor={themeColors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
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
          data={filteredCars}
          renderItem={renderCarItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={<Car size={36} color={themeColors.textMuted} />}
              title={searchQuery ? 'No cars found' : 'No cars in this view'}
              message={searchQuery ? `No results matching "${searchQuery}"` : 'Registered vehicles will appear here.'}
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

      {/* Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Car Details</Text>
              <TouchableOpacity onPress={() => setShowInfoModal(false)} style={{ padding: 4 }}>
                <X size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
            {selectedCar && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>Name</Text>
                  <Text style={[styles.infoValue, { color: themeColors.text }]}>{selectedCar.car_name}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>Number</Text>
                  <Text style={[styles.infoValue, { color: themeColors.primary }]}>{selectedCar.car_number}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>Type & Year</Text>
                  <Text style={[styles.infoValue, { color: themeColors.text }]}>{formatCarType(selectedCar.car_type)} ({selectedCar.year_of_the_car})</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>Owner</Text>
                  <Text style={[styles.infoValue, { color: themeColors.text }]}>{selectedCar.vehicle_owner_name}</Text>
                </View>
                <View style={[styles.infoRow, { alignItems: 'center' }]}>
                  <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>Verification Status</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isActiveStatus(selectedCar.car_status) ? '#10B981' : '#F59E0B' }}>
                      {getStatusLabel(selectedCar.car_status)}
                    </Text>
                    <Switch
                      value={isActiveStatus(selectedCar.car_status)}
                      onValueChange={(val) => {
                        handleToggleStatus(selectedCar, val);
                        setSelectedCar(prev => prev ? { ...prev, car_status: val ? 'ONLINE' : 'PROCESSING' } : null);
                      }}
                      trackColor={{ false: themeColors.border, true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>

                {/* Direct Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: themeColors.primary,
                      paddingVertical: 10,
                      borderRadius: 8,
                    }}
                    onPress={() => {
                      setShowInfoModal(false);
                      handleDocumentPress(selectedCar);
                    }}
                  >
                    <FileText size={15} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Car Documents</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  carCard: {
    marginBottom: 4,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    gap: 6,
    marginBottom: 2,
  },
  carName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  carNumber: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  carType: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ownerName: {
    fontSize: 11,
  },
  rightActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtn: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    maxHeight: 300,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
  },
});
