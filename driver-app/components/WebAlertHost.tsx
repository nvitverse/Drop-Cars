import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Platform, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';
import { plainAlertMessage } from '@/utils/errorMessage';

// One alert look for the whole app. Every Alert.alert(title, message, buttons) call already in the code base is routed
// here (native AND web) - same signature, so no screen had to change - and gets:
//   * an icon + colour that match what happened (problem / warning / success / info),
//   * a plain-language message (developer text such as "Failed to start trip: 400: ..." or "Request failed with status
//     code 500" is cleaned up automatically - see plainAlertMessage),
//   * big, easy buttons: the main action is filled, cancel is quiet, destructive is red.
// (react-native-web's own Alert.alert is a no-op, which is why this originally existed as the web-only patch.)

interface AlertButtonLike {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
}

type Kind = 'error' | 'warning' | 'success' | 'info';

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButtonLike[];
  kind: Kind;
}

let showAlertImpl: ((title: string, message?: string, buttons?: AlertButtonLike[]) => void) | null = null;
let originalNativeAlert: ((...args: any[]) => void) | null = null;

/** Call once at app startup: routes every Alert.alert through the styled host below. */
export function installWebAlert() {
  if (!originalNativeAlert) originalNativeAlert = (RNAlert as any).alert?.bind(RNAlert) || null;
  (RNAlert as any).alert = (title: string, message?: string, buttons?: AlertButtonLike[], options?: any) => {
    if (showAlertImpl) {
      showAlertImpl(title, message, buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }]);
    } else if (Platform.OS === 'web') {
      // Host not mounted yet (very first paint): plain browser alert so nothing is silently swallowed.
      window.alert(message ? `${title}\n\n${message}` : title);
    } else if (originalNativeAlert) {
      originalNativeAlert(title, plainAlertMessage(message), buttons, options);
    }
  };
}

function detectKind(title: string, message?: string): Kind {
  const t = `${title} ${message || ''}`.toLowerCase();
  if (/(success|successfully|completed|thank|saved|done|approved|added)/.test(title.toLowerCase())) return 'success';
  if (/(error|failed|invalid|incorrect|wrong|denied|not allowed|cannot|can't|could not|couldn't|unable|expired|required|missing|blocked|rejected)/.test(t)) return 'error';
  if (/(warning|confirm|are you sure|leave|cancel|log ?out|delete|remove|discard|sure)/.test(t)) return 'warning';
  return 'info';
}

const KIND_STYLE: Record<Kind, { color: string; bg: string; Icon: any }> = {
  error: { color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
  warning: { color: '#D97706', bg: '#FEF3C7', Icon: AlertTriangle },
  success: { color: '#059669', bg: '#D1FAE5', Icon: CheckCircle2 },
  info: { color: '#2563EB', bg: '#DBEAFE', Icon: Info },
};

/** Render once near the root of the app (e.g. in the root layout). */
export default function WebAlertHost() {
  const [state, setState] = useState<AlertState>({ visible: false, title: '', buttons: [], kind: 'info' });

  const show = useCallback((title: string, message?: string, buttons?: AlertButtonLike[]) => {
    const cleanTitle = String(title ?? '');
    const cleanMsg = plainAlertMessage(message);
    setState({
      visible: true,
      title: cleanTitle,
      message: cleanMsg,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      kind: detectKind(cleanTitle, cleanMsg),
    });
  }, []);

  useEffect(() => {
    showAlertImpl = show;
    return () => {
      showAlertImpl = null;
    };
  }, [show]);

  if (!state.visible) return null;

  const handlePress = (btn: AlertButtonLike) => {
    setState((s) => ({ ...s, visible: false }));
    btn.onPress?.();
  };

  const { color, bg, Icon } = KIND_STYLE[state.kind];
  const cancel = state.buttons.find((b) => b.style === 'cancel');
  // Back button behaves as the cancel button (or just closes the alert).
  const onRequestClose = () => {
    if (cancel) handlePress(cancel);
    else setState((s) => ({ ...s, visible: false }));
  };

  const stacked = state.buttons.length > 2;

  const content = (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: bg }]}>
          <Icon size={30} color={color} />
        </View>
        <Text style={styles.title}>{state.title}</Text>
        {!!state.message && (
          <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.message}>{state.message}</Text>
          </ScrollView>
        )}
        <View style={[styles.buttonRow, stacked && { flexDirection: 'column' }]}>
          {state.buttons.map((btn, i) => {
            const isCancel = btn.style === 'cancel';
            const isDestructive = btn.style === 'destructive';
            const primary = !isCancel && !isDestructive && (state.buttons.length === 1 || i === state.buttons.length - 1);
            const quiet = isCancel || (!primary && !isDestructive);
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.button,
                  stacked ? { width: '100%' } : { flex: 1 },
                  primary && { backgroundColor: color },
                  isDestructive && { backgroundColor: '#FEE2E2' },
                  quiet && styles.quietButton,
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.buttonText,
                    primary && { color: '#FFFFFF' },
                    isDestructive && { color: '#DC2626' },
                    quiet && { color: '#374151' },
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

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
    try {
      const { createPortal } = require('react-dom');
      return createPortal(content, document.body);
    } catch {
      // Fallback to RN Modal if createPortal is unavailable
    }
  }

  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    maxHeight: '80%',
    zIndex: 2147483647,
    elevation: 2147483647,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  messageScroll: {
    maxHeight: 260,
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  message: {
    fontSize: 14.5,
    fontFamily: 'Inter-Regular',
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 21,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  quietButton: {
    backgroundColor: '#F3F4F6',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
