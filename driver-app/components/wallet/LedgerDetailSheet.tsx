import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { X, ArrowUpRight, ArrowDownLeft, MapPin, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axiosInstance from '@/app/api/axiosInstance';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  entryId: string | null;
  onClose: () => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  } catch {
    return '';
  }
};

// Tap a wallet debit/credit row -> what it is, in plain words, and (for trips) the money split behind it.
export default function LedgerDetailSheet({ entryId, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!entryId) { setData(null); return; }
    let live = true;
    setLoading(true); setFailed(false); setData(null);
    axiosInstance
      .get(`/api/wallet/ledger/${entryId}/detail`)
      .then((r) => { if (live) setData(r.data); })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [entryId]);

  const credit = data?.entry_type === 'CREDIT';
  const accent = credit ? '#059669' : '#DC2626';
  const trip = data?.trip;

  const Row = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: color || colors.text, fontFamily: bold ? 'Inter-Bold' : 'Inter-Medium' }]}>{value}</Text>
    </View>
  );

  return (
    <Modal visible={!!entryId} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 12 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Wallet entry</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          )}
          {failed && !loading && (
            <View style={styles.center}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                We could not load the details of this entry right now. Please try again in a moment.
              </Text>
            </View>
          )}

          {data && !loading && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.amountBox, { backgroundColor: credit ? '#ECFDF5' : '#FEF2F2' }]}>
                {credit ? <ArrowUpRight size={22} color={accent} /> : <ArrowDownLeft size={22} color={accent} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]}>{data.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{fmtDate(data.created_at)}</Text>
                </View>
                <Text style={[styles.amount, { color: accent }]}>{credit ? '+' : '-'}₹{data.amount}</Text>
              </View>

              <View style={[styles.balanceBox, { borderColor: colors.border }]}>
                <Wallet size={16} color={colors.textSecondary} />
                <Text style={{ flexShrink: 1, color: colors.textSecondary, fontSize: 13 }}>
                  Wallet balance: ₹{data.balance_before} → <Text style={{ color: colors.text, fontFamily: 'Inter-Bold' }}>₹{data.balance_after}</Text>
                </Text>
              </View>

              {!!data.explanation && (
                <Text style={[styles.explain, { color: colors.textSecondary }]}>{data.explanation}</Text>
              )}

              {trip && (
                <View style={[styles.tripBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={[styles.tripTitle, { color: colors.text }]}>Booking #{trip.order_id} · {trip.trip_type}</Text>
                  {!!trip.from && (
                    <View style={styles.routeRow}>
                      <MapPin size={14} color="#10B981" />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={2}>
                        {trip.from}{trip.to ? `  →  ${trip.to}` : ''}
                      </Text>
                    </View>
                  )}
                  {!!trip.pickup_time && <Row label="Pickup" value={fmtDate(trip.pickup_time)} />}
                  {trip.km_driven != null && <Row label="Distance driven" value={`${trip.km_driven} km`} />}
                  {trip.held_amount != null && <Row label="Amount held at accept" value={`₹${trip.held_amount}`} />}
                  {trip.customer_total != null && <Row label="Customer paid (trip total)" value={`₹${trip.customer_total}`} bold />}
                  {trip.cash_collected != null && <Row label="Cash you collected" value={`₹${trip.cash_collected}`} />}
                  {trip.you_keep != null && <Row label="You keep" value={`₹${trip.you_keep}`} bold color="#059669" />}
                  {trip.booking_owner_share != null && Number(trip.booking_owner_share) > 0 && (
                    <Row label="Booking owner share" value={`₹${trip.booking_owner_share}`} />
                  )}
                  {trip.platform_fee != null && Number(trip.platform_fee) > 0 && <Row label="Drop Cars fee" value={`₹${trip.platform_fee}`} />}
                </View>
              )}

              {!!data.note && (
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 12, lineHeight: 17 }}>Note: {data.note}</Text>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 8, maxHeight: '85%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-Bold' },
  closeBtn: { padding: 4 },
  center: { paddingVertical: 36, alignItems: 'center' },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 14 },
  title: { fontSize: 15, fontFamily: 'Inter-Bold' },
  amount: { fontSize: 20, fontFamily: 'Inter-Bold' },
  balanceBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  explain: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  tripBox: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 14 },
  tripTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginBottom: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  rowLabel: { fontSize: 13, flexShrink: 1 },
  rowValue: { fontSize: 13, textAlign: 'right', flexShrink: 1 },
});
