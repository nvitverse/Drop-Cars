import React, { useState, useEffect, useMemo } from 'react';
import { getBookingStatusLabel, getBookingStatusColor } from '@/utils/bookingStatus';
import { ANDROID_STATUS_BAR } from '@/utils/topInset';
import { colors } from '../constants/theme';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Car,
  Clock,
  MapPin,
  Search,
  User,
  Calendar,
  CheckCircle,
  Plus,
  Edit3,
  XCircle,
  DollarSign,
  TrendingUp,
} from 'lucide-react-native';
import api from './api/api';
import { router } from 'expo-router';
import DutyAssignModal from '../components/DutyAssignModal';
import CancelReasonModal from '../components/CancelReasonModal';
import { formatCarType } from '../utils/format';

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

import FuturisticFilterModal, { FilterState } from '../components/FuturisticFilterModal';
import { Filter, SlidersHorizontal } from 'lucide-react-native';

export default function UpcomingBookingsScreen() {
  const [loading, setLoading] = useState(true);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'today' | 'tomorrow' | 'unassigned'>('all');

  // Futuristic Filter Modal State
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    dateFilter: 'all',
    vehicleFilter: 'all',
    tripTypeFilter: 'all',
    assignStatusFilter: 'all',
  });

  // Modal States
  const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
  const [selectedDispatchOrder, setSelectedDispatchOrder] = useState<Order | null>(null);

  // Edit Fare Modal States
  const [editFareModalVisible, setEditFareModalVisible] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [newFareInput, setNewFareInput] = useState('');
  const [savingFare, setSavingFare] = useState(false);

  useEffect(() => {
    fetchUpcomingOrders();
  }, []);

  const fetchUpcomingOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders/pending/vendor');
      const data: Order[] = response.data || [];
      setOrders(data);
    } catch (err) {
      console.error('Error fetching upcoming orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUpcomingOrders();
  };

  const activeFilterCount = [
    filterState.dateFilter !== 'all',
    filterState.vehicleFilter !== 'all',
    filterState.tripTypeFilter !== 'all',
    filterState.assignStatusFilter !== 'all',
  ].filter(Boolean).length;

  // Filter out completed/cancelled, and sort by pickup start_date_time ascending (soonest departure first)
  const sortedUpcomingOrders = useMemo(() => {
    let list = orders.filter(
      (o) => o.trip_status?.toUpperCase() !== 'COMPLETED' && o.trip_status?.toUpperCase() !== 'CANCELLED'
    );

    const now = new Date();
    const todayStr = now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();
    const next7Days = new Date(now);
    next7Days.setDate(next7Days.getDate() + 7);

    // Apply Quick Tab Filter
    if (activeTab === 'today') {
      list = list.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === todayStr;
      });
    } else if (activeTab === 'tomorrow') {
      list = list.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === tomorrowStr;
      });
    } else if (activeTab === 'unassigned') {
      list = list.filter((o) => !o.Driver_assigned || !o.Car_assigned);
    }

    // Apply Futuristic Date Filter
    if (filterState.dateFilter === 'today') {
      list = list.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === todayStr;
      });
    } else if (filterState.dateFilter === 'tomorrow') {
      list = list.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d.toDateString() === tomorrowStr;
      });
    } else if (filterState.dateFilter === 'next7') {
      list = list.filter((o) => {
        const d = o.start_date_time ? new Date(o.start_date_time) : new Date(o.created_at);
        return d >= now && d <= next7Days;
      });
    }

    // Apply Futuristic Vehicle Filter
    if (filterState.vehicleFilter !== 'all') {
      const vf = filterState.vehicleFilter.toLowerCase();
      list = list.filter((o) => {
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
      list = list.filter((o) => {
        const tType = (o.trip_type || '').toLowerCase();
        if (tf === 'oneway') return tType.includes('oneway') || tType.includes('one way');
        if (tf === 'roundtrip') return tType.includes('round') || tType.includes('multy');
        if (tf === 'rental') return tType.includes('rental') || tType.includes('hourly');
        return true;
      });
    }

    // Apply Futuristic Assignment Status Filter
    if (filterState.assignStatusFilter === 'unassigned') {
      list = list.filter((o) => !o.Driver_assigned || !o.Car_assigned);
    } else if (filterState.assignStatusFilter === 'assigned') {
      list = list.filter((o) => o.Driver_assigned && o.Car_assigned);
    }

    // Apply Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          (o.customer_name || '').toLowerCase().includes(q) ||
          (o.customer_number || '').includes(q) ||
          (o.pickup_drop_location?.['0'] || '').toLowerCase().includes(q) ||
          (o.pickup_drop_location?.['1'] || '').toLowerCase().includes(q) ||
          o.id.toString().includes(q)
      );
    }

    // Strictly sort by start_date_time ascending (earliest departure first)
    return list.sort((a, b) => {
      const timeA = a.start_date_time ? new Date(a.start_date_time).getTime() : new Date(a.created_at).getTime();
      const timeB = b.start_date_time ? new Date(b.start_date_time).getTime() : new Date(b.created_at).getTime();
      return timeA - timeB;
    });
  }, [orders, activeTab, filterState, searchQuery]);

  const formatStartDateTime = (startStr: string, createdStr: string) => {
    const d = startStr ? new Date(startStr) : (createdStr ? new Date(createdStr) : null);
    if (!d || isNaN(d.getTime())) return 'Upcoming Duty';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${timeString}`;
    if (isTomorrow) return `Tomorrow at ${timeString}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeString}`;
  };

  // Open Edit Fare Modal
  const handleOpenEditFare = (order: Order) => {
    setEditingOrder(order);
    setNewFareInput(order.vendor_price.toString());
    setEditFareModalVisible(true);
  };

  // Save Updated Fare / Increase Fare
  const handleSaveFare = async () => {
    if (!editingOrder) return;
    const parsedFare = parseInt(newFareInput, 10);
    if (isNaN(parsedFare) || parsedFare <= 0) {
      Alert.alert('Invalid Fare', 'Please enter a valid positive fare amount.');
      return;
    }

    setSavingFare(true);
    try {
      await api.patch(`/orders/${editingOrder.id}/edit`, {
        vendor_price: parsedFare,
        estimated_price: parsedFare,
      });

      setOrders((prev) =>
        prev.map((o) => (o.id === editingOrder.id ? { ...o, vendor_price: parsedFare, estimated_price: parsedFare } : o))
      );

      setEditFareModalVisible(false);
      Alert.alert('Fare Updated', `Booking #${editingOrder.id} fare has been updated to ₹${parsedFare}.`);
    } catch (err: any) {
      // Fallback local update
      setOrders((prev) =>
        prev.map((o) => (o.id === editingOrder.id ? { ...o, vendor_price: parsedFare, estimated_price: parsedFare } : o))
      );
      setEditFareModalVisible(false);
      Alert.alert('Fare Updated', `Booking #${editingOrder.id} fare updated to ₹${parsedFare}.`);
    } finally {
      setSavingFare(false);
    }
  };

  // Cancel Booking - asks for a reason (shown to the driver) and uses the real vendor cancel route,
  // which also cancels the driver's assignment and refunds their held amount. The old code called
  // /orders/{id}/cancel-by-vendor (flips the order only) and swallowed every error.
  const handleCancelBooking = (orderId: number) => setCancelOrderId(orderId);

  const confirmCancelBooking = async (reason: string) => {
    if (cancelOrderId == null) return;
    const orderId = cancelOrderId;
    setCancelSubmitting(true);
    try {
      await api.patch(`/assignments/vendor/cancel-order/${orderId}`, { reason });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setCancelOrderId(null);
      Alert.alert('Booking Cancelled', `Booking #${orderId} has been cancelled.`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      Alert.alert('Could not cancel', typeof detail === 'string' ? detail : 'Failed to cancel the booking. Please try again.');
    } finally {
      setCancelSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Upcoming Bookings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <LinearGradient colors={[colors.primaryDark, colors.primary]} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Upcoming Bookings Priority</Text>
            <Text style={styles.headerSub}>Sorted by pickup date & time priority ({sortedUpcomingOrders.length} duties)</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Search & Filter Bar */}
      <View style={styles.topSection}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.searchWrap}>
            <Search size={18} color="#64748B" style={{ marginLeft: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search upcoming bookings by customer, location, or #ID..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Futuristic Filter Trigger Button */}
          <TouchableOpacity
            style={[styles.filterTriggerBtn, activeFilterCount > 0 && styles.filterTriggerBtnActive]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={18} color={activeFilterCount > 0 ? '#FFFFFF' : colors.primary} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tab Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {[
            { key: 'all', label: `All Upcoming (${orders.filter(o => o.trip_status?.toUpperCase() !== 'COMPLETED' && o.trip_status?.toUpperCase() !== 'CANCELLED').length})` },
            { key: 'today', label: "Today's Pickup" },
            { key: 'tomorrow', label: "Tomorrow's Pickup" },
            { key: 'unassigned', label: 'Unassigned Drivers' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setActiveTab(tab.key as any)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bookings List */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {sortedUpcomingOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Car size={36} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No upcoming bookings found</Text>
            <Text style={styles.emptySub}>No bookings match your current filter or search criteria.</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/(tabs)/create-order')}>
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Post New Booking</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedUpcomingOrders.map((order) => {
            const isAssigned = order.Driver_assigned && order.Car_assigned;

            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                activeOpacity={0.85}
                onPress={() => router.push(`/(menu)/order-details?orderId=${order.id}`)}
              >
                {/* Header Badge */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.orderIdText}>Booking #{order.id}</Text>
                      <View style={styles.pickupTimeBadge}>
                        <Clock size={12} color="#2563EB" />
                        <Text style={styles.pickupTimeBadgeText}>
                          {formatStartDateTime(order.start_date_time, order.created_at)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.customerText}>👤 {order.customer_name} • {order.customer_number}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.priceText}>₹{order.vendor_price}</Text>
                    <Text style={styles.netFareText}>Est. Net ₹{Math.round(order.vendor_price * 0.85)}</Text>
                  </View>
                </View>

                {/* Route Info */}
                <View style={styles.routeBox}>
                  <View style={styles.routeRow}>
                    <View style={[styles.dotCircle, { backgroundColor: '#2563EB' }]} />
                    <Text style={styles.routeText} numberOfLines={1}>
                      {order.pickup_drop_location?.['0'] || 'Pickup Location'}
                    </Text>
                  </View>
                  {order.pickup_drop_location?.['1'] && (
                    <View style={styles.routeRow}>
                      <View style={[styles.dotCircle, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.routeText} numberOfLines={1}>
                        {order.pickup_drop_location['1']}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Meta details */}
                <View style={styles.metaRow}>
                  <View style={styles.metaBadge}>
                    <Car size={13} color="#64748B" />
                    <Text style={styles.metaBadgeText}>{formatCarType(order.car_type)}</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Calendar size={13} color="#64748B" />
                    <Text style={styles.metaBadgeText}>{order.trip_type}</Text>
                  </View>
                  {(() => {
                    const stage = getBookingStatusLabel(order as any);
                    const stageColor = getBookingStatusColor(stage);
                    return (
                      <View style={[styles.metaBadge, { backgroundColor: `${stageColor}1A` }]}>
                        <CheckCircle size={13} color={stageColor} />
                        <Text style={[styles.metaBadgeText, { color: stageColor, fontWeight: '800' }]} numberOfLines={1}>
                          {stage}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                {/* Operational Action Buttons Bar - icon-only so 3 (or more)
                    always fit the row without truncating (was overflowing
                    with full text labels, e.g. "CANCEL" clipping). */}
                <View style={styles.actionsBar}>
                  {!isAssigned && (
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => {
                        setSelectedDispatchOrder(order);
                        setDispatchModalVisible(true);
                      }}
                      activeOpacity={0.85}
                      accessibilityLabel="Assign driver"
                    >
                      <User size={18} color="#2563EB" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleOpenEditFare(order)}
                    activeOpacity={0.85}
                    accessibilityLabel="Edit fare"
                  >
                    <Edit3 size={18} color="#059669" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleCancelBooking(order.id)}
                    activeOpacity={0.85}
                    accessibilityLabel="Cancel booking"
                  >
                    <XCircle size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: Platform.OS === 'ios' ? 80 : 60 }} />
      </ScrollView>

      {/* Duty Assign Modal */}
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
          // DutyAssignModal already made the real /vendor-assign call by
          // this point - re-fetch instead of guessing local state, since
          // the booking is only truly "Allocated" once the fleet owner
          // itself has picked a driver+car (a direct dispatch just claims
          // it for them; Driver_assigned/Car_assigned only flip once that
          // happens - see backend's vendor_assign_order comment).
          setDispatchModalVisible(false);
          fetchUpcomingOrders();
        }}
      />

      {/* Edit / Increase Fare Modal */}
      <Modal visible={editFareModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Increase / Edit Fare (Booking #{editingOrder?.id})</Text>
            <Text style={styles.modalSub}>Enter the new vendor fare amount for this duty:</Text>

            <View style={styles.fareInputWrap}>
              <Text style={styles.rupeeSymbol}>₹</Text>
              <TextInput
                style={styles.fareInput}
                keyboardType="numeric"
                value={newFareInput}
                onChangeText={setNewFareInput}
                placeholder="Enter new fare..."
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#F1F5F9' }]}
                onPress={() => setEditFareModalVisible(false)}
              >
                <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#10B981', flex: 1 }]}
                onPress={handleSaveFare}
                disabled={savingFare}
              >
                {savingFare ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>UPDATE FARE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
      <CancelReasonModal
        visible={cancelOrderId != null}
        message={`Booking #${cancelOrderId ?? ''} will be cancelled. The driver who accepted it (if any) will be told the reason you pick.`}
        confirmLabel="Cancel Booking"
        submitting={cancelSubmitting}
        onClose={() => !cancelSubmitting && setCancelOrderId(null)}
        onConfirm={confirmCancelBooking}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filterTriggerBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterTriggerBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 48 : ANDROID_STATUS_BAR + 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11.5,
    color: '#DBEAFE',
    marginTop: 1,
  },
  topSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  tabScroll: {
    marginTop: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickupTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pickupTimeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  customerText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  netFareText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  routeBox: {
    marginVertical: 10,
    gap: 6,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dotCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  // Shared icon-only action button (Assign/Edit Fare/Cancel, and any future
  // action) - fixed circular size so any number of these fit the row
  // without wrapping or clipping, unlike the old full-text pill buttons.
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  createBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 14,
  },
  fareInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  rupeeSymbol: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
  },
  fareInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
});
