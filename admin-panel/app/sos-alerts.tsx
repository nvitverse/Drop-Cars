import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Phone,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
  Car,
  User,
  ExternalLink,
  ChevronLeft,
  Radio,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

interface SosAlertItem {
  id: number;
  order_id?: string;
  triggered_by_role: string;
  customer_phone?: string;
  driver_phone?: string;
  driver_name?: string;
  car_number?: string;
  emergency_contact?: string;
  latitude?: string;
  longitude?: string;
  tracking_link?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_ALARM';
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at?: string;
}

export default function SosAlertsScreen() {
  const router = useRouter();
  const { themeColors, isDark } = useTheme();

  const [alerts, setAlerts] = useState<SosAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');

  // Modal for resolving
  const [selectedAlert, setSelectedAlert] = useState<SosAlertItem | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [resolveNotes, setResolveNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const filterParam = filter === 'ALL' ? undefined : filter === 'ACTIVE' ? 'ACTIVE' : 'RESOLVED';
      const res = await apiService.getSosAlerts(filterParam);
      if (Array.isArray(res)) {
        setAlerts(res);
      }
    } catch (e: any) {
      console.warn('Failed to fetch SOS alerts:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleAcknowledge = async (alertId: number) => {
    try {
      await apiService.acknowledgeSosAlert(alertId);
      Alert.alert('Acknowledged', 'SOS Emergency has been acknowledged. Emergency protocol active.');
      fetchAlerts();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to acknowledge SOS');
    }
  };

  const handleResolveSubmit = async () => {
    if (!selectedAlert) return;
    setSubmitting(true);
    try {
      await apiService.resolveSosAlert(
        selectedAlert.id,
        resolveStatus,
        resolveNotes || (resolveStatus === 'RESOLVED' ? 'Assistance provided and verified safe.' : 'Reported as false alarm.')
      );
      Alert.alert('Updated', `SOS marked as ${resolveStatus}`);
      setSelectedAlert(null);
      setResolveNotes('');
      fetchAlerts();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to resolve SOS');
    } finally {
      setSubmitting(false);
    }
  };

  const openCall = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  const openMap = (lat?: string, lng?: string, trackUrl?: string) => {
    if (lat && lng) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    } else if (trackUrl) {
      Linking.openURL(trackUrl);
    }
  };

  const activeCount = alerts.filter(a => a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED').length;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>SOS Emergency Hub</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Live 24/7 Security & Passenger Distress Center
          </Text>
        </View>
        <TouchableOpacity style={styles.policeBtn} onPress={() => Linking.openURL('tel:112')}>
          <ShieldAlert size={16} color="#FFF" />
          <Text style={styles.policeBtnText}>112</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency Banner if active */}
      {activeCount > 0 && (
        <View style={styles.activeBanner}>
          <Radio size={20} color="#FFF" />
          <Text style={styles.activeBannerText}>
            {activeCount} ACTIVE EMERGENCY ALERT{activeCount > 1 ? 'S' : ''} IN PROGRESS!
          </Text>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filterRow}>
        {(['ACTIVE', 'RESOLVED', 'ALL'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.filterTab,
              { backgroundColor: filter === tab ? colors.error : themeColors.surface },
            ]}
            onPress={() => {
              setFilter(tab);
              setLoading(true);
            }}
          >
            <Text style={[styles.filterTabText, { color: filter === tab ? '#FFF' : themeColors.text }]}>
              {tab === 'ACTIVE' ? 'Active SOS' : tab === 'RESOLVED' ? 'Resolved' : 'All History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={colors.error} />
          <Text style={{ marginTop: 12, color: themeColors.textSecondary }}>Checking SOS Alerts...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAlerts(); }} />}
        >
          {alerts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: themeColors.surface }]}>
              <CheckCircle2 size={48} color={colors.success} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Emergency Alerts</Text>
              <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                All passengers and drivers are currently operating safely.
              </Text>
            </View>
          ) : (
            alerts.map(item => {
              const isActive = item.status === 'ACTIVE';
              const isAck = item.status === 'ACKNOWLEDGED';
              return (
                <View
                  key={item.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: isActive ? colors.error : isAck ? colors.warning : themeColors.border,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.tagWrap}>
                      <View style={[styles.roleTag, { backgroundColor: isActive ? '#EF444420' : '#10B98120' }]}>
                        <Text style={[styles.roleTagText, { color: isActive ? colors.error : colors.success }]}>
                          {item.triggered_by_role} SOS
                        </Text>
                      </View>
                      {item.order_id && (
                        <Text style={[styles.orderText, { color: themeColors.textSecondary }]}>
                          Trip #{item.order_id}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: isActive ? colors.error : isAck ? colors.warning : '#64748B' }]}>
                      <Text style={styles.statusBadgeText}>{item.status}</Text>
                    </View>
                  </View>

                  {/* Details Grid */}
                  <View style={styles.detailsGrid}>
                    {item.customer_phone && (
                      <View style={styles.detailItem}>
                        <User size={14} color={themeColors.textSecondary} />
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Passenger:</Text>
                        <Text style={[styles.detailValue, { color: themeColors.text }]}>{item.customer_phone}</Text>
                      </View>
                    )}
                    {item.driver_name && (
                      <View style={styles.detailItem}>
                        <Car size={14} color={themeColors.textSecondary} />
                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Driver / Car:</Text>
                        <Text style={[styles.detailValue, { color: themeColors.text }]}>
                          {item.driver_name} {item.car_number ? `(${item.car_number})` : ''}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailItem}>
                      <Clock size={14} color={themeColors.textSecondary} />
                      <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Time:</Text>
                      <Text style={[styles.detailValue, { color: themeColors.text }]}>
                        {new Date(item.created_at).toLocaleString('en-IN')}
                      </Text>
                    </View>
                    {(item.latitude && item.longitude) && (
                      <View style={styles.detailItem}>
                        <MapPin size={14} color={colors.error} />
                        <Text style={[styles.detailLabel, { color: colors.error }]}>GPS Location:</Text>
                        <Text style={[styles.detailValue, { color: colors.error }]}>
                          {item.latitude}, {item.longitude}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    {item.customer_phone && (
                      <TouchableOpacity
                        style={[styles.callBtn, { backgroundColor: '#10B981' }]}
                        onPress={() => openCall(item.customer_phone)}
                      >
                        <Phone size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Call Customer</Text>
                      </TouchableOpacity>
                    )}
                    {item.driver_phone && (
                      <TouchableOpacity
                        style={[styles.callBtn, { backgroundColor: '#3B82F6' }]}
                        onPress={() => openCall(item.driver_phone)}
                      >
                        <Phone size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Call Driver</Text>
                      </TouchableOpacity>
                    )}
                    {(item.latitude || item.tracking_link) && (
                      <TouchableOpacity
                        style={[styles.callBtn, { backgroundColor: '#8B5CF6' }]}
                        onPress={() => openMap(item.latitude, item.longitude, item.tracking_link)}
                      >
                        <MapPin size={14} color="#FFF" />
                        <Text style={styles.actionBtnText}>Live Map</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Lifecycle Buttons */}
                  <View style={[styles.lifecycleRow, { borderTopColor: themeColors.border }]}>
                    {isActive && (
                      <TouchableOpacity
                        style={[styles.ackBtn, { backgroundColor: colors.warning }]}
                        onPress={() => handleAcknowledge(item.id)}
                      >
                        <CheckCircle2 size={16} color="#FFF" />
                        <Text style={styles.lifecycleBtnText}>Acknowledge</Text>
                      </TouchableOpacity>
                    )}
                    {(isActive || isAck) && (
                      <TouchableOpacity
                        style={[styles.resolveBtn, { backgroundColor: colors.success }]}
                        onPress={() => {
                          setSelectedAlert(item);
                          setResolveStatus('RESOLVED');
                        }}
                      >
                        <ShieldAlert size={16} color="#FFF" />
                        <Text style={styles.lifecycleBtnText}>Resolve / Close</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Resolve Modal */}
      <Modal visible={!!selectedAlert} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Resolve SOS Emergency</Text>
            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Please verify safety status before closing this emergency record.
            </Text>

            <View style={styles.modalStatusRow}>
              <TouchableOpacity
                style={[
                  styles.statusChoiceBtn,
                  { backgroundColor: resolveStatus === 'RESOLVED' ? colors.success : themeColors.border },
                ]}
                onPress={() => setResolveStatus('RESOLVED')}
              >
                <Text style={{ color: resolveStatus === 'RESOLVED' ? '#FFF' : themeColors.text, fontWeight: '700' }}>
                  Safe / Resolved
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusChoiceBtn,
                  { backgroundColor: resolveStatus === 'FALSE_ALARM' ? colors.error : themeColors.border },
                ]}
                onPress={() => setResolveStatus('FALSE_ALARM')}
              >
                <Text style={{ color: resolveStatus === 'FALSE_ALARM' ? '#FFF' : themeColors.text, fontWeight: '700' }}>
                  False Alarm
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.notesInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              placeholder="Operator notes (e.g., Contacted customer, confirmed vehicle arrived safely)..."
              placeholderTextColor={themeColors.textSecondary}
              multiline
              numberOfLines={3}
              value={resolveNotes}
              onChangeText={setResolveNotes}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                onPress={() => setSelectedAlert(null)}
              >
                <Text style={{ color: themeColors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.success }]}
                onPress={handleResolveSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Save & Close</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  policeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  policeBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  activeBannerText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  filterTabText: { fontSize: 13, fontWeight: '700' },
  loaderCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  card: {
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tagWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleTagText: { fontSize: 12, fontWeight: '800' },
  orderText: { fontSize: 13, fontWeight: '600' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  detailsGrid: { gap: 6, marginBottom: 14 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailLabel: { fontSize: 13, fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  lifecycleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lifecycleBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, marginTop: 4, marginBottom: 16 },
  modalStatusRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statusChoiceBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  modalSubmitBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
});
