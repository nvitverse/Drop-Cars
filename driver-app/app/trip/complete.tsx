import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, BackHandler, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Star, CheckCircle2 } from 'lucide-react-native';
import * as SecureStore from '@/utils/secureStore';
import axiosDriver from '@/app/api/axiosDriver';
import { useTheme } from '@/contexts/ThemeContext';
import { getFriendlyError } from '@/utils/errorMessage';
import { formatBookingId } from '@/utils/format';

export const PENDING_COMPLETION_KEY = 'pendingTripCompletion';

const TAGS = ['Polite', 'On time', 'Clear directions', 'Paid without fuss', 'Rude behaviour', 'Delayed pickup'];

// Last step of every trip - cannot be skipped: the driver rates the customer and confirms what was actually collected.
// The cash field is pre-filled with what the bill says is due, so in the normal case it is one tap on "Done".
export default function TripCompleteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const orderId = parseInt(String(params.order_id || '0'));

  const [bill, setBill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [cash, setCash] = useState('');
  const [extras, setExtras] = useState('0');
  const [saving, setSaving] = useState(false);

  // Remember that this trip still needs closing out, so a killed app comes back to this page.
  useEffect(() => {
    if (orderId) SecureStore.setItemAsync(PENDING_COMPLETION_KEY, String(orderId)).catch(() => {});
  }, [orderId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axiosDriver.get(`/api/orders/driver/trip-bill/${orderId}`);
        setBill(res.data);
        setCash(String(res.data?.cash_to_collect ?? 0));
        setExtras(String(res.data?.extra_total ?? 0));
        if (res.data?.completion_done) finish();
      } catch (e: any) {
        Alert.alert('Could not load the bill', getFriendlyError(e, 'Please check your internet and try again.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Hardware back cannot skip this step.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('One last step', 'Please rate the customer and confirm the amount collected to finish this trip.');
      return true;
    });
    return () => sub.remove();
  }, []);

  const cashNum = parseInt(cash || '0', 10) || 0;
  const extrasNum = parseInt(extras || '0', 10) || 0;
  const totalPaid = cashNum + extrasNum;
  const differs = bill && cashNum !== Number(bill.cash_to_collect);

  const finish = async () => {
    await SecureStore.deleteItemAsync(PENDING_COMPLETION_KEY).catch(() => {});
    router.replace({ pathname: '/quick-dashboard', params: { tripJustCompleted: '1' } } as any);
  };

  const submit = async () => {
    if (rating < 1) {
      Alert.alert('Rate the customer', 'Please give the customer a star rating before you finish.');
      return;
    }
    setSaving(true);
    try {
      const feedback = [tags.join(', '), note.trim()].filter(Boolean).join(' - ');
      await axiosDriver.post(`/api/orders/driver/trip-completion/${orderId}`, {
        customer_rating: rating,
        customer_feedback: feedback || null,
        cash_collected: cashNum,
        other_extras: extrasNum,
        total_paid: totalPaid,
      });
      await finish();
    } catch (e: any) {
      Alert.alert('Could not save', getFriendlyError(e, 'We could not save this. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, value, onChange, hint, editable = true }: any) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: editable ? colors.border : 'transparent' }]}>
        <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 16 }}>₹</Text>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          editable={editable}
          onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
        />
      </View>
      {!!hint && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{hint}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <CheckCircle2 size={44} color="#10B981" />
            <Text style={[styles.title, { color: colors.text }]}>One last step</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 2 }}>Booking {formatBookingId(orderId)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>How was the customer?</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Star size={38} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'transparent'} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.tagWrap}>
                  {TAGS.map((tg) => {
                    const on = tags.includes(tg);
                    return (
                      <TouchableOpacity
                        key={tg}
                        onPress={() => setTags((p) => (on ? p.filter((x) => x !== tg) : [...p, tg]))}
                        style={[styles.tag, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + '18' : 'transparent' }]}
                      >
                        <Text style={{ color: on ? colors.primary : colors.textSecondary, fontSize: 12.5, fontFamily: 'Inter-Medium' }}>{tg}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.note, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Anything else you want to tell us? (optional)"
                  placeholderTextColor={colors.textSecondary}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Money you collected</Text>
                <Field label="Cash collected for the trip" value={cash} onChange={setCash} hint={`Bill says ₹${bill?.cash_to_collect ?? 0} was due. Change it only if the customer paid a different amount.`} />
                <Field label="Other extras collected" value={extras} onChange={setExtras} hint="Toll, parking or any charge collected outside the bill. 0 if none." />
                <View style={[styles.totalBox, { backgroundColor: colors.primary + '12' }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Total amount paid by the customer</Text>
                  <Text style={{ color: colors.primary, fontSize: 24, fontFamily: 'Inter-Bold' }}>₹{totalPaid}</Text>
                </View>
                {differs && (
                  <Text style={{ color: '#B45309', fontSize: 12.5, marginTop: 8 }}>
                    This is different from the bill. It is saved as you entered it and Drop Cars may check it.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: saving || rating < 1 ? '#94A3B8' : '#10B981' }]}
                onPress={submit}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneText}>Done</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontFamily: 'Inter-Bold', marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter-Bold', marginBottom: 12 },
  stars: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 14 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  note: { borderWidth: 1, borderRadius: 6, padding: 12, minHeight: 60, textAlignVertical: 'top' },
  label: { fontSize: 13.5, fontFamily: 'Inter-SemiBold', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 18, fontFamily: 'Inter-Bold', paddingVertical: 12 },
  totalBox: { borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  doneBtn: { minHeight: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter-Bold' },
});
