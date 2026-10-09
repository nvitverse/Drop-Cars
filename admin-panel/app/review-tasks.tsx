import { openWaUrl } from '@/utils/whatsapp';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Star,
  MessageCircle,
  Phone,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  UserCheck,
  XCircle,
  AlertCircle,
  Send,
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export default function ReviewTasksScreen() {
  const router = useRouter();
  const { themeColors, isDark: isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [completed5StarCount, setCompleted5StarCount] = useState<number | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState('https://g.page/r/dropcars/review');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('PENDING');

  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [submittingAction, setSubmittingAction] = useState<Record<string, boolean>>({});

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const filterParam = statusFilter === 'PENDING' ? 'PENDING' : undefined;
      const res = await apiService.getCustomerReviewQueue(filterParam);
      setQueue(res.queue || []);
      setPendingCount(res.pending_count || 0);
      setCompleted5StarCount(res.completed_5_star_count || 0);
      if (res.google_review_url) {
        setGoogleReviewUrl(res.google_review_url);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchQueue();
  };

  const openWhatsAppReviewRequest = (item: any) => {
    const cleanPhone = String(item.customer_phone || '').replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `வணக்கம் ${item.customer_name || 'சார்'},\n\n` +
      `Drop Cars உடன் உங்கள் ${item.route || 'பயணம்'} இனிமையாக அமைந்ததா?\n\n` +
      `எங்கள் சேவை மற்றும் டிரைவர் ${item.driver_name || ''} அவர்களின் பொறுப்பான ஓட்டுதலைப் பாராட்ட, கூகுளில் 5-ஸ்டார் ரேட்டிங் அளிக்க தாழ்மையுடன் வேண்டுகிறோம்:\n` +
      `👉 ${googleReviewUrl}\n\n` +
      `உங்கள் நல் ஆதரவுக்கு மிக்க நன்றி!\n- Drop Cars Customer Care`
    );
    const waUrl = `https://wa.me/${phoneWithCountry}?text=${msg}`;
    openWaUrl(waUrl).then((ok) => {
      if (!ok) Alert.alert('Error', 'Unable to open WhatsApp on this device');
    });
  };

  const handleAction = async (itemId: string, actionType: string, rating?: number) => {
    try {
      setSubmittingAction((prev) => ({ ...prev, [itemId]: true }));
      const note = actionNotes[itemId] || '';
      await apiService.submitReviewQueueAction(itemId, {
        action: actionType,
        customer_rating_reported: rating,
        customer_feedback_notes: note,
      });
      Alert.alert('Success', `Review task marked as ${actionType}`);
      fetchQueue();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update review task');
    } finally {
      setSubmittingAction((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Mandatory Review Tasks</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            கட்டாய கூகுள் ரிவியூ பணிகள் (Staff Follow-up)
          </Text>
        </View>
      </View>

      {/* Stats KPI Card */}
      <View style={[styles.kpiContainer, { backgroundColor: isDarkMode ? '#1E293B' : '#EFF6FF', borderColor: isDarkMode ? '#334155' : '#BFDBFE' }]}>
        <View style={styles.kpiCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={16} color="#EF4444" />
            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: themeColors.textSecondary }}>Pending Review Follow-ups</Text>
          </View>
          <Text style={{ fontSize: 26, fontFamily: 'Inter-Bold', color: '#EF4444', marginTop: 2 }}>{pendingCount ?? '–'}</Text>
          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>Must be approached by staff</Text>
        </View>

        <View style={styles.kpiCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Star size={16} color="#F59E0B" fill="#F59E0B" />
            <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: themeColors.textSecondary }}>5-Star Reviews Verified</Text>
          </View>
          <Text style={{ fontSize: 26, fontFamily: 'Inter-Bold', color: '#10B981', marginTop: 2 }}>{completed5StarCount ?? '–'}</Text>
          <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 1 }}>Direct on Google Place</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, statusFilter === 'PENDING' && { backgroundColor: colors.primary }]}
          onPress={() => setStatusFilter('PENDING')}
        >
          <Text style={[styles.filterChipText, statusFilter === 'PENDING' && { color: '#FFF' }]}>
            Pending Action{pendingCount != null ? ` (${pendingCount})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, statusFilter === 'ALL' && { backgroundColor: colors.primary }]}
          onPress={() => setStatusFilter('ALL')}
        >
          <Text style={[styles.filterChipText, statusFilter === 'ALL' && { color: '#FFF' }]}>All Trips</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 10, color: themeColors.textSecondary }}>Loading mandatory review queue...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {queue.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40, padding: 20 }}>
              <CheckCircle2 size={52} color="#10B981" />
              <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: themeColors.text, marginTop: 12 }}>
                All Reviews Cleared!
              </Text>
              <Text style={{ fontSize: 13, color: themeColors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                No pending customer follow-ups right now. Every completed trip will automatically appear here.
              </Text>
            </View>
          ) : (
            queue.map((item) => {
              const isPending = item.status === 'PENDING';
              const isSubmitting = submittingAction[item.id];

              return (
                <View
                  key={item.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: isPending ? (isDarkMode ? '#DC2626' : '#FCA5A5') : themeColors.border,
                      borderLeftWidth: 4,
                      borderLeftColor: isPending ? '#EF4444' : '#10B981',
                    },
                  ]}
                >
                  {/* Top Row: Order ID, Route, Status */}
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <Text style={[styles.bookingBadge, { color: colors.primary }]}>Booking #{item.order_id}</Text>
                      <Text style={[styles.customerName, { color: themeColors.text }]}>{item.customer_name}</Text>
                      <Text style={[styles.customerPhone, { color: themeColors.textSecondary }]}>{item.customer_phone}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.statusBadge, { backgroundColor: isPending ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }]}>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter-Bold', color: isPending ? '#EF4444' : '#10B981' }}>
                          {item.status.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>{item.route || 'Outstation'}</Text>
                    </View>
                  </View>

                  {/* Trip Details */}
                  <View style={styles.detailRow}>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Driver: <Text style={{ fontFamily: 'Inter-SemiBold', color: themeColors.text }}>{item.driver_name}</Text></Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Car: <Text style={{ fontFamily: 'Inter-SemiBold', color: themeColors.text }}>{item.vehicle_number}</Text></Text>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>Fare: <Text style={{ fontFamily: 'Inter-Bold', color: '#10B981' }}>₹{item.fare_collected || 0}</Text></Text>
                  </View>

                  {/* Staff Attribution if already approached */}
                  {item.approached_by_staff_username && (
                    <View style={styles.attributionBox}>
                      <UserCheck size={14} color="#6366F1" />
                      <Text style={{ fontSize: 11.5, color: '#6366F1', fontFamily: 'Inter-Medium' }}>
                        Handled by {item.approached_by_staff_username} on {new Date(item.approached_at).toLocaleDateString()}
                      </Text>
                    </View>
                  )}

                  {/* Action Zone: Only mandatory when PENDING */}
                  {isPending && (
                    <View style={styles.actionZone}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-SemiBold', color: themeColors.text, marginBottom: 8 }}>
                        Staff Action Required (Customer-ஐ தொடர்பு கொண்டு ரிவியூ கேட்கவும்):
                      </Text>

                      {/* Contact Buttons */}
                      <View style={styles.contactBtnRow}>
                        <TouchableOpacity
                          style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
                          onPress={() => openWhatsAppReviewRequest(item)}
                        >
                          <MessageCircle size={16} color="#FFF" />
                          <Text style={styles.btnTextWhite}>Send Review Link (WhatsApp)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.callBtn, { backgroundColor: '#3B82F6' }]}
                          onPress={() => Linking.openURL(`tel:${item.customer_phone}`)}
                        >
                          <Phone size={16} color="#FFF" />
                          <Text style={styles.btnTextWhite}>Call</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Optional Notes */}
                      <TextInput
                        style={[styles.noteInput, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
                        placeholder="Customer feedback / note (optional)..."
                        placeholderTextColor={themeColors.textSecondary}
                        value={actionNotes[item.id] || ''}
                        onChangeText={(v) => setActionNotes((prev) => ({ ...prev, [item.id]: v }))}
                      />

                      {/* Status Marking Actions */}
                      <View style={styles.markBtnRow}>
                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: '#10B981' }]}
                          onPress={() => handleAction(item.id, 'REVIEW_RECEIVED_5_STAR', 5)}
                          disabled={isSubmitting}
                        >
                          <Star size={14} color="#FFF" fill="#FFF" />
                          <Text style={styles.actionChipText}>5-Star Received</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: '#6366F1' }]}
                          onPress={() => handleAction(item.id, 'APPROACHED_VIA_WHATSAPP')}
                          disabled={isSubmitting}
                        >
                          <CheckCircle2 size={14} color="#FFF" />
                          <Text style={styles.actionChipText}>Link Sent</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: '#64748B' }]}
                          onPress={() => handleAction(item.id, 'REFUSED')}
                          disabled={isSubmitting}
                        >
                          <XCircle size={14} color="#FFF" />
                          <Text style={styles.actionChipText}>Customer Refused</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-Bold' },
  headerSubtitle: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  kpiContainer: {
    margin: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiCol: { flex: 1 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  filterChipText: { fontSize: 12.5, fontFamily: 'Inter-SemiBold', color: '#475569' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bookingBadge: { fontSize: 12, fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  customerName: { fontSize: 15, fontFamily: 'Inter-Bold', marginTop: 2 },
  customerPhone: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 1 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
    marginVertical: 6,
  },
  attributionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  actionZone: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
  },
  contactBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  callBtn: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnTextWhite: { color: '#FFF', fontSize: 12.5, fontFamily: 'Inter-Bold' },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    marginBottom: 8,
  },
  markBtnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionChipText: { color: '#FFF', fontSize: 11, fontFamily: 'Inter-Bold' },
});
