import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Share, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/contexts/ThemeContext';
import axiosDriver from '@/app/api/axiosDriver';

// Shown after a trip is completed: the customer scans this QR, the website review page opens with the trip details and
// the driver's name, and they leave stars + feedback. The link comes from the backend (GET /api/trip-review/link/{id});
// the page itself lives on the website and is wired to the review section later - this card only needs the URL.
export default function ReviewQrCard({ orderId }: { orderId: number | string }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axiosDriver.get(`/api/trip-review/link/${orderId}`);
        if (alive) setUrl(res.data?.url || null);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (failed) return null; // never get in the way of closing out a trip

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>⭐ Ask the customer to rate your service</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Show this QR. They scan it, see the trip and your name, and give stars and feedback.
      </Text>
      <View style={styles.qrBox}>
        {url ? <QRCode value={url} size={170} /> : <ActivityIndicator color={colors.primary} />}
      </View>
      {!!url && (
        <TouchableOpacity onPress={() => Share.share({ message: `Please rate your Drop Cars trip: ${url}` })}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter-Bold', fontSize: 13 }}>Or share the link</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8, padding: 16, alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 15, fontFamily: 'Inter-Bold', textAlign: 'center' },
  sub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  qrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 6, marginVertical: 6, minHeight: 194, minWidth: 194, alignItems: 'center', justifyContent: 'center' },
});
