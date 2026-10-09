import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Navigation,
  Fuel,
  Compass,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  Radio,
  Send,
  AlertTriangle,
  RotateCcw,
  Check,
  ChevronRight,
  Shield,
  Truck,
  DollarSign,
  TrendingDown,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';

type TourTab = 'tours' | 'matches' | 'autopilot' | 'broadcast';

export default function DriverToursScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TourTab>('tours');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [activeTours, setActiveTours] = useState<any[]>([]);
  const [toursSummary, setToursSummary] = useState<any>({ total_active_tours: 0, total_cash_in_hand: 0, total_diesel_spent: 0 });
  const [returnMatches, setReturnMatches] = useState<any[]>([]);
  const [autopilotConfig, setAutopilotConfig] = useState<any>({});

  // Settle Modal
  const [settleTourTarget, setSettleTourTarget] = useState<any>(null);
  const [closingOdo, setClosingOdo] = useState('');
  const [cashReturned, setCashReturned] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settling, setSettling] = useState(false);

  // Autopilot settings
  const [leadAutoDist, setLeadAutoDist] = useState(false);
  const [distMode, setDistMode] = useState('single_staff');
  const [fastagProvider, setFastagProvider] = useState('MANUAL');
  const [fastagThreshold, setFastagThreshold] = useState('300');
  const [savingAutopilot, setSavingAutopilot] = useState(false);

  // Broadcast Modal
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState('ALL');
  const [broadcastDiscount, setBroadcastDiscount] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      if (activeTab === 'tours') {
        const res = await apiService.getActiveToursSummary();
        if (res) {
          setActiveTours(res.tours || []);
          setToursSummary(res.summary || {});
        }
      } else if (activeTab === 'matches') {
        const matchesRes = await apiService.getOwnFleetReturnMatches();
        setReturnMatches(matchesRes?.matches || matchesRes || []);
      } else if (activeTab === 'autopilot') {
        const autoRes = await apiService.getAutopilotConfig();
        if (autoRes) {
          setAutopilotConfig(autoRes);
          setLeadAutoDist(!!autoRes.lead_auto_distribution_enabled);
          setDistMode(autoRes.lead_distribution_mode || 'single_staff');
          setFastagProvider(autoRes.fastag_bridge_provider || 'MANUAL');
          setFastagThreshold(String(autoRes.fastag_low_balance_threshold ?? 300));
        }
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to load tour data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleSettleTour = async () => {
    const odo = parseInt(closingOdo, 10);
    const cash = parseFloat(cashReturned);
    if (isNaN(odo) || odo <= 0 || isNaN(cash) || cash < 0) {
      Alert.alert('Validation Error', 'Enter valid closing odometer and returned physical cash');
      return;
    }
    setSettling(true);
    try {
      await apiService.settleTour(settleTourTarget.id, {
        closing_odometer: odo,
        physical_cash_returned: cash,
        settlement_notes: settleNotes.trim() || undefined,
      });
      showToast('Tour settled successfully', 'success');
      setSettleTourTarget(null);
      setClosingOdo('');
      setCashReturned('');
      setSettleNotes('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to settle tour');
    } finally {
      setSettling(false);
    }
  };

  const handleSaveAutopilot = async () => {
    setSavingAutopilot(true);
    try {
      await apiService.updateAutopilotConfig({
        lead_auto_distribution_enabled: leadAutoDist,
        lead_distribution_mode: distMode,
        fastag_bridge_provider: fastagProvider,
        fastag_low_balance_threshold: parseFloat(fastagThreshold) || 300,
      });
      showToast('Autopilot configuration saved', 'success');
      loadData(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save autopilot config');
    } finally {
      setSavingAutopilot(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      Alert.alert('Required', 'Please enter a title and message');
      return;
    }
    setSendingBroadcast(true);
    try {
      await apiService.sendBroadcastMessage({
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        target_filter: broadcastFilter,
        discount_code: broadcastDiscount.trim() || undefined,
      });
      showToast('Broadcast message sent', 'success');
      setShowBroadcastModal(false);
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastDiscount('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const itemBorder = isDark ? '#334155' : '#E2E8F0';
  const subText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <Toast {...toast} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Tours & Operations Hub</Text>
          <Text style={[styles.headerSub, { color: subText }]}>Active tours, ledger, return fleet & autopilot engine</Text>
        </View>
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: '#6366F1' }]}
          onPress={() => setShowBroadcastModal(true)}
        >
          <Radio size={14} color="#FFFFFF" />
          <Text style={styles.primaryActionBtnText}>Broadcast</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        {[
          { id: 'tours', label: 'Active Tours', icon: Compass },
          { id: 'matches', label: 'Return Matches', icon: Truck },
          { id: 'autopilot', label: 'Autopilot', icon: Zap },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, active && { borderBottomColor: '#6366F1', borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.id as TourTab)}
            >
              <Icon size={16} color={active ? '#6366F1' : subText} />
              <Text style={[styles.tabText, { color: active ? '#6366F1' : subText, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#6366F1" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        >
          {/* ---------------- ACTIVE TOURS TAB ---------------- */}
          {activeTab === 'tours' && (
            <View>
              {/* Summary Box */}
              <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 10 }]}>FLEET TOURS SUMMARY</Text>
                <View style={styles.metricsGrid}>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#6366F1' }]}>{toursSummary.total_active_tours || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Active Tours</Text>
                  </View>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#10B981' }]}>₹{toursSummary.total_cash_in_hand || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Cash in Hand</Text>
                  </View>
                  <View style={[styles.metricBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                    <Text style={[styles.metricVal, { color: '#EF4444' }]}>₹{toursSummary.total_diesel_spent || 0}</Text>
                    <Text style={[styles.metricLbl, { color: subText }]}>Fuel Spent</Text>
                  </View>
                </View>
              </View>

              {/* Active Tours List */}
              <Text style={[styles.sectionTitle, { color: subText }]}>ACTIVE RUNNING TOURS</Text>
              {activeTours.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Compass size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No active driver tours in progress.</Text>
                </View>
              ) : (
                activeTours.map((t) => (
                  <View key={t.id} style={[styles.tourCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.tourCode, { color: themeColors.text }]}>{t.tour_code || 'TOUR'}</Text>
                      <View style={[styles.pill, { backgroundColor: '#DCFCE7' }]}>
                        <Text style={[styles.pillText, { color: '#16A34A' }]}>ACTIVE</Text>
                      </View>
                    </View>
                    <Text style={[styles.tourDriver, { color: subText }]}>
                      {t.driver_name || 'Driver'} · 🚗 {t.vehicle_number || 'Fleet'} · Started {t.start_date}
                    </Text>
                    <View style={[styles.tourStats, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                      <Text style={[styles.statText, { color: '#10B981', fontWeight: '800' }]}>Cash: ₹{t.net_cash_in_hand ?? 0}</Text>
                      <Text style={[styles.statText, { color: '#EF4444' }]}>Fuel: ₹{t.total_diesel_spent ?? 0}</Text>
                      <Text style={[styles.statText, { color: '#6366F1' }]}>Toll: ₹{t.total_toll_spent ?? 0}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.settleBtn, { backgroundColor: '#6366F1' }]}
                      onPress={() => { setSettleTourTarget(t); setClosingOdo(''); setCashReturned(''); setSettleNotes(''); }}
                    >
                      <CheckCircle size={14} color="#FFF" />
                      <Text style={styles.settleBtnText}>Settle & Close Tour</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---------------- RETURN MATCHES TAB ---------------- */}
          {activeTab === 'matches' && (
            <View>
              {returnMatches.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Truck size={32} color="#94A3B8" />
                  <Text style={[styles.emptyText, { color: subText }]}>No own-fleet return trip opportunities currently matched.</Text>
                </View>
              ) : (
                returnMatches.map((m, idx) => (
                  <View key={m.id || idx} style={[styles.tourCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                    <Text style={[styles.tourCode, { color: themeColors.text }]}>{m.route_str || 'Return Match'}</Text>
                    <Text style={[styles.tourDriver, { color: subText }]}>Vehicle: {m.vehicle_number} · Available: {m.available_time}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---------------- AUTOPILOT ENGINE TAB ---------------- */}
          {activeTab === 'autopilot' && (
            <View>
              <Text style={[styles.sectionTitle, { color: subText }]}>AUTOPILOT & DISPATCH RULES</Text>
              <View style={[styles.tourCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
                <View style={styles.configRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.configLbl, { color: themeColors.text }]}>Lead Auto-Distribution</Text>
                    <Text style={[styles.configSub, { color: subText }]}>Automatically assign incoming web enquiries to staff</Text>
                  </View>
                  <Switch value={leadAutoDist} onValueChange={setLeadAutoDist} trackColor={{ false: '#CBD5E1', true: '#6366F1' }} />
                </View>

                <View style={[styles.configRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.configLbl, { color: themeColors.text }]}>Fastag Bridge Provider</Text>
                    <Text style={[styles.configSub, { color: subText }]}>Auto toll reconciliation with live Fastag gateway</Text>
                  </View>
                  <View style={[styles.chipGroup, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder }]}>
                    <Text style={[styles.statText, { color: '#6366F1', fontWeight: '800' }]}>{fastagProvider}</Text>
                  </View>
                </View>

                <View style={[styles.configRow, { borderTopWidth: 1, borderTopColor: itemBorder, paddingTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.configLbl, { color: themeColors.text }]}>Low Balance Threshold (₹)</Text>
                    <Text style={[styles.configSub, { color: subText }]}>Warn when Fastag balance dips below</Text>
                  </View>
                  <TextInput
                    style={[styles.smallInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
                    value={fastagThreshold}
                    onChangeText={setFastagThreshold}
                    keyboardType="numeric"
                  />
                </View>

                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#6366F1' }]} onPress={handleSaveAutopilot} disabled={savingAutopilot}>
                  {savingAutopilot ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Autopilot Rules</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ---------------- SETTLE TOUR MODAL ---------------- */}
      <Modal visible={!!settleTourTarget} transparent animationType="fade" onRequestClose={() => setSettleTourTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginBottom: 8 }]}>Settle & Close Tour</Text>
            <Text style={[styles.infoNote, { color: subText }]}>
              {settleTourTarget?.tour_code} · {settleTourTarget?.driver_name} (Cash owed: ₹{settleTourTarget?.net_cash_in_hand ?? 0})
            </Text>

            <Text style={[styles.inputLbl, { color: subText, marginTop: 10 }]}>Final Closing Odometer Reading</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={closingOdo}
              onChangeText={setClosingOdo}
              keyboardType="numeric"
              placeholder="e.g. 54200"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Physical Cash Returned (₹)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={cashReturned}
              onChangeText={setCashReturned}
              keyboardType="numeric"
              placeholder="e.g. 3500"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Settlement Notes</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={settleNotes}
              onChangeText={setSettleNotes}
              placeholder="Fuel bills verified, keys returned..."
              placeholderTextColor={subText}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: itemBorder }]} onPress={() => setSettleTourTarget(null)}>
                <Text style={{ color: subText, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtnSmall, { backgroundColor: '#6366F1' }]} onPress={handleSettleTour} disabled={settling}>
                {settling ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Complete Settlement</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------------- BROADCAST MODAL ---------------- */}
      <Modal visible={showBroadcastModal} transparent animationType="fade" onRequestClose={() => setShowBroadcastModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: itemBorder }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginBottom: 8 }]}>Send Fleet Broadcast</Text>
            <Text style={[styles.inputLbl, { color: subText }]}>Broadcast Title</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text }]}
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="e.g. Diwali Return Bookings Incentive"
              placeholderTextColor={subText}
            />

            <Text style={[styles.inputLbl, { color: subText }]}>Message Content</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: itemBorder, color: themeColors.text, minHeight: 70, textAlignVertical: 'top' }]}
              value={broadcastMessage}
              onChangeText={setBroadcastMessage}
              multiline
              numberOfLines={3}
              placeholder="Announcement text..."
              placeholderTextColor={subText}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: itemBorder }]} onPress={() => setShowBroadcastModal(false)}>
                <Text style={{ color: subText, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtnSmall, { backgroundColor: '#6366F1' }]} onPress={handleSendBroadcast} disabled={sendingBroadcast}>
                {sendingBroadcast ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Send Broadcast</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  primaryActionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabText: { fontSize: 11 },
  scroll: { flex: 1 },
  summaryCard: { borderRadius: 8, borderWidth: 1, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  metricsGrid: { flexDirection: 'row', gap: 6 },
  metricBox: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
  metricVal: { fontSize: 16, fontWeight: '800' },
  metricLbl: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  tourCard: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  tourCode: { fontSize: 14, fontWeight: '800' },
  tourDriver: { fontSize: 11.5, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  pillText: { fontSize: 10, fontWeight: '800' },
  tourStats: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderRadius: 6, borderWidth: 1, marginTop: 10 },
  statText: { fontSize: 11.5, fontWeight: '600' },
  settleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 6, marginTop: 10 },
  settleBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13 },
  configRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  configLbl: { fontSize: 13, fontWeight: '700' },
  configSub: { fontSize: 11, marginTop: 2 },
  chipGroup: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  smallInput: { width: 80, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, fontSize: 14, textAlign: 'center', fontWeight: '700' },
  submitBtn: { paddingVertical: 13, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 10, borderWidth: 1, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  infoNote: { fontSize: 11.5, fontStyle: 'italic', marginBottom: 6 },
  inputLbl: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4, marginTop: 10 },
  modalInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6, borderWidth: 1 },
  submitBtnSmall: { flex: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 6 },
});
