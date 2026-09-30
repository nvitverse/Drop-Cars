import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, CheckCircle, XCircle, RefreshCw, ArrowRight, Building2, Wallet } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, EmptyState, SkeletonRow, Btn } from '@/components/ui';

interface TransferTransaction {
  id: string;
  vendor_id: string;
  requested_amount: number;
  wallet_balance_before: number;
  bank_balance_before: number;
  status: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 50;

export default function TransfersScreen() {
  const { isDark, themeColors } = useTheme();
  const [transfers, setTransfers] = useState<TransferTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skipCount, setSkipCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchTransfers = async (reset = true) => {
    try {
      setError(null);
      const skip = reset ? 0 : skipCount;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getPendingTransfers(skip, PAGE_SIZE);
      setTransfers(prev => (reset ? data.transactions : [...prev, ...data.transactions]));
      setHasMore(data.transactions.length === PAGE_SIZE);
      setSkipCount(skip + data.transactions.length);
    } catch (error) {
      if (reset) setError('Failed to load transfer requests. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTransfers(true);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransfers(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchTransfers(false);
    }
  };

  const processTransferAction = async (
    transfer: TransferTransaction,
    action: 'approve' | 'reject',
    notes?: string
  ) => {
    try {
      await apiService.processTransfer(transfer.id, action, notes || undefined);
      setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
      Alert.alert(
        'Success',
        `Transfer ${action === 'approve' ? 'approved' : 'rejected'} successfully`
      );
    } catch (error) {
      Alert.alert('Error', `Failed to ${action} transfer. Please try again.`);
    }
  };

  const handleTransferAction = (transfer: TransferTransaction, action: 'approve' | 'reject') => {
    const title = `${action === 'approve' ? 'Approve' : 'Reject'} Transfer`;

    if (Platform.OS === 'ios') {
      Alert.prompt(
        title,
        'Add a note (optional):',
        async (notes) => {
          await processTransferAction(transfer, action, notes);
        },
        'plain-text',
        ''
      );
      return;
    }

    Alert.alert(
      title,
      `Are you sure you want to ${action} this transfer of ${formatCurrency(transfer.requested_amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => processTransferAction(transfer, action),
        },
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isPendingTransfer = (status: string) => status?.toLowerCase() === 'pending';

  const renderTransferItem = ({ item }: { item: TransferTransaction }) => (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.vendorRow}>
            <Building2 size={15} color={themeColors.primary} />
            <Text style={[styles.vendorId, { color: themeColors.text }]} numberOfLines={1}>
              Vendor: {item.vendor_id.substring(0, 10)}...
            </Text>
            <StatusPill status={item.status} variant={isPendingTransfer(item.status) ? 'warning' : 'neutral'} size="sm" />
          </View>
          <Text style={[styles.requestDate, { color: themeColors.textMuted }]}>{formatDate(item.created_at)}</Text>
        </View>
        <Text style={[styles.requestedAmount, { color: themeColors.primary }]}>{formatCurrency(item.requested_amount)}</Text>
      </View>

      <View style={[styles.balanceInfo, { backgroundColor: themeColors.surfaceAlt, borderColor: themeColors.border }]}>
        <View style={styles.balanceItem}>
          <Text style={[styles.balanceLabel, { color: themeColors.textMuted }]}>Wallet Before</Text>
          <Text style={[styles.balanceValue, { color: themeColors.text }]}>{formatCurrency(item.wallet_balance_before)}</Text>
        </View>
        <ArrowRight size={14} color={themeColors.textMuted} />
        <View style={styles.balanceItem}>
          <Text style={[styles.balanceLabel, { color: themeColors.textMuted }]}>Bank Before</Text>
          <Text style={[styles.balanceValue, { color: themeColors.text }]}>{formatCurrency(item.bank_balance_before)}</Text>
        </View>
      </View>

      {item.admin_notes && (
        <View style={styles.notesContainer}>
          <Text style={[styles.notesText, { color: themeColors.textSecondary }]}>{item.admin_notes}</Text>
        </View>
      )}

      {isPendingTransfer(item.status) && (
        <View style={styles.actionButtons}>
          <Btn
            label="Approve"
            variant="primary"
            size="sm"
            onPress={() => handleTransferAction(item, 'approve')}
            style={{ flex: 1 }}
          />
          <Btn
            label="Reject"
            variant="danger"
            size="sm"
            onPress={() => handleTransferAction(item, 'reject')}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Transfers</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{transfers.length}</Text>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={transfers}
          renderItem={renderTransferItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={<Clock size={36} color={themeColors.textMuted} />}
              title="No pending transfers"
              message="All vendor settlement requests have been processed."
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 12, fontWeight: '700' },
  loadingContainer: { padding: 16, gap: 8 },
  listContainer: { padding: 16, gap: 8, paddingBottom: 40 },
  card: { marginBottom: 4, padding: 12 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  vendorId: { fontSize: 13, fontWeight: '700' },
  requestDate: { fontSize: 11 },
  requestedAmount: { fontSize: 16, fontWeight: '800' },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  balanceItem: { alignItems: 'center' },
  balanceLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  balanceValue: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  notesContainer: {
    paddingVertical: 4,
  },
  notesText: { fontSize: 11, fontStyle: 'italic' },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  footerLoader: { paddingVertical: 12, alignItems: 'center' },
});
