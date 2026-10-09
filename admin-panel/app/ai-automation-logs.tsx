import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Dimensions,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { 
  ArrowLeft, 
  Bot, 
  CheckCircle, 
  XCircle, 
  Cpu, 
  Search, 
  Filter, 
  FileText, 
  Car, 
  MessageSquare, 
  Sparkles, 
  ChevronRight, 
  X, 
  RefreshCw,
  Clock,
  ShieldAlert
} from 'lucide-react-native';
import { apiService } from '@/services/api';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface AIAutomationLogItem {
  id: string;
  category: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  summary: string;
  confidence_score: number | null;
  details_json: any;
  created_at: string;
}

const CATEGORIES = [
  { id: 'ALL', label: 'All Actions', icon: Cpu },
  { id: 'DOCUMENT_VERIFICATION', label: 'Doc OCR & Xerox', icon: FileText },
  { id: 'AUTO_DISPATCH', label: 'Auto assign', icon: Car },
  { id: 'TAMIL_VOICE_BOT', label: 'Tamil Voice AI', icon: MessageSquare },
  { id: 'WHATSAPP_CHAT', label: 'WhatsApp Bot', icon: Sparkles },
];

export default function AIAutomationLogsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [logs, setLogs] = useState<AIAutomationLogItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AIAutomationLogItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (activeCategory !== 'ALL') {
        params.category = activeCategory;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const query = new URLSearchParams(params as any).toString();
      const res = await apiService.makeRequest<any>(`/admin/ai-automation-logs${query ? `?${query}` : ''}`);
      if (res && res.logs) {
        setLogs(res.logs);
        setStats(res.stats || {});
      }
    } catch (err) {
      console.log('Error fetching AI logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [activeCategory]);

  const handleSeedDemoLogs = async () => {
    try {
      setSeeding(true);
      await apiService.makeRequest('/admin/ai-automation-logs/seed-demo', { method: 'POST' });
      await fetchLogs();
    } catch (err) {
      console.log('Error seeding demo logs:', err);
    } finally {
      setSeeding(false);
    }
  };

  const getActionBadge = (actionType: string) => {
    switch (actionType) {
      case 'AUTO_APPROVED':
        return { bg: '#DCFCE7', text: '#15803D', label: 'APPROVED', icon: CheckCircle };
      case 'AUTO_REJECTED':
        return { bg: '#FEE2E2', text: '#B91C1C', label: 'REJECTED', icon: XCircle };
      case 'AUTO_DISPATCHED':
        return { bg: '#DBEAFE', text: '#1D4ED8', label: 'DISPATCHED', icon: Car };
      case 'TARIFF_QUOTED':
        return { bg: '#F3E8FF', text: '#6B21A8', label: 'VOICE QUOTE', icon: MessageSquare };
      default:
        return { bg: '#F3F4F6', text: '#374151', label: actionType, icon: Cpu };
    }
  };

  const formatTimestamp = (isoStr: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      {/* Top Header Bar */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={isDark ? '#FFF' : '#111'} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={styles.headerIconBadge}>
            <Bot size={20} color="#6366F1" />
          </View>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>AI & Automation Logs</Text>
        </View>
        <TouchableOpacity 
          style={styles.seedBtn} 
          onPress={handleSeedDemoLogs}
          disabled={seeding}
        >
          {seeding ? (
            <ActivityIndicator size="small" color="#6366F1" />
          ) : (
            <RefreshCw size={18} color="#6366F1" />
          )}
        </TouchableOpacity>
      </View>

      {/* Search & Categories */}
      <View style={styles.filterSection}>
        <View style={[styles.searchBox, isDark && styles.searchBoxDark]}>
          <Search size={18} color="#9CA3AF" />
          <TextInput
            style={[styles.searchInput, isDark && styles.textDark]}
            placeholder="Search AI logs by name or detail..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchLogs}
          />
        </View>

        {/* Category Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          {CATEGORIES.map((cat) => {
            const IconComp = cat.icon;
            const isActive = activeCategory === cat.id;
            const count = stats[cat.id] || 0;

            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.tabItem,
                  isActive && styles.tabItemActive,
                  isDark && !isActive && styles.tabItemDark,
                ]}
                onPress={() => setActiveCategory(cat.id)}
              >
                <IconComp size={15} color={isActive ? '#FFF' : isDark ? '#9CA3AF' : '#4B5563'} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive, isDark && !isActive && styles.textDark]}>
                  {cat.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Logs List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Fetching AI Audit Records...</Text>
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Bot size={48} color="#9CA3AF" />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No AI Activity Logs Found</Text>
          <Text style={styles.emptySub}>
            Click the refresh icon above to generate demo test logs or trigger an automated verification action.
          </Text>
          <TouchableOpacity style={styles.seedEmptyBtn} onPress={handleSeedDemoLogs}>
            <Sparkles size={16} color="#FFF" />
            <Text style={styles.seedEmptyBtnText}>Seed Demo AI Logs</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.logsList}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs(); }} />
          }
        >
          {logs.map((item) => {
            const badge = getActionBadge(item.action_type);
            const BadgeIcon = badge.icon;

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.logCard, isDark && styles.logCardDark]}
                onPress={() => {
                  setSelectedLog(item);
                  setDetailModalVisible(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.badgePill, { backgroundColor: badge.bg }]}>
                    <BadgeIcon size={12} color={badge.text} />
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>

                  <View style={styles.timeWrap}>
                    <Clock size={13} color="#9CA3AF" />
                    <Text style={styles.timeText}>{formatTimestamp(item.created_at)}</Text>
                  </View>
                </View>

                <Text style={[styles.summaryText, isDark && styles.textDark]} numberOfLines={2}>
                  {item.summary}
                </Text>

                <View style={styles.cardFooter}>
                  <Text style={styles.entityTag}>
                    {item.entity_name ? item.entity_name : item.category}
                  </Text>

                  {item.confidence_score && (
                    <View style={styles.confBadge}>
                      <Sparkles size={12} color="#6366F1" />
                      <Text style={styles.confText}>
                        {Math.round(item.confidence_score * 100)}% Confidence
                      </Text>
                    </View>
                  )}

                  <ChevronRight size={16} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Detailed Modal Inspector */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Bot size={22} color="#6366F1" />
                <Text style={[styles.modalTitle, isDark && styles.textDark]}>AI Action Detail Inspector</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <X size={22} color={isDark ? '#FFF' : '#333'} />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView style={styles.modalContent}>
                {/* Status Summary Banner */}
                <View style={[
                  styles.statusBanner,
                  { backgroundColor: getActionBadge(selectedLog.action_type).bg }
                ]}>
                  <Text style={[
                    styles.statusBannerText,
                    { color: getActionBadge(selectedLog.action_type).text }
                  ]}>
                    {selectedLog.action_type} • {selectedLog.category}
                  </Text>
                  <Text style={styles.statusBannerSub}>
                    {selectedLog.summary}
                  </Text>
                </View>

                {/* Info Fields */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Entity Name / ID:</Text>
                  <Text style={[styles.infoVal, isDark && styles.textDark]}>
                    {selectedLog.entity_name} ({selectedLog.entity_id || 'N/A'})
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Timestamp:</Text>
                  <Text style={[styles.infoVal, isDark && styles.textDark]}>
                    {formatTimestamp(selectedLog.created_at)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>AI Confidence:</Text>
                  <Text style={[styles.infoVal, { color: '#6366F1', fontWeight: 'bold' }]}>
                    {selectedLog.confidence_score ? `${Math.round(selectedLog.confidence_score * 100)}%` : 'N/A'}
                  </Text>
                </View>

                {/* Details Payload JSON Box */}
                <Text style={[styles.jsonHeader, isDark && styles.textDark]}>Raw Inspection Details:</Text>
                <View style={styles.jsonBox}>
                  <Text style={styles.jsonCode}>
                    {JSON.stringify(selectedLog.details_json, null, 2)}
                  </Text>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setDetailModalVisible(false)}
            >
              <Text style={styles.closeBtnText}>Done / Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  containerDark: { backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerDark: { backgroundColor: '#1F2937', borderBottomColor: '#374151' },
  backBtn: { padding: 4 },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  textDark: { color: '#F9FAFB' },
  seedBtn: { padding: 8, borderRadius: 6, backgroundColor: '#EEF2FF' },
  filterSection: { paddingVertical: 12, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchBoxDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  searchInput: { flex: 1, fontSize: 14, color: '#111' },
  tabsScroll: { paddingLeft: 16, flexDirection: 'row' },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    gap: 6,
  },
  tabItemDark: { backgroundColor: '#374151' },
  tabItemActive: { backgroundColor: '#6366F1' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  tabTextActive: { color: '#FFF' },
  tabBadge: { backgroundColor: '#D1D5DB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  tabBadgeTextActive: { color: '#FFF' },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#6B7280', fontSize: 14 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  seedEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  seedEmptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  logsList: { paddingHorizontal: 16, paddingTop: 6 },
  logCard: {
    backgroundColor: '#FFF',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  logCardDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, color: '#9CA3AF' },
  summaryText: { fontSize: 14, fontWeight: '600', color: '#1F2937', lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  entityTag: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  confBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  confText: { fontSize: 11, fontWeight: '700', color: '#6366F1' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalContainerDark: { backgroundColor: '#1F2937' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalContent: { gap: 14 },
  statusBanner: { padding: 14, borderRadius: 6, marginBottom: 12 },
  statusBannerText: { fontSize: 13, fontWeight: '800' },
  statusBannerSub: { fontSize: 14, color: '#111827', marginTop: 4, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoVal: { fontSize: 13, fontWeight: '600', color: '#111827' },
  jsonHeader: { fontSize: 14, fontWeight: '700', marginTop: 10, color: '#111' },
  jsonBox: { backgroundColor: '#1E293B', padding: 12, borderRadius: 6, marginTop: 6, marginBottom: 16 },
  jsonCode: { fontFamily: 'monospace', fontSize: 12, color: '#38BDF8' },
  closeBtn: { backgroundColor: '#6366F1', paddingVertical: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
