import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, Text, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBubble } from '@/contexts/BubbleContext';

/**
 * Global nag, separate from Settings' one-time explainer modal. Every time
 * the driver leaves the app (Home button, switching to Maps, etc.) while the
 * floating bubble is still off, this queues up so it's the first thing they
 * see the moment they come back - repeating "each and every time" per the
 * owner's spec, not just once, since a driver who ignored it once may still
 * want it later once they feel the pain of a missed booking while in Maps.
 * Stops nagging permanently the moment the bubble is actually turned on.
 */
export default function BubbleBackgroundSuggestion() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { bubbleEnabled, setBubbleEnabled, requestOverlayPermission, overlayPermissionGranted } = useBubble();
  const [visible, setVisible] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const everLeft = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      if (prev === 'active' && next !== 'active') {
        // Leaving the app - this is the moment the bubble would actually be
        // useful (about to switch to Maps/another app). Nothing is visibly
        // rendered while backgrounded, so flip the flag now and the modal
        // is simply already there the instant they return.
        everLeft.current = true;
        if (!bubbleEnabled) setVisible(true);
        return;
      }

      if (prev !== 'active' && next === 'active' && everLeft.current && !bubbleEnabled) {
        setVisible(true);
      }
    });
    return () => sub.remove();
  }, [bubbleEnabled]);

  if (Platform.OS !== 'android' || !user || bubbleEnabled) return null;

  const ignore = () => setVisible(false);

  const turnOn = async () => {
    setVisible(false);
    await setBubbleEnabled(true);
    if (!overlayPermissionGranted) {
      await requestOverlayPermission();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={ignore}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 30,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.primary + '22',
            }}>
              <MessageCircle color={colors.primary} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 15 }}>
                Turn on the Booking Bubble?
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                See new bookings even while you're in Maps or another app
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              onPress={ignore}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.border }}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Ignore</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={turnOn}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 6, alignItems: 'center', backgroundColor: colors.primary }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Turn On</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
