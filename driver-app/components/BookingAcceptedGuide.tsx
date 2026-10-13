import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import Modal from '@/components/KeyboardSafe';
import { CheckCircle2, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * What to do after accepting a booking. Drivers kept asking "now how do I assign a driver / where do I start the trip?" - the app only said
 * "Booking accepted" and left them to find out. Shown after every accept (until they tick "don't show again") and from the
 * "How does this work?" link in Upcoming > Unassigned. The four steps are really a sequence, hence the numbers.
 */
const STEPS: { title: string; body: string }[] = [
  { title: 'Assign a driver and a car', body: 'Open Upcoming > Unassigned and tap "Assign Driver & Cab" on this booking. Pick the driver, then the car. Do it before the countdown on the card ends, or the booking can go to someone else. Driving it yourself? Choose your own name.' },
  { title: 'The driver gets the booking', body: 'It appears on his phone (Duty tab) with the pickup, drop and the customer\'s details. Check the pickup time and call the customer once to confirm.' },
  { title: 'At pickup: start the trip', body: 'On the trip day the driver opens Duty, taps Start Ride, takes the odometer photo, enters the starting km and the 4-digit Start OTP the customer shows (the customer sees it in their booking and gets it by SMS).' },
  { title: 'At drop: end the trip', body: 'Enter toll / parking receipts and any extra km, then the End OTP from the customer. The trip closes and your payment is released.' },
];

export default function BookingAcceptedGuide({ visible, onClose, onNeverShow, justAccepted }: { visible: boolean; onClose: () => void; onNeverShow?: () => void; justAccepted?: boolean }) {
  const { colors } = useTheme() as any;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              {justAccepted ? <CheckCircle2 size={24} color="#16A34A" /> : null}
              <Text style={{ fontSize: 19, fontFamily: 'Inter-Bold', color: colors.text, flexShrink: 1 }}>{justAccepted ? 'Booking accepted - what next?' : 'How a booking works'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><X size={24} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView style={{ marginTop: 10 }}>
            {STEPS.map((s, i) => (
              <View key={s.title} style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter-Bold' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: colors.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 19 }}>{s.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Inter-SemiBold' }}>{justAccepted ? 'Assign now' : 'Got it'}</Text>
          </TouchableOpacity>
          {justAccepted && onNeverShow ? (
            <TouchableOpacity onPress={onNeverShow} style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>I know this - do not show again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
