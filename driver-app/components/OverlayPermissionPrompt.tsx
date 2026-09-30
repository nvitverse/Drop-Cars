import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, AppState } from 'react-native';
import * as SecureStore from '@/utils/secureStore';
import { hasOverlayPermission, requestOverlayPermission } from '@/services/bubble/bubbleOverlay';
import { useTheme } from '@/contexts/ThemeContext';
import { useBubble } from '@/contexts/BubbleContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// "Display over other apps" is what lets the new-booking bubble appear on top of other apps. If it has not been
// granted, suggest it - once per day, the first time the app is opened that day. The driver can ignore it.
const STORAGE_KEY = 'overlayPromptLastShownDay';
const today = () => new Date().toISOString().slice(0, 10);

export default function OverlayPermissionPrompt() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setBubbleEnabled } = useBubble();
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (await hasOverlayPermission()) return;
      const last = await SecureStore.getItemAsync(STORAGE_KEY);
      if (last === today()) return;
      setVisible(true);
    } catch {
      // never block the app over this
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const markShown = async () => {
    try { await SecureStore.setItemAsync(STORAGE_KEY, today()); } catch {}
  };

  const allow = async () => {
    await markShown();
    setVisible(false);
    try { await setBubbleEnabled(true); } catch {}
    try { await requestOverlayPermission(); } catch {}
  };

  const ignore = async () => {
    await markShown();
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={ignore}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, paddingBottom: 22 + insets.bottom }]}>
          <Text style={{ fontSize: 34, textAlign: 'center' }}>🫧</Text>
          <Text style={[styles.title, { color: colors.text }]}>Never miss a booking</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Allow "Display over other apps" so a new booking pops up as a floating bubble even while you are using another app.
            You can change this any time in Settings.
          </Text>
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={allow}>
            <Text style={styles.primaryText}>Allow</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={ignore}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: 'Inter-SemiBold' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card: { width: '100%', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, gap: 10 },
  title: { fontSize: 19, fontFamily: 'Inter-Bold', textAlign: 'center' },
  body: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 6 },
  primary: { paddingVertical: 13, borderRadius: 6, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-Bold' },
  secondary: { paddingVertical: 10, alignItems: 'center' },
});
