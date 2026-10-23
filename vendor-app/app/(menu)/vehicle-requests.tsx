import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Car, Phone, CircleCheck as CheckCircle, CircleX as XCircle, Clock } from 'lucide-react-native';
import { Linking } from 'react-native';
import api from '../api/api';

interface RequestRow {
  id: number;
  order_id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  customer_name: string | null;
  pickup_drop_location: Record<string, string> | null;
  start_date_time: string | null;
  required_car_type: string;
  offered_car_type: string;
  owner_name: string | null;
  owner_phone: string | null;
  car_name: string | null;
  car_number: string | null;
  driver_name: string | null;
  funds_needed: number | null;
  decided_by_name: string | null;
  assignment_id: number | null;
}

const label = (t: string) => (t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const route = (r: Record<string, string> | null) => (r ? Object.values(r).filter(Boolean).join(' → ') : '');

/**
 * A driver whose fleet has no car of the exact type you posted offers another car. You (who posted the booking) approve or decline it.
 * Approve = the driver may take the booking with that car; he still needs the normal wallet hold - if it is there the booking is
 * assigned at once, if not he is told how much to recharge and accepts afterwards.
 */
export default function VehicleRequestsScreen() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/poster/substitution-requests');
      setRows(res.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Could not load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = (r: RequestRow, approve: boolean) => {
    Alert.alert(
      approve ? 'Approve this vehicle?' : 'Decline this request?',
      approve
        ? `${r.owner_name || 'The driver'} will do Booking #${r.order_id} with ${r.car_name || 'the offered car'} (${label(r.offered_car_type)}) instead of the ${label(r.required_car_type)} you asked for.`
        : `${r.owner_name || 'The driver'} will be told the request was declined.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Decline',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(r.id);
            try {
              const res = await api.post(`/poster/substitution-requests/${r.id}/${approve ? 'approve' : 'reject'}`, {});
              if (approve && res.data?.message) Alert.alert('Approved', res.data.message);
              await load();
            } catch (e: any) {
              Alert.alert('Could not save', e?.response?.data?.detail || e?.message || 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><ArrowLeft size={22} color="#0F172A" /></TouchableOpacity>
        <Text style={styles.title}>Vehicle requests</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.intro}>
          Drivers who do not have the exact vehicle you posted can offer another car of theirs. Approve it and the driver takes the booking with that car.
        </Text>
        {rows === null && !error ? <ActivityIndicator style={{ marginTop: 30 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {rows && rows.length === 0 ? <Text style={styles.empty}>No vehicle requests right now.</Text> : null}
        {(rows || []).map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.cardTitle}>Booking #{r.order_id}</Text>
              <View style={[styles.pill, r.status === 'PENDING' ? styles.pillWait : r.status === 'APPROVED' ? styles.pillOk : styles.pillNo]}>
                {r.status === 'PENDING' ? <Clock size={12} color="#92400E" /> : r.status === 'APPROVED' ? <CheckCircle size={12} color="#166534" /> : <XCircle size={12} color="#991B1B" />}
                <Text style={styles.pillText}>{r.status === 'PENDING' ? 'Waiting' : r.status === 'APPROVED' ? 'Approved' : 'Declined'}</Text>
              </View>
            </View>
            <Text style={styles.line}>{route(r.pickup_drop_location)}</Text>
            {r.start_date_time ? <Text style={styles.sub}>{new Date(r.start_date_time).toLocaleString('en-IN')}</Text> : null}
            <View style={styles.carRow}>
              <Car size={16} color="#1D4ED8" />
              <Text style={styles.carText}>
                Asked: {label(r.required_car_type)}  →  Offered: {label(r.offered_car_type)}{r.car_name ? ` (${r.car_name}${r.car_number ? ' · ' + r.car_number : ''})` : ''}
              </Text>
            </View>
            <Text style={styles.sub}>Fleet: {r.owner_name || '-'}{r.driver_name ? ` · Driver: ${r.driver_name}` : ''}</Text>
            {r.status === 'APPROVED' ? (
              <Text style={styles.note}>
                {r.assignment_id
                  ? 'Assigned - the car and driver are on the booking.'
                  : (r.funds_needed ?? 0) > 0
                    ? `Waiting for the driver to recharge ₹${r.funds_needed}, then accept.`
                    : 'Waiting for the driver to tap Accept.'}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {r.owner_phone ? (
                <TouchableOpacity style={styles.call} onPress={() => Linking.openURL('tel:' + r.owner_phone)}>
                  <Phone size={16} color="#1D4ED8" />
                  <Text style={styles.callText}>Call</Text>
                </TouchableOpacity>
              ) : null}
              {r.status === 'PENDING' ? (
                <>
                  <TouchableOpacity style={[styles.btn, styles.decline]} disabled={busyId === r.id} onPress={() => decide(r, false)}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.approve]} disabled={busyId === r.id} onPress={() => decide(r, true)}>
                    {busyId === r.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.approveText}>Approve</Text>}
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  back: { padding: 6 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: '#0F172A' },
  scroll: { padding: 14, paddingBottom: 60 },
  intro: { fontSize: 13, lineHeight: 20, color: '#475569', marginBottom: 12 },
  error: { color: '#B91C1C', fontSize: 14, lineHeight: 21, marginTop: 20, textAlign: 'center' },
  empty: { color: '#64748B', fontSize: 15, lineHeight: 22, marginTop: 30, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: '#0F172A' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillWait: { backgroundColor: '#FEF3C7' },
  pillOk: { backgroundColor: '#DCFCE7' },
  pillNo: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#0F172A' },
  line: { fontSize: 14, lineHeight: 21, color: '#0F172A', marginTop: 6, fontWeight: '600' },
  sub: { fontSize: 12.5, lineHeight: 19, color: '#64748B', marginTop: 2 },
  carRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  carText: { flex: 1, fontSize: 13.5, lineHeight: 21, color: '#1E3A8A', fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 20, color: '#166534', marginTop: 8, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 42, marginRight: 'auto' },
  callText: { fontSize: 14, color: '#1D4ED8', fontWeight: '700' },
  btn: { minHeight: 42, minWidth: 96, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  approve: { backgroundColor: '#16A34A' },
  approveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  decline: { backgroundColor: '#FEE2E2' },
  declineText: { color: '#991B1B', fontWeight: '800', fontSize: 14 },
});
