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
import {
  ChevronLeft,
  UserCheck,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  ArrowRight,
} from 'lucide-react-native';
import { colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { apiService } from '@/services/api';

interface ProfileEditRequest {
  id: number;
  user_id: string;
  user_type: string;
  user_name: string;
  user_phone: string;
  field_name: string;
  old_value?: string;
  proposed_value: string;
  proof_document_url?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_notes?: string;
  created_at: string;
}

export default function ProfileEditQueueScreen() {
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

  const [requests, setRequests] = useState<ProfileEditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');

  const fetchQueue = useCallback(async () => {
    try {
      const res = await apiService.getProfileEditReviews(statusFilter);
      setRequests(res.reviews || []);
    } catch (e) {
      console.error('Failed to fetch profile edit queue:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleApprove = async (id: number, fieldName: string) => {
    Alert.alert(
      'Approve Profile Change?',
      `Are you sure you want to approve updating '${fieldName}' live on this user's profile?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Update Live Record',
          onPress: async () => {
            setProcessingId(id);
            try {
              await apiService.approveProfileEditReview(id, 'Approved by admin');
              Alert.alert('Success', `Approved and updated ${fieldName} live.`);
              fetchQueue();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to approve change.');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleReject = async (id: number, fieldName: string) => {
    Alert.alert(
      'Reject Profile Change?',
      `Reject proposed update for '${fieldName}'? Live record will remain unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject Request',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(id);
            try {
              await apiService.rejectProfileEditReview(id, 'Rejected by admin');
              Alert.alert('Rejected', `Request for ${fieldName} has been rejected.`);
              fetchQueue();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reject request.');
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? RNStatusBar.currentHeight || 20 : 20) }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Profile changes</Text>
      </View>

      {/* Status Filter Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(st => (
          <TouchableOpacity
            key={st}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: statusFilter === st ? colors.primary : themeColors.card,
              borderWidth: 1,
              borderColor: statusFilter === st ? colors.primary : themeColors.border,
            }}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: statusFilter === st ? '#FFFFFF' : themeColors.textSecondary }}>
              {st}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchQueue(); }} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle2 size={36} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Pending Profile Edits</Text>
            <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
              All sensitive driver & fleet owner profile edits are up-to-date.
            </Text>
          </View>
        ) : (
          requests.map(item => (
            <View key={item.id} style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={16} color={colors.primary} />
                  <Text style={[styles.userName, { color: themeColors.text }]}>{item.user_name || item.user_id}</Text>
                  <Text style={[styles.userBadge, { color: colors.primary }]}>({item.user_type})</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: item.status === 'APPROVED' ? '#10B98115' : item.status === 'REJECTED' ? '#EF444415' : '#F59E0B15' }
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    { color: item.status === 'APPROVED' ? '#10B981' : item.status === 'REJECTED' ? '#EF4444' : '#F59E0B' }
                  ]}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginBottom: 8 }}>Phone: {item.user_phone || 'N/A'}</Text>

              {/* Proposed Field Change comparison */}
              <View style={styles.comparisonBox}>
                <Text style={styles.fieldTitle}>FIELD TO UPDATE: {item.field_name.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Current Live Record</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.old_value || 'None / Empty'}</Text>
                  </View>
                  <ArrowRight size={14} color={themeColors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>Proposed Update</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>{item.proposed_value}</Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons for Pending requests */}
              {item.status === 'PENDING' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.approveBtn, processingId === item.id && { opacity: 0.5 }]}
                    onPress={() => handleApprove(item.id, item.field_name)}
                    disabled={processingId === item.id}
                  >
                    <CheckCircle2 size={14} color="#FFFFFF" />
                    <Text style={styles.approveBtnText}>Approve & Update</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.rejectBtn, processingId === item.id && { opacity: 0.5 }]}
                    onPress={() => handleReject(item.id, item.field_name)}
                    disabled={processingId === item.id}
                  >
                    <XCircle size={14} color="#FFFFFF" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F020',
  },
  backButton: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 16, gap: 12 },
  card: { padding: 14, borderRadius: 6, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 15, fontWeight: '800' },
  userBadge: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  comparisonBox: { backgroundColor: '#0EA5E910', padding: 10, borderRadius: 6, marginTop: 6 },
  fieldTitle: { fontSize: 10, fontWeight: '800', color: colors.primary },
  approveBtn: { flex: 1, backgroundColor: '#10B981', paddingVertical: 9, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  rejectBtn: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 9, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rejectBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});
