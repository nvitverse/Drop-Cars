// Emergency button for the running-trip card. Two taps on purpose (button, then "Send alert") so it cannot fire by accident.
// It sends the driver's live position to the operations team through the existing backend route POST /api/sos/trigger.
import React, { useState } from 'react';
import { Alert, Text, ActivityIndicator } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import * as Location from 'expo-location';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import axiosDriver from '@/app/api/axiosDriver';

export default function SosButton({ orderId }: { orderId?: number | string }) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      let latitude: string | undefined;
      let longitude: string | undefined;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = String(pos.coords.latitude);
          longitude = String(pos.coords.longitude);
        }
      } catch {
        // an alert without a position is still better than no alert
      }
      await axiosDriver.post('/api/sos/trigger', { order_id: orderId ? String(orderId) : undefined, latitude, longitude });
      Alert.alert('Alert sent', 'The Drop Cars team has your location and will call you now.');
    } catch {
      Alert.alert('Could not send the alert', 'Please call the Drop Cars office directly, or dial 112.');
    } finally {
      setSending(false);
    }
  };

  const ask = () =>
    Alert.alert('Emergency - send SOS?', 'This alerts the Drop Cars team immediately with your live location. Use it only if you are in danger or need urgent help.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send alert', style: 'destructive', onPress: send },
    ]);

  return (
    <TouchableOpacity
      onPress={ask}
      disabled={sending}
      accessibilityLabel="Emergency SOS"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DC2626', backgroundColor: '#FEF2F2' }}
    >
      {sending ? <ActivityIndicator size="small" color="#DC2626" /> : <ShieldAlert size={18} color="#DC2626" />}
      <Text style={{ color: '#B91C1C', fontFamily: 'Inter-Bold', fontSize: 13 }}>Emergency SOS</Text>
    </TouchableOpacity>
  );
}
