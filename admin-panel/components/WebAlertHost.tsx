import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useTheme } from '@/context/ThemeContext';

// react-native-web ships Alert.alert as a literal no-op ("static alert() {}") -
// every Alert.alert(...) call in this app (login errors, validation
// messages, confirmations, everything) silently does nothing on web. This
// file patches Alert.alert on web only to render a real modal instead, using
// the exact same (title, message, buttons) signature callers already use -
// no other file needs to change.

interface AlertButtonLike {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButtonLike[];
}

let showAlertImpl: ((title: string, message?: string, buttons?: AlertButtonLike[]) => void) | null = null;

/** Call once at app startup (web only - a no-op on native, which already has a real Alert). */
export function installWebAlert() {
  if (Platform.OS !== 'web') return;
  (RNAlert as any).alert = (title: string, message?: string, buttons?: AlertButtonLike[]) => {
    if (showAlertImpl) {
      showAlertImpl(title, message, buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }]);
    } else {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
  };
}

/** Render once near the root of the app (e.g. in the root layout), web only. */
export default function WebAlertHost() {
  const { isDark, themeColors } = useTheme();
  const [state, setState] = useState<AlertState>({ visible: false, title: '', buttons: [] });

  const show = useCallback((title: string, message?: string, buttons?: AlertButtonLike[]) => {
    setState({ visible: true, title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] });
  }, []);

  useEffect(() => {
    showAlertImpl = show;
    return () => {
      showAlertImpl = null;
    };
  }, [show]);

  if (Platform.OS !== 'web' || !state.visible) return null;

  const handlePress = (btn: AlertButtonLike) => {
    setState((s) => ({ ...s, visible: false }));
    btn.onPress?.();
  };

  const content = (
    <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(15, 23, 42, 0.45)' }]}>
      <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0', borderWidth: 1 }]}>
        <Text style={[styles.title, { color: themeColors.text }]}>{state.title}</Text>
        {!!state.message && <Text style={[styles.message, { color: themeColors.textSecondary }]}>{state.message}</Text>}
        <View style={styles.buttonRow}>
          {state.buttons.map((btn, i) => {
            const isCancel = btn.style === 'cancel';
            const isDestructive = btn.style === 'destructive';

            let btnBg = isDark ? '#4F46E5' : '#4F46E5';
            let textColor = '#FFFFFF';
            let borderStyle = {};

            if (isCancel) {
              btnBg = isDark ? '#334155' : '#F1F5F9';
              textColor = isDark ? '#E2E8F0' : '#475569';
              borderStyle = { borderWidth: 1, borderColor: isDark ? '#475569' : '#E2E8F0' };
            } else if (isDestructive) {
              btnBg = '#EF4444';
              textColor = '#FFFFFF';
            }

            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.button,
                  { backgroundColor: btnBg },
                  borderStyle,
                  isDestructive && styles.destructiveShadow,
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.82}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: textColor, fontWeight: isDestructive ? '800' : '700' },
                  ]}
                >
                  {btn.text || 'OK'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  if (typeof document !== 'undefined' && document.body) {
    try {
      const { createPortal } = require('react-dom');
      return createPortal(content, document.body);
    } catch {
      // Fallback to RN Modal if createPortal is unavailable
    }
  }

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={() => setState((s) => ({ ...s, visible: false }))}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 10,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 2147483647,
    zIndex: 2147483647,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14.5,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    textAlign: 'center',
  },
  destructiveShadow: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});
