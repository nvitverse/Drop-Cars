import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { X, UserCheck, Send, CheckCircle2, Percent, Search, Wallet, AlertTriangle, CreditCard } from 'lucide-react-native';
import api from '../app/api/api';

interface SearchResultItem {
  id: string | number;
  full_name: string;
  primary_number: string;
  wallet_balance: number;
  reg_id?: string;
  type?: string;
  status?: string;
}

interface DutyAssignModalProps {
  visible: boolean;
  onClose: () => void;
  onDispatchConfirmed: (targetId: string | number, type: string, withCredit?: boolean) => void;
  bookingDetails?: {
    order_id: number | string;
    pickup: string;
    drop: string;
    estimated_price: number;
    car_type?: string;
    fare_type?: string;
  };
}

export default function DutyAssignModal({
  visible,
  onClose,
  onDispatchConfirmed,
  bookingDetails,
}: DutyAssignModalProps) {
  // Driver / Fleet Owner Search State
  const [driverQuery, setDriverQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchedResults, setSearchedResults] = useState<SearchResultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchResultItem | null>(null);

  // Estimated platform commission required (10%)
  const estimatedPrice = bookingDetails?.estimated_price || 0;
  const requiredCommission = Math.round(estimatedPrice * 0.10);

  // Reset state whenever modal opens
  useEffect(() => {
    if (visible) {
      setDriverQuery('');
      setHasSearched(false);
      setSearchedResults([]);
      setSelectedItem(null);
    }
  }, [visible]);

  // Execute Search upon clicking SEARCH button (Fetches live DB API + matches names & numbers)
  const handleSearchDriver = async () => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) {
      Alert.alert('Search Input Required', 'Please enter a driver name or phone number to search.');
      return;
    }

    setLoading(true);
    try {
      // Real backend vendor/fleet-owner search - matches by name, phone, or
      // reg ID (see crud/car_driver.py's search_drivers_and_owners_for_vendor).
      // Router is mounted at /api/users (see main.py), so the path needs the
      // /users prefix - a previous version of this call omitted it, which
      // 404'd every real search and silently fell back to a hardcoded list
      // of fake names (Dhanasekaran/Mukil/etc.) instead of showing an error.
      const res = await api.post('/users/vendor/drivers/search', { query: q });
      const liveItems: SearchResultItem[] = Array.isArray(res.data)
        ? res.data.map((item: any) => ({
            id: item.id,
            full_name: item.full_name || 'Registered Driver',
            primary_number: item.primary_number || '',
            wallet_balance: item.wallet_balance ?? 0,
            reg_id: item.reg_id,
            type: item.type || 'DRIVER',
            status: item.status || 'AVAILABLE',
          }))
        : [];

      setSearchedResults(liveItems);
      setHasSearched(true);
    } catch (err: any) {
      // api.js's response interceptor already rewrites err.message to the
      // backend's real detail (or a plain-English network/timeout message) -
      // show that instead of a generic string so a real failure (expired
      // session, server error, etc.) is actually diagnosable.
      Alert.alert('Search Failed', err?.message || 'Could not search drivers right now. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const [dispatching, setDispatching] = useState(false);

  // Calls the real backend assignment endpoint. `withCredit` proceeds even
  // with a low wallet balance (force_credit) - used both for the initial
  // low-balance confirm and as the retry path if a first attempt without
  // it comes back INSUFFICIENT_BALANCE.
  const dispatchToBackend = async (withCredit: boolean) => {
    if (!selectedItem || !bookingDetails) return;
    setDispatching(true);
    try {
      const res = await api.post(`/orders/${bookingDetails.order_id}/vendor-assign`, {
        target_id: selectedItem.id,
        force_credit: withCredit,
      });
      if (res.data?.status === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Insufficient Wallet Balance',
          res.data.message || `${selectedItem.full_name}'s wallet balance is too low for this booking.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Allocate on Credit', onPress: () => dispatchToBackend(true) },
          ]
        );
        return;
      }
      onDispatchConfirmed(selectedItem.id, 'DRIVER_ASSIGNED', withCredit);
      Alert.alert(
        withCredit ? 'Allocated on Credit' : 'Duty Assigned',
        res.data?.message || `Order #${bookingDetails.order_id} successfully assigned to ${selectedItem.full_name}.`
      );
    } catch (err: any) {
      Alert.alert('Dispatch Failed', err?.message || 'Could not assign this booking right now. Please try again.');
    } finally {
      setDispatching(false);
    }
  };

  const handleConfirmDispatch = () => {
    if (!selectedItem) {
      Alert.alert('Driver / Fleet Owner Required', 'Please search and select a registered driver to assign.');
      return;
    }
    dispatchToBackend(false);
  };

  // Confirm Dispatch on Credit (when wallet balance is already known low)
  const handleConfirmCreditDispatch = () => {
    if (!selectedItem) {
      Alert.alert('Driver / Fleet Owner Required', 'Please search and select a registered driver to assign.');
      return;
    }

    Alert.alert(
      'Confirm Credit Allocation',
      `Allocate Order #${bookingDetails?.order_id || 'Unknown'} to ${selectedItem.full_name} on Credit? (Wallet balance: ₹${selectedItem.wallet_balance}, Required: ₹${requiredCommission})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Allocate on Credit', onPress: () => dispatchToBackend(true) },
      ]
    );
  };

  const isAllInclusive = bookingDetails?.fare_type === 'ALL_INCLUSIVE';
  const hasSufficientWallet = selectedItem ? selectedItem.wallet_balance >= requiredCommission : true;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Centered Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Send size={22} color="#2563EB" />
              <Text style={styles.headerTitle}>Assign Duty (Driver / Fleet Owner)</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Booking Summary Box */}
            <View style={styles.bookingBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.bookingTitle}>
                  Order #{bookingDetails?.order_id || 'Unknown'} • {bookingDetails?.car_type || 'Unknown'}
                </Text>
                <View style={styles.modelBadge}>
                  <Percent size={12} color="#38BDF8" />
                  <Text style={styles.modelBadgeText}>
                    {isAllInclusive ? 'All-Inclusive' : 'Per-Km (10% Comm.)'}
                  </Text>
                </View>
              </View>
              <Text style={styles.bookingRoute}>
                {bookingDetails?.pickup || 'Unknown'} ➔ {bookingDetails?.drop || 'Unknown'}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <Text style={styles.bookingPrice}>Est. Fare: ₹{estimatedPrice}</Text>
                <Text style={{ fontSize: 11, color: '#38BDF8', fontWeight: '700' }}>Req. Wallet: ₹{requiredCommission}</Text>
              </View>
            </View>

            {/* SEARCH DRIVER / FLEET OWNER */}
            <Text style={styles.sectionLabel}>SEARCH REGISTERED DRIVER / FLEET OWNER</Text>
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <UserCheck size={18} color="#64748B" style={{ marginLeft: 10 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter driver name or phone number (e.g. Dhana)..."
                  placeholderTextColor="#94A3B8"
                  value={driverQuery}
                  onChangeText={(text) => {
                    setDriverQuery(text);
                    if (hasSearched) setHasSearched(false);
                  }}
                  onSubmitEditing={handleSearchDriver}
                />
                {driverQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setDriverQuery('');
                      setHasSearched(false);
                      setSearchedResults([]);
                    }}
                    style={{ padding: 6 }}
                  >
                    <X size={16} color="#64748B" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[styles.searchBtn, { backgroundColor: '#10B981' }]}
                onPress={handleSearchDriver}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Search size={15} color="#FFFFFF" />}
                <Text style={styles.searchBtnText}>{loading ? 'SEARCHING' : 'SEARCH'}</Text>
              </TouchableOpacity>
            </View>

            {/* Search Results */}
            {loading ? (
              <View style={{ padding: 14, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Searching drivers in database...</Text>
              </View>
            ) : hasSearched ? (
              searchedResults.length > 0 ? (
                searchedResults.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isWalletLow = item.wallet_balance < requiredCommission;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                      onPress={() => setSelectedItem(item)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.itemIconBg, { backgroundColor: isWalletLow ? '#FEF3C7' : '#ECFDF5' }]}>
                        <UserCheck size={18} color={isWalletLow ? '#D97706' : '#059669'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.full_name}</Text>
                        <Text style={styles.itemSub}>{item.primary_number} • {item.type}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Wallet size={12} color={isWalletLow ? '#D97706' : '#059669'} />
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: isWalletLow ? '#D97706' : '#059669' }}>
                            Wallet: ₹{item.wallet_balance} {isWalletLow ? `(Req: ₹${requiredCommission})` : ''}
                          </Text>
                        </View>
                      </View>
                      {isSelected && <CheckCircle2 size={20} color="#10B981" />}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptySearchBox}>
                  <Text style={styles.emptySearchText}>No drivers found matching "{driverQuery}"</Text>
                </View>
              )
            ) : selectedItem ? (
              <View style={[styles.itemCard, styles.itemCardSelected, { marginBottom: 12 }]}>
                <View style={[styles.itemIconBg, { backgroundColor: '#ECFDF5' }]}>
                  <UserCheck size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{selectedItem.full_name}</Text>
                  <Text style={styles.itemSub}>{selectedItem.primary_number}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Wallet size={12} color="#059669" />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#059669' }}>
                      Wallet: ₹{selectedItem.wallet_balance}
                    </Text>
                  </View>
                </View>
                <CheckCircle2 size={20} color="#10B981" />
              </View>
            ) : (
              <Text style={styles.helperText}>Type driver name (e.g. Dhana or Mukil) or mobile number and tap SEARCH.</Text>
            )}
          </ScrollView>

          {/* Bottom Confirmation Action Button */}
          <View style={{ marginTop: 10 }}>
            {selectedItem && !hasSufficientWallet ? (
              <View style={{ gap: 8 }}>
                <View style={styles.warningBox}>
                  <AlertTriangle size={16} color="#B45309" />
                  <Text style={styles.warningText}>
                    Insufficient wallet balance (₹{selectedItem.wallet_balance}). Required commission is ₹{requiredCommission}.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.dispatchBtn, { backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6' }, dispatching && { opacity: 0.7 }]}
                  onPress={handleConfirmCreditDispatch}
                  disabled={dispatching}
                  activeOpacity={0.85}
                >
                  {dispatching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CreditCard size={18} color="#FFFFFF" />}
                  <Text style={styles.dispatchBtnText}>
                    ALLOCATE WITH CREDIT ({selectedItem.full_name.toUpperCase()})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.dispatchBtn, (!selectedItem || dispatching) && { opacity: 0.6 }]}
                onPress={handleConfirmDispatch}
                disabled={!selectedItem || dispatching}
                activeOpacity={0.85}
              >
                {dispatching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
                <Text style={styles.dispatchBtnText}>
                  {selectedItem ? `CONFIRM DISPATCH (${selectedItem.full_name.toUpperCase()})` : 'CONFIRM DISPATCH'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 24,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  body: {
    marginVertical: 12,
  },
  bookingBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  bookingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  bookingRoute: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '600',
  },
  bookingPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38BDF8',
  },
  modelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modelBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  searchBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 12,
    marginLeft: 2,
  },
  emptySearchBox: {
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginBottom: 12,
  },
  emptySearchText: {
    fontSize: 12.5,
    color: '#92400E',
    fontWeight: '600',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  itemCardSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  itemIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 10,
  },
  warningText: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
  },
  dispatchBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dispatchBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
