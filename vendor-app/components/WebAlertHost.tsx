import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// react-native-web ships Alert.alert as a literal no-op ("static alert() {}") -
// every Alert.alert(...) call in this app (sign-in errors, validation
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
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{state.title}</Text>
        {!!state.message && <Text style={styles.message}>{state.message}</Text>}
        <View style={styles.buttonRow}>
          {state.buttons.map((btn, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.button, btn.style === 'cancel' && styles.cancelButton]}
              onPress={() => handlePress(btn)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  btn.style === 'cancel' && styles.cancelText,
                  btn.style === 'destructive' && styles.destructiveText,
                ]}
              >
                {btn.text || 'OK'}
              </Text>
            </TouchableOpacity>
          ))}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#6366F1',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelText: {
    color: '#374151',
  },
  destructiveText: {
    color: '#EF4444',
  },
});
