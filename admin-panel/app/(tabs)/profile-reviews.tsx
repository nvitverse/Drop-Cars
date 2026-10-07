import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  User,
  CreditCard,
  FileText,
  Clock,
  ChevronRight,
} from 'lucide-react-native';

interface ProfileEditRequest {
  id: string;
  driverName: string;
  driverPhone: string;
  role: 'DUTY_DRIVER' | 'FLEET_OWNER';
  fieldModified: 'BANK_DETAILS' | 'LICENCE_NUMBER' | 'UPI_ID';
  oldValue: string;
  newValue: string;
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const MOCK_REVIEW_ITEMS: ProfileEditRequest[] = [
  {
    id: 'rev-101',
    driverName: 'Senthil Kumar',
    driverPhone: '+91 98765 43210',
    role: 'DUTY_DRIVER',
    fieldModified: 'BANK_DETAILS',
    oldValue: 'HDFC Bank - A/C **** 4812 (HDFC0001234)',
    newValue: 'SBI Bank - A/C 30981245901 (SBIN0004512)',
    submittedAt: '2026-09-01 18:30',
    status: 'PENDING',
  },
  {
    id: 'rev-102',
    driverName: 'Ramesh Babu (Royal Travels)',
    driverPhone: '+91 94432 10987',
    role: 'FLEET_OWNER',
    fieldModified: 'UPI_ID',
    oldValue: 'ramesh@okaxis',
    newValue: 'royaltravels@ybl',
    submittedAt: '2026-09-01 16:45',
    status: 'PENDING',
  },
];

export default function AdminProfileReviewsScreen() {
  const [requests, setRequests] = useState<ProfileEditRequest[]>(MOCK_REVIEW_ITEMS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAction = (id: string, action: 'APPROVE' | 'REJECT') => {
    setBusyId(id);
    setTimeout(() => {
      setBusyId(null);
      setRequests(prev =>
        prev.map(r => (r.id === id ? { ...r, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : r))
      );
      Alert.alert(
        action === 'APPROVE' ? 'Profile Edit Approved' : 'Profile Edit Rejected',
        `Request #${id} has been ${action === 'APPROVE' ? 'approved and updated live' : 'rejected'}.`
      );
    }, 900);
  };

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.headerIcon}>
            <ShieldAlert color="#EF4444" size={22} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Profile Edit Approvals</Text>
            <Text style={styles.headerSub}>Review payout & identity modifications</Text>
          </View>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>{pendingCount} PENDING</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {requests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <CheckCircle2 color="#10B981" size={48} />
            <Text style={styles.emptyTitle}>Queue Cleared!</Text>
            <Text style={styles.emptySub}>No sensitive profile edits waiting for review.</Text>
          </View>
        ) : (
          requests.map(item => (
            <View key={item.id} style={[styles.card, { opacity: item.status !== 'PENDING' ? 0.6 : 1 }]}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <User color="#0EA5E9" size={16} />
                  <Text style={styles.driverName}>{item.driverName}</Text>
                  <View style={styles.roleTag}>
                    <Text style={styles.roleTagText}>{item.role}</Text>
                  </View>
                </View>
                <Text style={styles.timeText}>{item.submittedAt}</Text>
              </View>

              <Text style={styles.phoneText}>{item.driverPhone}</Text>

              <View style={styles.changeBox}>
                <Text style={styles.fieldTitle}>
                  {item.fieldModified === 'BANK_DETAILS'
                    ? '🏦 Bank Account Modification'
                    : item.fieldModified === 'UPI_ID'
                    ? '📱 UPI ID Modification'
                    : '🪪 Licence Number Edit'}
                </Text>
                <View style={styles.diffRow}>
                  <Text style={styles.diffLabel}>Previous:</Text>
                  <Text style={styles.oldValText}>{item.oldValue}</Text>
                </View>
                <View style={styles.diffRow}>
                  <Text style={styles.diffLabel}>Requested:</Text>
                  <Text style={styles.newValText}>{item.newValue}</Text>
                </View>
              </View>

              {item.status === 'PENDING' ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleAction(item.id, 'REJECT')}
                    disabled={busyId === item.id}
                  >
                    <XCircle color="#EF4444" size={16} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleAction(item.id, 'APPROVE')}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <CheckCircle2 color="#FFFFFF" size={16} />
                        <Text style={styles.approveBtnText}>Approve Change</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.statusBanner, { backgroundColor: item.status === 'APPROVED' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }]}>
                  <Text style={{ color: item.status === 'APPROVED' ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: '800' }}>
                    {item.status === 'APPROVED' ? '✓ APPROVED & UPDATED' : '✗ REJECTED BY ADMIN'}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070B12' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  headerSub: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginTop: 1 },
  pendingBadge: { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  pendingBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  scroll: { flex: 1 },
  scrollInner: { padding: 16, gap: 14, paddingBottom: 110 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  emptySub: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: '#0F172A', borderRadius: 8, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  roleTag: { backgroundColor: 'rgba(14,165,233,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleTagText: { color: '#0EA5E9', fontSize: 9.5, fontWeight: '800' },
  timeText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  phoneText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  changeBox: { backgroundColor: 'rgba(7,11,18,0.7)', borderRadius: 6, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 6, marginVertical: 4 },
  fieldTitle: { color: '#F59E0B', fontSize: 12.5, fontWeight: '800', marginBottom: 2 },
  diffRow: { flexDirection: 'row', gap: 6 },
  diffLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', width: 65 },
  oldValText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', flex: 1, textDecorationLine: 'line-through' },
  newValText: { color: '#10B981', fontSize: 12, fontWeight: '800', flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  rejectBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 6, backgroundColor: '#10B981' },
  approveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  statusBanner: { paddingVertical: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
