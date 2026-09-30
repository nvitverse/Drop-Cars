import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Globe, Check, X, Clock, Zap } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { Card, StatusPill, Btn, EmptyState } from '@/components/ui';

interface PendingBookingRow {
  id: string;
  customer_name: string;
  customer_number: string;
  pickup_drop_location: any;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  quoted_total_amount: number | null;
  source: string;
  created_at: string;
  is_urgent: boolean;
  auto_post_at: string;
}

function locationLabel(loc: any): string {
  if (!loc) return 'N/A';
  if (loc.pickup || loc.drop) {
    const p = loc.pickup?.address || loc.pickup?.city || '?';
    const d = loc.drop?.address || loc.drop?.city || '?';
    return `${p} → ${d}`;
  }
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => loc[k]).join(' → ');
}

function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'posting any moment';
  const mins = Math.round(diffMs / 60000);
  return mins < 60 ? `in ~${mins} min` : `in ~${Math.round(mins / 60)}h`;
}

export default function WebsiteBookingApprovalsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [items, setItems] = useState<PendingBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingBookingRow | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiService.getPendingWebsiteBookings();
      setItems(data);
    } catch (error: any) {
      console.error('Failed to load pending website bookings:', error);
      Alert.alert('Error', error?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleApproveNow = (booking: PendingBookingRow) => {
    Alert.alert(
      'Approve & Broadcast to Drivers?',
      `Post ride (${locationLabel(booking.pickup_drop_location)}) to all active drivers on the marketplace immediately?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Post Now',
          onPress: async () => {
            setActioningId(booking.id);
            try {
              await apiService.approveWebsiteBooking(booking.id);
              setItems((prev) => prev.filter((b) => b.id !== booking.id));
              showToast('Booking approved and posted to drivers immediately.', 'success');
            } catch (e: any) {
              Alert.alert('Approve Failed', e?.message || 'Failed to approve booking');
            } finally {
              setActioningId(null);
            }
          },
        },
      ]
    );
  };

  const handleApproveAll = async () => {
    Alert.alert(
      'Post All Confirmed Bookings?',
      'This will immediately post all pending confirmed website bookings to all apps using auto-tariff pricing:\n\n• Per-KM Trips: ₹1/km reduced tariff, ₹300 fixed Driver Allowance\n• All-Inclusive Trips: 15% platform profit margin applied',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post All Now',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await apiService.approveAllWebsiteBookings();
              showToast(res.message || `Posted ${res.approved_count} bookings!`, 'success');
              load();
            } catch (e: any) {
              Alert.alert('Post All Failed', e?.message || 'Failed to post bookings');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) {
      Alert.alert('Reason Required', 'Enter a reason for rejecting this booking');
      return;
    }
    setActioningId(rejectTarget.id);
    try {
      await apiService.rejectWebsiteBooking(rejectTarget.id, rejectNotes.trim());
      setItems((prev) => prev.filter((b) => b.id !== rejectTarget.id));
      showToast('Booking rejected.', 'success');
      setRejectTarget(null);
      setRejectNotes('');
    } catch (e: any) {
      Alert.alert('Reject Failed', e?.message || 'Failed to reject booking');
    } finally {
      setActioningId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/' as any);
            }
          }}
          accessibilityLabel="Go back"
          style={{ padding: 6, marginRight: 8 }}
        >
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Website Approvals ({items.length})</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Auto-posts to drivers when timer expires</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
        ListHeaderComponent={
          items.length > 0 ? (
            <TouchableOpacity
              style={{
                backgroundColor: themeColors.primary,
                borderRadius: 8,
                paddingVertical: 14,
                paddingHorizontal: 16,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={handleApproveAll}
            >
              <Zap size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                Auto-Post All ({items.length}) Confirmed Bookings
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={Globe}
            title="No Pending Approvals"
            message="No website bookings awaiting approval. New website orders appear here during their auto-post delay."
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.rowCard}>
            <View style={styles.cardTop}>
              <Text style={[styles.customerName, { color: themeColors.text }]}>{item.customer_name}</Text>
              {item.is_urgent ? (
                <StatusPill label="URGENT" variant="danger" />
              ) : (
                <StatusPill label="Website" variant="info" />
              )}
            </View>
            <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
              {item.customer_number} • {item.trip_type} ({item.car_type})
            </Text>
            <Text style={[styles.route, { color: themeColors.text }]}>{locationLabel(item.pickup_drop_location)}</Text>
            <Text style={[styles.meta, { color: themeColors.textMuted }]}>
              Starts {new Date(item.start_date_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item.quoted_total_amount != null && (
              <Text style={[styles.amount, { color: themeColors.success }]}>₹{item.quoted_total_amount.toLocaleString('en-IN')}</Text>
            )}

            <View style={[styles.timerRow, { backgroundColor: isDark ? themeColors.surfaceAlt : themeColors.warningLight }]}>
              <Clock size={12} color={themeColors.warning} />
              <Text style={[styles.timerText, { color: themeColors.warning }]}>Auto-posts {timeUntil(item.auto_post_at)}</Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: isDark ? themeColors.errorLight : '#FEE2E2', borderWidth: StyleSheet.hairlineWidth, borderColor: themeColors.error }]}
                onPress={() => {
                  setRejectTarget(item);
                  setRejectNotes('');
                }}
                disabled={actioningId === item.id}
              >
                <X size={16} color={themeColors.error} />
                <Text style={[styles.denyBtnText, { color: themeColors.error }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: themeColors.success }]}
                onPress={() => handleApproveNow(item)}
                disabled={actioningId === item.id}
              >
                {actioningId === item.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Check size={16} color="white" />
                    <Text style={styles.approveBtnText}>Approve Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Reject Website Booking</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Why is this booking for {rejectTarget?.customer_name} being rejected?
            </Text>
            <TextInput
              style={[styles.modalInputMultiline, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Reason..."
              placeholderTextColor={themeColors.textMuted}
              value={rejectNotes}
              onChangeText={setRejectNotes}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? themeColors.surfaceAlt : '#F3F4F6' }]} onPress={() => setRejectTarget(null)}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: themeColors.error }, actioningId === rejectTarget?.id && { opacity: 0.6 }]}
                onPress={confirmReject}
                disabled={actioningId === rejectTarget?.id}
              >
                {actioningId === rejectTarget?.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalDenyButtonText}>Confirm Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  rowCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  customerName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  route: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  amount: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  timerText: { fontSize: 11.5, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  denyBtnText: { fontWeight: '700', fontSize: 14 },
  approveBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  modalInputMultiline: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtonsRow: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDenyButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
