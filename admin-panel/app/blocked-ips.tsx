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
import { ArrowLeft, ShieldBan, Plus, Trash2 } from 'lucide-react-native';
import { blockedIpsApi, BlockedIp } from '@/services/blockedIpsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import Toast, { useToast } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

// Mirrors admin/pages/blocked-ips.php on the website - spam/fake IPs
// silently ignored on public booking/enquiry forms. Same `blocked_ips`
// MySQL table, reached via the shared-key bridge (blockedIpsApi), same
// pattern as enquiries.tsx/coupons.tsx.
export default function BlockedIpsScreen() {
  const router = useRouter();
  const { isDark, themeColors } = useTheme();
  const { toast, showToast } = useToast();
  const [ips, setIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const [addVisible, setAddVisible] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await blockedIpsApi.list();
      setIps(data.blocked_ips || []);
    } catch (error: any) {
      console.warn('Failed to load blocked IPs:', error);
      showToast(error?.message || 'Failed to load blocked IPs', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleUnblock = (item: BlockedIp) => {
    Alert.alert('Unblock IP', `Allow ${item.ip_address} to use the website again?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setRemovingId(item.id);
          try {
            await blockedIpsApi.unblock(item.id);
            setIps((prev) => prev.filter((i) => i.id !== item.id));
            showToast('IP unblocked', 'success');
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to unblock IP');
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    const ip = newIp.trim();
    if (!ip) {
      Alert.alert('Required', 'Enter an IP address.');
      return;
    }
    setAdding(true);
    try {
      await blockedIpsApi.block(ip, newReason.trim() || undefined);
      setAddVisible(false);
      setNewIp('');
      setNewReason('');
      showToast('IP blocked', 'success');
      load();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to block IP');
    } finally {
      setAdding(false);
    }
  };

  const handleExportGoogleAds = () => {
    if (ips.length === 0) {
      Alert.alert('No IPs', 'No blocked IPs to export.');
      return;
    }
    const ipList = ips.map((i) => i.ip_address).join('\n');
    Alert.alert(
      'Google Ads IP Exclusion List',
      `Exporting ${ips.length} blocked IP addresses. Copy and paste into your Google Ads Campaign Negative IP Exclusions list:\n\n${ips.slice(0, 5).map(i => i.ip_address).join('\n')}${ips.length > 5 ? `\n...and ${ips.length - 5} more` : ''}`,
      [
        { text: 'OK' }
      ]
    );
    showToast(`Exported ${ips.length} IPs for Google Ads`, 'success');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ padding: 4 }}>
          <ArrowLeft size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text }]}>Blocked IPs</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{ips.length} spam/fraud IPs blocked</Text>
        </View>
        <ThemeToggle size={20} />
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
          <Plus size={18} color="white" />
        </TouchableOpacity>
      </View>

      {/* GOOGLE ADS FRAUD PROTECTION BANNER & EXPORT */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.card, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: '#6366F1', gap: 8 }]}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#C7D2FE' : '#312E81' }}>
            🛡️ Google Ads Click-Fraud Protection
          </Text>
          <Text style={{ fontSize: 12, color: isDark ? '#A5B4FC' : '#4338CA', lineHeight: 16 }}>
            Spam bots and repeated scrapers are blocked on the website. Export this list directly into Google Ads Negative IP Exclusions.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#4F46E5', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginTop: 4 }}
            onPress={handleExportGoogleAds}>
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>📋 Copy Google Ads IP Exclusion List ({ips.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={ips}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ShieldBan size={32} color={themeColors.textMuted} />
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>No IPs blocked right now.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ip, { color: themeColors.text }]}>{item.ip_address}</Text>
              <Text style={[styles.reason, { color: themeColors.textSecondary }]}>{item.reason || 'No reason given'}</Text>
              {item.blocked_at && (
                <Text style={[styles.meta, { color: themeColors.textMuted }]}>
                  {new Date(item.blocked_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.unblockBtn}
              onPress={() => handleUnblock(item)}
              disabled={removingId === item.id}
            >
              {removingId === item.id ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Trash2 size={16} color="#EF4444" />
              )}
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Block an IP</Text>
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>IP Address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. 103.21.244.10"
              placeholderTextColor={themeColors.textMuted}
              autoCapitalize="none"
              value={newIp}
              onChangeText={setNewIp}
            />
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="e.g. Repeated fake enquiries"
              placeholderTextColor={themeColors.textMuted}
              value={newReason}
              onChangeText={setNewReason}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]} onPress={() => setAddVisible(false)}>
                <Text style={[styles.modalCancelButtonText, { color: themeColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalBlockButton, adding && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={adding}
              >
                {adding ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalBlockButtonText}>Block</Text>}
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 19, fontWeight: '700', color: '#1F2937' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ip: { fontSize: 15, fontWeight: '700', color: '#1F2937', fontFamily: 'monospace' as any },
  reason: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  meta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 4 },
  unblockBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
  },
  modalButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: { backgroundColor: '#F3F4F6' },
  modalCancelButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  modalBlockButton: { backgroundColor: '#EF4444' },
  modalBlockButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
