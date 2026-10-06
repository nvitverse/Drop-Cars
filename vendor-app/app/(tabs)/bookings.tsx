import React, { useState, useMemo, useEffect } from 'react';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import { formatCarType } from '../../utils/format';
import { getBookingStatusLabel, getBookingStatusColor } from '../../utils/bookingStatus';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Car, Clock, MapPin, DollarSign, TrendingUp, Users, Search, ListFilter as Filter, X, CircleCheck as CheckCircle, Circle as XCircle, User, Calendar, ArrowLeft, Zap } from 'lucide-react-native';
import api from '../api/api';
import { router } from 'expo-router';
import DutyAssignModal from '../../components/DutyAssignModal';
import { increaseAllInclusiveFare } from '../../services/orderService';
import FuturisticFilterModal, { FilterState } from '../../components/FuturisticFilterModal';
import { colors } from '../../constants/theme';
import StatusBadge from '../../components/common/StatusBadge';
import OrderSummaryCard from '../../components/common/OrderSummaryCard';

const { width } = Dimensions.get('window');

interface VendorData {
  id: string;
  full_name: string;
  primary_number: string;
  account_status: string;
  branch_name: string;
}

interface Order {
  id: number;
  source: string;
  source_order_id: number;
  vendor_id: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: {
    [key: string]: string;
  };
  start_date_time: string;
  customer_name: string;
  customer_number: string;
  trip_status: string;
  cancelled_by?: string | null;
  pick_near_city: string;
  trip_distance: number | null;
  trip_time: string;
  estimated_price: number;
  vendor_price: number;
  platform_fees_percent: number;
  created_at: string;
  order_accept_status: boolean;
  Driver_assigned: boolean;
  Car_assigned: boolean;
}

const ORDERS_DATA: Order[] = [];

export default function BookingsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendorData, setVendorData] = useState<VendorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    dateFilter: 'all',
    vehicleFilter: 'all',
    tripTypeFilter: 'all',
    assignStatusFilter: 'all',
  });

  const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
  const [selectedDispatchOrder, setSelectedDispatchOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (refreshing) {
      fetchOrders();
    }
  }, [refreshing]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadVendorData(),
        fetchOrders()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVendorData = async () => {
    try {
      const response = await api.get('/users/vendor-details/me');
      setVendorData(response.data);
    } catch (err: any) {
      console.error('Error fetching vendor data:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders/pending/vendor');
      const ordersData: Order[] = response.data;
      const sortedOrders = ordersData.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(sortedOrders);
    } catch (err: any) {
      console.error('Error fetching vendor orders:', err);
      setOrders(ORDERS_DATA);
    } finally {
      setRefreshing(false);
    }
  };

  const [fareModalVisible, setFareModalVisible] = useState(false);
  const [selectedFareOrder, setSelectedFareOrder] = useState<Order | null>(null);
  const [newFareInput, setNewFareInput] = useState('');
  const [increasingFare, setIncreasingFare] = useState(false);

  const openIncreaseFareModal = (order: Order) => {
    setSelectedFareOrder(order);
    const curr = order.estimated_price || order.vendor_price || 0;
    setNewFareInput(String(curr + 200));
    setFareModalVisible(true);
  };

  const handleConfirmIncreaseFare = async () => {
    if (!selectedFareOrder) return;
    const amount = parseInt(newFareInput, 10);
    const curr = selectedFareOrder.estimated_price || selectedFareOrder.vendor_price || 0;
    if (isNaN(amount) || amount <= curr) {
      Alert.alert('Invalid Amount', `New fare must be higher than ₹${curr.toLocaleString('en-IN')}`);
      return;
    }
    setIncreasingFare(true);
    try {
      await increaseAllInclusiveFare(selectedFareOrder.id, amount);
      Alert.alert('Success', `Fare increased to ₹${amount.toLocaleString('en-IN')}! Drivers alerted.`);
      setFareModalVisible(false);
      fetchOrders();
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || e?.message || 'Could not increase fare');
    } finally {
      setIncreasingFare(false);
    }
  };

  type BookingCategory = 'all' | 'new' | 'accepted' | 'running' | 'completed' | 'cancelled' | 'expired';
  const [bookingCategory, setBookingCategory] = useState<BookingCategory>('new');

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, filterState, bookingCategory]);

  const categorize = (order: Order): BookingCategory => {
    const s = (order.trip_status || '').toUpperCase();
    if (s === 'COMPLETED') return 'completed';
    if (s === 'CANCELLED') {
      if (order.cancelled_by === 'AUTO_CANCELLED' && !order.order_accept_status) return 'expired';
      return 'cancelled';
    }
    if (!order.order_accept_status) return 'new';
    if (order.Driver_assigned && order.Car_assigned) return 'running';
    return 'accepted';
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: orders.length, new: 0, accepted: 0, running: 0, completed: 0, cancelled: 0, expired: 0 };
    for (const order of orders) counts[categorize(order)] += 1;
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (bookingCategory !== 'all') {
      filtered = filtered.filter(order => categorize(order) === bookingCategory);
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter(order =>
        (order.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.pickup_drop_location?.['0'] || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.pickup_drop_location?.['1'] || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.customer_number || '').includes(searchQuery)
      );
    }

    const now = new Date();
    const todayStr = now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();
    const next7Days = new Date(now);
    next7Days.setDate(next7Days.getDate() + 7);

    // Apply Futuristic Date Filter
    if (filterState.dateFilter === 'today') {
      filtered = filtered.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === todayStr;
      });
    } else if (filterState.dateFilter === 'tomorrow') {
      filtered = filtered.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === tomorrowStr;
      });
    } else if (filterState.dateFilter === 'next7') {
      filtered = filtered.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d >= now && d <= next7Days;
      });
    }

    // Apply Futuristic Vehicle Filter
    if (filterState.vehicleFilter !== 'all') {
      const vf = filterState.vehicleFilter.toLowerCase();
      filtered = filtered.filter((o) => {
        const cType = (o.car_type || '').toLowerCase();
        if (vf === 'sedan') return cType.includes('sedan') || cType.includes('4+1');
        if (vf === 'suv') return cType.includes('suv') || cType.includes('ertiga') || cType.includes('6+1');
        if (vf === 'luxury') return cType.includes('innova') || cType.includes('crysta') || cType.includes('luxury');
        if (vf === 'hatchback') return cType.includes('hatchback');
        return true;
      });
    }

    // Apply Futuristic Trip Type Filter
    if (filterState.tripTypeFilter !== 'all') {
      const tf = filterState.tripTypeFilter.toLowerCase();
      filtered = filtered.filter((o) => {
        const tType = (o.trip_type || '').toLowerCase();
        if (tf === 'oneway') return tType.includes('oneway') || tType.includes('one way');
        if (tf === 'roundtrip') return tType.includes('round') || tType.includes('multy');
        if (tf === 'rental') return tType.includes('rental') || tType.includes('hourly');
        return true;
      });
    }

    // Apply Futuristic Assignment Status Filter
    if (filterState.assignStatusFilter === 'unassigned') {
      filtered = filtered.filter((o) => !o.Driver_assigned || !o.Car_assigned);
    } else if (filterState.assignStatusFilter === 'assigned') {
      filtered = filtered.filter((o) => o.Driver_assigned && o.Car_assigned);
    }

    return filtered;
  }, [orders, searchQuery, filterState, bookingCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadVendorData(), fetchOrders()]);
  };

  const handleOrderPress = (orderId: number) => {
    router.push(`/order-details?orderId=${orderId}`);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (tripTime: string) => {
    if (tripTime.includes('hour')) {
      return tripTime;
    }
    return `${tripTime} hours`;
  };

  const clearFilters = () => {
    setFilterState({
      dateFilter: 'all',
      vehicleFilter: 'all',
      tripTypeFilter: 'all',
      assignStatusFilter: 'all',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Bookings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* Header */}
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.welcomeText}>Bookings Management</Text>
            <Text style={styles.companyName}>{vendorData?.full_name || 'Vendor Portal'}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(tabs)/menu')}>
            <Text style={styles.profileInitial}>
              {vendorData?.full_name?.trim()?.charAt(0)?.toUpperCase() || 'M'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Bookings grid */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Bookings Categories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([
              { key: 'create', label: 'Create', count: null, color: '#3B82F6' },
              { key: 'new', label: 'New', count: categoryCounts.new, color: '#F59E0B' },
              { key: 'accepted', label: 'Accepted', count: categoryCounts.accepted, color: '#10B981' },
              { key: 'running', label: 'Running', count: categoryCounts.running, color: '#6366F1' },
              { key: 'completed', label: 'Completed', count: categoryCounts.completed, color: '#3B82F6' },
              { key: 'cancelled', label: 'Cancelled', count: categoryCounts.cancelled, color: '#EF4444' },
              { key: 'expired', label: 'Expired', count: categoryCounts.expired, color: '#9CA3AF' },
              { key: 'all', label: 'All', count: categoryCounts.all, color: '#6B7280' },
              { key: 'vacant', label: 'Vacant', count: null, color: '#10B981' },
            ] as const).map((tile) => {
              const isActive = tile.key === bookingCategory;
              return (
                <TouchableOpacity
                  key={tile.key}
                  onPress={() => {
                    if (tile.key === 'create') { router.push('/(tabs)/create-order'); return; }
                    if (tile.key === 'vacant') { router.push('/(menu)/vacant-cities'); return; }
                    setBookingCategory(tile.key as any);
                  }}
                  style={{
                    width: '23%',
                    flexGrow: 1,
                    backgroundColor: isActive ? tile.color : '#FFFFFF',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: isActive ? tile.color : '#E5E7EB',
                  }}
                >
                  {tile.count !== null ? (
                    <Text style={{
                      fontSize: 18, fontWeight: '700',
                      color: isActive ? '#FFFFFF' : tile.color,
                    }}>
                      {tile.count}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: '700', color: isActive ? '#FFFFFF' : tile.color }}>
                      {tile.key === 'create' ? '+' : '📍'}
                    </Text>
                  )}
                  <Text style={{
                    fontSize: 11, fontWeight: '600', marginTop: 2,
                    color: isActive ? '#FFFFFF' : '#6B7280',
                  }}>
                    {tile.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Search and Filter Section */}
        <View style={styles.searchFilterSection}>
          <View style={styles.searchContainer}>
            <Search size={20} color="#6B7280" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer, location, or phone..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9CA3AF"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearch}>
                <X size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.filterButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Filter size={20} color="#1D4ED8" />
          </TouchableOpacity>
        </View>

        {/* Orders Section */}
        <View style={styles.ordersSection}>
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.sectionTitle}>Bookings</Text>
              <Text style={styles.sectionSubtitle}>
                Showing {filteredOrders.length} of {orders.length} Bookings
              </Text>
            </View>
          </View>

          {filteredOrders.length === 0 && (
            <View style={styles.emptyState}>
              <Search size={40} color="#CBD5E1" />
              <Text style={styles.emptyStateTitle}>No bookings match your filters</Text>
              <Text style={styles.emptyStateSubtitle}>
                Try a different search term or clear your filters to see more bookings.
              </Text>
            </View>
          )}

          {filteredOrders.slice(0, visibleCount).map((order) => (
            <TouchableOpacity key={order.id} style={styles.orderCard} onPress={() => handleOrderPress(order.id)}>
              <View style={styles.orderCardHeader}>
                <View style={styles.customerInfo}>
                  <View style={styles.customerAvatar}>
                    <Text style={styles.customerInitial}>
                      {order.customer_name ? order.customer_name.charAt(0).toUpperCase() : 'C'}
                    </Text>
                  </View>
                  <View style={styles.customerDetails}>
                    <Text style={styles.customerName}>{order.customer_name}</Text>
                    <Text style={styles.customerPhone}>{order.customer_number}</Text>
                    <Text style={styles.orderTime}>{formatTime(order.created_at)}</Text>
                  </View>
                </View>
                
                {(() => {
                  const label = getBookingStatusLabel(order);
                  const color = getBookingStatusColor(label);
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: `${color}15` }]}>
                      <View style={[styles.statusDot, { backgroundColor: color }]} />
                      <Text style={[styles.statusText, { color }]}>{label}</Text>
                    </View>
                  );
                })()}
              </View>

              {order.trip_status?.toUpperCase() === 'CANCELLED' && (
                <Text style={{ fontSize: 12, color: categorize(order) === 'expired' ? '#9CA3AF' : '#EF4444', marginTop: 4, marginBottom: 2 }}>
                  {categorize(order) === 'expired'
                    ? '⏱ Expired: nobody accepted this booking in time'
                    : order.cancelled_by === 'AUTO_CANCELLED'
                      ? '⚠ Auto-cancelled: driver/car not assigned in time'
                      : order.cancelled_by === 'CANCELLED_BY_VENDOR'
                        ? 'Cancelled by you'
                        : 'Cancelled'}
                </Text>
              )}

              <View style={styles.orderDetails}>
                <View style={styles.locationContainer}>
                  <View style={styles.locationItem}>
                    <View style={[styles.locationDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {order.pickup_drop_location?.['0'] || 'Pickup Location'}
                    </Text>
                  </View>
                  
                  {order.pickup_drop_location?.['1'] && (
                    <View style={styles.locationItem}>
                      <View style={[styles.locationDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {order.pickup_drop_location['1']}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Trip identity - car type, km, trip type, ID, price -
                    moved above the status rows below (it used to be small
                    text buried at the very bottom of the card, after the
                    status/assignment block and the Assign button, even
                    though it's the info a vendor scans first: which
                    vehicle, how far, what type of trip, which booking). */}
                <View style={styles.orderMeta}>
                  <View style={styles.metaGroup}>
                    <View style={styles.metaItem}>
                      <Car size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{formatCarType(order.car_type)}</Text>
                    </View>
                    {(order.trip_distance ?? 0) > 0 && (
                      <View style={styles.metaItem}>
                        <MapPin size={14} color="#6B7280" />
                        <Text style={styles.metaText}>{order.trip_distance} km</Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <Calendar size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{order.trip_type}</Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaText}>ID: #{order.id}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={styles.priceText}>₹{order.vendor_price}</Text>
                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0' }}>
                      <Text style={{ color: '#059669', fontSize: 10, fontWeight: '800' }}>
                        Est. Net ₹{Math.round(order.vendor_price * (1 - (order.platform_fees_percent || 15) / 100))}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Status Information */}
                <View style={styles.statusInfoContainer}>
                  <View style={styles.statusInfoRow}>
                    <View style={styles.statusItem}>
                      <CheckCircle size={16} color={order.order_accept_status ? '#10B981' : '#9CA3AF'} />
                      <Text style={[styles.statusItemText, { color: order.order_accept_status ? '#10B981' : '#9CA3AF' }]}>
                        {order.order_accept_status ? 'Booking Allocated' : 'Waiting for Allocation'}
                      </Text>
                    </View>

                    <View style={styles.statusItem}>
                      <Car size={16} color={order.Car_assigned ? '#10B981' : '#9CA3AF'} />
                      <Text style={[styles.statusItemText, { color: order.Car_assigned ? '#10B981' : '#9CA3AF' }]}>
                        Car {order.Car_assigned ? 'Assigned' : 'Not Assigned'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.statusInfoRow}>
                    <View style={styles.statusItem}>
                      <User size={16} color={order.Driver_assigned ? '#10B981' : '#9CA3AF'} />
                      <Text style={[styles.statusItemText, { color: order.Driver_assigned ? '#10B981' : '#9CA3AF' }]}>
                        Driver {order.Driver_assigned ? 'Assigned' : 'Not Assigned'}
                      </Text>
                    </View>

                    <View style={styles.statusItem}>
                      <Clock size={16} color="#6B7280" />
                      <Text style={styles.statusItemText}>
                        Duration: {formatDuration(order.trip_time)}
                      </Text>
                    </View>
                  </View>
                </View>

                {(!order.Car_assigned || !order.Driver_assigned) && order.trip_status?.toUpperCase() !== 'CANCELLED' && (
                  <TouchableOpacity
                    style={styles.quickAssignBtn}
                    onPress={() => {
                      setSelectedDispatchOrder(order);
                      setDispatchModalVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Car size={16} color="#FFFFFF" />
                    <Text style={styles.quickAssignBtnText}>ALLOCATE MANUALLY</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {filteredOrders.length > visibleCount && (
            <TouchableOpacity
              style={{
                marginTop: 8,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: '#EFF6FF',
                alignItems: 'center',
              }}
              onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              <Text style={{ color: '#1D4ED8', fontWeight: '600', fontSize: 14 }}>
                Show more ({filteredOrders.length - visibleCount} remaining)
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: Platform.OS === 'ios' ? 100 : 80 }} />
      </ScrollView>

      {/* Futuristic Filter Modal */}
      <FuturisticFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filterState}
        onApplyFilters={(newFilters) => setFilterState(newFilters)}
        onResetFilters={() =>
          setFilterState({
            dateFilter: 'all',
            vehicleFilter: 'all',
            tripTypeFilter: 'all',
            assignStatusFilter: 'all',
          })
        }
      />


      {/* Quick Fare Boost Modal for Vendor */}
      <Modal visible={fareModalVisible} transparent animationType="fade" onRequestClose={() => setFareModalVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={() => setFareModalVisible(false)}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={20} color="#059669" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>Boost Booking Fare</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
              Increase flat price for Booking #{selectedFareOrder?.id}. This immediately re-broadcasts a high-priority push notification to all available drivers in the pickup city.
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4 }}>New Total Fare (₹):</Text>
            <TextInput
              style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}
              value={newFareInput}
              onChangeText={setNewFareInput}
              keyboardType="numeric"
              placeholder="e.g. 4500"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' }} onPress={() => setFareModalVisible(false)}>
                <Text style={{ fontWeight: '700', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center' }}
                onPress={handleConfirmIncreaseFare}
                disabled={increasingFare}
              >
                {increasingFare ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontWeight: '800', color: '#FFF' }}>Boost & Alert</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <DutyAssignModal
        visible={dispatchModalVisible}
        onClose={() => setDispatchModalVisible(false)}
        bookingDetails={
          selectedDispatchOrder
            ? {
                order_id: selectedDispatchOrder.id,
                pickup: selectedDispatchOrder.pickup_drop_location?.['0'] || 'Chennai',
                drop: selectedDispatchOrder.pickup_drop_location?.['1'] || 'Pondicherry',
                estimated_price: selectedDispatchOrder.estimated_price,
                car_type: selectedDispatchOrder.car_type,
              }
            : undefined
        }
        onDispatchConfirmed={() => {
          // DutyAssignModal already made the real /vendor-assign call -
          // re-fetch instead of guessing local state, since the booking is
          // only truly "Allocated" once the fleet owner picks a driver+car
          // (a direct dispatch just claims it for them).
          setDispatchModalVisible(false);
          fetchOrders();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quickAssignBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  quickAssignBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 10,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 44 : ANDROID_STATUS_BAR + 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 14,
    color: '#DBEAFE',
    marginBottom: 2,
  },
  companyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  statsSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  searchFilterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1F2937',
  },
  clearSearch: {
    padding: 2,
  },
  filterButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginLeft: 6,
  },
  ordersSection: {
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 4,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1D4ED8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  customerInitial: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 1,
  },
  customerPhone: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 1,
  },
  orderTime: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    gap: 10,
  },
  locationContainer: {
    gap: 6,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
    marginTop: 5,
  },
  locationText: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
    lineHeight: 16,
  },
  statusInfoContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 10,
    gap: 6,
  },
  statusInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statusItemText: {
    fontSize: 12,
    fontWeight: '500',
  },
  orderMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  metaGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    flex: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  filterOptions: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  filterGroup: {
    marginBottom: 20,
  },
  filterGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterPillActive: {
    backgroundColor: '#1D4ED8',
  },
  filterPillText: {
    fontSize: 12,
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
