import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { History, Car, UserCheck, Building2, Shield, ArrowUpRight, X, Info, FileText } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { useTheme } from '@/context/ThemeContext';
import { Card, StatusPill, Segmented, EmptyState, SkeletonRow } from '@/components/ui';

interface LedgerEntry {
  id: string;
  order_id: number;
  entry_type: 'CREDIT' | 'DEBIT';
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string;
  created_at: string;
}

type FilterType = 'ALL' | 'CREDIT' | 'DEBIT';
type CategoryType = 'ALL' | 'BOOKINGS' | 'FLEET_OWNERS' | 'VENDORS' | 'PLATFORM';

const PAGE_SIZE = 50;

function parseLedgerEntity(entry: LedgerEntry) {
  const notesLower = (entry.notes || '').toLowerCase();

  if (entry.order_id || notesLower.includes('booking')) {
    const bookingId = entry.order_id || (notesLower.match(/booking\s*#?(\d+)/i)?.[1]);
    return {
      category: 'BOOKINGS' as const,
      entityType: 'Booking',
      label: bookingId ? `Booking #${bookingId}` : 'Booking Record',
      icon: Car,
      route: '/(tabs)/orders' as const,
      params: bookingId ? { search: String(bookingId) } : undefined,
    };
  }

  if (notesLower.includes('fleet driver') || notesLower.includes('vehicle_owner') || notesLower.includes('owner')) {
    const ownerNameMatch = entry.notes?.match(/to\s+([A-Za-z0-9\s]+)\s*\(/i);
    const ownerName = ownerNameMatch ? ownerNameMatch[1].trim() : 'Fleet Driver';
    return {
      category: 'FLEET_OWNERS' as const,
      entityType: 'Fleet Driver',
      label: ownerName !== 'Fleet Driver' ? `Fleet Driver: ${ownerName}` : 'Fleet Driver Account',
      icon: UserCheck,
      route: '/(tabs)/vehicle-owners' as const,
      params: undefined,
    };
  }

  if (notesLower.includes('vendor') || notesLower.includes('partner')) {
    const vendorNameMatch = entry.notes?.match(/to\s+([A-Za-z0-9\s]+)\s*\(/i);
    const vendorName = vendorNameMatch ? vendorNameMatch[1].trim() : 'Vendor';
    return {
      category: 'VENDORS' as const,
      entityType: 'Vendor',
      label: vendorName !== 'Vendor' ? `Vendor: ${vendorName}` : 'Vendor Account',
      icon: Building2,
      route: '/(tabs)/vendors' as const,
      params: undefined,
    };
  }

  return {
    category: 'PLATFORM' as const,
    entityType: 'Platform',
    label: 'Platform Treasury / System',
    icon: Shield,
    route: null,
    params: undefined,
  };
}

const TYPE_OPTIONS = [
  { label: 'All', value: 'ALL' },
  { label: 'Credit', value: 'CREDIT' },
  { label: 'Debit', value: 'DEBIT' },
];

export default function LogsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const [logs, setLogs] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryType>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const fetchLogs = async (reset = true) => {
    try {
      const skip = reset ? 0 : logs.length;
      if (!reset) setLoadingMore(true);
      const data = await apiService.getAdminLedger();
      const items = Array.isArray(data) ? data : [];
      setLogs(prev => (reset ? items : [...prev, ...items]));
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      if (reset) setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (filterType !== 'ALL' && entry.entry_type !== filterType) return false;
      if (categoryFilter !== 'ALL') {
        const entity = parseLedgerEntity(entry);
        if (entity.category !== categoryFilter) return false;
      }
      return true;
    });
  }, [logs, filterType, categoryFilter]);

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderLogItem = ({ item }: { item: LedgerEntry }) => {
    const entity = parseLedgerEntity(item);
    const isCredit = item.entry_type === 'CREDIT';

    return (
      <Card
        style={styles.logCard}
        onPress={() => setSelectedEntry(item)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.avatarBox, { backgroundColor: isCredit ? themeColors.successLight : themeColors.errorLight }]}>
            <entity.icon size={16} color={isCredit ? themeColors.success : themeColors.error} />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.entityLabel, { color: themeColors.text }]} numberOfLines={1}>{entity.label}</Text>
            <Text style={[styles.notesText, { color: themeColors.textSecondary }]} numberOfLines={1}>{item.notes || 'Ledger transaction'}</Text>
            <Text style={[styles.dateText, { color: themeColors.textMuted }]}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.amountText, { color: isCredit ? themeColors.success : themeColors.error }]}>
              {isCredit ? '+' : '-'}{formatCurrency(item.amount)}
            </Text>
            <Text style={[styles.balanceText, { color: themeColors.textMuted }]}>Bal: {formatCurrency(item.balance_after)}</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: themeColors.text }]}>Audit & Ledger Logs</Text>
          <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceAlt }]}>
            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{filteredLogs.length}</Text>
          </View>
        </View>
      </View>

      {/* Type Filter */}
      <View style={styles.tabContainer}>
        <Segmented
          options={TYPE_OPTIONS}
          value={filterType}
          onChange={(v) => setFilterType(v as FilterType)}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          renderItem={renderLogItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs(true)} tintColor={themeColors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={<History size={36} color={themeColors.textMuted} />}
              title="No logs found"
              message="System ledger transactions will be shown here."
            />
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={Boolean(selectedEntry)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Transaction Details</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)} style={{ padding: 4 }}>
                <X size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
            {selectedEntry && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Type</Text>
                  <Text style={[styles.detailValue, { color: selectedEntry.entry_type === 'CREDIT' ? themeColors.success : themeColors.error }]}>
                    {selectedEntry.entry_type}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Amount</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatCurrency(selectedEntry.amount)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Balance Before</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatCurrency(selectedEntry.balance_before)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Balance After</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatCurrency(selectedEntry.balance_after)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Notes</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>{selectedEntry.notes || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>Date & Time</Text>
                  <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatDate(selectedEntry.created_at)}</Text>
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
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  loadingContainer: { padding: 16, gap: 8 },
  listContainer: { padding: 16, gap: 8, paddingBottom: 40 },
  logCard: { marginBottom: 4, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  entityLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  notesText: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  dateText: { fontSize: 10.5 },
  amountText: { fontSize: 14, fontWeight: '800' },
  balanceText: { fontSize: 10.5, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 12, borderWidth: 1, padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalBody: { maxHeight: 300 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  detailLabel: { fontSize: 12, fontWeight: '500' },
  detailValue: { fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});
