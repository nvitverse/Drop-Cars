import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl, 
  TouchableOpacity, 
  Alert, 
  Modal 
} from 'react-native';
import api from '../api/api';
import { 
  History as HistoryIcon, 
  ArrowUpRight, 
  Clock, 
  CircleCheck as CheckCircle, 
  Circle as XCircle, 
  Filter, 
  ChevronRight, 
  X, 
  Calendar, 
  Wallet, 
  Banknote, 
  MessageSquare 
} from 'lucide-react-native';

interface Transfer {
  id: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_amount: number;
  created_at: string;
  wallet_balance_before: number;
  bank_balance_before: number;
  wallet_balance_after?: number;
  bank_balance_after?: number;
  admin_notes?: string;
}

export default function HistoryScreen() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadHistory = async () => {
    try {
      const response = await api.get('/transfer/history?skip=0&limit=100');
      setTransfers(response.data["transactions"]);
    } catch (error) {
      Alert.alert('Error', 'Failed to load transfer history');
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle size={16} color="#10B981" />;
      case 'Rejected':
        return <XCircle size={16} color="#EF4444" />;
      case 'Pending':
        return <Clock size={16} color="#F59E0B" />;
      default:
        return <Clock size={16} color="#6B7280" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return '#10B981';
      case 'Rejected':
        return '#EF4444';
      case 'Pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const getStatusBackgroundColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return '#10B98120';
      case 'Rejected':
        return '#EF444420';
      case 'Pending':
        return '#F59E0B20';
      default:
        return '#6B728020';
    }
  };

  const filteredTransfers = transfers.filter(transfer => {
    if (filter === 'all') return true;
    return transfer.status.toLowerCase() === filter.toLowerCase();
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const openTransferDetails = (transfer: Transfer) => {
    setSelectedTransfer(transfer);
    setModalVisible(true);
  };

  const closeTransferDetails = () => {
    setModalVisible(false);
    setSelectedTransfer(null);
  };

  const FilterButton = ({ status, label }: { status: string; label: string }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        filter === status && styles.filterButtonActive,
      ]}
      onPress={() => setFilter(status)}
    >
      <Text
        style={[
          styles.filterButtonText,
          filter === status && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Compact Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <HistoryIcon size={20} color="#3B82F6" />
            </View>
            <Text style={styles.headerTitle}>Transfer History</Text>
          </View>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.filterContainer}>
          <View style={styles.filterHeader}>
            <Filter size={16} color="#6B7280" />
            <Text style={styles.filterTitle}>Filter by status</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterButtons}>
              <FilterButton status="all" label="All" />
              <FilterButton status="pending" label="Pending" />
              <FilterButton status="approved" label="Paid" />
            </View>
          </ScrollView>
        </View>

        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredTransfers.length === 0 ? (
            <View style={styles.emptyState}>
              <HistoryIcon size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No transfers found</Text>
              <Text style={styles.emptySubtitle}>
                {filter === 'all' 
                  ? 'Your transfer history will appear here'
                  : `No ${filter} transfers found`
                }
              </Text>
            </View>
          ) : (
            <View style={styles.transferList}>
              {filteredTransfers.map((transfer) => (
                <TouchableOpacity
                  key={transfer.id}
                  style={styles.transferCard}
                  onPress={() => openTransferDetails(transfer)}
                >
                  <View style={styles.transferHeader}>
                    <View style={styles.transferIcon}>
                      <ArrowUpRight size={16} color="#3B82F6" />
                    </View>
                    <View style={styles.transferInfo}>
                      <Text style={styles.transferAmount}>
                        ₹{transfer.requested_amount.toLocaleString('en-IN')}
                      </Text>
                      <Text style={styles.transferDate}>
                        {formatDate(transfer.created_at)}
                      </Text>
                    </View>
                    <View style={styles.transferRight}>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusBackgroundColor(transfer.status) }
                      ]}>
                        {getStatusIcon(transfer.status)}
                        <Text style={[
                          styles.statusText,
                          { color: getStatusColor(transfer.status) }
                        ]}>
                          {transfer.status == "Approved" ? "Paid" : transfer.status}
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Transaction Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeTransferDetails}
      >
        {selectedTransfer && (
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={closeTransferDetails}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Amount Card */}
              <View style={styles.detailCard}>
                <View style={styles.amountSection}>
                  <Text style={styles.amountLabel}>Transfer Amount</Text>
                  <Text style={styles.amountValue}>
                    ₹{selectedTransfer.requested_amount.toLocaleString('en-IN')}
                  </Text>
                </View>
                
                <View style={styles.statusSection}>
                  <View style={styles.statusRow}>
                    <Calendar size={16} color="#6B7280" />
                    <Text style={styles.dateText}>
                      {formatDate(selectedTransfer.created_at)}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadgeLarge,
                    { backgroundColor: getStatusBackgroundColor(selectedTransfer.status) }
                  ]}>
                    {getStatusIcon(selectedTransfer.status)}
                    <Text style={[
                      styles.statusTextLarge,
                      { color: getStatusColor(selectedTransfer.status) }
                    ]}>
                      {selectedTransfer.status == "Approved" ? "Paid" : selectedTransfer.status}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Balance Details */}
              <View style={styles.detailCard}>
                <Text style={styles.sectionTitle}>Balance Details</Text>
                
                <View style={styles.balanceSection}>
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceIcon}>
                      <Wallet size={16} color="#3B82F6" />
                    </View>
                    <View style={styles.balanceInfo}>
                      <Text style={styles.balanceLabel}>Wallet Balance</Text>
                      <Text style={styles.balanceValue}>
                        Before: ₹{selectedTransfer.wallet_balance_before.toLocaleString('en-IN')}
                      </Text>
                      {selectedTransfer.wallet_balance_after && (
                        <Text style={[styles.balanceValue, styles.balanceAfter]}>
                          After: ₹{selectedTransfer.wallet_balance_after.toLocaleString('en-IN')}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.balanceRow}>
                    <View style={styles.balanceIcon}>
                      <Banknote size={16} color="#10B981" />
                    </View>
                    <View style={styles.balanceInfo}>
                      <Text style={styles.balanceLabel}>Bank Balance</Text>
                      <Text style={styles.balanceValue}>
                        Before: ₹{selectedTransfer.bank_balance_before.toLocaleString('en-IN')}
                      </Text>
                      {selectedTransfer.bank_balance_after && (
                        <Text style={[styles.balanceValue, styles.balanceAfter]}>
                          After: ₹{selectedTransfer.bank_balance_after.toLocaleString('en-IN')}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* Admin Notes */}
              {selectedTransfer.admin_notes && (
                <View style={styles.detailCard}>
                  <View style={styles.notesHeader}>
                    <MessageSquare size={16} color="#6B7280" />
                    <Text style={styles.sectionTitle}>Admin Responce</Text>
                  </View>
                  <View style={styles.notesContent}>
                    <Text style={styles.notesText}>{selectedTransfer.admin_notes}</Text>
                  </View>
                </View>
              )}

              {/* Transaction ID */}
              <View style={styles.detailCard}>
                <Text style={styles.sectionTitle}>Transaction Information</Text>
                <View style={styles.transactionId}>
                  <Text style={styles.idLabel}>Tnx ID:</Text>
                  <Text style={styles.idValue}>{selectedTransfer.id}</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  filterTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  transferList: {
    gap: 8,
    paddingBottom: 16,
  },
  transferCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transferIcon: {
    width: 32,
    height: 32,
    backgroundColor: '#3B82F620',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  transferInfo: {
    flex: 1,
  },
  transferAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  transferDate: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  transferRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusTextLarge: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  balanceSection: {
    gap: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  balanceIcon: {
    width: 32,
    height: 32,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 12,
    color: '#1F2937',
    marginBottom: 2,
  },
  balanceAfter: {
    color: '#10B981',
    fontWeight: '500',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  notesContent: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  notesText: {
    fontSize: 12,
    color: '#1F2937',
    lineHeight: 16,
  },
  transactionId: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  idLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  idValue: {
    fontSize: 11,
    color: '#1F2937',
    fontFamily: 'monospace',
  },
});