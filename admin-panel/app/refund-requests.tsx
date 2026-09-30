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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Receipt, Check, X, Zap } from 'lucide-react-native';
import { apiService } from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

interface RefundRequestRow {
  id: string;
  customer_name: string;
  customer_number: string;
  customer_email: string | null;
  linked_order_id: number | null;
  quoted_total_amount: number | null;
  refund_requested_at: string;
  has_razorpay_payment: boolean;
}

export default function RefundRequestsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [requests, setRequests] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [approveTarget, setApproveTarget] = useState<RefundRequestRow | null>(null);
  const [approveAmount, setApproveAmount] = useState('');
  const [viaRazorpay, setViaRazorpay] = useState(true);

  const [rejectTarget, setRejectTarget] = useState<RefundRequestRow | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiService.getRefundRequests();
      setRequests(data);
    } catch (error: any) {
      console.error('Failed to load refund requests:', error);
      Alert.alert('Error', error?.message || 'Failed to load refund requests');
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

  const handleOpenApprove = (req: RefundRequestRow) => {
    setApproveTarget(req);
    setApproveAmount(req.quoted_total_amount ? String(req.quoted_total_amount) : '');
    setViaRazorpay(req.has_razorpay_payment);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const amount = parseFloat(approveAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid refund amount');
      return;
    }
    setActioningId(approveTarget.id);
    try {
      await apiService.processRefundRequest(approveTarget.id, true, amount, undefined, viaRazorpay);
      showToast('Refund approved successfully', 'success');
      setApproveTarget(null);
      load();
    } catch (e: any) {
      Alert.alert('Approve Failed', e?.message || 'Could not approve refund');
    } finally {
      setActioningId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) {
      Alert.alert('Reason Required', 'Enter a brief reason for denying the refund');
      return;
    }
    setActioningId(rejectTarget.id);
    try {
      await apiService.processRefundRequest(rejectTarget.id, false, undefined, rejectNotes.trim());
      showToast('Refund request denied', 'success');
      setRejectTarget(null);
      setRejectNotes('');
      load();
    } catch (e: any) {
      Alert.alert('Deny Failed', e?.message || 'Could not deny refund');
    } finally {
      setActioningId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Refund Requests ({requests.length})</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Customer refund claims from website</Text>
        </View>
        <ThemeToggle size={20} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.text} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Receipt size={48} color={themeColors.textMuted} />
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>No pending refund requests</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.customerName, { color: themeColors.text }]}>{item.customer_name}</Text>
              {item.has_razorpay_payment && (
                <View style={[styles.rzpBadge, { backgroundColor: isDark ? '#4C1D95' : '#F5F3FF' }]}>
                  <Zap size={11} color="#7C3AED" />
                  <Text style={[styles.rzpBadgeText, { color: isDark ? '#DDD6FE' : '#7C3AED' }]}>Razorpay Paid</Text>
                </View>
              )}
            </View>
            <Text style={[styles.meta, { color: themeColors.textSecondary }]}>
              {item.customer_number} {item.customer_email ? `• ${item.customer_email}` : ''}
            </Text>
            <Text style={[styles.meta, { color: themeColors.textMuted }]}>
              Booking #{item.linked_order_id ?? 'N/A'} • Requested {new Date(item.refund_requested_at).toLocaleDateString()}
            </Text>
            {item.quoted_total_amount != null && (
              <Text style={styles.amount}>₹{item.quoted_total_amount.toLocaleString()}</Text>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.denyBtn, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}
                onPress={() => {
                  setRejectTarget(item);
                  setRejectNotes('');
                }}
              >
                <X size={16} color="#EF4444" />
                <Text style={styles.denyBtnText}>Deny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleOpenApprove(item)}
              >
                {actioningId === item.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Check size={16} color="white" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Approve modal */}
      <Modal visible={!!approveTarget} transparent animationType="fade" onRequestClose={() => setApproveTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Approve Refund</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              {approveTarget?.customer_name} - Booking #{approveTarget?.linked_order_id ?? 'N/A'}
            </Text>
            <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Refund Amount (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Amount"
              placeholderTextColor={themeColors.textMuted}
              keyboardType="numeric"
              value={approveAmount}
              onChangeText={setApproveAmount}
            />
            {approveTarget?.has_razorpay_payment && (
              <View style={[styles.switchRow, { borderTopColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Refund via Razorpay</Text>
                  <Text style={[styles.switchHint, { color: themeColors.textMuted }]}>
                    {viaRazorpay ? 'Money moves automatically to the customer.' : 'Record as already refunded manually (no Razorpay call).'}
                  </Text>
                </View>
                <Switch value={viaRazorpay} onValueChange={setViaRazorpay} trackColor={{ true: colors.primary }} />
              </View>
            )}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#F3F4F6' }]} onPress={() => setApproveTarget(null)}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalApproveButton, actioningId === approveTarget?.id && { opacity: 0.6 }]}
                onPress={confirmApprove}
                disabled={actioningId === approveTarget?.id}
              >
                {actioningId === approveTarget?.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalApproveButtonText}>Confirm Approve</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject modal */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Deny Refund</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Why is this refund for {rejectTarget?.customer_name} being denied? This will be emailed to the customer.
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
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#F3F4F6' }]} onPress={() => setRejectTarget(null)}>
                <Text style={{ color: themeColors.textSecondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDenyButton, actioningId === rejectTarget?.id && { opacity: 0.6 }]}
                onPress={confirmReject}
                disabled={actioningId === rejectTarget?.id}
              >
                {actioningId === rejectTarget?.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalDenyButtonText}>Confirm Deny</Text>
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
    borderBottomWidth: 1,
  },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13 },
  card: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  customerName: { fontSize: 16, fontWeight: '700' },
  rzpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rzpBadgeText: { fontSize: 10.5, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '800', color: '#059669', marginTop: 8, marginBottom: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 6,
  },
  denyBtn: {},
  denyBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  approveBtn: { backgroundColor: '#10B981' },
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
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  modalInputMultiline: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  switchHint: { fontSize: 11.5, marginTop: 2 },
  modalButtonsRow: { flexDirection: 'row', gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalApproveButton: { backgroundColor: '#10B981' },
  modalApproveButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  modalDenyButton: { backgroundColor: '#EF4444' },
  modalDenyButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
