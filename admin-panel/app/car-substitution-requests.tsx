import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StatusBar as RNStatusBar,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Car, CheckCircle2, XCircle, User, Phone, MapPin } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

interface SubRequestItem {
  id: number;
  order_id: number;
  customer_name: string | null;
  pickup_drop_location: Record<string, string> | null;
  owner_name: string | null;
  owner_phone: string | null;
  car_name: string | null;
  car_number: string | null;
  driver_name: string | null;
  required_car_type: string;
  offered_car_type: string;
  created_at: string | null;
}

const formatType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatRoute = (loc: Record<string, string> | null) => {
  if (!loc) return '';
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  if (keys.length === 0) return '';
  return `${loc[keys[0]]} → ${loc[keys[keys.length - 1]]}`;
};

export default function CarSubstitutionRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  const themeColors = {
    background: isDarkMode ? '#0F172A' : '#F8FAFC',
    card: isDarkMode ? '#1E293B' : '#FFFFFF',
    text: isDarkMode ? '#F8FAFC' : '#0F172A',
    textSecondary: isDarkMode ? '#94A3B8' : '#64748B',
    border: isDarkMode ? '#334155' : '#E2E8F0',
  };

  const [items, setItems] = useState<SubRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await apiService.getCarSubstitutionRequests();
      setItems(res.items || []);
    } catch (e) {
      console.error('Failed to fetch car substitution requests:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const decide = async (item: SubRequestItem, approve: boolean) => {
    const verb = approve ? 'Approve' : 'Reject';
    Alert.alert(
      `${verb} This Request?`,
      approve
        ? `Assign Booking #${item.order_id} to ${item.driver_name || 'this driver'} with their ${formatType(item.offered_car_type)} (${item.car_number || ''}) instead of the requested ${formatType(item.required_car_type)}?`
        : `Decline this substitution request? ${item.owner_name || 'The fleet'} will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setProcessingId(item.id);
            try {
              await apiService.decideCarSubstitutionRequest(item.id, approve);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            } catch (err: any) {
              Alert.alert('Error', err?.message || `Failed to ${verb.toLowerCase()} this request.`);
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? RNStatusBar.currentHeight || 20 : 20) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Request for My Car</Text>
      </View>

      <Text style={{ fontSize: 12, color: themeColors.textSecondary, paddingHorizontal: 16, paddingBottom: 10 }}>
        A fleet without the exact car type a booking needs, offering a different car of theirs instead.
      </Text>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchQueue(); }} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle2 size={36} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Pending Requests</Text>
            <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
              Every substitution request has been reviewed.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const isProcessing = processingId === item.id;
            return (
              <View key={item.id} style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <View style={styles.cardHeaderRow}>
                  <Car size={16} color={colors.primary} />
                  <Text style={[styles.orderTitle, { color: themeColors.text }]}>Booking #{item.order_id}</Text>
                </View>

                {!!item.customer_name && (
                  <View style={styles.row}>
                    <User size={13} color={themeColors.textSecondary} />
                    <Text style={[styles.rowText, { color: themeColors.textSecondary }]}>{item.customer_name}</Text>
                  </View>
                )}
                {!!item.pickup_drop_location && (
                  <View style={styles.row}>
                    <MapPin size={13} color="#EF4444" />
                    <Text style={[styles.rowText, { color: themeColors.text, fontWeight: '600' }]} numberOfLines={1}>
                      {formatRoute(item.pickup_drop_location)}
                    </Text>
                  </View>
                )}

                <View style={[styles.typeCompare, { borderColor: themeColors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeLabel, { color: themeColors.textSecondary }]}>Booking Needs</Text>
                    <Text style={[styles.typeValue, { color: themeColors.text }]}>{formatType(item.required_car_type)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeLabel, { color: themeColors.textSecondary }]}>Offered Instead</Text>
                    <Text style={[styles.typeValue, { color: '#F59E0B' }]}>{formatType(item.offered_car_type)}</Text>
                  </View>
                </View>

                <View style={[styles.fleetBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <Text style={[styles.fleetLine, { color: themeColors.text }]}>{item.owner_name || 'Fleet Driver'}</Text>
                  {!!item.owner_phone && (
                    <View style={styles.row}>
                      <Phone size={12} color={themeColors.textSecondary} />
                      <Text style={[styles.rowTextSmall, { color: themeColors.textSecondary }]}>{item.owner_phone}</Text>
                    </View>
                  )}
                  <Text style={[styles.rowTextSmall, { color: themeColors.textSecondary }]}>
                    Driver: {item.driver_name || '—'} · Car: {item.car_name || '—'} ({item.car_number || '—'})
                  </Text>
                </View>

                {isProcessing ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />
                ) : (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => decide(item, false)}>
                      <XCircle size={15} color={colors.error} />
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => decide(item, true)}>
                      <CheckCircle2 size={15} color="#FFFFFF" />
                      <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Approve & Assign</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F020' },
  backButton: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  orderTitle: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  rowText: { fontSize: 13 },
  rowTextSmall: { fontSize: 12 },
  typeCompare: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8, paddingTop: 8, borderTopWidth: 1 },
  typeLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  typeValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  fleetBox: { borderRadius: 6, borderWidth: 1, padding: 10, gap: 3, marginBottom: 4 },
  fleetLine: { fontSize: 13.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 6 },
  approveBtn: { backgroundColor: '#10B981' },
  rejectBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
