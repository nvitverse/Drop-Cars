import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, MapPin, Receipt } from 'lucide-react-native';
import axiosDriver from '@/app/api/axiosDriver';
import { useTheme } from '@/contexts/ThemeContext';
import { getFriendlyError } from '@/utils/errorMessage';
import { formatBookingId } from '@/utils/format';
import ReviewQrCard from '@/components/ReviewQrCard';

// Trip Report = the bill. The customer often looks at this screen on the driver's phone, so it only shows what the
// CUSTOMER pays - never the driver's fare, commission or wallet figures. (Server side: GET /driver/trip-bill/{id}.)
export default function TripReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const orderId = parseInt(String(params.order_id || '0'));
  const [bill, setBill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axiosDriver.get(`/api/orders/driver/trip-bill/${orderId}`);
        setBill(res.data);
      } catch (e: any) {
        setFailed(true);
        Alert.alert('Could not load the bill', getFriendlyError(e, 'Please check your internet and try again.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // The next page is compulsory - going back from here must not skip it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const goNext = () => router.replace({ pathname: '/trip/complete', params: { order_id: String(orderId) } } as any);

  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } catch { return ''; }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <CheckCircle2 size={46} color="#10B981" />
          <Text style={styles.heroTitle}>Trip completed</Text>
          <Text style={styles.heroSub}>Booking {formatBookingId(orderId)}</Text>
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}

        {bill && (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <Receipt size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Trip bill</Text>
              </View>

              <View style={styles.routeRow}>
                <MapPin size={15} color="#10B981" />
                <Text style={[styles.routeText, { color: colors.text }]}>{bill.from}</Text>
              </View>
              {!!bill.to && (
                <View style={styles.routeRow}>
                  <MapPin size={15} color="#EF4444" />
                  <Text style={[styles.routeText, { color: colors.text }]}>{bill.to}</Text>
                </View>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 6 }}>
                {bill.trip_type} · {fmtDate(bill.pickup_time)}
              </Text>
              {bill.km_driven != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                  Distance driven {bill.km_driven} km
                  {bill.km_billed > bill.km_driven ? ` · billed for the ${bill.km_billed} km minimum` : ''}
                </Text>
              )}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {bill.lines.map((l: any, i: number) => (
                <View key={i} style={styles.line}>
                  <Text style={[styles.lineLabel, { color: colors.text }]}>{l.label}</Text>
                  <Text style={[styles.lineAmount, { color: colors.text }]}>₹{l.amount}</Text>
                </View>
              ))}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.line}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Trip total</Text>
                <Text style={[styles.totalAmount, { color: colors.text }]}>₹{bill.total}</Text>
              </View>
              {bill.advance_received > 0 && (
                <View style={styles.line}>
                  <Text style={[styles.lineLabel, { color: '#059669' }]}>Advance already paid</Text>
                  <Text style={[styles.lineAmount, { color: '#059669' }]}>- ₹{bill.advance_received}</Text>
                </View>
              )}

              {Array.isArray(bill.extra_charges_paid_directly) && bill.extra_charges_paid_directly.length > 0 && (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginBottom: 4 }}>
                    Extra charges paid directly (not part of the trip total)
                  </Text>
                  {bill.extra_charges_paid_directly.map((e: any, i: number) => (
                    <View key={i} style={styles.line}>
                      <Text style={[styles.lineLabel, { color: colors.text }]}>{e.label}</Text>
                      <Text style={[styles.lineAmount, { color: colors.text }]}>₹{e.amount}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>

            <View style={styles.cashBox}>
              <Text style={styles.cashLabel}>Cash to collect from the customer</Text>
              <Text style={styles.cashAmount}>₹{bill.cash_to_collect}</Text>
              {bill.extra_total > 0 && (
                <Text style={styles.cashSub}>plus ₹{bill.extra_total} extra charges listed above</Text>
              )}
            </View>
          </>
        )}

        {failed && !loading && (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 16 }}>
            The bill could not be loaded. You can still continue to the last step.
          </Text>
        )}

        <ReviewQrCard orderId={orderId} />

        <TouchableOpacity style={styles.doneBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.doneText}>Completed</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: 'center', marginBottom: 16, marginTop: 4 },
  heroTitle: { fontSize: 22, fontFamily: 'Inter-Bold', color: '#059669', marginTop: 8 },
  heroSub: { fontSize: 13.5, color: '#6B7280', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter-Bold' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  routeText: { flex: 1, fontSize: 14.5, fontFamily: 'Inter-SemiBold' },
  divider: { height: 1, marginVertical: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 10 },
  lineLabel: { flex: 1, fontSize: 14 },
  lineAmount: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  totalLabel: { fontSize: 16, fontFamily: 'Inter-Bold' },
  totalAmount: { fontSize: 18, fontFamily: 'Inter-Bold' },
  cashBox: { backgroundColor: '#EFF6FF', borderColor: '#2563EB', borderWidth: 1.5, borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 14 },
  cashLabel: { fontSize: 12, fontFamily: 'Inter-Bold', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.5 },
  cashAmount: { fontSize: 32, fontFamily: 'Inter-Bold', color: '#1E40AF', marginTop: 4 },
  cashSub: { fontSize: 12.5, color: '#3B82F6', marginTop: 4 },
  doneBtn: { minHeight: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4F46E5', marginTop: 8 },
  doneText: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter-Bold' },
});
